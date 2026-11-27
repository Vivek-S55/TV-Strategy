require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cron = require('node-cron');
const multer = require('multer');
const { parseCSV, runBacktest } = require('./backtest');
const { parseTV, runOptionsBacktest } = require('./options-backtest');
const { runWaterfallBacktest, DEFAULT_ASSIGNMENTS } = require('./waterfall-backtest');
const { liveEngine } = require('./live-waterfall');
const { telegramNotifier } = require('./telegram-notifier');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadMulti = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── NSE AXIOS CLIENT (with cookie jar for session) ─────────
const cookieJar = new CookieJar();
const nseClient = wrapper(axios.create({
  jar: cookieJar,
  withCredentials: true,
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  }
}));

// Pre-warm NSE session on startup (visits homepage to get cookies first)
async function warmNSESession() {
  try {
    await nseClient.get('https://www.nseindia.com/', { headers: { 'Accept': 'text/html' } });
    console.log('✅ NSE session warmed up');
  } catch (e) {
    console.log('⚠️  NSE session warm-up failed:', e.message);
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(cors());

// Webhook payload pre-processor: accepts application/json, text/plain, or raw strings from TradingView
app.use('/webhook', express.text({ type: ['text/*', 'application/json', '*/*'] }));
app.use('/webhook', (req, res, next) => {
  if (typeof req.body === 'string') {
    let raw = req.body.trim();
    if (raw.startsWith('{') || raw.includes('chartRole') || raw.includes('open')) {
      try {
        req.body = JSON.parse(raw);
      } catch (e) {
        // Fix trailing empty values e.g. "ema9": , or "pp":
        let sanitized = raw.replace(/:\s*,/g, ': null,');
        sanitized = sanitized.replace(/:\s*(\r?\n|\}|$)/g, ': null$1');
        if (!sanitized.trim().endsWith('}')) sanitized += '\n}';
        // Remove trailing commas before }
        sanitized = sanitized.replace(/,\s*\}/g, '\n}');
        try {
          req.body = JSON.parse(sanitized);
          console.log('🛠️ Auto-sanitized incoming TradingView webhook payload');
        } catch (err2) {
          console.warn('⚠️ Could not parse raw webhook body:', raw);
          req.body = {};
        }
      }
    } else {
      req.body = {};
    }
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ─────────────────────────────────────────────
// IN-MEMORY SIGNAL STORE
// ─────────────────────────────────────────────
const signalStore = {
  signals: [],       // all incoming signals (max 100)
  lastSignal: null,  // most recent signal
  activeBias: null,  // 'BUY' | 'SELL' | null
  activeSignals: {}, // map of signal type → latest value
  stats: {
    totalSignals: 0,
    buySignals: 0,
    sellSignals: 0,
    exitSignals: 0,
  }
};

// Signal classification
function classifySignal(alertName, direction) {
  const name = (alertName || '').toLowerCase();
  if (name.includes('exit') || name.includes('zone broken')) return 'EXIT';
  if (name.includes('momentum') || name.includes('triple') || name.includes('hm confirmed')) return 'STRONG';
  if (name.includes('bounce') || name.includes('cross') || name.includes('flipped')) return 'MEDIUM';
  return 'CONTEXT';
}

// Tier of the signal
function getTier(alertName) {
  const name = (alertName || '').toLowerCase();
  if (name.includes('exit')) return 'EXIT';
  if (name.includes('triple') || name.includes('hm confirmed') || name.includes('momentum')) return 1;
  if (name.includes('bounce') || name.includes('cross') || name.includes('flipped') || name.includes('reversal')) return 2;
  return 3;
}

// Extract direction from alert name or payload
function extractDirection(payload) {
  if (payload.direction) return payload.direction.toUpperCase();
  const name = (payload.alert || payload.message || '').toLowerCase();
  if (name.includes('bull') || name.includes('buy')) return 'BUY';
  if (name.includes('bear') || name.includes('sell')) return 'SELL';
  return 'NEUTRAL';
}

// ─── SMART STRIKE SELECTION (±200 OTM from nearest 50) ────────
function computeStrikes(spot) {
  const nearestFifty = Math.round(spot / 50) * 50;
  return {
    ceStrike: nearestFifty + 200,
    peStrike: nearestFifty - 200,
    nearestFifty,
  };
}

// Look up live LTP from cached NSE options chain
function getLTPFromChain(strike, type) {
  if (!cachedOptionsData) return null;
  try {
    const rows = cachedOptionsData.data?.records?.data || [];
    const row = rows.find(r => r.strikePrice === strike);
    if (!row) return null;
    return type === 'CE' ? (row.CE?.lastPrice || null) : (row.PE?.lastPrice || null);
  } catch { return null; }
}

// Build full trade recommendation with both CE and PE details
function buildTradeRecommendation(spot, direction) {
  if (!spot || direction === 'EXIT' || direction === 'NEUTRAL') return null;
  const { ceStrike, peStrike } = computeStrikes(spot);
  const ceLTP = getLTPFromChain(ceStrike, 'CE');
  const peLTP = getLTPFromChain(peStrike, 'PE');
  const LOT_SIZE = 75;

  if (direction === 'BUY') {
    return {
      action: 'BUY CE',
      strike: ceStrike,
      type: 'CE',
      label: `${ceStrike} CE`,
      ltp: ceLTP,
      estCost: ceLTP ? Math.round(ceLTP * LOT_SIZE) : null,
      lotSize: LOT_SIZE,
      // Also provide PE context for reference
      altStrike: peStrike,
      altType: 'PE',
      altLTP: peLTP,
    };
  } else if (direction === 'SELL') {
    return {
      action: 'BUY PE',
      strike: peStrike,
      type: 'PE',
      label: `${peStrike} PE`,
      ltp: peLTP,
      estCost: peLTP ? Math.round(peLTP * LOT_SIZE) : null,
      lotSize: LOT_SIZE,
      // Also provide CE context for reference
      altStrike: ceStrike,
      altType: 'CE',
      altLTP: ceLTP,
    };
  }
  return null;
}

// ─────────────────────────────────────────────
// WEBSOCKET — broadcast to all UI clients
// ─────────────────────────────────────────────
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// Connect broadcaster to Live Waterfall Engine
liveEngine.setBroadcaster(broadcast);

wss.on('connection', (ws) => {
  console.log('📡 UI client connected');
  // Send current state on connect
  ws.send(JSON.stringify({
    type: 'INIT',
    data: {
      signals: signalStore.signals.slice(-20),
      lastSignal: signalStore.lastSignal,
      activeBias: signalStore.activeBias,
      stats: signalStore.stats,
    },
    ts: Date.now()
  }));

  // Send current Live Waterfall State on connect
  ws.send(JSON.stringify({
    type: 'LIVE_WATERFALL_INIT',
    data: liveEngine.getFullState(),
    ts: Date.now()
  }));

  ws.on('close', () => console.log('📡 UI client disconnected'));
});

// ─────────────────────────────────────────────
// WEBHOOK ENDPOINT — TradingView posts here
// ─────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  const body = req.body;
  console.log('\n🔔 Webhook received:', JSON.stringify(body, null, 2));

  // If this is a 3-Chart Live Candle Alert (has chartRole or OHLC bar data)
  let liveResult = null;
  if (body.chartRole || (body.open !== undefined && body.close !== undefined)) {
    liveResult = liveEngine.handleIncomingAlert(body);
  }

  let alertName = body.alert || body.message;
  if (!alertName) {
    if (body.chartRole) {
      if (body.longSignal === 1) alertName = `${body.chartRole} 9 EMA Long Signal`;
      else if (body.shortSignal === 1) alertName = `${body.chartRole} 9 EMA Short Signal`;
      else alertName = `${body.chartRole} 3m Bar (${body.symbol || ''})`;
    } else {
      alertName = '3m Candle Bar';
    }
  }

  let direction = extractDirection(body);
  if (direction === 'NEUTRAL' && body.chartRole) {
    if (body.longSignal === 1) direction = 'BUY';
    else if (body.shortSignal === 1) direction = 'SELL';
    else if (body.close !== undefined && body.open !== undefined) direction = (parseFloat(body.close) >= parseFloat(body.open) ? 'BUY' : 'SELL');
  }

  const tier = (body.longSignal === 1 || body.shortSignal === 1) ? 1 : getTier(alertName);
  const strength = (body.longSignal === 1 || body.shortSignal === 1) ? 'STRONG' : classifySignal(alertName, direction);
  const spot = parseFloat(body.price || body.close || 0);

  // ── Smart strike selection + live LTP lookup ─────────────────
  const tradeRec = spot ? buildTradeRecommendation(spot, direction) : null;

  // ── Also compute both strikes for reference (always) ─────────
  let strikeInfo = null;
  if (spot) {
    const { ceStrike, peStrike } = computeStrikes(spot);
    strikeInfo = {
      ceStrike,
      peStrike,
      ceLTP: getLTPFromChain(ceStrike, 'CE'),
      peLTP: getLTPFromChain(peStrike, 'PE'),
      optionsSource: cachedOptionsData?.source || 'none',
      optionsFetchedAt: cachedOptionsData?.fetchedAt || null,
    };
  }

  const signal = {
    id: Date.now(),
    alert: alertName,
    direction,
    tier,
    strength,
    price: spot,
    symbol: body.symbol || (body.chartRole === 'SPOT' ? 'NSE:NIFTY' : `NIFTY ${body.chartRole}`),
    time: body.time || new Date().toISOString(),
    open: parseFloat(body.open || 0),
    high: parseFloat(body.high || 0),
    low: parseFloat(body.low || 0),
    receivedAt: new Date().toISOString(),
    // Enriched trade recommendation with live LTP
    recommended: tradeRec,
    strikes: strikeInfo,
    // Indicator values from Pine Script (if sent in payload)
    indicators: {
      ema9: parseFloat(body.ema9) || null,
      ema20: parseFloat(body.ema20) || null,
      ema200: parseFloat(body.ema200) || null,
      rmi: parseFloat(body.rmi) || null,
      rsi: parseFloat(body.rsi) || null,
      pp: parseFloat(body.pp) || null,
      longStop: parseFloat(body.longStop) || null,
      shortStop: parseFloat(body.shortStop) || null,
      vwap: parseFloat(body.vwap) || null,
    },
  };

  // Update store
  signalStore.signals.unshift(signal);
  if (signalStore.signals.length > 100) signalStore.signals.pop();
  signalStore.lastSignal = signal;
  signalStore.stats.totalSignals++;

  if (strength === 'EXIT') {
    signalStore.stats.exitSignals++;
    signalStore.activeBias = null;
  } else if (direction === 'BUY') {
    signalStore.stats.buySignals++;
    if (tier === 1 || tier === 2) signalStore.activeBias = 'BUY';
  } else if (direction === 'SELL') {
    signalStore.stats.sellSignals++;
    if (tier === 1 || tier === 2) signalStore.activeBias = 'SELL';
  }

  // Log enrichment result
  if (tradeRec) {
    console.log(`✅ Strike: ${tradeRec.label} | LTP: ${tradeRec.ltp ? '₹' + tradeRec.ltp : 'N/A (options chain not cached yet)'} | Est. Cost: ${tradeRec.estCost ? '₹' + tradeRec.estCost : '—'}`);
  }

  // Broadcast to UI
  broadcast('SIGNAL', signal);
  if (tier === 1 || strength === 'EXIT') {
    broadcast('ALERT', { ...signal, requiresAction: true });
  }

  res.json({ status: 'ok', signal });
});

// ─────────────────────────────────────────────
// MOCK SIGNAL ENDPOINT — for testing
// ─────────────────────────────────────────────
app.post('/mock-signal', (req, res) => {
  const mockSignals = [
    { alert: 'Triple Alignment: BEARISH', direction: 'SELL', price: 23341, symbol: 'NSE:NIFTY50' },
    { alert: 'Triple Alignment: BULLISH', direction: 'BUY', price: 23400, symbol: 'NSE:NIFTY50' },
    { alert: 'EMA + HM Confirmed SELL', direction: 'SELL', price: 23354, symbol: 'NSE:NIFTY50' },
    { alert: 'EMA + HM Confirmed BUY', direction: 'BUY', price: 23380, symbol: 'NSE:NIFTY50' },
    { alert: 'SELL Zone 16: SELL Momentum', direction: 'SELL', price: 23341, symbol: 'NSE:NIFTY50' },
    { alert: 'BUY Zone 15: BUY Momentum', direction: 'BUY', price: 23300, symbol: 'NSE:NIFTY50' },
    { alert: 'Exit Engine: EXIT SELL NOW', direction: 'EXIT', price: 23290, symbol: 'NSE:NIFTY50' },
    { alert: 'SELL Zone Bounce', direction: 'SELL', price: 23360, symbol: 'NSE:NIFTY50' },
    { alert: '9 & 20 EMA: Clear SELL Cross', direction: 'SELL', price: 23341, symbol: 'NSE:NIFTY50' },
    { alert: 'Structural: Full Bear Reversal', direction: 'SELL', price: 23320, symbol: 'NSE:NIFTY50' },
  ];

  const mock = req.body.signal
    ? mockSignals.find(s => s.alert === req.body.signal) || mockSignals[0]
    : mockSignals[Math.floor(Math.random() * mockSignals.length)];

  // Forward to webhook handler
  return axios.post(`http://localhost:${PORT}/webhook`, { ...mock, time: new Date().toISOString() })
    .then(r => res.json(r.data))
    .catch(e => res.status(500).json({ error: e.message }));
});

// ─────────────────────────────────────────────
// LIVE WATERFALL ENGINE REST ENDPOINTS
// ─────────────────────────────────────────────
app.get('/api/live/state', (req, res) => {
  res.json(liveEngine.getFullState());
});

app.post('/api/live/manual-exit', (req, res) => {
  const reason = req.body?.reason || 'Manual Discretionary Exit (Target Reached)';
  const result = liveEngine.manualExitActiveTrade(reason);
  res.json(result);
});

app.get('/api/live/sessions', (req, res) => {
  const dataDir = path.join(__dirname, '..', 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('live_session_') && f.endsWith('.json')).sort();
  const sessions = files.map(fname => {
    try {
      const raw = fs.readFileSync(path.join(dataDir, fname), 'utf8');
      const d = JSON.parse(raw);
      return {
        file: fname,
        dayKey: d.dayKey,
        dayLabel: d.dayLabel,
        trades: d.executedTrades?.length || 0,
        winRate: d.summary?.winRate || 0,
        netPnL: d.summary?.totalNetPnL || 0,
        bars: d.syncedBars?.length || 0
      };
    } catch (e) {
      return { file: fname, error: e.message };
    }
  });
  res.json({ status: 'ok', count: sessions.length, sessions });
});

app.get('/api/live/session', (req, res) => {
  const dayKey = req.query.day || req.query.date;
  if (!dayKey) {
    return res.status(400).json({ error: 'Missing ?day=YYYY-MM-DD parameter' });
  }
  const filePath = path.join(__dirname, '..', 'data', `live_session_${dayKey}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Session for day ${dayKey} not found in inventory` });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (req.query.load === 'true') {
      liveEngine.loadSessionFromDisk(dayKey);
      broadcast('LIVE_WATERFALL_RESET', liveEngine.getFullState());
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/live/reset', (req, res) => {
  liveEngine.resetSession();
  broadcast('LIVE_WATERFALL_RESET', liveEngine.getFullState());
  res.json({ status: 'ok', message: 'Session reset', state: liveEngine.getFullState() });
});

app.post('/api/live/mock-candle', (req, res) => {
  const time = req.body.time || new Date().toISOString();
  const spotBar = req.body.spot || { chartRole: 'SPOT', close: 22600, open: 22590, high: 22610, low: 22585, ema9: 22595, pp: 22550 };
  const ceBar = req.body.ce || { chartRole: 'CE', close: 250, open: 245, high: 255, low: 242, ema9: 246, longSignal: 1, symbol: '22400 CE' };
  const peBar = req.body.pe || { chartRole: 'PE', close: 180, open: 185, high: 190, low: 178, ema9: 184, shortSignal: 1, symbol: '22800 PE' };

  liveEngine.handleIncomingAlert({ ...spotBar, time, chartRole: 'SPOT' });
  liveEngine.handleIncomingAlert({ ...ceBar, time, chartRole: 'CE' });
  const result = liveEngine.handleIncomingAlert({ ...peBar, time, chartRole: 'PE' });

  res.json({ status: 'ok', result, state: liveEngine.getFullState() });
});

// ─────────────────────────────────────────────
// TELEGRAM MOBILE ALERTS REST ENDPOINTS
// ─────────────────────────────────────────────
app.get('/api/telegram/config', (req, res) => {
  res.json({ status: 'ok', config: telegramNotifier.getPublicConfig() });
});

app.post('/api/telegram/config', (req, res) => {
  const result = telegramNotifier.saveConfig(req.body || {});
  res.json(result);
});

app.post('/api/telegram/test', async (req, res) => {
  if (req.body?.botToken || req.body?.chatId) {
    telegramNotifier.saveConfig({
      botToken: req.body.botToken || telegramNotifier.config.botToken,
      chatId: req.body.chatId || telegramNotifier.config.chatId
    });
  }
  const result = await telegramNotifier.testAlert();
  res.json(result);
});

// ─────────────────────────────────────────────
// NSE OPTIONS CHAIN PROXY
// ─────────────────────────────────────────────
let cachedOptionsData = null;
let lastOptionsFetch = 0;

app.get('/api/options/:symbol', async (req, res) => {
  const symbol = (req.params.symbol || 'NIFTY').toUpperCase();
  const now = Date.now();

  // Cache for 55 seconds
  if (cachedOptionsData && (now - lastOptionsFetch) < 55000) {
    return res.json(cachedOptionsData);
  }

  try {
    // Step 1: Re-warm session if stale (> 5 min)
    if ((now - lastOptionsFetch) > 300000) {
      await warmNSESession();
    }

    // Step 2: Fetch options chain with live session cookies
    const response = await nseClient.get(
      `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.nseindia.com/option-chain',
          'X-Requested-With': 'XMLHttpRequest',
        }
      }
    );

    if (response.data && response.data.records) {
      cachedOptionsData = { source: 'live', data: response.data, fetchedAt: new Date().toISOString() };
      lastOptionsFetch = now;
      console.log(`✅ NSE ${symbol} options fetched — ${response.data.records.data?.length || 0} strikes`);
      return res.json(cachedOptionsData);
    } else {
      throw new Error('Invalid response structure from NSE');
    }
  } catch (err) {
    console.log(`⚠️  NSE options fetch failed: ${err.message} — using mock data`);
    // Try to re-warm and serve mock in the meantime
    warmNSESession().catch(() => { });
    res.json(getMockOptionsData());
  }
});

// ─────────────────────────────────────────────
// SIGNALS API
// ─────────────────────────────────────────────
app.get('/api/signals', (req, res) => {
  res.json({
    signals: signalStore.signals.slice(0, 50),
    lastSignal: signalStore.lastSignal,
    activeBias: signalStore.activeBias,
    stats: signalStore.stats,
  });
});

app.delete('/api/signals', (req, res) => {
  signalStore.signals = [];
  signalStore.lastSignal = null;
  signalStore.activeBias = null;
  signalStore.stats = { totalSignals: 0, buySignals: 0, sellSignals: 0, exitSignals: 0 };
  broadcast('RESET', {});
  res.json({ status: 'cleared' });
});

// ─────────────────────────────────────────────
// MOCK OPTIONS DATA
// ─────────────────────────────────────────────
function getMockOptionsData() {
  const spot = 23341;
  const strikes = [];
  const baseStrike = Math.round(spot / 50) * 50;

  for (let i = -6; i <= 6; i++) {
    const strike = baseStrike + (i * 50);
    const isATM = Math.abs(strike - spot) < 50;
    const dist = Math.abs(strike - baseStrike) / 50;
    const ceLtp = Math.max(5, Math.round(isATM ? 98 : 98 / (1.8 ** dist) + Math.random() * 5));
    const peLtp = Math.max(5, Math.round(isATM ? 95 : 95 / (1.8 ** dist) + Math.random() * 5));
    const ceOi = Math.round((1000000 - dist * 80000 + Math.random() * 50000));
    const peOi = Math.round((900000 - dist * 70000 + Math.random() * 50000));

    strikes.push({
      strikePrice: strike,
      CE: { lastPrice: ceLtp, openInterest: ceOi, impliedVolatility: (14 + dist * 1.5 + Math.random()).toFixed(2), changeinOpenInterest: Math.round((Math.random() - 0.5) * 20000) },
      PE: { lastPrice: peLtp, openInterest: peOi, impliedVolatility: (14.5 + dist * 1.2 + Math.random()).toFixed(2), changeinOpenInterest: Math.round((Math.random() - 0.5) * 15000) },
    });
  }

  return {
    source: 'mock',
    data: {
      records: {
        underlyingValue: spot,
        expiryDates: ['25-Sep-2026', '02-Oct-2026', '30-Oct-2026'],
        data: strikes
      }
    },
    fetchedAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// BACKTEST API
// ─────────────────────────────────────────────
// 1. Single CSV backtest (original)
app.post('/api/backtest/upload', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });
    const csvText = req.file.buffer.toString('utf8');
    const bars = parseCSV(csvText);
    if (bars.length < 10) return res.status(400).json({ error: 'CSV has too few rows.' });
    const opts = {
      useTripleAlign: req.body.useTripleAlign !== 'false',
      useEMAHM: req.body.useEMAHM !== 'false',
      useLongShort: req.body.useLongShort !== 'false',
      useZoneMomentum: req.body.useZoneMomentum !== 'false',
      useStructural: req.body.useStructural !== 'false',
      useStopLoss: req.body.useStopLoss !== 'false',
      exitOnEMAFlip: req.body.exitOnEMAFlip !== 'false',
      exitOnOpposite: req.body.exitOnOpposite !== 'false',
      exitDistancePts: parseInt(req.body.exitDistancePts || 50),
      initialCapital: parseInt(req.body.initialCapital || 100000),
      lotSize: parseInt(req.body.lotSize || 75),
      commission: parseInt(req.body.commission || 20),
      slippage: parseInt(req.body.slippage || 2),
    };
    const result = runBacktest(bars, opts);
    console.log(`✅ Backtest: ${bars.length} bars, ${result.summary.totalTrades} trades, ₹${result.summary.totalPnL}`);
    res.json({ status: 'ok', bars: bars.length, ...result });
  } catch (err) {
    console.error('Backtest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Options backtest (3 CSVs: futures + CE + PE)
app.post('/api/backtest/options',
  uploadMulti.fields([
    { name: 'futures', maxCount: 1 },
    { name: 'ce', maxCount: 1 },
    { name: 'pe', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files;
      if (!files.futures?.[0]) return res.status(400).json({ error: 'Missing Nifty Futures CSV (futures)' });
      if (!files.ce?.[0]) return res.status(400).json({ error: 'Missing CE chart CSV (ce)' });
      if (!files.pe?.[0]) return res.status(400).json({ error: 'Missing PE chart CSV (pe)' });

      const futuresBars = parseTV(files.futures[0].buffer.toString('utf8'));
      const ceBars = parseTV(files.ce[0].buffer.toString('utf8'));
      const peBars = parseTV(files.pe[0].buffer.toString('utf8'));

      const opts = {
        startDate: req.body.startDate || '2026-09-16',
        endDate: req.body.endDate || '2026-09-22',
        lotSize: parseInt(req.body.lotSize || 750),
        commission: parseInt(req.body.commission || 20),
        slippage: parseFloat(req.body.slippage || 0.5),
        initialCapital: parseInt(req.body.initialCapital || 100000),
        targetPts: parseFloat(req.body.targetPts || 25),
      };

      const result = runOptionsBacktest(futuresBars, ceBars, peBars, opts);
      console.log(`✅ Options Backtest: ${futuresBars.length} futures bars, ${result.summary.totalTrades} trades, ₹${result.summary.totalPnL} P&L`);
      res.json({ status: 'ok', ...result });
    } catch (err) {
      console.error('Options backtest error:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// 3. Waterfall Backtest (Phase 1 — 9 EMA Long Signal across 4 days)
app.get('/api/waterfall/config', (req, res) => {
  res.json({ status: 'ok', assignments: DEFAULT_ASSIGNMENTS });
});

app.get('/api/waterfall/run', (req, res) => {
  try {
    const lotSize = parseInt(req.query.lotSize || 75, 10);
    const commission = req.query.commission !== undefined ? parseFloat(req.query.commission) : 20;
    const slippage = req.query.slippage !== undefined ? parseFloat(req.query.slippage) : 0;
    const entryStartTime = req.query.entryStartTime || '09:18';
    const entryEndTime = req.query.entryEndTime || '14:45';
    const strikeMode = req.query.strikeMode || 'single';
    const targetPts = req.query.targetPts !== undefined ? parseFloat(req.query.targetPts) : 15;
    const requireHMBullish = req.query.requireHMBullish !== undefined ? (req.query.requireHMBullish === 'true' || req.query.requireHMBullish === true) : true;
    const exitOnHMBearish = req.query.exitOnHMBearish !== undefined ? (req.query.exitOnHMBearish === 'true' || req.query.exitOnHMBearish === true) : false;
    const enableNearCETrail = req.query.enableNearCETrail !== undefined ? (req.query.enableNearCETrail === 'true' || req.query.enableNearCETrail === true) : true;
    const ceNearThreshold = req.query.ceNearThreshold !== undefined ? parseFloat(req.query.ceNearThreshold) : 5.0;
    const filterInsideSellZone = req.query.filterInsideSellZone !== undefined ? (req.query.filterInsideSellZone === 'true' || req.query.filterInsideSellZone === true) : true;
    const sellZoneMinHeadroom = req.query.sellZoneMinHeadroom !== undefined ? parseFloat(req.query.sellZoneMinHeadroom) : 15.0;
    const sellZoneBreakoutExpiryBars = req.query.sellZoneBreakoutExpiryBars !== undefined ? parseInt(req.query.sellZoneBreakoutExpiryBars, 10) : 4;
    const filterInsideBuyZone = req.query.filterInsideBuyZone !== undefined ? (req.query.filterInsideBuyZone === 'true' || req.query.filterInsideBuyZone === true) : true;
    const requireHMExitConfirmation = req.query.requireHMExitConfirmation !== undefined ? (req.query.requireHMExitConfirmation === 'true' || req.query.requireHMExitConfirmation === true) : true;
    const enableCERejectionExit = req.query.enableCERejectionExit !== undefined ? (req.query.enableCERejectionExit === 'true' || req.query.enableCERejectionExit === true) : true;
    const ceRejectionDist = req.query.ceRejectionDist !== undefined ? parseFloat(req.query.ceRejectionDist) : 0;
    const enableSellZoneBreakout = req.query.enableSellZoneBreakout !== undefined ? (req.query.enableSellZoneBreakout === 'true' || req.query.enableSellZoneBreakout === true) : true;
    const breakoutExpiryBars = req.query.breakoutExpiryBars !== undefined ? parseInt(req.query.breakoutExpiryBars, 10) : 15;
    const enableBreakoutSL = req.query.enableBreakoutSL !== undefined ? (req.query.enableBreakoutSL === 'true' || req.query.enableBreakoutSL === true) : true;
    const entrySignalMode = req.query.entrySignalMode || 'both';
    const enableRMIBounceEntry = req.query.enableRMIBounceEntry !== undefined ? (req.query.enableRMIBounceEntry === 'true' || req.query.enableRMIBounceEntry === true) : (entrySignalMode === 'both' || entrySignalMode === 'rmi');
    const enableCEBounceEntry = req.query.enableCEBounceEntry !== undefined ? (req.query.enableCEBounceEntry === 'true' || req.query.enableCEBounceEntry === true) : (entrySignalMode === 'both' || entrySignalMode === 'ce_bounce');
    const enableCEFloorSL = req.query.enableCEFloorSL !== undefined ? (req.query.enableCEFloorSL === 'true' || req.query.enableCEFloorSL === true) : true;
    const enableRMIFloorExit = req.query.enableRMIFloorExit !== undefined ? (req.query.enableRMIFloorExit === 'true' || req.query.enableRMIFloorExit === true) : true;
    const enableRMIRejectionExit = req.query.enableRMIRejectionExit !== undefined ? (req.query.enableRMIRejectionExit === 'true' || req.query.enableRMIRejectionExit === true) : true;
    const enableCETargetTouch = req.query.enableCETargetTouch !== undefined ? (req.query.enableCETargetTouch === 'true' || req.query.enableCETargetTouch === true) : true;
    const enableConfluenceMode = req.query.enableConfluenceMode !== undefined ? (req.query.enableConfluenceMode === 'true' || req.query.enableConfluenceMode === true) : true;
    const maxZoneWidth = req.query.maxZoneWidth !== undefined ? parseFloat(req.query.maxZoneWidth) : 20.0;
    const zoneRetracementPct = req.query.zoneRetracementPct !== undefined ? parseFloat(req.query.zoneRetracementPct) : 0.50;
    const stagnationBars = req.query.stagnationBars !== undefined ? parseInt(req.query.stagnationBars, 10) : 10;
    const minConfluence = req.query.minConfluence !== undefined ? parseInt(req.query.minConfluence, 10) : 2;
    const enableCPRExits = req.query.enableCPRExits !== undefined ? (req.query.enableCPRExits === 'true' || req.query.enableCPRExits === true) : true;
    const enableHMVolExit = req.query.enableHMVolExit !== undefined ? (req.query.enableHMVolExit === 'true' || req.query.enableHMVolExit === true) : true;
    const filterFalseRejections = req.query.filterFalseRejections !== undefined ? (req.query.filterFalseRejections === 'true' || req.query.filterFalseRejections === true) : true;
    const enableStrictBull = req.query.enableStrictBull !== undefined ? (req.query.enableStrictBull === 'true' || req.query.enableStrictBull === true) : true;
    const enableStrictBear = req.query.enableStrictBear !== undefined ? (req.query.enableStrictBear === 'true' || req.query.enableStrictBear === true) : true;
    const enableHammerContinuation = req.query.enableHammerContinuation !== undefined ? (req.query.enableHammerContinuation === 'true' || req.query.enableHammerContinuation === true) : true;
    const enableCELineBounce = false; // Always disabled
    const enableNifty9EMAAlignment = req.query.enableNifty9EMAAlignment !== undefined ? (req.query.enableNifty9EMAAlignment === 'true' || req.query.enableNifty9EMAAlignment === true) : true;
    const enableCounterBreakoutExit = req.query.enableCounterBreakoutExit !== undefined ? (req.query.enableCounterBreakoutExit === 'true' || req.query.enableCounterBreakoutExit === true) : true;
    const enableCandleBRMIReclaim = req.query.enableCandleBRMIReclaim !== undefined ? (req.query.enableCandleBRMIReclaim === 'true' || req.query.enableCandleBRMIReclaim === true) : true;
    const enableRMISupportHold = req.query.enableRMISupportHold !== undefined ? (req.query.enableRMISupportHold === 'true' || req.query.enableRMISupportHold === true) : true;
    const rmiSupportHoldThreshold = req.query.rmiSupportHoldThreshold !== undefined ? parseFloat(req.query.rmiSupportHoldThreshold) : 10.0;
    const enableCrossStrikeInflection = req.query.enableCrossStrikeInflection !== undefined ? (req.query.enableCrossStrikeInflection === 'true' || req.query.enableCrossStrikeInflection === true) : true;
    const crossStrikeMinWick = req.query.crossStrikeMinWick !== undefined ? parseFloat(req.query.crossStrikeMinWick) : 6.0;
    const maxCEBounceSLDist = req.query.maxCEBounceSLDist !== undefined ? parseFloat(req.query.maxCEBounceSLDist) : 15.0;
    const sellZoneMinWick = req.query.sellZoneMinWick !== undefined ? parseFloat(req.query.sellZoneMinWick) : 4.0;
    const enableCPRResistanceFilter = req.query.enableCPRResistanceFilter !== undefined ? (req.query.enableCPRResistanceFilter === 'true' || req.query.enableCPRResistanceFilter === true) : true;
    const cprCeilingBuffer = req.query.cprCeilingBuffer !== undefined ? parseFloat(req.query.cprCeilingBuffer) : 5.0;
    const openingCprBuffer = req.query.openingCprBuffer !== undefined ? parseFloat(req.query.openingCprBuffer) : 8.0;
    const enableSpotCPRConflictFilter = req.query.enableSpotCPRConflictFilter !== undefined ? (req.query.enableSpotCPRConflictFilter === 'true' || req.query.enableSpotCPRConflictFilter === true) : true;
    const enableOpeningClimaxFilter = req.query.enableOpeningClimaxFilter !== undefined ? (req.query.enableOpeningClimaxFilter === 'true' || req.query.enableOpeningClimaxFilter === true) : true;
    const maxClimaxStretch = req.query.maxClimaxStretch !== undefined ? parseFloat(req.query.maxClimaxStretch) : 35.0;
    const enableBounceExhaustionFilter = req.query.enableBounceExhaustionFilter !== undefined ? (req.query.enableBounceExhaustionFilter === 'true' || req.query.enableBounceExhaustionFilter === true) : true;
    const maxBounceUpperWick = req.query.maxBounceUpperWick !== undefined ? parseFloat(req.query.maxBounceUpperWick) : 12.0;
    const maxBounceTwoBarRange = req.query.maxBounceTwoBarRange !== undefined ? parseFloat(req.query.maxBounceTwoBarRange) : 65.0;
    const enableCPRReversalEntry = req.query.enableCPRReversalEntry !== undefined ? (req.query.enableCPRReversalEntry === 'true' || req.query.enableCPRReversalEntry === true) : true;
    const enableDualCeilingFilter = req.query.enableDualCeilingFilter !== undefined ? (req.query.enableDualCeilingFilter === 'true' || req.query.enableDualCeilingFilter === true) : true;
    const enablePivotRetracementQueue = req.query.enablePivotRetracementQueue !== undefined ? (req.query.enablePivotRetracementQueue === 'true' || req.query.enablePivotRetracementQueue === true) : true;
    const enableRMIReclaimEntry = req.query.enableRMIReclaimEntry !== undefined ? (req.query.enableRMIReclaimEntry === 'true' || req.query.enableRMIReclaimEntry === true) : true;
    const enableCandleBTrendBreakout = req.query.enableCandleBTrendBreakout !== undefined ? (req.query.enableCandleBTrendBreakout === 'true' || req.query.enableCandleBTrendBreakout === true) : true;
    const maxCandleBTrendSLDist = req.query.maxCandleBTrendSLDist !== undefined ? parseFloat(req.query.maxCandleBTrendSLDist) : 20.0;
    const enableCELineWickBreakout = req.query.enableCELineWickBreakout !== undefined ? (req.query.enableCELineWickBreakout === 'true' || req.query.enableCELineWickBreakout === true) : true;
    const maxCELineWickBreakoutSLDist = req.query.maxCELineWickBreakoutSLDist !== undefined ? parseFloat(req.query.maxCELineWickBreakoutSLDist) : 45.0;
    const enableDeadCatBounceGuard = req.query.enableDeadCatBounceGuard !== undefined ? (req.query.enableDeadCatBounceGuard === 'true' || req.query.enableDeadCatBounceGuard === true) : true;
    const enableMacroRegimeInflection = req.query.enableMacroRegimeInflection !== undefined ? (req.query.enableMacroRegimeInflection === 'true' || req.query.enableMacroRegimeInflection === true) : false;
    const macroInflectionMaxRisk = req.query.macroInflectionMaxRisk !== undefined ? parseFloat(req.query.macroInflectionMaxRisk) : 20.0;
    const macroInflectionRRFactor = req.query.macroInflectionRRFactor !== undefined ? parseFloat(req.query.macroInflectionRRFactor) : 4.0;
    const enableDailyCircuitBreaker = req.query.enableDailyCircuitBreaker !== undefined ? (req.query.enableDailyCircuitBreaker === 'true' || req.query.enableDailyCircuitBreaker === true) : false;
    const maxConsecutiveLosses = req.query.maxConsecutiveLosses !== undefined ? parseInt(req.query.maxConsecutiveLosses, 10) : 2;
    const enableCPRSqueezeGuard = req.query.enableCPRSqueezeGuard !== undefined ? (req.query.enableCPRSqueezeGuard === 'true' || req.query.enableCPRSqueezeGuard === true) : true;
    const enableUnifiedReclaim = req.query.enableUnifiedReclaim !== undefined ? (req.query.enableUnifiedReclaim === 'true' || req.query.enableUnifiedReclaim === true) : true;
    const enableCESpringboard = req.query.enableCESpringboard !== undefined ? (req.query.enableCESpringboard === 'true' || req.query.enableCESpringboard === true) : true;
    const enableSpot200EMAGuard = req.query.enableSpot200EMAGuard !== undefined ? (req.query.enableSpot200EMAGuard === 'true' || req.query.enableSpot200EMAGuard === true) : true;
    const fixedTarget = (req.query.fixedTarget !== undefined && req.query.fixedTarget !== '' && !isNaN(parseFloat(req.query.fixedTarget))) ? parseFloat(req.query.fixedTarget) : null;
    const dateFilter = req.query.dateFilter || '2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-11-02,2026-11-03,2026-11-04,2026-11-05,2026-11-06,2026-11-09,2026-11-11,2026-11-12,2026-11-13,2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20,2026-11-23,2026-11-25,2026-11-26,2026-11-27';

    const result = runWaterfallBacktest({
      lotSize, commission, slippage, entryStartTime, entryEndTime, strikeMode, targetPts,
      requireHMBullish, exitOnHMBearish, enableNearCETrail, ceNearThreshold,
      filterInsideSellZone, filterInsideBuyZone, requireHMExitConfirmation,
      sellZoneMinHeadroom, sellZoneBreakoutExpiryBars,
      enableCERejectionExit, ceRejectionDist, enableSellZoneBreakout, breakoutExpiryBars,
      enableBreakoutSL, entrySignalMode, enableRMIBounceEntry, enableCEBounceEntry,
      enableCEFloorSL, enableRMIFloorExit, enableRMIRejectionExit, enableCETargetTouch,
      enableConfluenceMode, maxZoneWidth, zoneRetracementPct, stagnationBars, minConfluence,
      enableCPRExits, enableHMVolExit, filterFalseRejections, enableStrictBull, enableStrictBear,
      enableHammerContinuation, enableCELineBounce, enableNifty9EMAAlignment, enableCounterBreakoutExit,
      enableCandleBRMIReclaim, enableRMISupportHold, rmiSupportHoldThreshold,
      enableCrossStrikeInflection, crossStrikeMinWick, maxCEBounceSLDist, sellZoneMinWick,
      enableCPRResistanceFilter, cprCeilingBuffer, openingCprBuffer, enableSpotCPRConflictFilter,
      enableOpeningClimaxFilter, maxClimaxStretch,
      enableBounceExhaustionFilter, maxBounceUpperWick, maxBounceTwoBarRange,
      enableCPRReversalEntry,
      enableDualCeilingFilter,
      enablePivotRetracementQueue,
      enableRMIReclaimEntry,
      enableCandleBTrendBreakout,
      maxCandleBTrendSLDist,
      enableCELineWickBreakout,
      maxCELineWickBreakoutSLDist,
      enableDeadCatBounceGuard,
      enableMacroRegimeInflection,
      macroInflectionMaxRisk,
      macroInflectionRRFactor,
      enableDailyCircuitBreaker,
      maxConsecutiveLosses,
      enableCPRSqueezeGuard,
      enableUnifiedReclaim,
      enableCESpringboard,
      enableSpot200EMAGuard,
      fixedTarget,
      dateFilter
    });
    console.log(`✅ Waterfall Backtest: ${result.summary.totalTrades} trades, ₹${result.summary.totalNetPnL} Net P&L (Date: ${dateFilter}, Confluence Mode: ${enableConfluenceMode}, CPR Exits: ${enableCPRExits})`);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error('Waterfall backtest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});



// ─────────────────────────────────────────────
// STATIC SERVE + START
// ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 TV Strategy Dashboard running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready at ws://localhost:${PORT}`);
  console.log(`🔔 Webhook endpoint: POST http://localhost:${PORT}/webhook`);
  console.log(`🧪 Test mock signal: POST http://localhost:${PORT}/mock-signal\n`);
  // Warm NSE session on startup
  warmNSESession();
});
