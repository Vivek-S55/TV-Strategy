/**
 * Builds live webhook logs and session state for Nov 13, 2026
 * Using:
 *  - data/NSE_NIFTY, 3.csv
 *  - data/NSE_NIFTY261117C25000, 3.csv
 *  - data/NSE_NIFTY261117P25400, 3.csv
 */

const fs = require('fs');
const path = require('path');
const wb = require('../backend/waterfall-backtest');
const { LiveWaterfallEngine } = require('../backend/live-waterfall');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARTS_DIR = path.join(__dirname, '..', 'Chartsdata');

const dayKey = '2026-11-13';
const dayLabel = 'Friday, Nov 13';

const niftyPath = path.join(DATA_DIR, 'NSE_NIFTY, 3.csv');
const cePath = path.join(DATA_DIR, 'NSE_NIFTY261117C25000, 3.csv');
const pePath = path.join(DATA_DIR, 'NSE_NIFTY261117P25400, 3.csv');

console.log('Loading CSV data for', dayKey, '...');
const niftyBars = wb.parseCSV(fs.readFileSync(niftyPath, 'utf8')).filter(b => b.day === dayKey);
const ceBars = wb.parseCSV(fs.readFileSync(cePath, 'utf8')).filter(b => b.day === dayKey);
const peBars = wb.parseCSV(fs.readFileSync(pePath, 'utf8')).filter(b => b.day === dayKey);

console.log(`Bars found: SPOT = ${niftyBars.length}, CE = ${ceBars.length}, PE = ${peBars.length}`);

const niftyMap = new Map(niftyBars.map(b => [b.timeOnly, b]));
const ceMap = new Map(ceBars.map(b => [b.timeOnly, b]));
const peMap = new Map(peBars.map(b => [b.timeOnly, b]));

const times = Array.from(new Set([
  ...niftyBars.map(b => b.timeOnly),
  ...ceBars.map(b => b.timeOnly),
  ...peBars.map(b => b.timeOnly)
])).sort();

console.log(`Total synchronized bar times: ${times.length} (${times[0]} to ${times[times.length - 1]})`);

function barToPayload(bar, role, symbol) {
  if (!bar) return null;
  const dt = new Date(bar.time);
  const ms = dt.getTime();
  // Simulated alert reception time (bar close time + 2-4 seconds)
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

// 1. Generate live_webhooks_2026-11-13.jsonl and .json
const webhookLines = [];
const webhookArray = [];

for (const t of times) {
  const barPE = peMap.get(t);
  const barCE = ceMap.get(t);
  const barSpot = niftyMap.get(t);

  const peEntry = barToPayload(barPE, 'PE', 'NIFTY261117P25400');
  const ceEntry = barToPayload(barCE, 'CE', 'NIFTY261117C25000');
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
console.log(`✅ Saved ${webhookLines.length} webhook alerts to ${webhookJsonlPath}`);

const webhookJsonPath = path.join(DATA_DIR, `live_webhooks_${dayKey}.json`);
fs.writeFileSync(webhookJsonPath, JSON.stringify(webhookArray, null, 2), 'utf8');
console.log(`✅ Saved ${webhookArray.length} webhook alerts to ${webhookJsonPath}`);

// 2. Generate live_session_2026-11-13.json using LiveWaterfallEngine
const engine = new LiveWaterfallEngine({
  chartsDir: CHARTS_DIR,
  enableDeadCatBounceGuard: true,
  enableConfluenceMode: true
});

engine.resetSession(false);
engine.session.dayKey = dayKey;
engine.session.dayLabel = dayLabel;
engine.session.currentCEFile = 'NSE_NIFTY261117C25000, 3.csv';
engine.session.currentPEFile = 'NSE_NIFTY261117P25400, 3.csv';

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
console.log(`✅ Saved live session snapshot to ${sessionPath}`);

console.log('\n--- Nov 13 Live Session Summary ---');
console.log(`Bars Synced: ${fullState.syncedBars.length}`);
console.log(`Executed Trades: ${fullState.executedTrades.length}`);
console.log(`Skipped Trades: ${fullState.skippedTrades.length}`);
console.log(`Net P&L (Lot 75): ₹${fullState.summary.totalNetPnL.toFixed(2)} (${fullState.summary.totalGrossPoints.toFixed(2)} pts)`);
console.log(`Win Rate: ${fullState.summary.winRate}% (${fullState.summary.winTrades} Wins / ${fullState.summary.lossTrades} Losses)`);

