/**
 * Options Backtest Engine — Phase 1 (Waterfall)
 * backend/options-backtest.js
 *
 * ONE RULE ONLY:
 *   Long Signal = 1  → BUY 23100 CE  (price confirmed above 9 EMA)
 *   Short Signal = 1 → EXIT CE        (price confirmed below 9 EMA)
 *
 *   Short Signal = 1 → BUY 23600 PE  (price confirmed below 9 EMA)
 *   Long Signal = 1  → EXIT PE        (price confirmed above 9 EMA)
 *
 *   EOD 15:15 IST    → Exit whatever is open
 *
 * One trade at a time. Entry/exit at actual CE/PE LTP.
 */

// ─────────────────────────────────────────────────────────────
// CSV PARSER  (works for all 3 TradingView exports)
// ─────────────────────────────────────────────────────────────
function parseTV(csvText) {
  const lines  = csvText.trim().split('\n');
  const header = lines[0].replace(/\r/g, '').split(',').map(h => h.trim().replace(/"/g, ''));

  // Build a name → index map
  const ci = {};
  header.forEach((h, i) => { ci[h.trim()] = i; });

  const fv = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const bv = v => parseFloat(v) === 1;

  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].replace(/\r/g, '').split(',').map(v => v.trim().replace(/"/g, ''));
    if (r.length < 5) continue;

    const timeRaw = r[ci['time']] || r[0] || '';
    let ts;
    if (/^\d{10,13}$/.test(timeRaw)) {
      ts = parseInt(timeRaw) * (timeRaw.length === 10 ? 1000 : 1);
    } else {
      ts = new Date(timeRaw).getTime();
    }
    if (isNaN(ts)) continue;

    const closeVal = fv(r[ci['close']]);
    if (closeVal === null) continue;

    // IST date + hhmm
    const istStr = new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });
    const date   = istStr.slice(0, 10);
    const [hh, mm] = istStr.slice(11, 16).split(':').map(Number);

    bars.push({
      ts,
      date,
      hhmm:      hh * 100 + mm,
      open:      fv(r[ci['open']])  ?? closeVal,
      high:      fv(r[ci['high']])  ?? closeVal,
      low:       fv(r[ci['low']])   ?? closeVal,
      close:     closeVal,
      longSig:   bv(r[ci['Long Signal']]),
      shortSig:  bv(r[ci['Short Signal']]),
      ema9:      fv(r[ci['9 EMA']]),
      pp:        fv(r[ci['PP']]),
      r1:        fv(r[ci['R1']]),
      s1:        fv(r[ci['S1']]),
    });
  }

  return bars.sort((a, b) => a.ts - b.ts);
}

// ─────────────────────────────────────────────────────────────
// TIMESTAMP LOOKUP MAP
// ─────────────────────────────────────────────────────────────
function buildTsMap(bars) {
  const map = new Map();
  bars.forEach(b => map.set(b.ts, b));
  return map;
}

function getLTP(map, ts) {
  if (map.has(ts)) return map.get(ts).close;
  // ±1 candle tolerance (30s, 60s)
  for (const d of [-30000, 30000, -60000, 60000, -180000, 180000]) {
    if (map.has(ts + d)) return map.get(ts + d).close;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────
function runOptionsBacktest(futuresBars, ceBars, peBars, opts = {}) {
  const {
    startDate      = '2026-09-16',
    endDate        = '2026-09-22',
    lotSize        = 750,
    commission     = 20,
    slippage       = 0.5,
    initialCapital = 100000,
    targetPts      = 25,   // Nifty futures points — exit as soon as reached
  } = opts;

  const filtered = futuresBars.filter(b => b.date >= startDate && b.date <= endDate);
  if (filtered.length < 2) {
    throw new Error(`No bars in range ${startDate}–${endDate}. Check your Futures CSV.`);
  }

  const ceMap = buildTsMap(ceBars);
  const peMap = buildTsMap(peBars);

  let position   = null;
  let equity     = initialCapital;
  const trades   = [];
  const equityCurve = [];
  const skipped  = [];

  for (let i = 0; i < filtered.length; i++) {
    const bar = filtered[i];

    // ── EOD: flat all positions at 15:15 ────────────────────
    if (bar.hhmm >= 1515 && position) {
      const ltp = position.dir === 'CE' ? getLTP(ceMap, bar.ts) : getLTP(peMap, bar.ts);
      if (ltp !== null) {
        const exitLTP = ltp - slippage;
        const pnl = (exitLTP - position.entryLTP) * lotSize - commission * 2;
        equity += pnl;
        trades.push(makeTrade(trades.length + 1, position, bar, exitLTP, pnl, equity, 'EOD Exit 15:15'));
      }
      position = null;
    }

    if (bar.hhmm >= 1515) {
      equityCurve.push({ ts: bar.ts, equity: Math.round(equity), date: bar.date });
      continue;
    }

    // ── EXIT ────────────────────────────────────────────────
    if (position) {
      const inCE = position.dir === 'CE';
      const inPE = position.dir === 'PE';
      const curLTP = inCE ? getLTP(ceMap, bar.ts) : getLTP(peMap, bar.ts);

      // Priority 1: Option Premium Target reached (+25 pts on CE or PE chart)
      const targetHit = curLTP !== null && (curLTP - position.entryLTP >= targetPts);

      // Priority 2: Opposite EMA signal
      const oppositeSignal =
        (inCE && bar.shortSig) ||
        (inPE && bar.longSig);

      const shouldExit = (targetHit || oppositeSignal) && curLTP !== null;

      if (shouldExit) {
        const exitLTP = curLTP - slippage;
        const pnl = (exitLTP - position.entryLTP) * lotSize - commission * 2;
        equity += pnl;
        const reason = targetHit
          ? `🎯 Target +${targetPts}pt hit on ${position.dir} (LTP ₹${position.entryLTP.toFixed(1)} → ₹${exitLTP.toFixed(1)})`
          : (inCE ? 'Short Signal → EMA SELL' : 'Long Signal → EMA BUY');
        trades.push(makeTrade(trades.length + 1, position, bar, exitLTP, pnl, equity, reason));
        position = null;
      }
    }

    // ── ENTRY: fresh signal, no open position ────────────────
    if (!position && bar.hhmm >= 915 && bar.hhmm < 1510) {

      let dir = null;
      if (bar.longSig)  dir = 'CE';
      if (bar.shortSig) dir = 'PE';

      if (dir) {
        const map = dir === 'CE' ? ceMap : peMap;
        const ltp = getLTP(map, bar.ts);

        if (ltp !== null) {
          position = {
            dir,
            entryTs:    bar.ts,
            entryDate:  bar.date,
            entryHHMM:  bar.hhmm,
            entryFut:   bar.close,
            entryLTP:   ltp + slippage,
            ema9:       bar.ema9,
            pp:         bar.pp,
          };
        } else {
          skipped.push({
            ts: bar.ts, date: bar.date, hhmm: bar.hhmm,
            dir, futPrice: bar.close,
            reason: 'No matching LTP in options chart at this timestamp',
          });
        }
      }
    }

    equityCurve.push({ ts: bar.ts, equity: Math.round(equity), date: bar.date });
  }

  // Close any position left at end of data
  if (position) {
    const last = filtered[filtered.length - 1];
    const ltp  = position.dir === 'CE' ? getLTP(ceMap, last.ts) : getLTP(peMap, last.ts);
    if (ltp) {
      const pnl = (ltp - position.entryLTP) * lotSize - commission * 2;
      equity += pnl;
      trades.push(makeTrade(trades.length + 1, position, last, ltp, pnl, equity, 'End of Data'));
    }
    position = null;
  }

  // ── SUMMARY ──────────────────────────────────────────────
  const wins      = trades.filter(t => t.result === 'WIN');
  const losses    = trades.filter(t => t.result === 'LOSS');
  const totalPnL  = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  const byDay = {};
  trades.forEach(t => {
    if (!byDay[t.entryDate]) byDay[t.entryDate] = { trades: 0, wins: 0, pnl: 0 };
    byDay[t.entryDate].trades++;
    if (t.result === 'WIN') byDay[t.entryDate].wins++;
    byDay[t.entryDate].pnl += t.pnl;
  });

  const ceTrades = trades.filter(t => t.dir === 'CE');
  const peTrades = trades.filter(t => t.dir === 'PE');
  const ceWins   = ceTrades.filter(t => t.result === 'WIN');
  const peWins   = peTrades.filter(t => t.result === 'WIN');

  return {
    summary: {
      startDate, endDate,
      barsAnalysed:   filtered.length,
      daysAnalysed:   [...new Set(filtered.map(b => b.date))].length,
      totalTrades:    trades.length,
      ceTrades:       ceTrades.length,
      peTrades:       peTrades.length,
      ceWinRate:      ceTrades.length > 0 ? Math.round(ceWins.length / ceTrades.length * 100) : 0,
      peWinRate:      peTrades.length > 0 ? Math.round(peWins.length / peTrades.length * 100) : 0,
      wins:           wins.length,
      losses:         losses.length,
      winRate:        trades.length > 0 ? Math.round(wins.length / trades.length * 100) : 0,
      totalPnL:       Math.round(totalPnL),
      grossWin:       Math.round(grossWin),
      grossLoss:      Math.round(grossLoss),
      profitFactor:   grossLoss > 0 ? Math.round(grossWin / grossLoss * 100) / 100 : null,
      avgWin:         wins.length   > 0 ? Math.round(grossWin   / wins.length)   : 0,
      avgLoss:        losses.length > 0 ? Math.round(grossLoss / losses.length)  : 0,
      maxDrawdown:    Math.round(computeMaxDD(equityCurve.map(e => e.equity))),
      finalEquity:    Math.round(equity),
      returnPct:      Math.round(totalPnL / initialCapital * 10000) / 100,
      skippedSignals: skipped.length,
      lotSize,
      initialCapital,
    },
    trades,
    equityCurve,
    dayBreakdown: byDay,
    skipped,
  };
}

function makeTrade(id, pos, exitBar, exitLTP, pnl, equity, exitReason) {
  const fmt = ts => new Date(ts).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
  });
  return {
    id,
    dir:          pos.dir,
    entryDate:    pos.entryDate,
    entryTime:    fmt(pos.entryTs),
    exitDate:     exitBar.date,
    exitTime:     fmt(exitBar.ts),
    durationMins: Math.round((exitBar.ts - pos.entryTs) / 60000),
    entryFut:     +pos.entryFut.toFixed(2),
    entryLTP:     +pos.entryLTP.toFixed(2),
    exitLTP:      +exitLTP.toFixed(2),
    ltpMove:      +(exitLTP - pos.entryLTP).toFixed(2),
    pnl:          Math.round(pnl),
    result:       pnl >= 0 ? 'WIN' : 'LOSS',
    exitReason,
    equity:       Math.round(equity),
    ema9:         pos.ema9 ? +pos.ema9.toFixed(2) : null,
    pp:           pos.pp   ? +pos.pp.toFixed(2)   : null,
  };
}

function computeMaxDD(arr) {
  let peak = arr[0] || 0, maxDD = 0;
  for (const v of arr) {
    if (v > peak) peak = v;
    if (peak - v > maxDD) maxDD = peak - v;
  }
  return maxDD;
}

module.exports = { parseTV, runOptionsBacktest };
