const fs = require('fs');
const path = require('path');

/**
 * Parses a CSV string into an array of bar objects.
 */
function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (!lines.length) return [];

  // Parse header
  const headerLine = lines[0].trim();
  if (!headerLine) return [];
  const headers = headerLine.split(',').map(h => h.trim());

  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = parts[j] !== undefined ? parts[j].trim() : '';
    }

    const t = row['time'] || '';
    const close = parseFloat(row['close']);
    if (isNaN(close)) continue;

    bars.push({
      time: t,
      open: parseFloat(row['open']) || close,
      high: parseFloat(row['high']) || close,
      low: parseFloat(row['low']) || close,
      close: close,
      longSignal: parseFloat(row['Long Signal']) === 1 ? 1 : 0,
      shortSignal: parseFloat(row['Short Signal']) === 1 ? 1 : 0,
      ema9: parseFloat(row['9 EMA']) || null,
      ema20: parseFloat(row['20 EMA']) || null,
      emaBuyHM: parseFloat(row['EMA BUY (HM Confirmed)']) === 1 ? 1 : 0,
      vwap: parseFloat(row['VWAP']) || null,
      rsi: parseFloat(row['RSI']) || null,
      volStrength: parseFloat(row['Volume strength']) || null,
      priceStrength: parseFloat(row['Price strength']) || null,
      longStop: parseFloat(row['Long Stop']) || null,
      shortStop: parseFloat(row['Short Stop']) || null,
      day: t.substring(0, 10),
      timeOnly: t.substring(11, 16)
    });
  }

  // Sort chronologically
  bars.sort((a, b) => (a.time > b.time ? 1 : -1));
  return bars;
}

/**
 * Standard strike assignments for the 4 days (Sep 28 to Oct 01)
 * based on Nifty open price each morning:
 * - 2026-09-28: Open 23,080 -> Ref 23,100 -> CE: 22900, 22800 | PE: 23300, 23400
 * - 2026-09-29: Open 22,745 -> Ref 22,700 -> CE: 22500, 22400 | PE: 22900, 23000
 * - 2026-09-30: Open 22,665 -> Ref 22,700 -> CE: 22500, 22400 | PE: 22900, 23000
 * - 2026-10-01: Open 22,558 -> Ref 22,600 -> CE: 22400, 22300 | PE: 22800, 22900
 */
// Option A: Single Primary Strike per side (±200 OTM from Ref) — No duplicate strikes
const SINGLE_PRIMARY_ASSIGNMENTS = {
  '2026-09-28': {
    dayLabel: 'Monday, Sep 28',
    niftyOpen: 23079.85,
    refStrike: 23100,
    CE: ['NSE_NIFTY261013C22900, 3.csv'],
    PE: ['NSE_NIFTY261013P23300, 3.csv']
  },
  '2026-09-29': {
    dayLabel: 'Tuesday, Sep 29',
    niftyOpen: 22744.80,
    refStrike: 22700,
    CE: ['NSE_NIFTY261013C22500, 3.csv'],
    PE: ['NSE_NIFTY261013P22900, 3.csv']
  },
  '2026-09-30': {
    dayLabel: 'Wednesday, Sep 30',
    niftyOpen: 22664.95,
    refStrike: 22700,
    CE: ['NSE_NIFTY261013C22500, 3.csv'],
    PE: ['NSE_NIFTY261013P22900, 3.csv']
  },
  '2026-10-01': {
    dayLabel: 'Thursday, Oct 01',
    niftyOpen: 22558.20,
    refStrike: 22600,
    CE: ['NSE_NIFTY261013C22400, 3.csv'],
    PE: ['NSE_NIFTY261013P22800, 3.csv']
  }
};

const MULTI_STRIKE_ASSIGNMENTS = {
  '2026-09-28': {
    dayLabel: 'Monday, Sep 28',
    niftyOpen: 23079.85,
    refStrike: 23100,
    CE: ['NSE_NIFTY261013C22900, 3.csv', 'NSE_NIFTY261013C22800, 3.csv'],
    PE: ['NSE_NIFTY261013P23300, 3.csv', 'NSE_NIFTY261013P23200, 3.csv']
  },
  '2026-09-29': {
    dayLabel: 'Tuesday, Sep 29',
    niftyOpen: 22744.80,
    refStrike: 22700,
    CE: ['NSE_NIFTY261013C22500, 3.csv', 'NSE_NIFTY261013C22400, 3.csv'],
    PE: ['NSE_NIFTY261013P22900, 3.csv', 'NSE_NIFTY261013P23000, 3.csv']
  },
  '2026-09-30': {
    dayLabel: 'Wednesday, Sep 30',
    niftyOpen: 22664.95,
    refStrike: 22700,
    CE: ['NSE_NIFTY261013C22500, 3.csv', 'NSE_NIFTY261013C22400, 3.csv'],
    PE: ['NSE_NIFTY261013P22900, 3.csv', 'NSE_NIFTY261013P23000, 3.csv']
  },
  '2026-10-01': {
    dayLabel: 'Thursday, Oct 01',
    niftyOpen: 22558.20,
    refStrike: 22600,
    CE: ['NSE_NIFTY261013C22400, 3.csv', 'NSE_NIFTY261013C22300, 3.csv'],
    PE: ['NSE_NIFTY261013P22800, 3.csv', 'NSE_NIFTY261013P22900, 3.csv']
  }
};

const DEFAULT_ASSIGNMENTS = SINGLE_PRIMARY_ASSIGNMENTS;

/**
 * Extracts clean strike label from filename:
 * 'NSE_NIFTY261006C22900, 3.csv' -> '22900 CE'
 */
function cleanStrikeName(filename) {
  const match = filename.match(/NIFTY\d+([CP])(\d+)/i);
  if (match) {
    const type = match[1].toUpperCase() === 'C' ? 'CE' : 'PE';
    return `${match[2]} ${type}`;
  }
  return filename.replace(/,.*$/, '');
}

/**
 * Runs the waterfall backtest.
 */
function runWaterfallBacktest(options = {}) {
  const chartsDir = options.chartsDir || path.join(__dirname, '..', 'Chartsdata');
  const lotSize = parseInt(options.lotSize || 75, 10);
  const commissionPerOrder = parseFloat(options.commission !== undefined ? options.commission : 20);
  const slippagePts = parseFloat(options.slippage || 0);
  const entryStartTime = options.entryStartTime || '09:30';
  const entryEndTime = options.entryEndTime || '14:45';
  const targetPts = options.targetPts !== undefined ? parseFloat(options.targetPts) : 15;
  const strikeMode = options.strikeMode || 'single';
  const requireHMBullish = options.requireHMBullish !== undefined ? (options.requireHMBullish === true || options.requireHMBullish === 'true') : true;
  const exitOnHMBearish = options.exitOnHMBearish !== undefined ? (options.exitOnHMBearish === true || options.exitOnHMBearish === 'true') : false;
  const requireHMExitConfirmation = options.requireHMExitConfirmation !== undefined ? (options.requireHMExitConfirmation === true || options.requireHMExitConfirmation === 'true') : true;
  const enableCERejectionExit = options.enableCERejectionExit !== undefined ? (options.enableCERejectionExit === true || options.enableCERejectionExit === 'true') : true;
  const ceRejectionDist = options.ceRejectionDist !== undefined ? parseFloat(options.ceRejectionDist) : 0;
  const enableNearCETrail = options.enableNearCETrail !== undefined ? (options.enableNearCETrail === true || options.enableNearCETrail === 'true') : true;
  const ceNearThreshold = options.ceNearThreshold !== undefined ? parseFloat(options.ceNearThreshold) : 5.0;
  const filterInsideSellZone = options.filterInsideSellZone !== undefined ? (options.filterInsideSellZone === true || options.filterInsideSellZone === 'true') : true;
  const filterInsideBuyZone = options.filterInsideBuyZone !== undefined ? (options.filterInsideBuyZone === true || options.filterInsideBuyZone === 'true') : true;
  const maxBuyZoneBounces = options.maxBuyZoneBounces !== undefined ? parseInt(options.maxBuyZoneBounces, 10) : 2;
  const maxSellZoneRetests = options.maxSellZoneRetests !== undefined ? parseInt(options.maxSellZoneRetests, 10) : 2;

  let assignments = options.assignments;
  if (!assignments) {
    assignments = (strikeMode === 'all' || strikeMode === 'multi') ? MULTI_STRIKE_ASSIGNMENTS : SINGLE_PRIMARY_ASSIGNMENTS;
  }

  // Cache parsed CSV files to avoid reloading repeatedly
  const fileCache = new Map();
  function getBarsForFile(fname) {
    if (fileCache.has(fname)) return fileCache.get(fname);
    const filepath = path.join(chartsDir, fname);
    if (!fs.existsSync(filepath)) {
      console.warn(`File not found: ${filepath}`);
      return [];
    }
    const content = fs.readFileSync(filepath, 'utf8');
    const parsed = parseCSV(content);
    fileCache.set(fname, parsed);
    return parsed;
  }

  const rawTrades = [];
  const skippedTrades = [];

  // Iterate over each assigned day and chart
  for (const [dayKey, dayCfg] of Object.entries(assignments)) {
    for (const side of ['CE', 'PE']) {
      const files = dayCfg[side] || [];
      for (const fname of files) {
        const allBars = getBarsForFile(fname);
        const dayBars = allBars.filter(b => b.day === dayKey);
        if (!dayBars.length) continue;

        const strikeName = cleanStrikeName(fname);
        let inPosition = false;
        let activeTrade = null;
        let activeSellZone = null;
        let activeBuyZone = null;

        for (let i = 0; i < dayBars.length; i++) {
          const bar = dayBars[i];
          const isLastBar = (i === dayBars.length - 1);
          const isEOD = bar.timeOnly >= '15:15';

          // Update Sell Zone tracking:
          // Invalidate active zone if price breaks out with sustained closes strictly above the zone ceiling
          const prevBar = i > 0 ? dayBars[i - 1] : bar;
          if (activeSellZone && activeSellZone.active) {
            if (bar.close > activeSellZone.high && prevBar.close > activeSellZone.high) {
              activeSellZone.active = false;
            }
          }

          
          // Update Buy Zone tracking:
          // Invalidate active zone if price breaks down with sustained closes strictly below the zone floor
          if (activeBuyZone && activeBuyZone.active) {
            if (bar.close < activeBuyZone.low && prevBar.close < activeBuyZone.low) {
              activeBuyZone.active = false;
            }
          }

          // Parent Buy Zone formation on Long Signal
          if (bar.longSignal === 1) {
            const flr = Math.min(bar.low, prevBar.low);
            const ceil = Math.max(bar.open, bar.close, prevBar.close);
            if (!activeBuyZone || !activeBuyZone.active) {
              activeBuyZone = {
                high: ceil,
                low: flr,
                bounceCount: 0,
                active: true,
                createdTime: bar.timeOnly
              };
            }
          }
  
          // Parent Sell Zone formation on Short Signal
          if (bar.shortSignal === 1) {
                // Check if price is resting inside active Buy Zone (demand support)
                let isInsideBuyZone = false;
                if (filterInsideBuyZone && activeBuyZone && activeBuyZone.active) {
                  if (bar.close >= activeBuyZone.low && bar.close <= activeBuyZone.high) {
                    activeBuyZone.bounceCount = (activeBuyZone.bounceCount || 0) + 1;
                    if (activeBuyZone.bounceCount <= maxBuyZoneBounces) {
                      isInsideBuyZone = true;
                      if (!activeTrade.buyZoneNotes) activeTrade.buyZoneNotes = [];
                      activeTrade.buyZoneNotes.push("Sell Signal at " + bar.timeOnly + " ignored (Inside Buy Zone [₹" + activeBuyZone.low.toFixed(1) + " - ₹" + activeBuyZone.high.toFixed(1) + "], Bounce #" + activeBuyZone.bounceCount + ")");
                    } else {
                      activeBuyZone.active = false;
                    }
                  }
                }

                if (!isInsideBuyZone) {
                  // If requireHMExitConfirmation is enabled, do NOT exit if HM is still bullish/neutral!
                  if (!requireHMExitConfirmation || isHMBearishState) {
                    shouldExit = true;
                    exitPrice = Math.max(0.05, bar.close - slippagePts);
                    exitReason = requireHMExitConfirmation ? "Short Signal (HM Confirmed)" : "Short Signal";
                  }
                }
              } else if (isEOD || isLastBar) {
                shouldExit = true;
                exitPrice = Math.max(0.05, bar.close - slippagePts);
                exitReason = isEOD ? 'EOD 15:15' : 'Market Close';
              }
            }

            if (shouldExit) {
              const grossPoints = Math.round((exitPrice - activeTrade.entryPrice) * 100) / 100;
              const grossPnL = Math.round(grossPoints * lotSize * 100) / 100;
              const totalCommission = commissionPerOrder * 2; // Entry + Exit
              const netPnL = Math.round((grossPnL - totalCommission) * 100) / 100;
              const barsHeld = i - activeTrade.entryIndex;

              rawTrades.push({
                id: `T${rawTrades.length + 1}`,
                day: dayKey,
                dayLabel: dayCfg.dayLabel || dayKey,
                side: side,
                strike: strikeName,
                file: fname,
                entryTime: activeTrade.entryTime,
                entryPrice: activeTrade.entryPrice,
                exitTime: bar.time,
                exitPrice: exitPrice,
                exitReason: exitReason,
                isNearCE: activeTrade.isNearCE || false,
                ceDist: activeTrade.ceDist !== undefined ? activeTrade.ceDist : null,
                ceLine: activeTrade.ceLine !== undefined ? activeTrade.ceLine : null,
                reasonShort: activeTrade.reasonShort,
                reasoning: activeTrade.reasoning,
                lotSize: lotSize,
                grossPoints: grossPoints,
                grossPnL: grossPnL,
                commission: totalCommission,
                netPnL: netPnL,
                barsHeld: barsHeld,
                durationMinutes: barsHeld * 3,
                isWin: netPnL > 0
              });

              inPosition = false;
              activeTrade = null;
              continue;
            }
          }

          // Entry condition if not in position (skip entries before 9:30 AM and after 2:45 PM IST)
          const isWithinEntryHours = (bar.timeOnly >= entryStartTime && bar.timeOnly <= entryEndTime);
          if (!inPosition && isWithinEntryHours) {
            // HM PVR Bullish State: Indicator EMA BUY (HM Confirmed) flag OR manual calculation RSI > 3 EMA & RSI > 21 WMA
            const hasHMMetrics = (bar.rsi !== null && bar.priceStrength !== null && bar.volStrength !== null);
            const isHMBullishState = (bar.emaBuyHM === 1) || (hasHMMetrics ? (bar.rsi > bar.priceStrength && bar.rsi > bar.volStrength) : false);

            // Rule 1: Whenever the buy signal forms inside the active sell zone, do not attempt the trade
            let shouldSkipDueToSellZone = false;
            if (bar.longSignal === 1 && (!requireHMBullish || isHMBullishState)) {
              if (activeSellZone && activeSellZone.active) {
                const isInside = (bar.close >= activeSellZone.low && bar.close <= activeSellZone.high);
                if (isInside) {
                  activeSellZone.buyRetestCount = (activeSellZone.buyRetestCount || 0) + 1;
                  if (activeSellZone.buyRetestCount <= maxSellZoneRetests) {
                    if (filterInsideSellZone) {
                      shouldSkipDueToSellZone = true;
                      skippedTrades.push({
                        day: dayKey,
                        dayLabel: dayCfg.dayLabel || dayKey,
                        time: bar.time,
                        timeOnly: bar.timeOnly,
                        entryTime: bar.time,
                        entryPrice: bar.close,
                        strike: strikeName,
                        side: side,
                        file: fname,
                        close: bar.close,
                        zoneLow: activeSellZone.low,
                        zoneHigh: activeSellZone.high,
                        retestCount: activeSellZone.buyRetestCount,
                        status: 'SKIPPED',
                        isExecuted: false,
                        skipReason: `Buy Signal inside Parent Sell Zone [₹${activeSellZone.low.toFixed(1)} - ₹${activeSellZone.high.toFixed(1)}] (Attempt #${activeSellZone.buyRetestCount})`,
                        reasonShort: `Blocked: Inside Sell Zone (Attempt #${activeSellZone.buyRetestCount})`,
                        reasoning: `🛑 Signal Blocked: 9 EMA Buy signal fired at ${bar.timeOnly} IST on ${strikeName} (Close ₹${bar.close.toFixed(2)}) • Trapped inside active Parent Sell Zone [₹${activeSellZone.low.toFixed(2)} – ₹${activeSellZone.high.toFixed(2)}] • Retest Attempt #${activeSellZone.buyRetestCount} (Max allowed: ${maxSellZoneRetests}) • Filtered to avoid buying against resistance ceiling`
                      });
                    }
                  } else {
                    // More than 2 buy attempts absorb/exhaust the zone
                    activeSellZone.active = false;
                  }
                }
              }
            } else if (bar.longSignal === 1 && requireHMBullish && !isHMBullishState) {
              skippedTrades.push({
                day: dayKey,
                dayLabel: dayCfg.dayLabel || dayKey,
                time: bar.time,
                timeOnly: bar.timeOnly,
                entryTime: bar.time,
                entryPrice: bar.close,
                strike: strikeName,
                side: side,
                file: fname,
                close: bar.close,
                status: 'SKIPPED',
                isExecuted: false,
                skipReason: `HM Not Bullish (RSI ${bar.rsi ? bar.rsi.toFixed(1) : 'N/A'} < P/V strength)`,
                reasonShort: 'Blocked: HM Not Bullish',
                reasoning: `🛑 Signal Blocked: 9 EMA Buy signal fired at ${bar.timeOnly} IST on ${strikeName} (Close ₹${bar.close.toFixed(2)}) • Hybrid Momentum not confirmed bullish • RSI (${bar.rsi ? bar.rsi.toFixed(1) : 'N/A'}) vs Price (${bar.priceStrength ? bar.priceStrength.toFixed(1) : 'N/A'}) / Volume (${bar.volStrength ? bar.volStrength.toFixed(1) : 'N/A'})`
              });
            }

            const isEntryValid = (bar.longSignal === 1) && (!requireHMBullish || isHMBullishState) && !shouldSkipDueToSellZone;

            if (isEntryValid) {
              inPosition = true;
              const entryPrice = bar.close + slippagePts;

              // Check if entry forms near the Chandelier Exit (CE) line (<= 5 pts)
              const ceLine = bar.longStop || bar.shortStop;
              const ceDist = (ceLine !== null && !isNaN(ceLine)) ? Math.round(Math.abs(bar.close - ceLine) * 100) / 100 : null;
              const isNearCE = (ceDist !== null && ceDist <= ceNearThreshold);

              let reasonShort = '9 EMA Long Signal';
              if (isHMBullishState && bar.close >= (bar.vwap || bar.close)) {
                reasonShort = '9 EMA + HM PVR Buy (Above VWAP)';
              } else if (isHMBullishState) {
                reasonShort = '9 EMA + HM PVR Buy';
              } else if (bar.close >= (bar.vwap || bar.close)) {
                reasonShort = '9 EMA Signal (Above VWAP)';
              } else if (bar.rsi && bar.rsi >= 55) {
                reasonShort = `9 EMA Signal (RSI ${bar.rsi.toFixed(0)})`;
              }
              if (isNearCE) {
                reasonShort += ` [Near-CE ${ceDist}pt]`;
              }

              const reasonParts = [
                `🎯 Trigger: 9 EMA Long Signal fired at ${bar.timeOnly} IST on ${strikeName}`,
                isNearCE ? `🎯 Near-CE Setup: Entry ₹${bar.close.toFixed(2)} is within ${ceDist} pts of Chandelier Line (₹${ceLine.toFixed(2)})` : null,
                `📊 Price Action: Close ₹${bar.close.toFixed(2)} crossed above 9 EMA (₹${(bar.ema9 || bar.close).toFixed(2)})`,
                bar.ema20 ? `📈 20 EMA: ₹${bar.ema20.toFixed(2)} (${bar.close >= bar.ema20 ? 'Above 20 EMA • Bullish' : 'Below 20 EMA'})` : null,
                bar.vwap ? `🌊 VWAP: ₹${bar.vwap.toFixed(2)} (${bar.close >= bar.vwap ? 'Above VWAP • Bullish Bias' : 'Below VWAP'})` : null,
                hasHMMetrics ? (isHMBullishState
                  ? `⚡ HM PVR Confirmed: RSI (${bar.rsi.toFixed(1)}) > 3 EMA (${bar.priceStrength.toFixed(1)}) & 21 WMA (${bar.volStrength.toFixed(1)}) • Bullish State`
                  : `⚠️ HM Mismatch: RSI (${bar.rsi.toFixed(1)}) vs 3 EMA (${bar.priceStrength.toFixed(1)}) / 21 WMA (${bar.volStrength.toFixed(1)})`) : null,
                bar.rsi ? `🔥 RSI: ${bar.rsi.toFixed(1)}${bar.rsi >= 50 ? ' (Positive Momentum)' : ''}` : null
              ].filter(Boolean);

              activeTrade = {
                entryTime: bar.time,
                entryPrice: Math.round(entryPrice * 100) / 100,
                entryIndex: i,
                isNearCE: isNearCE,
                ceLine: ceLine,
                ceDist: ceDist,
                reasonShort: reasonShort,
                reasoning: reasonParts.join(' • ')
              };
            }
          }
        }
      }
    }
  }

  // Sort all trades chronologically by entryTime
  rawTrades.sort((a, b) => (a.entryTime > b.entryTime ? 1 : -1));

  // Re-index trades and compute running equity curve
  let runningGrossEquity = 0;
  let runningNetEquity = 0;
  let peakNetEquity = 0;
  let maxDrawdown = 0;

  const equityCurve = [
    {
      tradeNum: 0,
      time: 'Start',
      grossPnL: 0,
      netPnL: 0,
      cumulativeGross: 0,
      cumulativeNet: 0,
      drawdown: 0
    }
  ];

  const processedTrades = rawTrades.map((t, idx) => {
    runningGrossEquity += t.grossPnL;
    runningNetEquity += t.netPnL;

    if (runningNetEquity > peakNetEquity) {
      peakNetEquity = runningNetEquity;
    }
    const currentDrawdown = peakNetEquity - runningNetEquity;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }

    equityCurve.push({
      tradeNum: idx + 1,
      day: t.day,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      time: t.exitTime,
      strike: t.strike,
      side: t.side,
      netPnL: t.netPnL,
      cumulativeGross: Math.round(runningGrossEquity * 100) / 100,
      cumulativeNet: Math.round(runningNetEquity * 100) / 100,
      drawdown: Math.round(currentDrawdown * 100) / 100
    });

    return {
      ...t,
      tradeNo: idx + 1,
      cumulativeNet: Math.round(runningNetEquity * 100) / 100
    };
  });

  // Calculate Metrics
  const totalTrades = processedTrades.length;
  const winTrades = processedTrades.filter(t => t.netPnL > 0);
  const lossTrades = processedTrades.filter(t => t.netPnL < 0);
  const breakevenTrades = processedTrades.filter(t => t.netPnL === 0);

  const totalGrossPnL = Math.round(processedTrades.reduce((acc, t) => acc + t.grossPnL, 0) * 100) / 100;
  const totalNetPnL = Math.round(processedTrades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100;
  const totalCommission = Math.round(processedTrades.reduce((acc, t) => acc + t.commission, 0) * 100) / 100;

  const grossProfit = Math.round(winTrades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100;
  const grossLoss = Math.round(Math.abs(lossTrades.reduce((acc, t) => acc + t.netPnL, 0)) * 100) / 100;
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0;

  const winRate = totalTrades > 0 ? Math.round((winTrades.length / totalTrades) * 1000) / 10 : 0;
  const avgWin = winTrades.length > 0 ? Math.round((grossProfit / winTrades.length) * 100) / 100 : 0;
  const avgLoss = lossTrades.length > 0 ? Math.round((grossLoss / lossTrades.length) * 100) / 100 : 0;
  const riskReward = avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : 0;

  const bestTrade = processedTrades.reduce((max, t) => (t.netPnL > (max ? max.netPnL : -Infinity) ? t : max), null);
  const worstTrade = processedTrades.reduce((min, t) => (t.netPnL < (min ? min.netPnL : Infinity) ? t : min), null);

  // CE vs PE Breakdown
  const ceTrades = processedTrades.filter(t => t.side === 'CE');
  const peTrades = processedTrades.filter(t => t.side === 'PE');

  const ceNetPnL = Math.round(ceTrades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100;
  const peNetPnL = Math.round(peTrades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100;

  const ceWins = ceTrades.filter(t => t.netPnL > 0).length;
  const peWins = peTrades.filter(t => t.netPnL > 0).length;

  const ceSummary = {
    trades: ceTrades.length,
    wins: ceWins,
    losses: ceTrades.length - ceWins,
    winRate: ceTrades.length ? Math.round((ceWins / ceTrades.length) * 1000) / 10 : 0,
    netPnL: ceNetPnL,
    grossPoints: Math.round(ceTrades.reduce((acc, t) => acc + t.grossPoints, 0) * 100) / 100
  };

  const peSummary = {
    trades: peTrades.length,
    wins: peWins,
    losses: peTrades.length - peWins,
    winRate: peTrades.length ? Math.round((peWins / peTrades.length) * 1000) / 10 : 0,
    netPnL: peNetPnL,
    grossPoints: Math.round(peTrades.reduce((acc, t) => acc + t.grossPoints, 0) * 100) / 100
  };

  // Day-wise Breakdown
  const daySummary = {};
  for (const [dayKey, dayCfg] of Object.entries(assignments)) {
    const dTrades = processedTrades.filter(t => t.day === dayKey);
    const dWins = dTrades.filter(t => t.netPnL > 0).length;
    const dCeTrades = dTrades.filter(t => t.side === 'CE');
    const dPeTrades = dTrades.filter(t => t.side === 'PE');

    daySummary[dayKey] = {
      day: dayKey,
      label: dayCfg.dayLabel,
      niftyOpen: dayCfg.niftyOpen,
      refStrike: dayCfg.refStrike,
      ceStrikes: (dayCfg.CE || []).map(cleanStrikeName),
      peStrikes: (dayCfg.PE || []).map(cleanStrikeName),
      trades: dTrades.length,
      wins: dWins,
      losses: dTrades.length - dWins,
      winRate: dTrades.length ? Math.round((dWins / dTrades.length) * 1000) / 10 : 0,
      totalNetPnL: Math.round(dTrades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100,
      ceNetPnL: Math.round(dCeTrades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100,
      peNetPnL: Math.round(dPeTrades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100,
      points: Math.round(dTrades.reduce((acc, t) => acc + t.grossPoints, 0) * 100) / 100
    };
  }

  // Strike-wise Breakdown
  const strikeMap = {};
  for (const t of processedTrades) {
    const key = `${t.day}_${t.strike}`;
    if (!strikeMap[key]) {
      strikeMap[key] = {
        day: t.day,
        strike: t.strike,
        side: t.side,
        trades: 0,
        wins: 0,
        netPnL: 0,
        points: 0
      };
    }
    strikeMap[key].trades += 1;
    if (t.netPnL > 0) strikeMap[key].wins += 1;
    strikeMap[key].netPnL += t.netPnL;
    strikeMap[key].points += t.grossPoints;
  }

  const strikeSummary = Object.values(strikeMap).map(s => ({
    ...s,
    winRate: s.trades ? Math.round((s.wins / s.trades) * 1000) / 10 : 0,
    netPnL: Math.round(s.netPnL * 100) / 100,
    points: Math.round(s.points * 100) / 100
  }));

  return {
    config: {
      lotSize,
      commissionPerOrder,
      slippagePts,
      entryStartTime,
      entryEndTime,
      targetPts,
      strikeMode: (strikeMode === 'all' || strikeMode === 'multi') ? 'multi' : 'single',
      requireHMBullish,
      exitOnHMBearish,
      enableNearCETrail,
      ceNearThreshold,
      filterInsideSellZone,
      maxSellZoneRetests,
      dateRange: '2026-09-28 to 2026-10-01',
      rule: `Waterfall Phase 1: 9 EMA Long Signal Buy (09:30 - 14:45 IST) • ${requireHMBullish ? 'HM Bullish State Confirmed • ' : ''}${filterInsideSellZone ? 'Filter Inside Sell Zone • ' : ''}${enableNearCETrail ? `Near-CE (<=${ceNearThreshold}pt) Low Trail • ` : ''}${exitOnHMBearish ? 'HM Bearish Exit Enabled • ' : ''}${targetPts > 0 ? `Target: +${targetPts} pts` : 'No Target (Signal Exit)'} • ${(strikeMode === 'all' || strikeMode === 'multi') ? 'Multi-Strike' : 'Single Primary Strike (±200 OTM)'}`
    },
    summary: {
      totalTrades,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      breakevenTrades: breakevenTrades.length,
      skippedTradesCount: skippedTrades.length,
      winRate,
      totalGrossPnL,
      totalCommission,
      totalNetPnL,
      profitFactor,
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,
      riskReward,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      bestTrade: bestTrade ? {
        strike: bestTrade.strike,
        time: bestTrade.entryTime,
        pnl: bestTrade.netPnL,
        points: bestTrade.grossPoints
      } : null,
      worstTrade: worstTrade ? {
        strike: worstTrade.strike,
        time: worstTrade.entryTime,
        pnl: worstTrade.netPnL,
        points: worstTrade.grossPoints
      } : null
    },
    legs: {
      CE: ceSummary,
      PE: peSummary
    },
    daySummary,
    strikeSummary,
    equityCurve,
    trades: processedTrades,
    skippedTrades,
    allSignals: [
      ...processedTrades.map(t => ({
        ...t,
        status: 'EXECUTED',
        isExecuted: true
      })),
      ...skippedTrades.map((s, idx) => ({
        id: `S${idx + 1}`,
        day: s.day,
        dayLabel: s.dayLabel,
        side: s.side,
        strike: s.strike,
        file: s.file,
        entryTime: s.entryTime,
        entryPrice: s.entryPrice,
        exitTime: s.entryTime,
        exitPrice: null,
        exitReason: s.retestCount ? `Blocked (Attempt #${s.retestCount})` : (s.reasonShort || s.skipReason || 'Blocked'),
        isNearCE: false,
        ceDist: null,
        ceLine: null,
        reasonShort: s.reasonShort,
        reasoning: s.reasoning,
        lotSize: lotSize,
        grossPoints: null,
        grossPnL: null,
        commission: 0,
        netPnL: null,
        barsHeld: 0,
        durationMinutes: 0,
        isWin: null,
        status: 'SKIPPED',
        isExecuted: false,
        skipReason: s.skipReason,
        cumulativeNet: null
      }))
    ].sort((a, b) => (a.entryTime > b.entryTime ? 1 : (a.entryTime < b.entryTime ? -1 : 0)))
  };
}

module.exports = {
  parseCSV,
  runWaterfallBacktest,
  DEFAULT_ASSIGNMENTS
};
