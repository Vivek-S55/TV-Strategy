/**
 * DATA INVENTORY BUILDER: export-daily-sessions.js
 * 
 * Generates standardized day-wise JSON session files in data/live_session_YYYY-MM-DD.json
 * from historical CSV charts in Chartsdata/ for October 26 to November 05.
 * 
 * Usage:
 *   node scripts/export-daily-sessions.js
 *   node scripts/export-daily-sessions.js --fixedTarget=15
 *   node scripts/export-daily-sessions.js --dates=2026-11-04
 */

const fs = require('fs');
const path = require('path');
const wb = require('../backend/waterfall-backtest');
const { LiveWaterfallEngine } = require('../backend/live-waterfall');
const rules = require('../backend/confluence-rules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARTS_DIR = path.join(__dirname, '..', 'Chartsdata');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Parse CLI flags
const args = process.argv.slice(2);
let fixedTarget = null;
let dateFilterArg = null;

for (const arg of args) {
  if (arg.startsWith('--fixedTarget=')) {
    const val = arg.split('=')[1];
    if (val && !isNaN(parseFloat(val))) fixedTarget = parseFloat(val);
  } else if (arg.startsWith('--dates=')) {
    dateFilterArg = arg.split('=')[1];
  }
}

const DEFAULT_DAYS = [
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-09'
];

const targetDays = dateFilterArg ? dateFilterArg.split(',').map(s => s.trim()) : DEFAULT_DAYS;

console.log('========================================================================');
console.log('📦 WATERFALL DATA INVENTORY BUILDER');
console.log(`   Exit Formula: ${fixedTarget ? `Fixed Target (${fixedTarget} pts)` : 'Standard Dynamic Exits (Baseline)'}`);
console.log(`   Target Days (${targetDays.length}): ${targetDays.join(', ')}`);
console.log('========================================================================\n');

const inventoryReport = [];

for (const dayKey of targetDays) {
  const dayCfg = wb.SINGLE_PRIMARY_ASSIGNMENTS[dayKey];
  if (!dayCfg) {
    console.warn(`⚠️ No assignment configuration found for ${dayKey}. Skipping.`);
    continue;
  }

  const niftyPath = wb.resolveNiftyPath(CHARTS_DIR, dayKey);
  const ceResolved = wb.resolveOptionFile(CHARTS_DIR, dayCfg.CE[0]);
  const peResolved = wb.resolveOptionFile(CHARTS_DIR, dayCfg.PE[0]);

  const niftyBars = wb.parseCSV(fs.readFileSync(niftyPath, 'utf8')).filter(b => b.day === dayKey);
  const ceBars = wb.parseCSV(fs.readFileSync(path.join(CHARTS_DIR, ceResolved), 'utf8')).filter(b => b.day === dayKey);
  const peBars = wb.parseCSV(fs.readFileSync(path.join(CHARTS_DIR, peResolved), 'utf8')).filter(b => b.day === dayKey);

  if (!niftyBars.length || (!ceBars.length && !peBars.length)) {
    console.warn(`⚠️ Incomplete bar data for ${dayKey} (Spot: ${niftyBars.length}, CE: ${ceBars.length}, PE: ${peBars.length}). Skipping.`);
    continue;
  }

  const ceMap = new Map(ceBars.map(b => [b.timeOnly, b]));
  const peMap = new Map(peBars.map(b => [b.timeOnly, b]));
  const niftyMap = new Map(niftyBars.map(b => [b.timeOnly, b]));
  const times = Array.from(new Set([
    ...niftyBars.map(b => b.timeOnly),
    ...ceBars.map(b => b.timeOnly),
    ...peBars.map(b => b.timeOnly)
  ])).sort();

  // Initialize engine with matching options
  const engine = new LiveWaterfallEngine({
    chartsDir: CHARTS_DIR,
    fixedTarget: fixedTarget,
    enableDeadCatBounceGuard: true,
    enableConfluenceMode: true
  });

  // Reset engine session for this specific historical day
  engine.resetSession(false);
  engine.session.dayKey = dayKey;
  engine.session.dayLabel = dayCfg.dayLabel;
  engine.session.currentCEFile = ceResolved;
  engine.session.currentPEFile = peResolved;

  // Replay all 3-min synchronized bars
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

  // Set cockpit with last bar snapshot
  const lastTime = times[times.length - 1];
  fullState.cockpit = {
    lastSyncTime: lastTime,
    spot: niftyMap.get(lastTime) || null,
    ce: ceMap.get(lastTime) || null,
    pe: peMap.get(lastTime) || null
  };

  // Write out to data/live_session_YYYY-MM-DD.json
  const outPath = path.join(DATA_DIR, `live_session_${dayKey}.json`);
  fs.writeFileSync(outPath, JSON.stringify(fullState, null, 2));

  // Run parity check against waterfall backtest
  const bt = wb.runWaterfallBacktest({
    dateFilter: dayKey,
    fixedTarget: fixedTarget,
    enableDeadCatBounceGuard: true,
    enableConfluenceMode: true
  });

  const btSummary = bt.daySummary[dayKey] || { trades: 0, wins: 0, totalNetPnL: 0 };
  const parityMatch = (fullState.executedTrades.length === btSummary.trades) &&
                      (Math.abs(fullState.summary.totalNetPnL - btSummary.totalNetPnL) < 0.1);

  inventoryReport.push({
    dayKey,
    dayLabel: dayCfg.dayLabel,
    strikeCE: rules.cleanStrikeName(ceResolved),
    strikePE: rules.cleanStrikeName(peResolved),
    bars: fullState.syncedBars.length,
    trades: fullState.executedTrades.length,
    wins: fullState.summary.winTrades,
    losses: fullState.summary.lossTrades,
    netPnL: fullState.summary.totalNetPnL,
    skips: fullState.skippedTrades.length,
    parity: parityMatch ? '✅ MATCH' : '⚠️ MISMATCH',
    fileSizeKB: Math.round(fs.statSync(outPath).size / 1024)
  });

  console.log(`✓ [${dayKey}] ${dayCfg.dayLabel} -> data/live_session_${dayKey}.json (${fullState.syncedBars.length} bars, ${fullState.executedTrades.length} trades, ₹${fullState.summary.totalNetPnL.toFixed(2)} Net P&L) [${parityMatch ? 'PARITY OK' : 'CHECK NEEDED'}]`);
}

console.log('\n========================================================================');
console.log('📊 DATA INVENTORY GENERATION SUMMARY TABLE');
console.log('========================================================================');
console.table(inventoryReport);
console.log('\n✨ All day-wise session JSON files successfully generated and saved to data/!\n');
