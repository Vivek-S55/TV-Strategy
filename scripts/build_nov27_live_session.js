/**
 * BUILDER: build_nov27_live_session.js
 * 
 * Constructs the standardized live session file (and webhooks) in data/
 * for Friday, November 27, 2026 using:
 *  - data/NSE_NIFTY, 3 (13).csv
 *  - data/NSE_NIFTY261201C25600, 3.csv
 *  - data/NSE_NIFTY261201P26000, 3 (1).csv
 * 
 * Without modifying any engine logic!
 */

const fs = require('fs');
const path = require('path');
const wb = require('../backend/waterfall-backtest');
const { LiveWaterfallEngine } = require('../backend/live-waterfall');

const DATA_DIR = path.join(__dirname, '..', 'data');
const spotFile = path.join(DATA_DIR, 'NSE_NIFTY, 3 (13).csv');
const ceFile = path.join(DATA_DIR, 'NSE_NIFTY261201C25600, 3.csv');
const peFile = path.join(DATA_DIR, 'NSE_NIFTY261201P26000, 3 (1).csv');

const dayKey = '2026-11-27';
const dayLabel = 'Friday, Nov 27';
const ceStrike = 25600;
const peStrike = 26000;

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
console.log('📦 BUILDING LIVE SESSION FILE FOR FRIDAY, NOV 27, 2026');
console.log('========================================================================\n');

const spotBars = wb.parseCSV(fs.readFileSync(spotFile, 'utf8')).filter(b => b.day === dayKey);
const ceBars = wb.parseCSV(fs.readFileSync(ceFile, 'utf8')).filter(b => b.day === dayKey);
const peBars = wb.parseCSV(fs.readFileSync(peFile, 'utf8')).filter(b => b.day === dayKey);

console.log(`Bars loaded: Spot = ${spotBars.length}, CE = ${ceBars.length}, PE = ${peBars.length}`);

const ceMap = new Map(ceBars.map(b => [b.timeOnly, b]));
const peMap = new Map(peBars.map(b => [b.timeOnly, b]));
const niftyMap = new Map(spotBars.map(b => [b.timeOnly, b]));

const times = Array.from(new Set([
  ...spotBars.map(b => b.timeOnly),
  ...ceBars.map(b => b.timeOnly),
  ...peBars.map(b => b.timeOnly)
])).sort();

console.log(`Total synchronized timestamps: ${times.length}`);

// Forward-fill Spot for end-of-day timestamps if spot ended early
let lastSpot = null;
for (const t of times) {
  if (niftyMap.has(t)) {
    lastSpot = niftyMap.get(t);
  } else if (lastSpot) {
    niftyMap.set(t, { ...lastSpot, timeOnly: t, time: `${dayKey}T${t}:00+05:30` });
  }
}

// 1. Build webhooks
const webhookLines = [];
const webhookArray = [];

for (const t of times) {
  const barPE = peMap.get(t);
  const barCE = ceMap.get(t);
  const barSpot = niftyMap.get(t);

  const peEntry = barToPayload(barPE, 'PE', `NIFTY261201P${peStrike}`);
  const ceEntry = barToPayload(barCE, 'CE', `NIFTY261201C${ceStrike}`);
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

console.log(`✅ Webhooks written: ${webhookArray.length} alerts saved to disk`);

// 2. Replay LiveWaterfallEngine
const engine = new LiveWaterfallEngine();

engine.resetSession(false);
engine.session.dayKey = dayKey;
engine.session.dayLabel = dayLabel;
engine.session.currentCEFile = path.basename(ceFile);
engine.session.currentPEFile = path.basename(peFile);

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

console.log(`\n✅ Saved ${sessionPath}`);
console.log(`   Synced Bars: ${fullState.syncedBars.length}`);
console.log(`   Trades: ${fullState.executedTrades.length} (${fullState.summary.winTrades}W / ${fullState.summary.lossTrades}L, Win Rate: ${fullState.summary.winRate}%)`);
console.log(`   Net P&L: ₹${fullState.summary.totalNetPnL.toFixed(2)}`);
console.log(`   Skips: ${fullState.skippedTrades.length}`);
console.log(`   File size: ${Math.round(fs.statSync(sessionPath).size / 1024)} KB\n`);

