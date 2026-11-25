/**
 * Backtest Engine v2 — backend/backtest.js
 *
 * Now supports the FULL TradingView export format from "Vivek's Dashboard" indicator.
 * All indicator values (EMA, CPR, HM Confirmed signals, RMI, Stops) are read
 * directly from the CSV columns — NO approximation needed.
 *
 * CSV columns expected (from TradingView "Download Chart Data"):
 *   time, open, high, low, close,
 *   EMA BUY (HM Confirmed), EMA SELL (HM Confirmed),
 *   SMA Low, SMA High, VWAP,
 *   S3, R3, S1, R1, S2, R2, PP, CR, CS,
 *   9 EMA, 20 EMA, 200 EMA,
 *   Long Signal, Short Signal,
 *   RMI Center, Long Stop, Long Stop Start, Buy Label,
 *   Short Stop, Short Stop Start, Sell Label,
 *   RSI, Centre line, Volume strength, Price strength
 */

// ─── CSV PARSER ─────────────────────────────────────────────
function parseCSV(csvText) {
  const lines  = csvText.trim().split('\n');
  const header = lines[0].replace(/\r/g, '').split(',').map(h => h.trim().replace(/"/g, ''));

  // Build column index map
  const col = {};
  header.forEach((h, i) => { col[h.toLowerCase()] = i; });

  // Helper: get column value by name (case-insensitive, partial match)
  const getCol = (row, ...names) => {
    for (const name of names) {
      const key = Object.keys(col).find(k => k.includes(name.toLowerCase()));
      if (key !== undefined && row[col[key]] !== undefined) return row[col[key]];
    }
    return null;
  };

  // Detect if this is a TradingView indicator-enriched export
  const hasIndicators = header.some(h => h.toLowerCase().includes('ema buy') || h.toLowerCase().includes('long signal') || h.toLowerCase().includes('9 ema'));

  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].replace(/\r/g, '').split(',').map(v => v.trim().replace(/"/g, ''));
    if (row.length < 4) continue;

    // Parse timestamp
    const timeRaw = row[0];
    let ts;
    if (/^\d{10,13}$/.test(timeRaw)) {
      ts = parseInt(timeRaw) * (timeRaw.length === 10 ? 1000 : 1);
    } else {
      ts = new Date(timeRaw.replace(' ', 'T')).getTime();
    }
    if (isNaN(ts)) continue;

    const dt   = new Date(ts);
    const date = dt.toISOString().slice(0, 10);
    const hhmm = dt.getHours() * 100 + dt.getMinutes();

    const fv = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const bv = (v) => parseFloat(v) === 1;

    const bar = {
      ts, date, hhmm,
      open:   fv(row[1]) || fv(getCol(row, 'open')),
      high:   fv(row[2]) || fv(getCol(row, 'high')),
      low:    fv(row[3]) || fv(getCol(row, 'low')),
      close:  fv(row[4]) || fv(getCol(row, 'close')),
    };

    if (!bar.close) continue;
    bar.open  = bar.open  || bar.close;
    bar.high  = bar.high  || bar.close;
    bar.low   = bar.low   || bar.close;

    if (hasIndicators) {
      // ── Indicator columns (from TradingView export) ─────────
      bar.emaBuyHM    = bv(getCol(row, 'ema buy'));        // EMA BUY (HM Confirmed)
      bar.emaSellHM   = bv(getCol(row, 'ema sell'));       // EMA SELL (HM Confirmed)
      bar.longSignal  = bv(getCol(row, 'long signal'));    // Long Signal (broader buy)
      bar.shortSignal = bv(getCol(row, 'short signal'));   // Short Signal (broader sell)
      bar.ema9        = fv(getCol(row, '9 ema'));
      bar.ema20       = fv(getCol(row, '20 ema'));
      bar.ema200      = fv(getCol(row, '200 ema'));
      bar.pp          = fv(getCol(row, 'pp'));             // CPR Pivot Point
      bar.r1          = fv(getCol(row, 'r1'));
      bar.s1          = fv(getCol(row, 's1'));
      bar.r2          = fv(getCol(row, 'r2'));
      bar.s2          = fv(getCol(row, 's2'));
      bar.rmiCenter   = fv(getCol(row, 'rmi center'));
      bar.longStop    = fv(getCol(row, 'long stop')) || fv(getCol(row, 'longstop'));
      bar.shortStop   = fv(getCol(row, 'short stop')) || fv(getCol(row, 'shortstop'));
      bar.rsi         = fv(getCol(row, 'rsi'));
      bar.volStrength = fv(getCol(row, 'volume strength'));
      bar.priceStr    = fv(getCol(row, 'price strength'));
      bar.smaLow      = fv(getCol(row, 'sma low'));
      bar.smaHigh     = fv(getCol(row, 'sma high'));
      bar.hasIndicators = true;
    } else {
      bar.hasIndicators = false;
    }

    bars.push(bar);
  }

  return bars.sort((a, b) => a.ts - b.ts);
}

// ─── EMA COMPUTATION (fallback for plain OHLCV) ─────────────
function computeEMA(closes, period) {
  const k = 2 / (period + 1);
  const result = new Array(closes.length).fill(null);
  let firstIdx = period - 1;
  if (firstIdx >= closes.length) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  result[firstIdx] = sum / period;
  for (let i = firstIdx + 1; i < closes.length; i++) {
    result[i] = closes[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

// ─── CPR COMPUTATION (fallback for plain OHLCV) ─────────────
function computeDailyCPR(bars) {
  const dayMap = {};
  bars.forEach(b => {
    const date = b.date;
    if (!dayMap[date]) dayMap[date] = { high: b.high, low: b.low, close: b.close };
    else {
      dayMap[date].high  = Math.max(dayMap[date].high, b.high);
      dayMap[date].low   = Math.min(dayMap[date].low,  b.low);
      dayMap[date].close = b.close;
    }
  });
  const dates = Object.keys(dayMap).sort();
  const cprByDate = {};
  for (let i = 1; i < dates.length; i++) {
    const prev = dayMap[dates[i - 1]];
    const pp   = (prev.high + prev.low + prev.close) / 3;
    cprByDate[dates[i]] = { pp, r1: 2 * pp - prev.low, s1: 2 * pp - prev.high };
  }
  return cprByDate;
}

// ─── MAIN BACKTEST ENGINE ─────────────────────────────────────
function runBacktest(bars, options = {}) {
  const {
    useEMAHM        = true,
    useLongShort    = true,
    useTripleAlign  = true,
    useZoneMomentum = true,
    useStructural   = true,
    useStopLoss     = true,
    exitOnEMAFlip   = true,
    exitOnOpposite  = true,
    exitDistancePts = 50,
    initialCapital  = 100000,
    lotSize         = 75,
    commission      = 20,
    slippage        = 2,
  } = options;

  if (bars.length < 20) {
    throw new Error(`Need at least 20 bars. Got ${bars.length}.`);
  }

  const hasIndicators = bars.some(b => b.hasIndicators);

  // If plain OHLCV, compute indicators
  let closes, ema9arr, ema20arr, ema200arr, cprByDate;
  if (!hasIndicators) {
    if (bars.length < 200) throw new Error(`Plain OHLCV needs 200+ bars. Got ${bars.length}.`);
    closes   = bars.map(b => b.close);
    ema9arr  = computeEMA(closes, 9);
    ema20arr = computeEMA(closes, 20);
    ema200arr = computeEMA(closes, 200);
    cprByDate = computeDailyCPR(bars);
  }

  // State
  let emaState       = 'Neutral';
  let cprDirection   = 'None';
  let ema200Dir      = 'None';
  let buyZoneActive  = false;
  let buyZoneLow = null, buyZoneHigh = null;
  let sellZoneActive = false;
  let sellZoneLow = null, sellZoneHigh = null;
  let prevDate       = null;

  let position = null;
  const trades = [];
  let equity   = initialCapital;
  const equityCurve = [];
  const signalLog   = [];

  for (let i = 0; i < bars.length; i++) {
    const bar  = bars[i];
    const c    = bar.close;

    // Get indicator values
    let e9, e20, e200, pp, longStop, shortStop;
    if (hasIndicators) {
      e9        = bar.ema9;
      e20       = bar.ema20;
      e200      = bar.ema200;
      pp        = bar.pp;
      longStop  = bar.longStop;
      shortStop = bar.shortStop;
    } else {
      e9    = ema9arr[i];
      e20   = ema20arr[i];
      e200  = ema200arr[i];
      const cpr = cprByDate[bar.date] || null;
      pp    = cpr ? cpr.pp : null;
      longStop = null;
      shortStop = null;
    }

    if (!e9 || !e20) {
      equityCurve.push({ ts: bar.ts, equity: Math.round(equity), date: bar.date });
      continue;
    }

    // Daily reset
    if (bar.date !== prevDate) {
      prevDate     = bar.date;
      emaState     = 'Neutral';
      cprDirection = 'None';
      ema200Dir    = 'None';
      buyZoneActive  = false;
      sellZoneActive = false;
    }

    // Compute EMA state
    if (e9 > e20 && i > 0) {
      const pe9  = hasIndicators ? bars[i-1].ema9 : ema9arr[i-1];
      const pe20 = hasIndicators ? bars[i-1].ema20 : ema20arr[i-1];
      if (pe9 !== null && pe20 !== null && pe9 <= pe20) emaState = 'BUY';
    } else if (e9 < e20 && i > 0) {
      const pe9  = hasIndicators ? bars[i-1].ema9 : ema9arr[i-1];
      const pe20 = hasIndicators ? bars[i-1].ema20 : ema20arr[i-1];
      if (pe9 !== null && pe20 !== null && pe9 >= pe20) emaState = 'SELL';
    }

    // CPR direction
    if (pp) {
      if (c > pp) cprDirection = 'BULL';
      else if (c < pp) cprDirection = 'BEAR';
    }

    // 200 EMA direction
    if (e200) {
      if (c > e200) ema200Dir = 'BULL';
      else if (c < e200) ema200Dir = 'BEAR';
    }

    // Triple alignment
    const ema9Bull = c > e9;
    const ema9Bear = c < e9;
    const bullAlign = cprDirection === 'BULL' && ema200Dir === 'BULL' && ema9Bull;
    const bearAlign = cprDirection === 'BEAR' && ema200Dir === 'BEAR' && ema9Bear;
    const prevBullAlign = i > 0 ? (() => {
      const pb = bars[i-1];
      const pe9 = hasIndicators ? pb.ema9 : ema9arr[i-1];
      const pe200 = hasIndicators ? pb.ema200 : ema200arr[i-1];
      const ppp = hasIndicators ? pb.pp : null;
      if (!pe9 || !pe200) return false;
      const pCPRDir = ppp ? (pb.close > ppp ? 'BULL' : 'BEAR') : 'None';
      const p200Dir = pb.close > pe200 ? 'BULL' : 'BEAR';
      return pCPRDir === 'BULL' && p200Dir === 'BULL' && pb.close > pe9;
    })() : false;
    const prevBearAlign = i > 0 ? (() => {
      const pb = bars[i-1];
      const pe9 = hasIndicators ? pb.ema9 : ema9arr[i-1];
      const pe200 = hasIndicators ? pb.ema200 : ema200arr[i-1];
      const ppp = hasIndicators ? pb.pp : null;
      if (!pe9 || !pe200) return false;
      const pCPRDir = ppp ? (pb.close < ppp ? 'BEAR' : 'BULL') : 'None';
      const p200Dir = pb.close < pe200 ? 'BEAR' : 'BULL';
      return pCPRDir === 'BEAR' && p200Dir === 'BEAR' && pb.close < pe9;
    })() : false;

    const newBullAlign = bullAlign && !prevBullAlign;
    const newBearAlign = bearAlign && !prevBearAlign;

    // Zone momentum
    if (emaState === 'BUY' && !buyZoneActive) {
      buyZoneLow = e9; buyZoneHigh = e20; buyZoneActive = true;
    }
    if (emaState === 'SELL') buyZoneActive = false;
    if (emaState === 'SELL' && !sellZoneActive) {
      sellZoneLow = e20; sellZoneHigh = e9; sellZoneActive = true;
    }
    if (emaState === 'BUY') sellZoneActive = false;

    const prevC = i > 0 ? bars[i-1].close : c;
    const buyMomentum   = buyZoneActive  && buyZoneHigh  && c > buyZoneHigh  && c > prevC;
    const sellMomentum  = sellZoneActive && sellZoneLow  && c < sellZoneLow  && c < prevC;

    // ── DIRECT & PVR NATIVE SIGNALS ──────────────
    const hasPVR = (bar.rsi !== null && bar.priceStr !== null && bar.volStrength !== null);
    const pvrBuyState  = hasPVR ? (bar.rsi > bar.priceStr && bar.rsi > bar.volStrength) : false;
    const pvrSellState = hasPVR ? (bar.rsi < bar.priceStr && bar.rsi < bar.volStrength) : false;
    const emaBuyHM   = hasIndicators ? (bar.emaBuyHM || (bar.longSignal && pvrBuyState))   : false;
    const emaSellHM  = hasIndicators ? (bar.emaSellHM || (bar.shortSignal && pvrSellState)) : false;
    const longSig    = hasIndicators ? bar.longSignal  : false;
    const shortSig   = hasIndicators ? bar.shortSignal : false;

    // ── EOD EXIT ───────────────────────────────────────────
    const isEOD = bar.hhmm >= 1515;
    if (isEOD && position) {
      const exitP = c + (position.dir === 'BUY' ? -slippage : slippage);
      const pts   = position.dir === 'BUY' ? exitP - position.entry : position.entry - exitP;
      const pnl   = pts * lotSize - commission * 2;
      equity += pnl;
      trades.push(buildTrade(trades.length + 1, position, exitP, pts, pnl, equity, bar.ts, bar.date, 'EOD Exit'));
      position = null;
    }

    // ── EXIT CONDITIONS ─────────────────────────────────────
    if (position) {
      let exitReason = null;
      const inLong  = position.dir === 'BUY';
      const inShort = position.dir === 'SELL';

      // Stop loss from indicator
      if (useStopLoss && inLong  && longStop  && c < longStop)  exitReason = 'Long Stop Hit';
      if (useStopLoss && inShort && shortStop && c > shortStop) exitReason = 'Short Stop Hit';

      // EMA flip
      if (!exitReason && exitOnEMAFlip) {
        if (inLong  && (emaSellHM || shortSig) && c > position.entry + exitDistancePts) exitReason = 'EMA Flip → SELL';
        if (inShort && (emaBuyHM  || longSig)  && c < position.entry - exitDistancePts) exitReason = 'EMA Flip → BUY';
      }

      // Opposite Tier-1 signal
      if (!exitReason && exitOnOpposite) {
        if (inLong  && newBearAlign)                exitReason = 'Opposite Bear Align';
        if (inShort && newBullAlign)                exitReason = 'Opposite Bull Align';
        if (inLong  && (emaSellHM || shortSig))     exitReason = 'HM SELL Signal';
        if (inShort && (emaBuyHM  || longSig))      exitReason = 'HM BUY Signal';
      }

      if (exitReason) {
        const exitP = c + (position.dir === 'BUY' ? -slippage : slippage);
        const pts   = position.dir === 'BUY' ? exitP - position.entry : position.entry - exitP;
        const pnl   = pts * lotSize - commission * 2;
        equity += pnl;
        trades.push(buildTrade(trades.length + 1, position, exitP, pts, pnl, equity, bar.ts, bar.date, exitReason));
        position = null;
      }
    }

    // ── ENTRY CONDITIONS ────────────────────────────────────
    let enterDir = null, enterReason = '';

    if (!position) {
      // Priority 1: Direct HM Confirmed signals (most accurate — from TradingView)
      if (useEMAHM && emaBuyHM && !enterDir)  { enterDir = 'BUY';  enterReason = 'EMA+HM Confirmed BUY'; }
      if (useEMAHM && emaSellHM && !enterDir) { enterDir = 'SELL'; enterReason = 'EMA+HM Confirmed SELL'; }

      // Priority 2: Long/Short Signal (broader indicator signal)
      if (useLongShort && longSig  && !enterDir) { enterDir = 'BUY';  enterReason = 'Long Signal (Indicator)'; }
      if (useLongShort && shortSig && !enterDir) { enterDir = 'SELL'; enterReason = 'Short Signal (Indicator)'; }

      // Priority 3: Triple Alignment (computed from EMA + CPR in CSV)
      if (useTripleAlign && newBullAlign && !enterDir) { enterDir = 'BUY';  enterReason = 'Triple Alignment BUY'; }
      if (useTripleAlign && newBearAlign && !enterDir) { enterDir = 'SELL'; enterReason = 'Triple Alignment SELL'; }

      // Priority 4: Zone Momentum
      if (useZoneMomentum && buyMomentum  && !enterDir) { enterDir = 'BUY';  enterReason = 'Zone Momentum BUY'; }
      if (useZoneMomentum && sellMomentum && !enterDir) { enterDir = 'SELL'; enterReason = 'Zone Momentum SELL'; }
    }

    if (enterDir) {
      const entryP = c + (enterDir === 'BUY' ? slippage : -slippage);
      position = { dir: enterDir, entry: entryP, entryTs: bar.ts, entryDate: bar.date, reason: enterReason };
      signalLog.push({
        ts: bar.ts, dir: enterDir, price: c, reason: enterReason,
        ema9: e9 ? +e9.toFixed(2) : null,
        ema20: e20 ? +e20.toFixed(2) : null,
        ema200: e200 ? +e200.toFixed(2) : null,
        pp: pp ? +pp.toFixed(2) : null,
        rmi: bar.rmiCenter ? +bar.rmiCenter.toFixed(2) : null,
        rsi: bar.rsi ? +bar.rsi.toFixed(2) : null,
      });
    }

    equityCurve.push({ ts: bar.ts, equity: Math.round(equity), date: bar.date });
  }

  // ── SUMMARY STATS ───────────────────────────────────────────
  const wins      = trades.filter(t => t.result === 'WIN');
  const losses    = trades.filter(t => t.result === 'LOSS');
  const totalPnL  = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const maxDD     = computeMaxDrawdown(equityCurve.map(e => e.equity));

  // Signal breakdown
  const byReason = {};
  trades.forEach(t => {
    const r = t.entryReason;
    if (!byReason[r]) byReason[r] = { total: 0, wins: 0, pnl: 0 };
    byReason[r].total++;
    if (t.result === 'WIN') byReason[r].wins++;
    byReason[r].pnl += t.pnl;
  });

  return {
    summary: {
      totalTrades:    trades.length,
      wins:           wins.length,
      losses:         losses.length,
      winRate:        trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0,
      totalPnL:       Math.round(totalPnL),
      grossWin:       Math.round(grossWin),
      grossLoss:      Math.round(grossLoss),
      profitFactor:   grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
      avgWin:         wins.length   > 0 ? Math.round(grossWin   / wins.length)   : 0,
      avgLoss:        losses.length > 0 ? Math.round(grossLoss / losses.length)  : 0,
      maxDrawdown:    Math.round(maxDD),
      finalEquity:    Math.round(equity),
      returnPct:      Math.round((totalPnL / initialCapital) * 10000) / 100,
      barsAnalysed:   bars.length,
      daysAnalysed:   [...new Set(bars.map(b => b.date))].length,
      dataSource:     hasIndicators ? 'TradingView (with all indicator columns)' : 'Plain OHLCV (EMA+CPR computed)',
      signalBreakdown: byReason,
    },
    trades,
    equityCurve,
    signals: signalLog,
  };
}

function buildTrade(id, pos, exitP, pts, pnl, equity, exitTs, exitDate, exitReason) {
  return {
    id,
    dir:        pos.dir,
    entryReason: pos.reason,
    entryTime:  new Date(pos.entryTs).toISOString(),
    exitTime:   new Date(exitTs).toISOString(),
    entryDate:  new Date(pos.entryTs).toLocaleDateString('en-IN'),
    exitDate:   new Date(exitTs).toLocaleDateString('en-IN'),
    entry:      +pos.entry.toFixed(2),
    exit:       +exitP.toFixed(2),
    pts:        +pts.toFixed(2),
    pnl:        Math.round(pnl),
    result:     pnl >= 0 ? 'WIN' : 'LOSS',
    exitReason,
    equity:     Math.round(equity),
  };
}

function computeMaxDrawdown(equities) {
  let peak = equities[0] || 0, maxDD = 0;
  for (const e of equities) {
    if (e > peak) peak = e;
    const dd = peak - e;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

module.exports = { parseCSV, runBacktest };
