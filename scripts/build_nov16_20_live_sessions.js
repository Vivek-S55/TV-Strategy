/**
 * BUILDER: build_nov16_20_live_sessions.js
 * 
 * Constructs the standardized live session files (and webhooks) in data/
 * for November 16 to November 20, 2026 using:
 *  - Chartsdata/NSE_NIFTY, 3 (10).csv
 *  - Chartsdata/NSE_NIFTY261123C*.csv
 *  - Chartsdata/NSE_NIFTY261123P*.csv
 * 
 * Without modifying any existing confluence logic!
 */

const fs = require('fs');
const path = require('path');
const wb = require('../backend/waterfall-backtest');
const { LiveWaterfallEngine } = require('../backend/live-waterfall');
const rules = require('../backend/confluence-rules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARTS_DIR = path.join(__dirname, '..', 'Chartsdata');

const NIFTY_SPOT_FILE = 'NSE_NIFTY, 3 (10).csv';
const niftyFullPath = path.join(CHARTS_DIR, NIFTY_SPOT_FILE);

if (!fs.existsSync(niftyFullPath)) {
  console.error(`❌ Spot file not found: ${niftyFullPath}`);
  process.exit(1);
}

const allNiftyBars = wb.parseCSV(fs.readFileSync(niftyFullPath, 'utf8'));

// Target sessions: Nov 16 to Nov 20, 2026
const targetDays = [
  { dayKey: '2026-11-16', dayLabel: 'Monday, Nov 16' },
  { dayKey: '2026-11-17', dayLabel: 'Tuesday, Nov 17' },
  { dayKey: '2026-11-18', dayLabel: 'Wednesday, Nov 18' },
  { dayKey: '2026-11-19', dayLabel: 'Thursday, Nov 19' },
  { dayKey: '2026-11-20', dayLabel: 'Friday, Nov 20' }
];

function barToPayload(bar, role, symbol) {
  if (!bar) return null;
  const dt = new Date(bar.time);
  const ms = dt.getTime();
  const alertTs = new Date(ms + 3000).toISOString();
  const ceLine = bar.cs !== null ? bar.cs : (bar.cr !== null ? bar.cr : null);

  const payload = {
    chartRole: role,
    symbol: symbol,
    time: String(ms),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    ema9: bar.ema9 !== null ? bar.ema9 : null,
    ema20: bar.ema20 !== null ? bar.ema20 : null,
    ema200: bar.ema200 !== null ? bar.ema200 : null,
    pp: bar.pp !== null ? bar.pp : null,
    r1: bar.r1 !== null ? bar.r1 : null,
    s1: bar.s1 !== null ? bar.s1 : null,
    r2: bar.r2 !== null ? bar.r2 : null,
    s2: bar.s2 !== null ? bar.s2 : null,
    r3: bar.r3 !== null ? bar.r3 : null,
    s3: bar.s3 !== null ? bar.s3 : null,
    cs: bar.cs !== null ? bar.cs : null,
    cr: bar.cr !== null ? bar.cr : null,
    ceLine: ceLine,
    longStop: bar.longStop !== null ? bar.longStop : null,
    shortStop: bar.shortStop !== null ? bar.shortStop : null,
    rmiCenter: bar.rmiCenter !== null ? bar.rmiCenter : null,
    longSignal: bar.longSignal || 0,
    shortSignal: bar.shortSignal || 0,
    emaBuyHM: bar.emaBuyHM || 0,
    emaSellHM: bar.emaSellHM || 0,
    rsi: bar.rsi !== null ? bar.rsi : null,
    volStrength: bar.volStrength !== null ? bar.volStrength : null,
    priceStrength: bar.priceStrength !== null ? bar.priceStrength : null
  };

  return { ts: alertTs, payload };
}

console.log('========================================================================');
console.log('📦 BUILDING LIVE SESSION FILES FOR NOV 16 - NOV 20, 2026');
console.log('========================================================================\n');

const summaryResults = [];

for (const session of targetDays) {
  const { dayKey, dayLabel } = session;
  const niftyBars = allNiftyBars.filter(b => b.day === dayKey);

  if (!niftyBars.length) {
    console.warn(`⚠️ No Nifty Spot bars for ${dayKey}. Skipping.`);
    continue;
  }

  const niftyOpen = niftyBars[0].open;
  const refStrike = Math.round(niftyOpen / 100) * 100;
  const ceStrike = refStrike - 200;
  const peStrike = refStrike + 200;

  const ceFileName = `NSE_NIFTY261123C${ceStrike}, 3.csv`;
  const peFileName = `NSE_NIFTY261123P${peStrike}, 3.csv`;

  const ceFullPath = path.join(CHARTS_DIR, ceFileName);
  const peFullPath = path.join(CHARTS_DIR, peFileName);

  if (!fs.existsSync(ceFullPath) || !fs.existsSync(peFullPath)) {
    console.warn(`⚠️ Strike files missing for ${dayKey}: ${ceFileName} or ${peFileName}`);
    continue;
  }

  const ceBars = wb.parseCSV(fs.readFileSync(ceFullPath, 'utf8')).filter(b => b.day === dayKey);
  const peBars = wb.parseCSV(fs.readFileSync(peFullPath, 'utf8')).filter(b => b.day === dayKey);

  console.log(`\n📅 Processing ${dayLabel} (${dayKey}):`);
  console.log(`   Nifty Open: ₹${niftyOpen.toFixed(2)} -> Ref: ${refStrike} -> CE: ${ceStrike} (${ceFileName}) | PE: ${peStrike} (${peFileName})`);
  console.log(`   Bars: Spot = ${niftyBars.length}, CE = ${ceBars.length}, PE = ${peBars.length}`);

  const ceMap = new Map(ceBars.map(b => [b.timeOnly, b]));
  const peMap = new Map(peBars.map(b => [b.timeOnly, b]));
  const niftyMap = new Map(niftyBars.map(b => [b.timeOnly, b]));

  const times = Array.from(new Set([
    ...niftyBars.map(b => b.timeOnly),
    ...ceBars.map(b => b.timeOnly),
    ...peBars.map(b => b.timeOnly)
  ])).sort();

  // 1. Build webhooks
  const webhookLines = [];
  const webhookArray = [];

  for (const t of times) {
    const barPE = peMap.get(t);
    const barCE = ceMap.get(t);
    const barSpot = niftyMap.get(t);

    const peEntry = barToPayload(barPE, 'PE', `NIFTY261123P${peStrike}`);
    const ceEntry = barToPayload(barCE, 'CE', `NIFTY261123C${ceStrike}`);
    const spotEntry = barToPayload(barSpot, 'SPOT', 'NIFTY');

    if (peEntry) {
      webhookLines.push(JSON.stringify(peEntry));
      webhookArray.push(peEntry);
    }
    if (ceEntry) {
      webhookLines.push(JSON.stringify(ceEntry));
      webhookArray.push(ceEntry);
    }
    if (spotEntry) {
      webhookLines.push(JSON.stringify(spotEntry));
      webhookArray.push(spotEntry);
    }
  }

  const webhookJsonlPath = path.join(DATA_DIR, `live_webhooks_${dayKey}.jsonl`);
  fs.writeFileSync(webhookJsonlPath, webhookLines.join('\n') + '\n', 'utf8');

  const webhookJsonPath = path.join(DATA_DIR, `live_webhooks_${dayKey}.json`);
  fs.writeFileSync(webhookJsonPath, JSON.stringify(webhookArray, null, 2), 'utf8');

  // 2. Replay LiveWaterfallEngine
  const engine = new LiveWaterfallEngine({
    chartsDir: CHARTS_DIR,
    enableDeadCatBounceGuard: true,
    enableConfluenceMode: true
  });

  engine.resetSession(false);
  engine.session.dayKey = dayKey;
  engine.session.dayLabel = dayLabel;
  engine.session.currentCEFile = ceFileName;
  engine.session.currentPEFile = peFileName;

  for (const t of times) {
    const barNifty = niftyMap.get(t);
    const barCE = ceMap.get(t);
    const barPE = peMap.get(t);
    if (barNifty) barNifty.chartRole = 'SPOT';
    if (barCE) barCE.chartRole = 'CE';
    if (barPE) barPE.chartRole = 'PE';

    engine.executeSynchronizedBar(t, {
      SPOT: barNifty,
      CE: barCE,
      PE: barPE
    });
  }

  const fullState = engine.getFullState();
  const lastTime = times[times.length - 1];
  fullState.cockpit = {
    lastSyncTime: lastTime,
    spot: niftyMap.get(lastTime) || null,
    ce: ceMap.get(lastTime) || null,
    pe: peMap.get(lastTime) || null
  };

  const sessionPath = path.join(DATA_DIR, `live_session_${dayKey}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(fullState, null, 2), 'utf8');

  summaryResults.push({
    dayKey,
    dayLabel,
    CE: `${ceStrike} CE`,
    PE: `${peStrike} PE`,
    syncedBars: fullState.syncedBars.length,
    trades: fullState.executedTrades.length,
    wins: fullState.summary.winTrades,
    losses: fullState.summary.lossTrades,
    winRate: `${fullState.summary.winRate}%`,
    netPnL: `₹${fullState.summary.totalNetPnL.toFixed(2)}`,
    skips: fullState.skippedTrades.length,
    fileSizeKB: Math.round(fs.statSync(sessionPath).size / 1024)
  });

  console.log(`   ✅ Saved ${sessionPath} (${fullState.syncedBars.length} bars, ${fullState.executedTrades.length} trades, ₹${fullState.summary.totalNetPnL.toFixed(2)} Net P&L)`);
}

console.log('\n========================================================================');
console.log('📊 LIVE SESSION GENERATION SUMMARY TABLE (NOV 16 - NOV 20, 2026)');
console.log('========================================================================');
console.table(summaryResults);
console.log('\n✨ All live session files successfully constructed in data/!\n');

