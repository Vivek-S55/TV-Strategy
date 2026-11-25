/**
 * CONFLUENCE RULES ENGINE
 * Single source of truth for Universal Entry Models, Exit Models,
 * Macro Regime Filters, and Candlestick Risk Guards.
 * 
 * Shared across:
 * - Backtest Engine (backend/waterfall-backtest.js)
 * - Live Streaming Engine (backend/live-waterfall.js)
 */

function cleanStrikeName(filename) {
  if (!filename) return "N/A";
  const match = filename.match(/NIFTY\d+([CP])(\d+)/i);
  if (match) {
    const type = match[1].toUpperCase() === 'C' ? 'CE' : 'PE';
    return `${match[2]} ${type}`;
  }
  return filename.replace(/,.*$/, '');
}

function normalizeOptions(options = {}) {
  return {
    lotSize: options.lotSize || 75,
    commission: options.commission !== undefined ? options.commission : 20,
    maxZoneWidth: options.maxZoneWidth !== undefined ? parseFloat(options.maxZoneWidth) : 20.0,
    zoneRetracementPct: options.zoneRetracementPct !== undefined ? parseFloat(options.zoneRetracementPct) : 0.50,
    stagnationBars: options.stagnationBars !== undefined ? parseInt(options.stagnationBars, 10) : 10,
    enableCPRExits: options.enableCPRExits !== undefined ? options.enableCPRExits : true,
    enableHMVolExit: options.enableHMVolExit !== undefined ? options.enableHMVolExit : true,
    enableStrictBull: options.enableStrictBull !== undefined ? (options.enableStrictBull === true || options.enableStrictBull === 'true') : true,
    enableStrictBear: options.enableStrictBear !== undefined ? (options.enableStrictBear === true || options.enableStrictBear === 'true') : true,
    enableHammerContinuation: options.enableHammerContinuation !== undefined ? (options.enableHammerContinuation === true || options.enableHammerContinuation === 'true') : true,
    enableCELineBounce: false, // Legacy bounce setup disabled
    enableCESpringboard: options.enableCESpringboard !== undefined ? (options.enableCESpringboard === true || options.enableCESpringboard === 'true') : true,
    enableSpot200EMAGuard: options.enableSpot200EMAGuard !== undefined ? (options.enableSpot200EMAGuard === true || options.enableSpot200EMAGuard === 'true') : true,
    maxCESpringboardRisk: options.maxCESpringboardRisk !== undefined ? parseFloat(options.maxCESpringboardRisk) : 35.0,
    enableNifty9EMAAlignment: options.enableNifty9EMAAlignment !== undefined ? (options.enableNifty9EMAAlignment === true || options.enableNifty9EMAAlignment === 'true') : true,
    enableOption9EMAFilter: options.enableOption9EMAFilter !== undefined ? (options.enableOption9EMAFilter === true || options.enableOption9EMAFilter === 'true') : true,
    enableCounterBreakoutExit: options.enableCounterBreakoutExit !== undefined ? (options.enableCounterBreakoutExit === true || options.enableCounterBreakoutExit === 'true') : true,
    enableCELineSupportCushion: options.enableCELineSupportCushion !== undefined ? (options.enableCELineSupportCushion === true || options.enableCELineSupportCushion === 'true') : true,
    ceLineCushionThreshold: options.ceLineCushionThreshold !== undefined ? parseFloat(options.ceLineCushionThreshold) : 5.0,
    enableCandleBRMIReclaim: options.enableCandleBRMIReclaim !== undefined ? (options.enableCandleBRMIReclaim === true || options.enableCandleBRMIReclaim === 'true') : true,
    enableRMISupportHold: options.enableRMISupportHold !== undefined ? (options.enableRMISupportHold === true || options.enableRMISupportHold === 'true') : true,
    rmiSupportHoldThreshold: options.rmiSupportHoldThreshold !== undefined ? parseFloat(options.rmiSupportHoldThreshold) : 10.0,
    enableCrossStrikeInflection: options.enableCrossStrikeInflection !== undefined ? (options.enableCrossStrikeInflection === true || options.enableCrossStrikeInflection === 'true') : true,
    crossStrikeMinWick: options.crossStrikeMinWick !== undefined ? parseFloat(options.crossStrikeMinWick) : 6.0,
    maxCEBounceSLDist: options.maxCEBounceSLDist !== undefined ? parseFloat(options.maxCEBounceSLDist) : 15.0,
    sellZoneMinWick: options.sellZoneMinWick !== undefined ? parseFloat(options.sellZoneMinWick) : 4.0,
    enableCPRResistanceFilter: options.enableCPRResistanceFilter !== undefined ? (options.enableCPRResistanceFilter === true || options.enableCPRResistanceFilter === 'true') : true,
    cprCeilingBuffer: options.cprCeilingBuffer !== undefined ? parseFloat(options.cprCeilingBuffer) : 5.0,
    openingCprBuffer: options.openingCprBuffer !== undefined ? parseFloat(options.openingCprBuffer) : 8.0,
    enableSpotCPRConflictFilter: options.enableSpotCPRConflictFilter !== undefined ? (options.enableSpotCPRConflictFilter === true || options.enableSpotCPRConflictFilter === 'true') : true,
    enableOpeningClimaxFilter: options.enableOpeningClimaxFilter !== undefined ? (options.enableOpeningClimaxFilter === true || options.enableOpeningClimaxFilter === 'true') : true,
    maxClimaxStretch: options.maxClimaxStretch !== undefined ? parseFloat(options.maxClimaxStretch) : 35.0,
    enableBounceExhaustionFilter: options.enableBounceExhaustionFilter !== undefined ? (options.enableBounceExhaustionFilter === true || options.enableBounceExhaustionFilter === 'true') : true,
    maxBounceUpperWick: options.maxBounceUpperWick !== undefined ? parseFloat(options.maxBounceUpperWick) : 12.0,
    maxBounceTwoBarRange: options.maxBounceTwoBarRange !== undefined ? parseFloat(options.maxBounceTwoBarRange) : 65.0,
    enableCPRReversalEntry: options.enableCPRReversalEntry !== undefined ? (options.enableCPRReversalEntry === true || options.enableCPRReversalEntry === 'true') : true,
    enableDualCeilingFilter: options.enableDualCeilingFilter !== undefined ? (options.enableDualCeilingFilter === true || options.enableDualCeilingFilter === 'true') : true,
    enablePivotRetracementQueue: options.enablePivotRetracementQueue !== undefined ? (options.enablePivotRetracementQueue === true || options.enablePivotRetracementQueue === 'true') : true,
    enableRMIReclaimEntry: options.enableRMIReclaimEntry !== undefined ? (options.enableRMIReclaimEntry === true || options.enableRMIReclaimEntry === 'true') : true,
    enableDeadCatBounceGuard: options.enableDeadCatBounceGuard !== undefined ? (options.enableDeadCatBounceGuard === true || options.enableDeadCatBounceGuard === 'true') : true,
    fixedTarget: (options.fixedTarget !== undefined && options.fixedTarget !== '' && !isNaN(parseFloat(options.fixedTarget))) ? parseFloat(options.fixedTarget) : null,
    enableCandleBTrendBreakout: options.enableCandleBTrendBreakout !== undefined ? (options.enableCandleBTrendBreakout === true || options.enableCandleBTrendBreakout === 'true') : true,
    maxCandleBTrendSLDist: options.maxCandleBTrendSLDist !== undefined ? parseFloat(options.maxCandleBTrendSLDist) : 20.0,
    enableCELineWickBreakout: options.enableCELineWickBreakout !== undefined ? (options.enableCELineWickBreakout === true || options.enableCELineWickBreakout === 'true') : true,
    maxCELineWickBreakoutSLDist: options.maxCELineWickBreakoutSLDist !== undefined ? parseFloat(options.maxCELineWickBreakoutSLDist) : 45.0,
    enableCPRS3R3ReclaimEntry: options.enableCPRS3R3ReclaimEntry !== undefined ? (options.enableCPRS3R3ReclaimEntry === true || options.enableCPRS3R3ReclaimEntry === 'true') : true,
    enableMacroRegimeInflection: options.enableMacroRegimeInflection !== undefined ? (options.enableMacroRegimeInflection === true || options.enableMacroRegimeInflection === 'true') : false,
    macroInflectionMaxRisk: options.macroInflectionMaxRisk !== undefined ? parseFloat(options.macroInflectionMaxRisk) : 20.0,
    macroInflectionRRFactor: options.macroInflectionRRFactor !== undefined ? parseFloat(options.macroInflectionRRFactor) : 4.0,
    enableDailyCircuitBreaker: options.enableDailyCircuitBreaker !== undefined ? (options.enableDailyCircuitBreaker === true || options.enableDailyCircuitBreaker === 'true') : false,
    maxConsecutiveLosses: options.maxConsecutiveLosses !== undefined ? parseInt(options.maxConsecutiveLosses, 10) : 2,
    enableCPRSqueezeGuard: options.enableCPRSqueezeGuard !== undefined ? (options.enableCPRSqueezeGuard === true || options.enableCPRSqueezeGuard === 'true') : true,
    filterInsideSellZone: options.filterInsideSellZone !== undefined ? (options.filterInsideSellZone === true || options.filterInsideSellZone === 'true') : true,
    sellZoneMinHeadroom: options.sellZoneMinHeadroom !== undefined ? parseFloat(options.sellZoneMinHeadroom) : 15.0,
    enableUnifiedReclaim: options.enableUnifiedReclaim !== undefined ? (options.enableUnifiedReclaim === true || options.enableUnifiedReclaim === 'true') : true,
    enableSellZoneBreakout: options.enableSellZoneBreakout !== undefined ? (options.enableSellZoneBreakout === true || options.enableSellZoneBreakout === 'true') : true,
    sellZoneBreakoutExpiryBars: options.sellZoneBreakoutExpiryBars !== undefined ? parseInt(options.sellZoneBreakoutExpiryBars, 10) : 4,
    alignmentCushionBars: options.alignmentCushionBars !== undefined ? parseInt(options.alignmentCushionBars, 10) : 6,
    entryStartTime: options.entryStartTime || '09:18',
    entryEndTime: options.entryEndTime || '14:45'
  };
}

function computeMacroRegime(barNifty, opts, state) {
  let isStrictBull = opts.enableStrictBull && barNifty && barNifty.ema200 && barNifty.pp && (barNifty.close > barNifty.ema200 + 15 && barNifty.close > barNifty.pp + 15);
  let isStrictBear = opts.enableStrictBear && barNifty && barNifty.ema200 && barNifty.pp && (barNifty.close < barNifty.ema200 - 15 && barNifty.close < barNifty.pp - 15);

  // Two-Way Dynamic Invalidation: If price peaked and broke down below VWAP / > 35 pts from Day High, dissolve bull lock
  if (isStrictBull && state && state.dayHigh && barNifty && barNifty.vwap) {
    if (barNifty.close < state.dayHigh - 35.0 && barNifty.close < barNifty.vwap) {
      isStrictBull = false;
    }
  }
  if (isStrictBear && state && state.dayLow && barNifty && barNifty.vwap) {
    if (barNifty.close > state.dayLow + 35.0 && barNifty.close > barNifty.vwap) {
      isStrictBear = false;
    }
  }

  return { isStrictBull: !!isStrictBull, isStrictBear: !!isStrictBear };
}

function checkPreEntrySafety(side, file, curBar, oppBar, barNifty, t, i, setupName, prevBar, opts, state) {
  if (!curBar) return { allowed: true };

  const upperWick = curBar.high - Math.max(curBar.open, curBar.close);
  const lowerWick = Math.min(curBar.open, curBar.close) - curBar.low;
  const isOpening = t >= "09:15" && t <= "09:30";

  // Dynamic VWAP Guard: Prevent buying > 25 pts counter-trend into steep crashes / rallies
  if (opts.enableCPRSqueezeGuard && barNifty && barNifty.vwap) {
    if (side === "CE" && barNifty.close < barNifty.vwap - 25.0) {
      return {
        allowed: false,
        skipReason: `Dynamic VWAP Guard: Spot (₹${barNifty.close.toFixed(2)}) trading > 25 pts below intraday VWAP (₹${barNifty.vwap.toFixed(2)}) — Counter-trend Call buying blocked`,
        reasoning: `🛡️ Dynamic VWAP Guard: Nifty Spot is trading deeply below institutional VWAP. Buying Calls into a persistent intraday downtrend carries severe adverse momentum risk.`
      };
    }
    if (side === "PE" && barNifty.close > barNifty.vwap + 25.0) {
      return {
        allowed: false,
        skipReason: `Dynamic VWAP Guard: Spot (₹${barNifty.close.toFixed(2)}) trading > 25 pts above intraday VWAP (₹${barNifty.vwap.toFixed(2)}) — Counter-trend Put buying blocked`,
        reasoning: `🛡️ Dynamic VWAP Guard: Nifty Spot is trading deeply above institutional VWAP. Buying Puts into a persistent intraday uptrend carries severe adverse momentum risk.`
      };
    }
  }

  // Dual Structural Ceiling Rejection (200 EMA + CPR PP)
  if (opts.enableDualCeilingFilter && curBar.ema200 && curBar.pp) {
    const maxCeiling = Math.max(curBar.ema200, curBar.pp);
    const minCeiling = Math.min(curBar.ema200, curBar.pp);
    if (curBar.high >= maxCeiling && curBar.close < minCeiling) {
      return {
        allowed: false,
        skipReason: `Dual Ceiling Rejection: High ₹${curBar.high.toFixed(2)} tested both 200 EMA (₹${curBar.ema200.toFixed(2)}) & CPR PP (₹${curBar.pp.toFixed(2)}) from below and closed below both (₹${curBar.close.toFixed(2)})`,
        reasoning: `🛡️ Dual Ceiling Protection: Candle spiked above both 200 EMA and CPR Central Pivot (PP) but failed to hold, closing below both resistance levels with an upper rejection wick. High institutional mean-reversion risk.`
      };
    }
  }

  // 1. Candidate Option CPR R1 Ceiling Proximity & Rejection Filter
  if (opts.enableCPRResistanceFilter && curBar.r1 && curBar.close <= curBar.r1) {
    const buffer = isOpening ? opts.openingCprBuffer : opts.cprCeilingBuffer;
    const distHighToR1 = curBar.r1 - curBar.high;
    if (curBar.high >= curBar.r1 - buffer) {
      if (distHighToR1 <= opts.cprCeilingBuffer || upperWick >= 3.0 || upperWick >= lowerWick) {
        const skipMsg = isOpening
          ? `Opening Liquidity Sweep & CPR R1 Rejection: High ₹${curBar.high.toFixed(2)} tested R1 (₹${curBar.r1.toFixed(2)}, dist: ${distHighToR1.toFixed(2)} pts) with Upper Wick (${upperWick.toFixed(2)} pts) and Close ₹${curBar.close.toFixed(2)} <= R1`
          : `CPR R1 Ceiling Proximity: High ₹${curBar.high.toFixed(2)} tested R1 (₹${curBar.r1.toFixed(2)}, dist: ${distHighToR1.toFixed(2)} pts) without clean breakout close`;
        return {
          allowed: false,
          isCPRReversalCandidate: true,
          skipReason: skipMsg,
          reasoning: `🛡️ CPR Ceiling Protection: ${side} signal on ${cleanStrikeName(file)} entered within ${distHighToR1.toFixed(2)} pts of daily CPR R1 (₹${curBar.r1.toFixed(2)}) without closing above R1. Extreme mean-reversion risk.`
        };
      }
    }
  }

  // 2. Underlying Nifty Spot CPR Floor/Ceiling Conflict Filter
  if (opts.enableSpotCPRConflictFilter && barNifty) {
    if (side === "PE" && barNifty.s1) {
      if (barNifty.low <= barNifty.s1 + 5.0 && barNifty.close >= barNifty.s1 - 15.0) {
        return {
          allowed: false,
          skipReason: `Spot CPR S1 Floor Conflict: Nifty Spot Low ₹${barNifty.low.toFixed(2)} hit daily S1 floor (₹${barNifty.s1.toFixed(2)}) while entering PE`,
          reasoning: `🛡️ Spot S1 Floor Protection: Nifty Spot tested daily CPR S1 floor (₹${barNifty.s1.toFixed(2)}, low ₹${barNifty.low.toFixed(2)}). Entering PE carries high institutional bounce risk.`
        };
      }
    } else if (side === "CE" && barNifty.r1) {
      if (barNifty.high >= barNifty.r1 - 5.0 && barNifty.close <= barNifty.r1 + 15.0) {
        return {
          allowed: false,
          skipReason: `Spot CPR R1 Ceiling Conflict: Nifty Spot High ₹${barNifty.high.toFixed(2)} hit daily R1 ceiling (₹${barNifty.r1.toFixed(2)}) while entering CE`,
          reasoning: `🛡️ Spot R1 Ceiling Protection: Nifty Spot tested daily CPR R1 ceiling (₹${barNifty.r1.toFixed(2)}, high ₹${barNifty.high.toFixed(2)}). Entering CE carries high institutional rejection risk.`
        };
      }
    }
  }

  // 3. Opening Climax 9 EMA Stretch Guard
  if (opts.enableOpeningClimaxFilter && isOpening && curBar.ema9 && curBar.r1) {
    const stretch = curBar.close - curBar.ema9;
    if (stretch > opts.maxClimaxStretch && curBar.high >= curBar.r1 - 10.0) {
      return {
        allowed: false,
        skipReason: `Opening Climax 9 EMA Stretch: Stretched ${stretch.toFixed(2)} pts above 9 EMA into CPR R1 (High ₹${curBar.high.toFixed(2)} vs R1 ₹${curBar.r1.toFixed(2)})`,
        reasoning: `🛡️ Opening Climax Protection: Candidate option stretched ${stretch.toFixed(2)} pts above 9 EMA during opening liquidity sweep directly below CPR R1.`
      };
    }
  }

  // 4. Support Bounce Rejection & Climax Exhaustion Filter
  if (opts.enableBounceExhaustionFilter && setupName && setupName.includes("Bounce")) {
    const candleBody = Math.abs(curBar.close - curBar.open);
    // 4a. Severe Upper Wick Exhaustion (Shooting Star / Upper Absorption at Highs)
    if (upperWick >= opts.maxBounceUpperWick && upperWick > candleBody) {
      return {
        allowed: false,
        skipReason: `Bounce Upper Wick Exhaustion: Upper Wick (${upperWick.toFixed(2)} pts >= ${opts.maxBounceUpperWick} pts) > Body (${candleBody.toFixed(2)} pts) — Severe seller rejection at highs`,
        reasoning: `🛡️ Bounce Protection Skip: ${setupName} formed shooting star exhaustion with ${upperWick.toFixed(2)} pt upper rejection wick exceeding candle body. High mean-reversion risk.`
      };
    }
    // 4b. 2-Bar Vertical Climax Extension Cap
    if (prevBar) {
      const twoBarRange = curBar.high - prevBar.low;
      if (twoBarRange > opts.maxBounceTwoBarRange) {
        return {
          allowed: false,
          skipReason: `Bounce Momentum Climax: 2-Bar expansion (${twoBarRange.toFixed(2)} pts) > ${opts.maxBounceTwoBarRange} pts max cap (Candle 1 Low ₹${prevBar.low.toFixed(2)} to Candle 2 High ₹${curBar.high.toFixed(2)})`,
          reasoning: `🛡️ Bounce Climax Skip: ${setupName} surged ${twoBarRange.toFixed(2)} pts vertically in 2 bars (> ${opts.maxBounceTwoBarRange} pt cap). Climax exhaustion risk.`
        };
      }
    }
  }

  // 5. Sell Zone Trap Guard (Dynamic Ceiling & Headroom)
  if (opts.filterInsideSellZone && state && state.sellZones && state.sellZones[side] && state.sellZones[side].active) {
    const sz = state.sellZones[side];
    const ceiling = (curBar.shortStop && curBar.shortStop > curBar.close) ? curBar.shortStop : sz.ceiling;
    const floor = sz.floor || sz.low || (ceiling - 20.0);
    const headroom = ceiling - curBar.close;
    const isInside = (curBar.close >= floor && curBar.close <= ceiling);

    if (curBar.close > ceiling) {
      // Confirmed breakout close strictly above ceiling! Allowed!
    } else if (headroom < (opts.sellZoneMinHeadroom || 15.0) || (setupName && setupName.includes("Candle B Multi-Chart Trend Breakout") && isInside)) {
      return {
        allowed: false,
        isSellZoneTrap: true,
        ceiling: ceiling,
        signalLow: curBar.low,
        headroom: headroom,
        skipReason: `Sell Zone Trap Guard: Headroom (${headroom.toFixed(2)} pts) < ${(opts.sellZoneMinHeadroom || 15.0).toFixed(1)} pts to ceiling (₹${ceiling.toFixed(2)}) — Queued for confirmed breakout close strictly above ceiling`,
        reasoning: `🛡️ Sell Zone Trap Guard: ${side} signal on ${cleanStrikeName(file)} entered within ${headroom.toFixed(2)} pts of active Sell Zone ceiling (₹${ceiling.toFixed(2)}). Blind buy blocked; queued for breakout close strictly above ceiling.`
      };
    }
  }

  // 6. Late-Day Climax Overextension Filter (Post 14:00 PM on extreme stretched days)
  if (t >= "14:00" && barNifty) {
    const spotStretchFromOpen = barNifty.open ? Math.abs(barNifty.close - barNifty.open) : 0;
    const spotStretchFromVWAP = barNifty.vwap ? Math.abs(barNifty.close - barNifty.vwap) : 0;
    if (spotStretchFromOpen >= 250.0 || spotStretchFromVWAP >= 150.0 || (barNifty.pp && Math.abs(barNifty.close - barNifty.pp) >= 200.0)) {
      if (setupName && (setupName.includes("Breakout") || setupName.includes("Candle B"))) {
        return {
          allowed: false,
          skipReason: `Late-Day Climax Overextension: New breakout entry blocked after 14:00 PM when Spot is stretched ${Math.max(spotStretchFromOpen, spotStretchFromVWAP).toFixed(0)} pts from open/VWAP to avoid EOD squaring-off traps`,
          reasoning: `🛡️ Late Climax Protection: Market is in an extreme trend day (Spot stretched >150 pts from VWAP) after 14:00 PM. Late-day breakout entries face institutional profit-taking and squaring-off reversals.`
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Evaluates all exit models for an active trade on candle close.
 */
function evaluateTradeExits(ctx) {
  const {
    activeTrade, curBar, oppBar, prevCurBar, barNifty,
    t, i, barsHeld, opts, lastCEPrice, lastPEPrice, dayKey, dayLabel
  } = ctx;

  if (activeTrade) {
    activeTrade.milestones = activeTrade.milestones || {
      pts25: { reached: false, time: null, price: null },
      pts30: { reached: false, time: null, price: null },
      pts50: { reached: false, time: null, price: null }
    };
  }

  if (curBar) {
    if (!activeTrade.maxHigh || curBar.high > activeTrade.maxHigh) {
      activeTrade.maxHigh = curBar.high;
      activeTrade.peakBarIndex = i;
    }
    const currentRun = Math.round((curBar.high - activeTrade.entryPrice) * 100) / 100;
    if (currentRun >= 25.0 && !activeTrade.milestones.pts25.reached) {
      activeTrade.milestones.pts25 = { reached: true, time: t, price: curBar.high, points: currentRun };
    }
    if (currentRun >= 30.0 && !activeTrade.milestones.pts30.reached) {
      activeTrade.milestones.pts30 = { reached: true, time: t, price: curBar.high, points: currentRun };
    }
    if (currentRun >= 50.0 && !activeTrade.milestones.pts50.reached) {
      activeTrade.milestones.pts50 = { reached: true, time: t, price: curBar.high, points: currentRun };
    }
    if (curBar.pp && curBar.high > curBar.pp) {
      activeTrade.crossedPP = true;
    }
  }

  let exitTrigger = false;
  let exitReason = "";

  // Milestone Trailing SL Protection Floor:
  let protectedFloor = null;
  const runSoFar = activeTrade.maxHigh ? (activeTrade.maxHigh - activeTrade.entryPrice) : 0;
  if (runSoFar >= 50.0) {
    protectedFloor = activeTrade.entryPrice + 25.0;
  } else if (runSoFar >= 35.0) {
    protectedFloor = activeTrade.entryPrice + 15.0;
  } else if (runSoFar >= 25.0) {
    protectedFloor = activeTrade.entryPrice + 2.0;
  }

  // Close below protected floor triggers milestone exit (only after peak bar has passed)
  if (!exitTrigger && protectedFloor !== null && curBar && i > activeTrade.peakBarIndex && curBar.close < protectedFloor) {
    exitTrigger = true;
    exitReason = `Milestone Trailing SL Triggered: Reached +${runSoFar.toFixed(1)} pts peak; locked +${(protectedFloor - activeTrade.entryPrice).toFixed(1)} pts minimum at ₹${protectedFloor.toFixed(2)}`;
    activeTrade.targetExitPrice = protectedFloor;
  }

  // Exit: Fixed Target (Takes immediate priority if configured)
  if (opts.fixedTarget && opts.fixedTarget > 0 && curBar) {
    if (curBar.high >= activeTrade.entryPrice + opts.fixedTarget) {
      exitTrigger = true;
      exitReason = `Fixed Target Exit (+${opts.fixedTarget} pts)`;
      activeTrade.targetExitPrice = activeTrade.entryPrice + opts.fixedTarget;
    }
  }

  // Exit: Setup 16 (1:4 Target Exit)
  if (!exitTrigger && activeTrade.targetPrice && curBar && curBar.high >= activeTrade.targetPrice) {
    exitTrigger = true;
    exitReason = `1:4 Target Hit: Reached ₹${activeTrade.targetPrice.toFixed(2)} (+${(activeTrade.targetPrice - activeTrade.entryPrice).toFixed(2)} pts)`;
    activeTrade.targetExitPrice = activeTrade.targetPrice;
  }

  // 3-Chart Alignment Incubation Cushion (First 6 bars / ~18 mins):
  // Gives high-conviction 3-chart aligned trades room to breathe without being shaken out by micro-noise.
  const isIncubationActive = activeTrade.is3ChartAligned && barsHeld <= (opts.alignmentCushionBars || 6);
  if (!exitTrigger && isIncubationActive && curBar) {
    const slThreshold = activeTrade.isSetup16Trade ? activeTrade.stopLoss : (activeTrade.signalCandleLow || activeTrade.stopLoss);
    // Hard capital protection: if candle closes below signal candle low or catastrophic 25+ pt drop
    if (slThreshold && curBar.close < slThreshold) {
      exitTrigger = true;
      exitReason = `Stop Loss Hit: Price closed below Signal Candle Low (₹${slThreshold.toFixed(2)}); exited at ₹${curBar.close.toFixed(2)}`;
    } else if (activeTrade.entryPrice && curBar.low < activeTrade.entryPrice - 25.0) {
      exitTrigger = true;
      exitReason = `Catastrophic SL Hit: Price fell 25+ pts from entry; exited at ₹${curBar.close.toFixed(2)}`;
    }
  }

  // RMI Support Hold Invalidation Check:
  if (!exitTrigger && opts.enableRMISupportHold && activeTrade && activeTrade.rmiHoldSL && curBar && curBar.close < activeTrade.rmiHoldSL && t !== activeTrade.rmiHoldTime) {
    exitTrigger = true;
    exitReason = `RMI Support Invalidation: Closed below Sell Signal Low (₹${activeTrade.rmiHoldSL.toFixed(2)}); exited at ₹${curBar.close.toFixed(2)}`;
  }

  // Chandelier Exit Support Cushion Confirmation (Candle+1 Check):
  // When an exit is deferred because price touched the Chandelier Exit line (dynamic trend floor),
  // confirm exit ONLY if Candle+1 confirms breakdown by closing below the trigger candle's close (or CE line).
  if (!exitTrigger && opts.enableCELineSupportCushion && activeTrade && activeTrade.pendingCELineExit && t !== activeTrade.pendingCELineExit.triggerTime) {
    if (curBar && (curBar.close < activeTrade.pendingCELineExit.triggerClose || (activeTrade.pendingCELineExit.ceLine && curBar.close < activeTrade.pendingCELineExit.ceLine))) {
      exitTrigger = true;
      exitReason = `${activeTrade.pendingCELineExit.exitReason} (Confirmed by Candle+1 breakdown below ₹${activeTrade.pendingCELineExit.triggerClose.toFixed(2)})`;
      activeTrade.pendingCELineExit = null;
    } else {
      // CE line pushed price higher (springboard bounce); invalidate pending exit and ride the trend!
      activeTrade.pendingCELineExit = null;
    }
  }

  // Exit 0: Counter-Breakout Exit (Suppressed during incubation phase)
  if (!exitTrigger && opts.enableCounterBreakoutExit && !isIncubationActive) {
    if (activeTrade.side === "PE") {
      const ceBuySignal = ctx.barCE && (ctx.barCE.longSignal === 1 || ctx.barCE.emaBuyHM === 1);
      const niftyBuySignal = barNifty && (barNifty.longSignal === 1 || barNifty.emaBuyHM === 1);
      if (ceBuySignal && niftyBuySignal) {
        const oppHasBuy = oppBar && (oppBar.longSignal === 1 || oppBar.emaBuyHM === 1);
        const isNearRMI = !oppHasBuy && opts.enableRMISupportHold && curBar && curBar.rmiCenter && (curBar.close >= curBar.rmiCenter) && (curBar.close - curBar.rmiCenter <= opts.rmiSupportHoldThreshold);
        const isNearCELine = opts.enableCELineSupportCushion && curBar && curBar.longStop != null && (curBar.low >= curBar.longStop - 2.5) && (curBar.low - curBar.longStop <= (opts.ceLineCushionThreshold || 5.0));
        if (isNearRMI && (!activeTrade.rmiHoldSL || activeTrade.rmiHoldTime === t)) {
          activeTrade.rmiHoldSL = curBar.low;
          activeTrade.rmiHoldTime = t;
        } else if (isNearCELine && (!activeTrade.pendingCELineExit || activeTrade.pendingCELineExit.triggerTime === t)) {
          activeTrade.pendingCELineExit = {
            triggerTime: t,
            triggerClose: curBar.close,
            ceLine: curBar.longStop,
            exitReason: `Counter-Breakout Exit: Nifty Spot (Close ₹${barNifty.close.toFixed(2)}) and CE (Close ₹${ctx.barCE.close.toFixed(2)}) fired simultaneous Buy Signals`
          };
          if (curBar.longStop) {
            activeTrade.stopLoss = curBar.longStop;
            activeTrade.invalidationLevel = curBar.longStop;
          }
        } else {
          exitTrigger = true;
          exitReason = `Counter-Breakout Exit: Nifty Spot (Close ₹${barNifty.close.toFixed(2)}) and CE (Close ₹${ctx.barCE.close.toFixed(2)}) fired simultaneous Buy Signals`;
        }
      }
    } else if (activeTrade.side === "CE") {
      const peBuySignal = ctx.barPE && (ctx.barPE.longSignal === 1 || ctx.barPE.emaBuyHM === 1);
      const niftyShortSignal = barNifty && (barNifty.shortSignal === 1);
      if (peBuySignal && niftyShortSignal) {
        const isNearRMI = opts.enableRMISupportHold && curBar && curBar.rmiCenter && (curBar.close >= curBar.rmiCenter) && (curBar.close - curBar.rmiCenter <= opts.rmiSupportHoldThreshold);
        const isNearCELine = opts.enableCELineSupportCushion && curBar && curBar.longStop != null && (curBar.low >= curBar.longStop - 2.5) && (curBar.low - curBar.longStop <= (opts.ceLineCushionThreshold || 5.0));
        if (isNearRMI && (!activeTrade.rmiHoldSL || activeTrade.rmiHoldTime === t)) {
          activeTrade.rmiHoldSL = curBar.low;
          activeTrade.rmiHoldTime = t;
        } else if (isNearCELine && (!activeTrade.pendingCELineExit || activeTrade.pendingCELineExit.triggerTime === t)) {
          activeTrade.pendingCELineExit = {
            triggerTime: t,
            triggerClose: curBar.close,
            ceLine: curBar.longStop,
            exitReason: `Counter-Breakout Exit: Nifty Spot (Close ₹${barNifty.close.toFixed(2)}) and PE (Close ₹${ctx.barPE.close.toFixed(2)}) fired simultaneous Sell/Buy Signals`
          };
          if (curBar.longStop) {
            activeTrade.stopLoss = curBar.longStop;
            activeTrade.invalidationLevel = curBar.longStop;
          }
        } else {
          exitTrigger = true;
          exitReason = `Counter-Breakout Exit: Nifty Spot (Close ₹${barNifty.close.toFixed(2)}) and PE (Close ₹${ctx.barPE.close.toFixed(2)}) fired simultaneous Sell/Buy Signals`;
        }
      }
    }
  }

  // Stop Loss Buffer: Stop Loss = Invalidation Level - 2.50 pts
  const slBuffer = opts.slBuffer !== undefined ? opts.slBuffer : 2.50;
  const rawInvalidation = activeTrade.invalidationLevel || activeTrade.stopLoss;
  const bufferedSL = activeTrade.invalidationLevel ? activeTrade.stopLoss : (activeTrade.stopLoss - slBuffer);

  // Special Exit for Shallow Support Entry: Only exit on Candle A Stop Loss or 9 EMA close breakdown
  if (activeTrade.onlyExitOn9EMA) {
    if (activeTrade.stopLoss && curBar && curBar.low <= bufferedSL) {
      exitTrigger = true;
      exitReason = `Stop Loss Hit: Price broke below Stop Loss (₹${bufferedSL.toFixed(2)} [Invalidation ₹${rawInvalidation.toFixed(2)} - ${slBuffer.toFixed(2)} pts buffer]); exited at ₹${curBar.close.toFixed(2)}`;
    } else if (curBar && curBar.ema9 && curBar.close < curBar.ema9 && barsHeld >= 1) {
      exitTrigger = true;
      exitReason = `9 EMA Breakdown Exit: Price closed below 9 EMA (₹${curBar.ema9.toFixed(2)}); exited at ₹${curBar.close.toFixed(2)}`;
    }
  }

  // Stop Loss Invalidation Exit
  if (!exitTrigger && !activeTrade.onlyExitOn9EMA && activeTrade.stopLoss) {
    if (isIncubationActive) {
      // During incubation cushion (first 18 mins), exit only if candle CLOSES below SL or catastrophic wick > 25 pts
      if (curBar && curBar.close < bufferedSL) {
        exitTrigger = true;
        exitReason = `Stop Loss Hit: Price closed below Stop Loss (₹${bufferedSL.toFixed(2)} [Invalidation ₹${rawInvalidation.toFixed(2)} - ${slBuffer.toFixed(2)} pts buffer]); exited at ₹${curBar.close.toFixed(2)}`;
      } else if (curBar && curBar.low < activeTrade.entryPrice - 25.0) {
        exitTrigger = true;
        exitReason = `Catastrophic SL Hit: Price dropped 25+ pts from entry; exited at ₹${curBar.close.toFixed(2)}`;
      }
    } else {
      if (curBar && curBar.low <= bufferedSL) {
        exitTrigger = true;
        exitReason = `Stop Loss Hit: Price broke below Stop Loss (₹${bufferedSL.toFixed(2)} [Invalidation ₹${rawInvalidation.toFixed(2)} - ${slBuffer.toFixed(2)} pts buffer]); exited at ₹${curBar.close.toFixed(2)}`;
      }
    }
  }

  if (activeTrade.onlyExitOn9EMA && !exitTrigger && t < "15:15") {
    // Enforce: only exit on 9 EMA or SL or EOD
  } else
    // Exit 1: EOD Market Close
    if (t >= "15:15") {
      exitTrigger = true;
      exitReason = `EOD Market Session Close at ₹${curBar ? curBar.close.toFixed(2) : activeTrade.entryPrice}`;
    }
    // Exit 2: 10-Bar Stagnation Failure to Break Signal High or Below Entry
    else if (barsHeld >= opts.stagnationBars && curBar && (curBar.close < activeTrade.entryPrice || (activeTrade.signalHigh && activeTrade.maxHigh <= activeTrade.signalHigh))) {
      exitTrigger = true;
      exitReason = curBar.close < activeTrade.entryPrice
        ? `10-Bar Stagnation: Price trading below entry (₹${curBar.close.toFixed(2)} < ₹${activeTrade.entryPrice.toFixed(2)}) after ${opts.stagnationBars} bars; exited at ₹${curBar.close.toFixed(2)}`
        : `10-Bar Stagnation: Price unable to cross signal high (₹${activeTrade.signalHigh.toFixed(2)}) for ${opts.stagnationBars} consecutive candles; exited at ₹${curBar.close.toFixed(2)}`;
    }
    // Exit 4: Multi-Chart CPR PP Flip Breakdown (High priority)
    else if (opts.enableCPRExits && activeTrade.crossedPP && barNifty && barNifty.pp && curBar && curBar.pp && (
      (activeTrade.side === "PE" && curBar.close < curBar.pp && barNifty.close > barNifty.pp) ||
      (activeTrade.side === "CE" && curBar.close < curBar.pp && barNifty.close < barNifty.pp)
    )) {
      exitTrigger = true;
      exitReason = `Multi-Chart CPR PP Flip: Nifty ${activeTrade.side === "PE" ? "reclaimed" : "broke below"} CPR PP (₹${barNifty.pp.toFixed(2)}) while ${activeTrade.side} broke down below CPR PP (₹${curBar.pp.toFixed(2)}); exited at ₹${curBar.close.toFixed(2)}`;
    }
    // Exit 3: CPR Pivot Resistance + HM Volume Exhaustion
    else if (opts.enableCPRExits && opts.enableHMVolExit && curBar && curBar.pp && curBar.rsi && curBar.volStrength && activeTrade.entryPrice < curBar.pp && curBar.high >= curBar.pp - 2) {
      const nearCPR = Math.abs(curBar.close - curBar.pp) < 8;
      const hmExhaustion = (curBar.rsi - curBar.volStrength <= 1.5);
      if (nearCPR && hmExhaustion) {
        exitTrigger = true;
        exitReason = `CPR Pivot Resistance + HM Volume Reversal: Price near CPR PP (₹${curBar.pp.toFixed(2)}) with HM volume exhaustion (${curBar.volStrength.toFixed(1)} vs RSI ${curBar.rsi.toFixed(1)}); exited at ₹${curBar.close.toFixed(2)}`;
      }
    }

  // Exit 5: Multi-Chart Sell Zone Rejection (Bidirectional for CE & PE)
  if (!exitTrigger && curBar && barNifty && barsHeld >= 2) {
    const sellZoneLevel = curBar.shortStop;
    const curUpperWick = curBar.high - Math.max(curBar.open, curBar.close);
    const curLowerWick = Math.min(curBar.open, curBar.close) - curBar.low;

    const isRetestFailure = activeTrade.maxHigh &&
      (activeTrade.maxHigh - activeTrade.entryPrice >= 20.0) &&
      activeTrade.peakBarIndex != null && (i > activeTrade.peakBarIndex) &&
      (curBar.high >= activeTrade.maxHigh - 10.0) &&
      (curUpperWick >= 8.0);

    if (activeTrade.side === "CE") {
      const isAtSellZone = (sellZoneLevel && curBar.high >= sellZoneLevel - 1 && activeTrade.entryPrice < sellZoneLevel) || isRetestFailure;
      if (isAtSellZone && !isIncubationActive) {
        if (!activeTrade.is3ChartAligned) { activeTrade.stopLoss = Math.max(activeTrade.stopLoss || 0, curBar.low); }
        const hasRejectionWick = curUpperWick > curLowerWick && curUpperWick >= opts.sellZoneMinWick;
        const spotRejection = barNifty.close < barNifty.open;
        if (curBar.close < curBar.open && hasRejectionWick && spotRejection) {
          exitTrigger = true;
          exitReason = `Multi-Chart Sell Zone Rejection: CE tested Sell Zone resistance (high ₹${curBar.high.toFixed(2)}) with upper rejection wick (${curUpperWick.toFixed(2)} pts); exited at ₹${curBar.close.toFixed(2)}`;
        }
      }
    } else if (activeTrade.side === "PE") {
      const isAtSellZone = (sellZoneLevel && curBar.high >= sellZoneLevel - 1 && activeTrade.entryPrice < sellZoneLevel) || isRetestFailure;
      if (isAtSellZone) {
        activeTrade.stopLoss = Math.max(activeTrade.stopLoss || 0, curBar.low);
        const hasRejectionWick = curUpperWick > curLowerWick && curUpperWick >= opts.sellZoneMinWick;
        const spotRejection = barNifty.close > barNifty.open;
        if (curBar.close < curBar.open && hasRejectionWick && spotRejection) {
          exitTrigger = true;
          exitReason = `Multi-Chart Sell Zone Rejection: PE tested Sell Zone resistance (high ₹${curBar.high.toFixed(2)}) with upper rejection wick (${curUpperWick.toFixed(2)} pts); exited at ₹${curBar.close.toFixed(2)}`;
        }
      }
    }
  }

  // Exit 6: Sell Zone + CE/RMI Rejection (Bidirectional for PE & CE)
  if (!exitTrigger && !activeTrade.isInflectionTrade && curBar && curBar.rmiCenter && oppBar && oppBar.rmiCenter && barNifty && barNifty.rmiCenter && barsHeld >= 2) {
    if (activeTrade.side === "PE") {
      const peRejected = curBar.close < curBar.rmiCenter && curBar.close < curBar.open && prevCurBar && curBar.close < prevCurBar.low;
      const ceHolding = oppBar.close > oppBar.rmiCenter && oppBar.close > oppBar.open;
      const spotHolding = barNifty.close > barNifty.rmiCenter;
      if (peRejected && ceHolding && spotHolding) {
        exitTrigger = true;
        exitReason = `Sell Zone + CE/RMI Rejection: PE rejected below RMI Center (₹${curBar.rmiCenter.toFixed(2)}) while CE (₹${oppBar.rmiCenter.toFixed(2)}) and Nifty Spot supported above RMI Center; exited at ₹${curBar.close.toFixed(2)}`;
      }
    } else if (activeTrade.side === "CE") {
      const ceRejected = curBar.close < curBar.rmiCenter && curBar.close < curBar.open && prevCurBar && curBar.close < prevCurBar.low;
      const peHolding = oppBar.close > oppBar.rmiCenter && oppBar.close > oppBar.open;
      const spotBearish = barNifty.close < barNifty.rmiCenter;
      if (ceRejected && peHolding && spotBearish) {
        exitTrigger = true;
        exitReason = `Sell Zone + PE/RMI Rejection: CE rejected below RMI Center (₹${curBar.rmiCenter.toFixed(2)}) while PE (₹${oppBar.rmiCenter.toFixed(2)}) supported above RMI Center and Nifty Spot broke below RMI Center; exited at ₹${curBar.close.toFixed(2)}`;
      }
    }
  }

  // Exit 7: TV Short Signal Confirmation (requires barsHeld >= 3, suppressed during 3-chart incubation cushion)
  if (!exitTrigger && curBar && curBar.shortSignal === 1 && barsHeld >= 3 && !isIncubationActive) {
    const oppHasBuy = oppBar && (oppBar.longSignal === 1 || oppBar.emaBuyHM === 1);
    const isNearRMI = !oppHasBuy && opts.enableRMISupportHold && curBar && curBar.rmiCenter && (curBar.close >= curBar.rmiCenter) && (curBar.close - curBar.rmiCenter <= opts.rmiSupportHoldThreshold);
    const isNearCELine = opts.enableCELineSupportCushion && curBar && curBar.longStop != null && (curBar.low >= curBar.longStop - 2.5) && (curBar.low - curBar.longStop <= (opts.ceLineCushionThreshold || 5.0));
    if (isNearRMI && (!activeTrade.rmiHoldSL || activeTrade.rmiHoldTime === t)) {
      activeTrade.rmiHoldSL = curBar.low;
      activeTrade.rmiHoldTime = t;
    } else if (isNearCELine && (!activeTrade.pendingCELineExit || activeTrade.pendingCELineExit.triggerTime === t)) {
      activeTrade.pendingCELineExit = {
        triggerTime: t,
        triggerClose: curBar.close,
        ceLine: curBar.longStop,
        exitReason: `Sell Signal Indication Exit: Formed TV short signal confirmation at ₹${curBar.close.toFixed(2)}`
      };
      if (curBar.longStop) {
        activeTrade.stopLoss = curBar.longStop;
        activeTrade.invalidationLevel = curBar.longStop;
      }
    } else {
      exitTrigger = true;
      exitReason = `Sell Signal Indication Exit: Formed TV short signal confirmation at ₹${curBar.close.toFixed(2)}`;
    }
  }

  // Exit 8: 200 EMA Resistance Rejection
  if (!exitTrigger && !activeTrade.onlyExitOn9EMA && curBar && curBar.ema200 && prevCurBar && prevCurBar.ema200 && barsHeld >= 2 && activeTrade.entryPrice < curBar.ema200 - 15) {
    const followThroughReject = prevCurBar.high >= prevCurBar.ema200 - 1 && curBar.close <= curBar.ema200;
    if (followThroughReject) {
      exitTrigger = true;
      exitReason = `2-Chart 200 EMA Rejection: Tested 200 EMA (₹${curBar.ema200.toFixed(2)}) and confirmation candle closed below; exited at ₹${curBar.close.toFixed(2)}`;
    }
  }

  // Exit 9: Universal CPR Ceiling Rejection (R1, S1, R3, S3) — Suppressed during incubation phase
  if (!exitTrigger && opts.enableCPRExits && curBar && barsHeld >= 3 && !isIncubationActive) {
    const cprCeilings = [
      { name: "R1", val: curBar.r1 },
      { name: "S1", val: curBar.s1 },
      { name: "R3", val: curBar.r3 },
      { name: "S3", val: curBar.s3 }
    ].filter(c => c.val != null && !isNaN(c.val) && c.val > activeTrade.entryPrice);

    for (const ceil of cprCeilings) {
      const testedCeiling = (activeTrade.maxHigh >= ceil.val * 0.98 || curBar.high >= ceil.val - 1);
      const isRejecting = (curBar.close < curBar.open && curBar.close <= ceil.val) &&
        (prevCurBar && curBar.volStrength < 80.0 && curBar.volStrength < prevCurBar.volStrength);
      if (testedCeiling && isRejecting) {
        exitTrigger = true;
        exitReason = `CPR ${ceil.name} Ceiling Rejection: ${activeTrade.side} tested ${ceil.name} (₹${ceil.val.toFixed(2)}) with ceiling rejection; exited at ₹${curBar.close.toFixed(2)}`;
        break;
      }
    }
  }

  if (exitTrigger) {
    let exitPrice = activeTrade.targetExitPrice || (curBar ? curBar.close : ((activeTrade.side === "PE" ? lastPEPrice : lastCEPrice) || activeTrade.entryPrice));
    if (protectedFloor !== null && exitPrice < protectedFloor) {
      exitPrice = protectedFloor;
      exitReason += ` (Protected by Milestone Trailing SL: Locked ₹${protectedFloor.toFixed(2)})`;
    }
    const grossPoints = Math.round((exitPrice - activeTrade.entryPrice) * 100) / 100;
    const grossPnL = Math.round(grossPoints * opts.lotSize * 100) / 100;
    const comm = opts.commission * 2;
    const netPnL = Math.round((grossPnL - comm) * 100) / 100;

    const peakHigh = activeTrade.maxHigh ? Math.max(activeTrade.maxHigh, exitPrice) : exitPrice;
    const maxPointsRun = Math.round((peakHigh - activeTrade.entryPrice) * 100) / 100;
    const is25pointsReached = maxPointsRun >= 25.0;
    const is30pointsReached = maxPointsRun >= 30.0;
    const is50pointsReached = maxPointsRun >= 50.0;

    const tradeRecord = {
      day: dayKey,
      dayLabel: dayLabel,
      side: activeTrade.side,
      strike: activeTrade.strike,
      file: activeTrade.file,
      entryTime: `${dayKey}T${activeTrade.entryTime}:00+05:30`,
      entryPrice: activeTrade.entryPrice,
      exitTime: `${dayKey}T${t}:00+05:30`,
      exitPrice: exitPrice,
      exitReason: exitReason,
      grossPoints: grossPoints,
      grossPnL: grossPnL,
      commission: comm,
      netPnL: netPnL,
      barsHeld: barsHeld,
      durationMinutes: barsHeld * 3,
      isWin: netPnL > 0,
      isConfluenceTrade: true,
      reasonShort: activeTrade.reasonShort,
      reasoning: `${activeTrade.reasoning} • 🚪 Exit: ${exitReason}`,
      peakHigh: peakHigh,
      maxPointsRun: maxPointsRun,
      is25pointsReached: is25pointsReached,
      is30pointsReached: is30pointsReached,
      is50pointsReached: is50pointsReached,
      milestones: activeTrade.milestones || {}
    };

    return {
      exited: true,
      tradeRecord,
      exitReason,
      exitSide: activeTrade.side
    };
  }

  return { exited: false };
}

/**
 * Evaluates pending setups and new entry setups for the candle at index i (time t).
 */
function evaluateTradeEntries(ctx) {
  const {
    state, barCE, barPE, barNifty, prevCE, prevPE, prevNifty,
    t, i, times, opts, isStrictBull, isStrictBear,
    dayKey, dayLabel, currentCEFile, currentPEFile, fileForSide,
    recordSkip, peMap, ceMap, niftyMap
  } = ctx;

  if (state.activeTrade || t < opts.entryStartTime || t > opts.entryEndTime) {
    return;
  }

  // Daily Circuit Breaker: Halt new entries after max consecutive losses
  if (opts.enableDailyCircuitBreaker && (state.dailyConsecutiveLosses || 0) >= (opts.maxConsecutiveLosses || 2)) {
    return;
  }

  // Setup 18: Sell Zone Ceiling Breakout Reclaim
  if (opts.enableSellZoneBreakout && state.pendingSellZoneBreakout && state.pendingSellZoneBreakout.active) {
    if (i > state.pendingSellZoneBreakout.expireIndex) {
      state.pendingSellZoneBreakout = null;
    } else {
      const pSide = state.pendingSellZoneBreakout.side;
      const targetBar = pSide === "CE" ? barCE : barPE;
      const oppBar = pSide === "CE" ? barPE : barCE;
      const spotBar = barNifty;

      if (targetBar && oppBar && spotBar) {
        // Step 3: Hard Early Cancellation (Invalidation)
        const lowBroken = targetBar.close < state.pendingSellZoneBreakout.signalLow;
        const freshSell = targetBar.shortSignal === 1;
        const spotReversal = pSide === "CE"
          ? (spotBar.close < (spotBar.ema9 || spotBar.open) && spotBar.shortSignal === 1)
          : (spotBar.close > (spotBar.ema9 || spotBar.open) && spotBar.longSignal === 1);

        if (lowBroken || freshSell || spotReversal) {
          state.pendingSellZoneBreakout = null;
        } else {
          // Spot 200 EMA Floor Defense Guard (Only for PE breakouts)
          if (opts.enableSpot200EMAGuard && pSide === 'PE' && spotBar && spotBar.ema200 && spotBar.close >= spotBar.ema200 - 5) {
            const curLowNear = (spotBar.low <= spotBar.ema200 + 15);
            const prevLowNear = prevNifty && prevNifty.ema200 && (prevNifty.low <= prevNifty.ema200 + 15);
            if (curLowNear || prevLowNear) {
              if (recordSkip) {
                recordSkip(
                  {
                    skipReason: `Spot 200 EMA Floor Defense: Spot Low ₹${spotBar.low.toFixed(1)} tested 200 EMA (₹${spotBar.ema200.toFixed(1)}) — PE breakout cancelled to protect capital`,
                    reasoning: `🛑 Filtered: Spot 200 EMA Floor Defense — Nifty Spot low touched ₹${spotBar.low.toFixed(1)} defending 3m 200 EMA (₹${spotBar.ema200.toFixed(1)}). PE breakout cancelled to prevent buying into institutional macro bounce.`
                  },
                  pSide,
                  state.pendingSellZoneBreakout.file,
                  targetBar.close,
                  t
                );
              }
              state.pendingSellZoneBreakout = null;
              return;
            }
          }

          // Step 4: Execution Trigger: Candle close strictly above ceiling
          const breakoutConfirmed = targetBar.close > state.pendingSellZoneBreakout.ceiling;
          const spotAligned = pSide === "CE"
            ? (spotBar.close > (spotBar.ema9 || spotBar.open))
            : (spotBar.close < (spotBar.ema9 || spotBar.open));

          if (breakoutConfirmed && spotAligned) {
            const entryPrice = targetBar.close;
            const stopLoss = Math.min(targetBar.low, state.pendingSellZoneBreakout.signalLow);
            const slDist = entryPrice - stopLoss;
            const barsElapsed = i - state.pendingSellZoneBreakout.signalIndex;
            const file = state.pendingSellZoneBreakout.file;

            state.activeTrade = {
              side: pSide,
              strike: cleanStrikeName(file),
              file: file,
              entryTime: t,
              entryIndex: i,
              entryPrice: entryPrice,
              signalHigh: targetBar.high,
              signalCandleLow: targetBar.low,
              stopLoss: stopLoss,
              isSellZoneBreakoutTrade: true,
              reasonShort: "Sell Zone Ceiling Breakout",
              reasoning: `🎯 Trigger: Setup 18 Sell Zone Ceiling Breakout — Reclaimed Sell Zone ceiling (₹${state.pendingSellZoneBreakout.ceiling.toFixed(2)}) within ${barsElapsed} bars (${barsElapsed * 3}m) (Entered @ ₹${entryPrice.toFixed(2)}, Protected SL @ ₹${stopLoss.toFixed(2)} [Cleared Ceiling ₹${state.pendingSellZoneBreakout.ceiling.toFixed(2)} - 2.50 buffer, Risk: ${slDist.toFixed(2)} pts])`
            };

            if (state.sellZones && state.sellZones[pSide]) {
              state.sellZones[pSide].active = false;
            }
            state.pendingSellZoneBreakout = null;
            return;
          }
        }
      }
    }
  }

  // Setup 17: Chandelier Exit (CE Line) Wick Reclaim Breakout
  if (opts.enableCELineWickBreakout && state.pendingCELineBreakout && state.pendingCELineBreakout.active) {
    if (i > state.pendingCELineBreakout.expireIndex) {
      state.pendingCELineBreakout = null;
    } else {
      const pSide = state.pendingCELineBreakout.side;
      const targetBar = pSide === "CE" ? barCE : barPE;
      const oppBar = pSide === "CE" ? barPE : barCE;
      const spotBar = barNifty;

      if (targetBar && oppBar && spotBar) {
        const targetHigh = state.pendingCELineBreakout.targetHigh;
        const breakoutConfirmed = targetBar.close > targetHigh;

        if (breakoutConfirmed) {
          let oppBearish = false;
          let spotAligned = false;

          if (pSide === "CE") {
            oppBearish = oppBar.close < oppBar.open || oppBar.close < (oppBar.ema9 || oppBar.close + 1);
            spotAligned = spotBar.close > spotBar.open || spotBar.close > (spotBar.ema9 || spotBar.close - 1);
          } else {
            oppBearish = oppBar.close > oppBar.open || oppBar.close > (oppBar.ema9 || oppBar.close - 1);
            spotAligned = spotBar.close < spotBar.open || spotBar.close < (spotBar.ema9 || spotBar.close + 1);
          }

          if (oppBearish && spotAligned) {
            const entryPrice = targetBar.close;
            const invalidationLevel = Math.min(targetBar.low, state.pendingCELineBreakout.signalLow);
            const stopLoss = invalidationLevel - 2.50;
            const slDist = entryPrice - stopLoss;
            const barsElapsed = i - state.pendingCELineBreakout.signalIndex;

            if (slDist <= (opts.maxCELineWickBreakoutSLDist || 45.0)) {
              const file = state.pendingCELineBreakout.file;
              state.activeTrade = {
                side: pSide,
                strike: cleanStrikeName(file),
                file: file,
                entryTime: t,
                entryIndex: i,
                entryPrice: entryPrice,
                signalHigh: targetBar.high,
                invalidationLevel: invalidationLevel,
                stopLoss: stopLoss,
                isCELineBreakoutTrade: true,
                reasonShort: "CE Line Wick Breakout (Setup 17)",
                reasoning: `🎯 Trigger: Setup 17 CE Line Wick Breakout — Reclaimed Chandelier Exit rejection level (₹${targetHigh.toFixed(2)}) within ${barsElapsed} bars (${barsElapsed * 3}m) (Entered @ ₹${entryPrice.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)} [Invalidation ₹${invalidationLevel.toFixed(2)} - 2.50 pts buffer, Risk: ${slDist.toFixed(2)} pts])`
              };
              state.pendingCELineBreakout = null;
              return;
            } else {
              state.skippedTrades.push({
                id: `S${state.skippedTrades.length + 1}`,
                day: dayKey, dayLabel: dayLabel,
                side: pSide, strike: cleanStrikeName(state.pendingCELineBreakout.file), file: state.pendingCELineBreakout.file,
                entryTime: `${dayKey}T${t}:00+05:30`, entryPrice,
                status: "SKIPPED",
                skipReason: `Setup 17 CE Line Breakout SL Too Wide: SL distance (${slDist.toFixed(2)} pts) > ${opts.maxCELineWickBreakoutSLDist || 45.0} pts max`,
                reasoning: `🛡️ Setup 17 CE Line Breakout skipped: SL distance ${slDist.toFixed(2)} pts exceeds ${(opts.maxCELineWickBreakoutSLDist || 45.0)} pt cap.`
              });
              state.pendingCELineBreakout = null;
            }
          }
        }
      }
    }
  }

  // Setup 13: Candle B Multi-Chart Trend Alignment Breakout
  if (opts.enableCandleBTrendBreakout && state.pendingCandleBAlignment && state.pendingCandleBAlignment.active) {
    if (i > state.pendingCandleBAlignment.signalIndex + 1) {
      state.pendingCandleBAlignment = null;
    } else if (i === state.pendingCandleBAlignment.signalIndex + 1) {
      const pSide = state.pendingCandleBAlignment.side;
      const targetBar = pSide === "CE" ? barCE : barPE;
      const oppBar = pSide === "CE" ? barPE : barCE;
      const spotBar = barNifty;

      if (targetBar && oppBar && spotBar) {
        const breakoutConfirmed = targetBar.close > state.pendingCandleBAlignment.signalHigh;
        let oppBearish = false;
        let spotAligned = false;

        if (pSide === "CE") {
          const oppCELine = oppBar.shortStop || oppBar.longStop;
          oppBearish = oppBar.close < oppBar.ema9 && 
                       oppBar.close < (oppBar.ema20 || oppBar.ema9) && 
                       (!oppBar.rmiCenter || oppBar.close < oppBar.rmiCenter) &&
                       (!oppCELine || oppBar.close < oppCELine);

          const spotCELine = spotBar.longStop || spotBar.shortStop;
          spotAligned = spotBar.close > spotBar.ema9 &&
                        spotBar.close > (spotBar.ema20 || spotBar.ema9) &&
                        (!spotBar.rmiCenter || spotBar.close > spotBar.rmiCenter) &&
                        (!spotCELine || spotBar.close > spotCELine);
        } else {
          const oppCELine = oppBar.shortStop || oppBar.longStop;
          oppBearish = oppBar.close < oppBar.ema9 && 
                       oppBar.close < (oppBar.ema20 || oppBar.ema9) && 
                       (!oppBar.rmiCenter || oppBar.close < oppBar.rmiCenter) &&
                       (!oppCELine || oppBar.close < oppCELine);

          const spotCELine = spotBar.shortStop || spotBar.longStop;
          spotAligned = spotBar.close < spotBar.ema9 &&
                        spotBar.close < (spotBar.ema20 || spotBar.ema9) &&
                        (!spotBar.rmiCenter || spotBar.close < spotBar.rmiCenter) &&
                        (!spotCELine || spotBar.close < spotCELine);
        }

        if (breakoutConfirmed && oppBearish && spotAligned) {
          const entryPrice = targetBar.close;
          const stopLoss = state.pendingCandleBAlignment.signalLow;
          const slDist = entryPrice - stopLoss;
          if (slDist <= opts.maxCandleBTrendSLDist) {
            const safety = checkPreEntrySafety(pSide, state.pendingCandleBAlignment.file, targetBar, oppBar, spotBar, t, i, "Candle B Multi-Chart Trend Breakout", null, opts, state);
            if (!safety.allowed) {
              recordSkip(safety, pSide, state.pendingCandleBAlignment.file, targetBar.close, t);
              state.pendingCandleBAlignment = null;
              return;
            }
            const file = state.pendingCandleBAlignment.file;
            state.activeTrade = {
              side: pSide,
              strike: cleanStrikeName(file),
              file: file,
              entryTime: t,
              entryIndex: i,
              entryPrice: entryPrice,
              signalHigh: Math.max(targetBar.high, state.pendingCandleBAlignment.signalHigh),
              stopLoss: stopLoss,
              isCandleBAlignmentTrade: true,
              reasonShort: "Candle B Multi-Chart Trend Breakout",
              reasoning: `🎯 Trigger: Setup 13 Candle B Multi-Chart Trend Breakout — Candle B (${t}) broke Candle A high (₹${state.pendingCandleBAlignment.signalHigh.toFixed(2)}) with complete 3-chart trend alignment (Spot & Counter-strike aligned) (Entered @ ₹${entryPrice.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)} [Risk: ${slDist.toFixed(2)} pts])`
            };
            state.pendingCandleBAlignment = null;
            return;
          } else {
            state.skippedTrades.push({
              id: `S${state.skippedTrades.length + 1}`,
              day: dayKey, dayLabel: dayLabel,
              side: pSide, strike: cleanStrikeName(state.pendingCandleBAlignment.file), file: state.pendingCandleBAlignment.file,
              entryTime: `${dayKey}T${t}:00+05:30`, entryPrice,
              status: "SKIPPED",
              skipReason: `Setup 13 Candle B SL Too Wide: SL distance (${slDist.toFixed(2)} pts) > ${opts.maxCandleBTrendSLDist} pts max`,
              reasoning: `🛡️ Setup 13 Candle B Breakout skipped: SL distance ${slDist.toFixed(2)} pts exceeds ${opts.maxCandleBTrendSLDist} pt cap.`
            });
            state.pendingCandleBAlignment = null;
          }
        } else {
          state.pendingCandleBAlignment = null;
        }
      } else {
        state.pendingCandleBAlignment = null;
      }
    }
  }

  // Setup 10: Chandelier Exit Springboard Entry — Candle B Confirmation Check
  if (opts.enableCESpringboard && state.pendingCEBounce && state.pendingCEBounce.active) {
    const targetSide = state.pendingCEBounce.side;
    const candleB = targetSide === "CE" ? barCE : barPE;
    const macroBlock = targetSide === "CE" ? isStrictBear : isStrictBull;

    if (i > state.pendingCEBounce.signalIndex + 1) {
      state.pendingCEBounce = null;
    } else if (i === state.pendingCEBounce.signalIndex + 1) {
      if (macroBlock) {
        state.pendingCEBounce = null;
      } else if (candleB) {
        const isGreenB = candleB.close > candleB.open;
        const closedAboveA = candleB.close > state.pendingCEBounce.candleAClose;
        const higherHigh = candleB.high > state.pendingCEBounce.candleAHigh;
        const lowHolds = candleB.low >= (state.pendingCEBounce.candleALongStop - 3.0);

        if (!isGreenB || !closedAboveA || !higherHigh || !lowHolds) {
          state.pendingCEBounce = null;
        } else {
          const entryPrice = candleB.close;
          const stopLoss = state.pendingCEBounce.candleALow - 2.50;
          const slDist = entryPrice - stopLoss;
          const maxRisk = opts.maxCESpringboardRisk || 35.0;

          if (slDist > maxRisk || slDist <= 0) {
            state.skippedTrades.push({
              id: `S${state.skippedTrades.length + 1}`,
              day: dayKey, dayLabel: dayLabel,
              side: targetSide, strike: cleanStrikeName(state.pendingCEBounce.file), file: state.pendingCEBounce.file,
              entryTime: `${dayKey}T${t}:00+05:30`, entryPrice,
              status: "SKIPPED",
              skipReason: `Chandelier Springboard SL Too Wide: SL distance (${slDist.toFixed(2)} pts) > ${maxRisk} pts max`,
              reasoning: `🛡️ CE Springboard skipped: Candle B confirmed bounce but SL distance ${slDist.toFixed(2)} pts exceeds ${maxRisk} pt cap.`
            });
            state.pendingCEBounce = null;
          } else {
            const file = state.pendingCEBounce.file;
            state.activeTrade = {
              side: targetSide,
              strike: cleanStrikeName(file),
              file: file,
              entryTime: t,
              entryIndex: i,
              entryPrice: entryPrice,
              signalHigh: Math.max(candleB.high, state.pendingCEBounce.candleAHigh),
              stopLoss: stopLoss,
              invalidationLevel: state.pendingCEBounce.candleALow,
              isConfluenceTrade: true,
              reasonShort: "Chandelier Exit Springboard Entry",
              reasoning: `🎯 Trigger: Setup 10 Chandelier Exit Springboard Entry — Candle A (${state.pendingCEBounce.candleATime}) tested CE Line (₹${state.pendingCEBounce.candleALongStop.toFixed(2)}, low ₹${state.pendingCEBounce.candleALow.toFixed(2)}) and held; Candle B confirmed green bounce close (₹${candleB.close.toFixed(2)} > ₹${state.pendingCEBounce.candleAClose.toFixed(2)}) (Entered @ ₹${entryPrice.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)})`
            };
            state.pendingCEBounce = null;
            return;
          }
        }
      }
    }
  }

  // Setup 12: Opposite CPR R1 Sweep Reversal Entry
  if (opts.enableCPRReversalEntry && state.pendingCPRReversal && state.pendingCPRReversal.active) {
    const barsSinceSignal = i - state.pendingCPRReversal.signalIndex;
    if (barsSinceSignal > 2) {
      state.pendingCPRReversal.active = false;
    } else {
      const targetSide = state.pendingCPRReversal.targetSide;
      const targetBar = targetSide === "CE" ? barCE : barPE;
      const targetFile = state.pendingCPRReversal.targetFile;
      
      if (targetBar) {
        if (targetBar.low < state.pendingCPRReversal.oppBar0Low - 5.0) {
          state.pendingCPRReversal.active = false;
        } else if (!state.activeTrade) {
          const isGreen = targetBar.close > targetBar.open;
          const hasMomentum = targetBar.close > state.pendingCPRReversal.oppBar0Close;

          if (isGreen && hasMomentum) {
            const rawSL = state.pendingCPRReversal.oppBar0Low - 1.0;
            const stopLoss = Math.max(rawSL, targetBar.close - 20.0);

            state.activeTrade = {
              side: targetSide,
              strike: cleanStrikeName(targetFile),
              file: targetFile,
              entryTime: t,
              entryIndex: i,
              entryPrice: targetBar.close,
              signalHigh: targetBar.high,
              stopLoss: stopLoss,
              reasonShort: "Opposite CPR R1 Reversal Entry",
              reasoning: `🎯 Trigger: Opposite CPR R1 Reversal — ${state.pendingCPRReversal.triggerSide} (${state.pendingCPRReversal.triggerStrike}) rejected daily CPR R1 (₹${state.pendingCPRReversal.r1Level.toFixed(2)}) at ${state.pendingCPRReversal.triggerTime} IST; confirmed on ${targetSide} (${cleanStrikeName(targetFile)}) by next candle closing green (₹${targetBar.close.toFixed(2)} > Open ₹${targetBar.open.toFixed(2)}) (Entered @ ₹${targetBar.close.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)})`
            };
            state.pendingCPRReversal.active = false;
            return;
          }
        }
      }
    }
  }

  // Setup 12: Next-Candle RMI Reclaim Breakout Entry
  if (opts.enableRMIReclaimEntry && state.pendingRMIReclaim && state.pendingRMIReclaim.active) {
    const barsSinceSignal = i - state.pendingRMIReclaim.signalIndex;
    if (barsSinceSignal > 3) {
      state.pendingRMIReclaim.active = false;
    } else {
      const targetSide = state.pendingRMIReclaim.side;
      const targetBar = targetSide === "CE" ? barCE : barPE;
      const targetFile = state.pendingRMIReclaim.file;

      if (targetBar) {
        if (targetBar.low < state.pendingRMIReclaim.signalLow - 15.0) {
          state.pendingRMIReclaim.active = false;
        } else if (!state.activeTrade && targetBar.rmiCenter && targetBar.close > targetBar.rmiCenter && targetBar.close > targetBar.open) {
          // Rule 1: Dead-Cat Bounce Guard on Setup 12
          const isSteepDrop = opts.enableDeadCatBounceGuard && state.pendingRMIReclaim.isSteepDrop;
          if (isSteepDrop && !state.pendingRMIReclaim.reclaimBarSeen) {
            // First candle poked above RMI Center: mark it, do NOT enter yet; require Candle 2 confirmation!
            state.pendingRMIReclaim.reclaimBarSeen = true;
            state.pendingRMIReclaim.reclaimBarHigh = targetBar.high;
            state.pendingRMIReclaim.reclaimBarLow = targetBar.low;
            state.pendingRMIReclaim.reclaimBarClose = targetBar.close;
            state.pendingRMIReclaim.reclaimBarIndex = i;
          } else if (isSteepDrop && state.pendingRMIReclaim.reclaimBarSeen) {
            // Candle 2: must confirm with higher low AND close green
            const confirmed = targetBar.low >= state.pendingRMIReclaim.reclaimBarLow && targetBar.close > targetBar.open;
            if (!confirmed) {
              // Expire immediately: failed dead-cat bounce
              state.pendingRMIReclaim.active = false;
            } else {
              // Confirmed higher low!
              const oppBarRMI = targetSide === "CE" ? barPE : barCE;
              const safety = checkPreEntrySafety(targetSide, targetFile, targetBar, oppBarRMI, barNifty, t, i, "RMI Center Reclaim Breakout Entry", null, opts, state);
              if (!safety.allowed) {
                recordSkip(safety, targetSide, targetFile, targetBar.close, t);
                state.pendingRMIReclaim.active = false;
              } else {
                const rawSL = Math.max(Math.min(targetBar.low, state.pendingRMIReclaim.reclaimBarLow), targetBar.close - 20.0);
                const slBuffer = opts.slBuffer !== undefined ? opts.slBuffer : 2.50;
                const stopLoss = rawSL - slBuffer;
                state.activeTrade = {
                  side: targetSide,
                  strike: cleanStrikeName(targetFile),
                  file: targetFile,
                  entryTime: t,
                  entryIndex: i,
                  entryPrice: targetBar.close,
                  signalHigh: Math.max(targetBar.high, state.pendingRMIReclaim.reclaimBarHigh),
                  invalidationLevel: rawSL,
                  stopLoss: stopLoss,
                  reasonShort: "RMI Center Reclaim Breakout Entry",
                  reasoning: `🎯 Trigger: Setup 12 RMI Center Reclaim (Confirmed Higher Low) — Buy signal candle tested RMI Center (₹${state.pendingRMIReclaim.rmiCenter.toFixed(2)}) from below; confirmed on Candle 2 holding higher low (₹${targetBar.low.toFixed(2)} >= ₹${state.pendingRMIReclaim.reclaimBarLow.toFixed(2)}) and closing green (Entered @ ₹${targetBar.close.toFixed(2)}, Invalidation @ ₹${rawSL.toFixed(2)}, Stop Loss @ ₹${stopLoss.toFixed(2)} [-${slBuffer.toFixed(2)} pts buffer])`
                };
                state.pendingRMIReclaim.active = false;
                return;
              }
            }
          } else {
            // Standard reclaim (not a steep drop): enter immediately
            const oppBarRMI = targetSide === "CE" ? barPE : barCE;
            const safety = checkPreEntrySafety(targetSide, targetFile, targetBar, oppBarRMI, barNifty, t, i, "RMI Center Reclaim Breakout Entry", null, opts, state);
            if (!safety.allowed) {
              recordSkip(safety, targetSide, targetFile, targetBar.close, t);
              state.pendingRMIReclaim.active = false;
            } else {
              const rawSL = Math.max(Math.min(targetBar.low, state.pendingRMIReclaim.signalLow), targetBar.close - 20.0);
              const slBuffer = opts.slBuffer !== undefined ? opts.slBuffer : 2.50;
              const stopLoss = rawSL - slBuffer;
              state.activeTrade = {
                side: targetSide,
                strike: cleanStrikeName(targetFile),
                file: targetFile,
                entryTime: t,
                entryIndex: i,
                entryPrice: targetBar.close,
                signalHigh: Math.max(targetBar.high, state.pendingRMIReclaim.signalHigh),
                invalidationLevel: rawSL,
                stopLoss: stopLoss,
                reasonShort: "RMI Center Reclaim Breakout Entry",
                reasoning: `🎯 Trigger: Setup 12 RMI Center Reclaim — Buy signal candle tested RMI Center (₹${state.pendingRMIReclaim.rmiCenter.toFixed(2)}) from below at ${state.pendingRMIReclaim.signalTime}; confirmed on next candle closing above RMI Center (₹${targetBar.close.toFixed(2)} > ₹${targetBar.rmiCenter.toFixed(2)}) (Entered @ ₹${targetBar.close.toFixed(2)}, Invalidation @ ₹${rawSL.toFixed(2)}, Stop Loss @ ₹${stopLoss.toFixed(2)} [-${slBuffer.toFixed(2)} pts buffer])`
              };
              state.pendingRMIReclaim.active = false;
              return;
            }
          }
        }
      }
    }
  }

  // Setup 9: Hammer Wick + Continuation Confirmation Check
  if (opts.enableHammerContinuation && state.pendingHammerBreak && state.pendingHammerBreak.active) {
    const barsSinceSignal = i - state.pendingHammerBreak.signalIndex;
    if (barsSinceSignal > 3) {
      state.pendingHammerBreak.active = false;
    } else {
      const targetSide = state.pendingHammerBreak.side;
      const targetBar = targetSide === "CE" ? barCE : barPE;
      const targetFile = state.pendingHammerBreak.file;
      const macroBlock = targetSide === "CE" ? isStrictBear : isStrictBull;
      if (targetBar) {
        if (targetBar.low < state.pendingHammerBreak.signalLow) {
          state.pendingHammerBreak.active = false;
        } else if (targetBar.close > state.pendingHammerBreak.triggerClose && !macroBlock) {
          // Rule 1: Dead-Cat Bounce Guard on Setup 9
          const isSteepDrop = opts.enableDeadCatBounceGuard && state.pendingHammerBreak.isSteepDrop;
          const spotAligned = barNifty && (targetSide === "CE" ? (barNifty.close > (barNifty.ema9 || barNifty.open)) : (barNifty.close < (barNifty.ema9 || barNifty.open)));
          if (isSteepDrop && (!spotAligned || (targetSide === "CE" && targetBar.shortStop != null) || (targetSide === "PE" && targetBar.longStop != null))) {
            // Expire dead-cat bounce falling knife
            state.pendingHammerBreak.active = false;
          } else {
            const oppBarH = targetSide === "CE" ? barPE : barCE;
            const safety = checkPreEntrySafety(targetSide, targetFile, targetBar, oppBarH, barNifty, t, i, "Hammer Wick Continuation Entry", null, opts, state);
            if (!safety.allowed) {
              recordSkip(safety, targetSide, targetFile, targetBar.close, t);
              state.pendingHammerBreak.active = false;
            } else {
              state.activeTrade = {
                side: targetSide,
                strike: cleanStrikeName(targetFile),
                file: targetFile,
                entryTime: t,
                entryIndex: i,
                entryPrice: targetBar.close,
                signalHigh: Math.max(targetBar.high, state.pendingHammerBreak.signalHigh),
                stopLoss: state.pendingHammerBreak.signalLow,
                reasonShort: "Hammer Wick Continuation Entry",
                reasoning: `🎯 Trigger: Setup 9 Hammer Wick Continuation — Signal candle held support with lower wick > upper wick at ${state.pendingHammerBreak.structuralName} (₹${state.pendingHammerBreak.structuralVal.toFixed(2)}) and closed above 9 EMA; confirmed by candle closing (₹${targetBar.close.toFixed(2)}) above signal candle close (₹${state.pendingHammerBreak.triggerClose.toFixed(2)}) (Entered @ ₹${targetBar.close.toFixed(2)}, SL @ ₹${state.pendingHammerBreak.signalLow.toFixed(2)})`
              };
              state.pendingHammerBreak.active = false;
              return;
            }
          }
        }
      }
    }
  }

  // Setup 4b Confirmation Check: next candle must close above support candle high (Bidirectional)
  if (state.pendingRMIBounce) {
    const targetSide = state.pendingRMIBounce.side || "CE";
    const targetBar = targetSide === "CE" ? barCE : barPE;
    const targetFile = state.pendingRMIBounce.file;
    const macroBlock = targetSide === "CE" ? isStrictBear : isStrictBull;
    if (i === state.pendingRMIBounce.supportIndex + 1 && targetBar) {
      if (targetBar.close > state.pendingRMIBounce.supportHigh && !macroBlock) {
        const oppBarBounce = targetSide === "CE" ? barPE : barCE;
        const prevTargetBar = targetSide === "CE" ? prevCE : prevPE;
        const safety = checkPreEntrySafety(targetSide, targetFile, targetBar, oppBarBounce, barNifty, t, i, "2-Chart Support Bounce Entry", prevTargetBar, opts, state);
        if (!safety.allowed) {
          recordSkip(safety, targetSide, targetFile, targetBar.close, t);
          state.pendingRMIBounce = null;
          return;
        }
        state.activeTrade = {
          side: targetSide,
          strike: cleanStrikeName(targetFile),
          file: targetFile,
          entryTime: t,
          entryIndex: i,
          entryPrice: targetBar.close,
          signalHigh: Math.max(targetBar.high, state.pendingRMIBounce.supportHigh),
          reasonShort: "2-Chart Support Bounce",
          reasoning: `🎯 Trigger: Supported at ${targetSide} above RMI Center (₹${state.pendingRMIBounce.rmiCenter.toFixed(2)}) and rejected at ${targetSide === "CE" ? "PE" : "CE"} below RMI Center, confirmed by next candle closing above support high (₹${state.pendingRMIBounce.supportHigh.toFixed(2)}) (Entered @ ₹${targetBar.close.toFixed(2)})`
        };
        state.pendingRMIBounce = null;
        return;
      } else {
        state.pendingRMIBounce = null;
      }
    } else if (i > state.pendingRMIBounce.supportIndex + 1) {
      state.pendingRMIBounce = null;
    }
  }

  // Setup 2: Retracement / Shallow Pullback Entry
  if (state.pendingRetracement && state.pendingRetracement.active) {
    const barsSinceSignal = i - state.pendingRetracement.signalIndex;
    if (barsSinceSignal > 10) {
      state.pendingRetracement.active = false;
    } else {
      const pBar = state.pendingRetracement.side === "PE" ? barPE : barCE;
      if (pBar) {
        if (pBar.close < state.pendingRetracement.floor - 2.0) {
          state.pendingRetracement.active = false;
        } else {
          // Setup 2c: Candle B 3-Chart Coordinated RMI Reclaim Entry
          if (opts.enableCandleBRMIReclaim && barsSinceSignal === 1) {
            const rmiTestedAndHeld = pBar.rmiCenter && pBar.close > pBar.rmiCenter && pBar.low <= pBar.rmiCenter + 2;
            const niftyAligned = state.pendingRetracement.side === "CE"
              ? (barNifty && barNifty.ema9 && barNifty.close > barNifty.ema9)
              : (barNifty && barNifty.ema9 && barNifty.close < barNifty.ema9);

            const oppStrike = state.pendingRetracement.side === "CE" ? barPE : barCE;
            const oppFailing = oppStrike
              ? ((oppStrike.rmiCenter && oppStrike.close < oppStrike.rmiCenter) || oppStrike.shortSignal === 1 || (oppStrike.ema9 && oppStrike.close < oppStrike.ema9))
              : true;

            if (rmiTestedAndHeld && niftyAligned && oppFailing) {
              const oppBarRetr = state.pendingRetracement.side === "CE" ? barPE : barCE;
              const safety = checkPreEntrySafety(state.pendingRetracement.side, fileForSide(state.pendingRetracement.side), pBar, oppBarRetr, barNifty, t, i, "Candle B 3-Chart RMI Reclaim", null, opts, state);
              if (!safety.allowed) {
                recordSkip(safety, state.pendingRetracement.side, fileForSide(state.pendingRetracement.side), pBar.close, t);
              } else {
                state.activeTrade = {
                side: state.pendingRetracement.side,
                strike: cleanStrikeName(fileForSide(state.pendingRetracement.side)),
                file: fileForSide(state.pendingRetracement.side),
                entryTime: t,
                entryIndex: i,
                entryPrice: pBar.close,
                signalHigh: Math.max(pBar.high, state.pendingRetracement.signalHigh),
                stopLoss: state.pendingRetracement.floor - 5.0,
                onlyExitOn9EMA: true,
                reasonShort: "Candle B 3-Chart RMI Reclaim",
                reasoning: `🎯 Trigger: Setup 2c Candle B 3-Chart RMI Reclaim — Candle B tested RMI Center (₹${pBar.rmiCenter.toFixed(2)}, low ₹${pBar.low.toFixed(2)}) and held above (close ₹${pBar.close.toFixed(2)}); Nifty aligned and opposite strike failing (Entered @ ₹${pBar.close.toFixed(2)}, SL @ ₹${Math.min(pBar.low, state.pendingRetracement.signalLow).toFixed(2)})`
              };
              state.pendingRetracement.active = false;
              return;
            }
          }
        }

          // Track Candle B on immediate next bar
          if (barsSinceSignal === 1 && state.pendingRetracement.candleBLow === null) {
            if (pBar.low > state.pendingRetracement.signalLow) {
              state.pendingRetracement.candleBLow = pBar.low;
              state.pendingRetracement.isShallowBullish = true;
            }
          }

          // Case A: When 50% targetLevel is below Candle A low
          const targetBelowCandleA = state.pendingRetracement.targetLevel < state.pendingRetracement.signalLow;
          if (barsSinceSignal >= 2 && barsSinceSignal <= 5 && state.pendingRetracement.isShallowBullish && targetBelowCandleA && pBar.low <= state.pendingRetracement.candleBLow && pBar.low >= state.pendingRetracement.signalLow) {
            const oppBarRetr = state.pendingRetracement.side === "CE" ? barPE : barCE;
            const safety = checkPreEntrySafety(state.pendingRetracement.side, fileForSide(state.pendingRetracement.side), pBar, oppBarRetr, barNifty, t, i, "Candle B Shallow Support Entry", null, opts, state);
            if (!safety.allowed) {
              recordSkip(safety, state.pendingRetracement.side, fileForSide(state.pendingRetracement.side), pBar.close, t);
              state.pendingRetracement.active = false;
              return;
            }
            state.activeTrade = {
              side: state.pendingRetracement.side,
              strike: cleanStrikeName(fileForSide(state.pendingRetracement.side)),
              file: fileForSide(state.pendingRetracement.side),
              entryTime: t,
              entryIndex: i,
              entryPrice: pBar.close,
              signalHigh: pBar.high,
              stopLoss: state.pendingRetracement.signalLow,
              onlyExitOn9EMA: true,
              reasonShort: "Candle B Shallow Support Entry",
              reasoning: `🎯 Trigger: Wide zone shallow support entry — Price touched Candle B low (₹${state.pendingRetracement.candleBLow.toFixed(2)}) within 15m without breaking Candle A low (₹${state.pendingRetracement.signalLow.toFixed(2)}) (Entered @ ₹${pBar.close.toFixed(2)}, SL @ ₹${state.pendingRetracement.signalLow.toFixed(2)})`
            };
            state.pendingRetracement.active = false;
            return;
          }
          // Case B: Standard 50% discount retracement holding above Base Floor
          else if (pBar.low <= state.pendingRetracement.targetLevel && pBar.close >= state.pendingRetracement.floor) {
            if (pBar.shortSignal === 1) {
              state.pendingRetracement.active = false;
              return;
            }
            const hasHMMetrics = (pBar.rsi !== null && pBar.priceStrength !== null && pBar.volStrength !== null);
            const isHMBullish = (pBar.emaBuyHM === 1) || 
              (hasHMMetrics && (pBar.rsi > pBar.priceStrength && pBar.rsi > pBar.volStrength));

            // In strong macro alignment, if Spot is aligned and opposite strike failing, accept absorption close above floor
            const isMacroAligned = (state.pendingRetracement.side === "CE")
              ? (barNifty && barNifty.close > (barNifty.vwap || barNifty.ema9) && (!barPE || barPE.close < (barPE.vwap || barPE.ema9 || barPE.open)))
              : (barNifty && barNifty.close < (barNifty.vwap || barNifty.ema9) && (!barCE || barCE.close < (barCE.vwap || barCE.ema9 || barCE.open)));

            if (!isHMBullish && !isMacroAligned) {
              return;
            }

// (Safety check omitted for 50% pullback as signal was pre-validated at trigger)

            state.activeTrade = {
              side: state.pendingRetracement.side,
              strike: cleanStrikeName(fileForSide(state.pendingRetracement.side)),
              file: fileForSide(state.pendingRetracement.side),
              entryTime: t,
              entryIndex: i,
              entryPrice: pBar.close,
              signalHigh: pBar.high,
              reasonShort: "50% Discount Retracement Entry",
              reasoning: `🎯 Trigger: Price retraced to 50% discount pullback of skipped Buy Zone with Hilega Milega confirmation (Entered @ ₹${pBar.close.toFixed(2)})`
            };
            state.pendingRetracement.active = false;
            return;
          }
        }
      }
    }
  }

  // Setup 3: Multi-Chart CPR PP Flip Reversal Entry
  if (state.justExitedReason && state.justExitedReason.includes("CPR PP Flip") && barNifty && barPE && barCE && barNifty.pp && barPE.pp && barCE.pp) {
    if (state.justExitedSide === "PE" && barNifty.close > barNifty.pp && barPE.close < barPE.pp && barCE.close > barCE.pp && !isStrictBear) {
      const safety = checkPreEntrySafety("CE", currentCEFile, barCE, barPE, barNifty, t, i, "CPR PP Reversal Entry", null, opts, state);
      if (!safety.allowed) {
        recordSkip(safety, "CE", currentCEFile, barCE.close, t);
        return;
      }
      state.activeTrade = {
        side: "CE",
        strike: cleanStrikeName(currentCEFile),
        file: currentCEFile,
        entryTime: t,
        entryIndex: i,
        entryPrice: barCE.close,
        signalHigh: barCE.high,
        reasonShort: "CPR PP Reversal Entry",
        reasoning: `🎯 Trigger: 3-chart triangulation confirmed to enter CE at ₹${barCE.close.toFixed(2)} (Nifty reclaimed CPR PP ₹${barNifty.pp.toFixed(2)}, PE broke below CPR PP ₹${barPE.pp.toFixed(2)}, and CE confirmed above CPR PP ₹${barCE.pp.toFixed(2)})`
      };
      return;
    } else if (state.justExitedSide === "CE" && barNifty.close < barNifty.pp && barCE.close < barCE.pp && barPE.close > barPE.pp && !isStrictBull) {
      const safety = checkPreEntrySafety("PE", currentPEFile, barPE, barCE, barNifty, t, i, "CPR PP Reversal Entry", null, opts, state);
      if (!safety.allowed) {
        recordSkip(safety, "PE", currentPEFile, barPE.close, t);
        return;
      }
      state.activeTrade = {
        side: "PE",
        strike: cleanStrikeName(currentPEFile),
        file: currentPEFile,
        entryTime: t,
        entryIndex: i,
        entryPrice: barPE.close,
        signalHigh: barPE.high,
        reasonShort: "CPR PP Reversal Entry",
        reasoning: `🎯 Trigger: 3-chart triangulation confirmed to enter PE at ₹${barPE.close.toFixed(2)} (Nifty broke below CPR PP ₹${barNifty.pp.toFixed(2)}, CE broke below CPR PP ₹${barCE.pp.toFixed(2)}, and PE confirmed above CPR PP ₹${barPE.pp.toFixed(2)})`
      };
      return;
    }
  }

  // Setup 4: Support Bounce & Resistance Rejection Reversal Entry
  // 4a. Reversal after Sell Zone rejection
  if (state.justExitedReason && state.justExitedReason.includes("Sell Zone Rejection")) {
    if (state.justExitedSide === "CE" && barPE && prevPE && barNifty && !isStrictBull) {
      const peHigherHighClose = (barPE.close > prevPE.close && barPE.high > prevPE.high);
      if (peHigherHighClose && barNifty.close < barNifty.open) {
        state.activeTrade = {
          side: "PE",
          strike: cleanStrikeName(currentPEFile),
          file: currentPEFile,
          entryTime: t,
          entryIndex: i,
          entryPrice: barPE.close,
          signalHigh: barPE.high,
          reasonShort: "Sell Zone Rejection Reversal",
          reasoning: `🎯 Trigger: PE formed higher-high close (₹${barPE.close.toFixed(2)} > ₹${prevPE.close.toFixed(2)}) after CE Sell Zone rejection (Entered @ ₹${barPE.close.toFixed(2)})`
        };
        return;
      }
    } else if (state.justExitedSide === "PE" && barCE && prevCE && barNifty && !isStrictBear) {
      const ceHigherHighClose = (barCE.close > prevCE.close && barCE.high > prevCE.high);
      if (ceHigherHighClose && barNifty.close > barNifty.open) {
        state.activeTrade = {
          side: "CE",
          strike: cleanStrikeName(currentCEFile),
          file: currentCEFile,
          entryTime: t,
          entryIndex: i,
          entryPrice: barCE.close,
          signalHigh: barCE.high,
          reasonShort: "Sell Zone Rejection Reversal",
          reasoning: `🎯 Trigger: CE formed higher-high close (₹${barCE.close.toFixed(2)} > ₹${prevCE.close.toFixed(2)}) after PE Sell Zone rejection (Entered @ ₹${barCE.close.toFixed(2)})`
        };
        return;
      }
    }
  }

  // 4b. Reversal after RMI Breakdown
  if (state.justExitedReason && state.justExitedReason.includes("RMI Rejection")) {
    if (state.justExitedSide === "PE" && barCE && barCE.rmiCenter && barCE.close > barCE.rmiCenter && barCE.close > barCE.open && !isStrictBear) {
      state.pendingRMIBounce = {
        side: "CE",
        supportTime: t,
        supportHigh: barCE.high,
        supportPrice: barCE.close,
        supportIndex: i,
        rmiCenter: barCE.rmiCenter,
        file: currentCEFile
      };
    } else if (state.justExitedSide === "CE" && barPE && barPE.rmiCenter && barPE.close > barPE.rmiCenter && barPE.close > barPE.open && !isStrictBull) {
      state.pendingRMIBounce = {
        side: "PE",
        supportTime: t,
        supportHigh: barPE.high,
        supportPrice: barPE.close,
        supportIndex: i,
        rmiCenter: barPE.rmiCenter,
        file: currentPEFile
      };
    }
  }

  // Setup 8: Unified Multi-Chart Structural Level Support Reclaim Entry (200 EMA, CPR R1, CPR S1, CE Line, RMI Center)
  if (opts.enableUnifiedReclaim && !state.activeTrade && barNifty && barPE && barCE) {
    for (const side of ['CE', 'PE']) {
      if (side === 'PE' && isStrictBull) continue;
      if (side === 'CE' && isStrictBear) continue;

      const curBar = side === 'PE' ? barPE : barCE;
      const prevBar = side === 'PE' ? prevPE : prevCE;
      const oppBar = side === 'PE' ? barCE : barPE;
      const file = fileForSide(side);

      if (!curBar || !prevBar || !oppBar) continue;

      // The 5 key structural lines on candidate
      const candLevels = [
        { name: '200 EMA', val: curBar.ema200 },
        { name: 'CPR R1', val: curBar.r1 },
        { name: 'CPR S1', val: curBar.s1 },
        { name: 'CE Line', val: (side === 'CE' ? curBar.longStop : curBar.shortStop) },
        { name: 'RMI Center', val: curBar.rmiCenter }
      ].filter(l => l.val != null && !isNaN(l.val));

      // Opposite strike lines for rejection check
      const oppLevels = [
        { name: '200 EMA', val: oppBar.ema200 },
        { name: 'CPR R1', val: oppBar.r1 },
        { name: 'CPR S1', val: oppBar.s1 },
        { name: 'CE Line', val: (side === 'CE' ? oppBar.shortStop : oppBar.longStop) },
        { name: 'RMI Center', val: oppBar.rmiCenter }
      ].filter(l => l.val != null && !isNaN(l.val));

      for (const lvl of candLevels) {
        // 1. Candidate dipped/tested level and reclaimed above
        const touchedAndReclaimed = (curBar.low <= lvl.val + 2.0 && curBar.close > lvl.val);
        const notOverextended = (curBar.close - lvl.val <= 20.0);
        const isBullishCandle = (curBar.close >= curBar.open) || ((curBar.close - curBar.low) >= (curBar.high - curBar.close));

        if (!touchedAndReclaimed || !notOverextended || !isBullishCandle) continue;

        // 2. Spot alignment
        const spotAligned = (side === 'CE')
          ? (barNifty.close > (barNifty.ema9 || barNifty.open) && barNifty.close > (barNifty.ema20 || barNifty.vwap || barNifty.open))
          : (barNifty.close < (barNifty.ema9 || barNifty.open) && barNifty.close < (barNifty.ema20 || barNifty.vwap || barNifty.open));
        if (!spotAligned) continue;

        // 3. Opposite strike rejection or failure
        const oppUpperWick = oppBar.high - Math.max(oppBar.open, oppBar.close);
        const oppLowerWick = Math.min(oppBar.open, oppBar.close) - oppBar.low;
        const oppAtResistance = oppLevels.some(ol => oppBar.high >= ol.val - 3.0 && oppBar.close <= ol.val + 1.0);
        const oppFailing = (oppBar.close < oppBar.open) || (oppUpperWick >= oppLowerWick && oppUpperWick >= 4.0) || (oppBar.close < (oppBar.ema9 || oppBar.open));

        if (!oppFailing && !oppAtResistance) continue;

        // 4. Objective Stop Loss
        const stopLoss = Math.min(curBar.low, lvl.val) - 2.50;
        const riskDist = curBar.close - stopLoss;
        if (riskDist > 25.0 || riskDist <= 0) continue;

        // 5. Pre-entry safety
        const setupTitle = 'Unified ' + lvl.name + ' Support Reclaim';
        const safety = checkPreEntrySafety(side, file, curBar, oppBar, barNifty, t, i, setupTitle, prevBar, opts, state);
        if (!safety.allowed) {
          recordSkip(safety, side, file, curBar.close, t);
          continue;
        }

        // Trigger Entry!
        state.activeTrade = {
          side: side,
          strike: cleanStrikeName(file),
          file: file,
          entryTime: t,
          entryIndex: i,
          entryPrice: curBar.close,
          signalHigh: curBar.high,
          stopLoss: stopLoss,
          reasonShort: setupTitle,
          reasoning: '🎯 Trigger: Setup 8 ' + setupTitle + ' — Tested ' + lvl.name + ' (₹' + lvl.val.toFixed(2) + ', low ₹' + curBar.low.toFixed(2) + ') and reclaimed above (close ₹' + curBar.close.toFixed(2) + '); Opposite strike rejecting overhead levels and Spot aligned (Entered @ ₹' + curBar.close.toFixed(2) + ', SL @ ₹' + stopLoss.toFixed(2) + ' [Risk: ' + riskDist.toFixed(2) + ' pts])'
        };
        break;
      }
      if (state.activeTrade) break;
    }
  }

  // Setup 7: CPR PP 2-Candle Support Bounce Entry
  if (!state.activeTrade) {
    for (const side of ["CE", "PE"]) {
      if (side === "PE" && isStrictBull) continue;
      if (side === "CE" && isStrictBear) continue;

      const curBar = side === "PE" ? barPE : barCE;
      const prevBar = side === "PE" ? prevPE : prevCE;
      const oppBar = side === "PE" ? barCE : barPE;
      const file = fileForSide(side);

      if (curBar && prevBar && curBar.pp && prevBar.pp) {
        const candle1TouchPP = prevBar.low <= prevBar.pp + 1 && prevBar.close > prevBar.pp;
        const candle2HigherHigh = curBar.close > curBar.pp && curBar.high > prevBar.high && curBar.close > prevBar.close;
        const counterReject = oppBar && (oppBar.close <= oppBar.open || (oppBar.rmiCenter && oppBar.high >= oppBar.rmiCenter - 2) || oppBar.shortSignal === 1);

        if (candle1TouchPP && candle2HigherHigh && counterReject) {
          const safety = checkPreEntrySafety(side, file, curBar, oppBar, barNifty, t, i, "CPR PP Support Bounce Entry", prevBar, opts, state);
          if (!safety.allowed) {
            recordSkip(safety, side, file, curBar.close, t);
            continue;
          }
          state.activeTrade = {
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            entryTime: t,
            entryIndex: i,
            entryPrice: curBar.close,
            signalHigh: curBar.high,
            reasonShort: "CPR PP Support Bounce Entry",
            reasoning: `🎯 Trigger: 2 consecutive candles held above CPR PP (₹${curBar.pp.toFixed(2)}) with higher highs while counter-strike rejected from resistance (Entered @ ₹${curBar.close.toFixed(2)})`
          };
          break;
        }
      }
    }
  }

  // Setup 5: Spot 200 EMA Double Rejection / Bounce Trend Continuation Entry (Bidirectional)
  if (!state.activeTrade && barNifty && prevNifty && barPE && barCE) {
    // 5a. PE Entry: Spot rejects 200 EMA twice from below
    if (!isStrictBull) {
      const spot200EMARejectTwice = prevNifty.high >= prevNifty.ema200 - 1 && prevNifty.close < prevNifty.ema200 &&
        barNifty.high >= barNifty.ema200 - 1 && barNifty.close < barNifty.ema200 &&
        barNifty.close < prevNifty.close && barNifty.close < barNifty.open;
      const peBullish = barPE.close > barPE.ema9 && barPE.ema9 > barPE.ema20;
      const ceBearish = barCE.close < barCE.ema9 && barCE.ema9 < barCE.ema20;
      if (spot200EMARejectTwice && peBullish && ceBearish) {
        const safety = checkPreEntrySafety("PE", currentPEFile, barPE, barCE, barNifty, t, i, "Spot 200 EMA Rejection Twice Trend Entry", null, opts, state);
        if (!safety.allowed) {
          recordSkip(safety, "PE", currentPEFile, barPE.close, t);
          return;
        } else {
          state.activeTrade = {
            side: "PE",
            strike: cleanStrikeName(currentPEFile),
            file: currentPEFile,
            entryTime: t,
            entryIndex: i,
            entryPrice: barPE.close,
            signalHigh: barPE.high,
            reasonShort: "Spot 200 EMA Rejection Twice Trend Entry",
            reasoning: `🎯 Trigger: Nifty tested 200 EMA twice (₹${barNifty.ema200.toFixed(2)}) with confirmed bearish rejection (Close ₹${barNifty.close.toFixed(2)} < Prev ₹${prevNifty.close.toFixed(2)}); PE aligned bullish and CE aligned bearish (Entered @ ₹${barPE.close.toFixed(2)})`
          };
          return;
        }
      }
    }
    // 5b. CE Entry: Spot bounces on 200 EMA twice from above
    if (!state.activeTrade && !isStrictBear) {
      const spot200EMABounceTwice = prevNifty.low <= prevNifty.ema200 + 1 && prevNifty.close > prevNifty.ema200 &&
        barNifty.low <= barNifty.ema200 + 1 && barNifty.close > barNifty.ema200 &&
        barNifty.close > prevNifty.close && barNifty.close > barNifty.open;
      const ceBullish = barCE.close > barCE.ema9 && barCE.ema9 > barCE.ema20;
      const peBearish = barPE.close < barPE.ema9 && barPE.ema9 < barPE.ema20;
      if (spot200EMABounceTwice && ceBullish && peBearish) {
        const safety = checkPreEntrySafety("CE", currentCEFile, barCE, barPE, barNifty, t, i, "Spot 200 EMA Support Twice Trend Entry", null, opts, state);
        if (!safety.allowed) {
          recordSkip(safety, "CE", currentCEFile, barCE.close, t);
          return;
        } else {
          state.activeTrade = {
            side: "CE",
            strike: cleanStrikeName(currentCEFile),
            file: currentCEFile,
            entryTime: t,
            entryIndex: i,
            entryPrice: barCE.close,
            signalHigh: barCE.high,
            reasonShort: "Spot 200 EMA Support Twice Trend Entry",
            reasoning: `🎯 Trigger: Nifty tested 200 EMA twice (₹${barNifty.ema200.toFixed(2)}) with confirmed bullish continuation (Close ₹${barNifty.close.toFixed(2)} > Prev ₹${prevNifty.close.toFixed(2)}); CE aligned bullish and PE aligned bearish (Entered @ ₹${barCE.close.toFixed(2)})`
          };
          return;
        }
      }
    }
  }

  // Setup 11: Coordinated Cross-Strike Signal Flip + Wick Rejection
  if (opts.enableCrossStrikeInflection && !state.activeTrade && t >= opts.entryStartTime && t <= opts.entryEndTime && barNifty && barCE && barPE) {
    for (const side of ["PE", "CE"]) {
      const curBar = side === "PE" ? barPE : barCE;
      const oppBar = side === "PE" ? barCE : barPE;
      const file = fileForSide(side);

      if (!curBar || !oppBar) continue;

      const signalsAligned = (curBar.longSignal === 1 || curBar.emaBuyHM === 1) && (oppBar.shortSignal === 1);
      if (!signalsAligned) continue;

      const curLowerWick = Math.min(curBar.open, curBar.close) - curBar.low;
      const curUpperWick = curBar.high - Math.max(curBar.open, curBar.close);
      const oppUpperWick = oppBar.high - Math.max(oppBar.open, oppBar.close);
      const oppLowerWick = Math.min(oppBar.open, oppBar.close) - oppBar.low;
      const niftyUpperWick = barNifty.high - Math.max(barNifty.open, barNifty.close);
      const niftyLowerWick = Math.min(barNifty.open, barNifty.close) - barNifty.low;

      let isInflectionConfirmed = false;
      let inflectionNotes = "";

      if (side === "PE") {
        const ceRejected = oppUpperWick >= opts.crossStrikeMinWick && oppUpperWick > oppLowerWick;
        const peAbsorbed = curLowerWick >= opts.crossStrikeMinWick && curLowerWick > curUpperWick;
        const spotRejected = (niftyUpperWick >= opts.crossStrikeMinWick) || (barNifty.close < barNifty.open);

        if (ceRejected && peAbsorbed && spotRejected) {
          isInflectionConfirmed = true;
          inflectionNotes = `CE Upper Rejection (${oppUpperWick.toFixed(2)} pts), PE Lower Absorption (${curLowerWick.toFixed(2)} pts), Spot Upper Rejection (${niftyUpperWick.toFixed(2)} pts)`;
        }
      } else if (side === "CE") {
        const peRejected = oppLowerWick >= opts.crossStrikeMinWick && oppLowerWick > oppUpperWick;
        const ceAbsorbed = curLowerWick >= opts.crossStrikeMinWick && curLowerWick > curUpperWick;
        const spotBounced = (niftyLowerWick >= opts.crossStrikeMinWick) || (barNifty.close > barNifty.open);

        if (peRejected && ceAbsorbed && spotBounced) {
          isInflectionConfirmed = true;
          inflectionNotes = `PE Rejection (${oppLowerWick.toFixed(2)} pts), CE Lower Absorption (${curLowerWick.toFixed(2)} pts), Spot Lower Bounce (${niftyLowerWick.toFixed(2)} pts)`;
        }
      }

      if (isInflectionConfirmed) {
        const dynamicSL = curBar.low;
        const slDist = curBar.close - dynamicSL;

        if (slDist <= opts.maxCEBounceSLDist) {
          const safety = checkPreEntrySafety(side, file, curBar, oppBar, barNifty, t, i, "Cross-Strike Inflection Flip Entry", null, opts, state);
          if (!safety.allowed) {
            recordSkip(safety, side, file, curBar.close, t);
            continue;
          }
          state.activeTrade = {
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            entryTime: t,
            entryIndex: i,
            entryPrice: curBar.close,
            signalHigh: curBar.high,
            stopLoss: dynamicSL,
            isInflectionTrade: true,
            reasonShort: "Cross-Strike Inflection Flip Entry",
            reasoning: `🎯 Trigger: Setup 11 Cross-Strike Inflection Flip — ${side} Buy Signal + ${side === "PE" ? "CE" : "PE"} Sell Signal with ${inflectionNotes} (Entered @ ₹${curBar.close.toFixed(2)}, Dynamic SL @ ₹${dynamicSL.toFixed(2)} [Risk: ${slDist.toFixed(2)} pts])`
          };
          break;
        }
      }
    }
  }

  // Setup 15: CPR R3 / S3 Multi-Chart Support Reclaim & Breakout
  if (opts.enableCPRS3R3ReclaimEntry && !state.activeTrade && i >= 2 && times && prevNifty && barNifty && prevCE && barCE && prevPE && barPE) {
    const prev2T = times[i - 2];
    const prev2Nifty = (niftyMap && prev2T) ? niftyMap.get(prev2T) : null;
    const prev2CE = (ceMap && prev2T) ? ceMap.get(prev2T) : null;
    const prev2PE = (peMap && prev2T) ? peMap.get(prev2T) : null;

    if (prev2Nifty && prev2CE && prev2PE) {
      // 1. CE Side: Bullish CPR R3 Support Reclaim & Breakout
      if (!isStrictBear && barNifty.r3) {
        const spotR3 = barNifty.r3;
        // Candle A (i-2): Spot tests or pierces CPR R3 from above
        const spotTestedR3 = (prev2Nifty.low <= spotR3 + 5.0) || (prev2Nifty.close <= spotR3 + 5.0);
        // Candle B (i-1): Spot reclaims CPR R3
        const spotReclaimedR3 = prevNifty.close > spotR3;
        // Candle C (i): Spot closes above Candle A high
        const spotExpanded = barNifty.close > prev2Nifty.high;

        // CE Option Confirmation:
        const ceLongStop = prev2CE.longStop || prevCE.longStop || barCE.longStop;
        const ceTestedSupport = ceLongStop ? (prev2CE.low <= ceLongStop + 6.0) : (prev2CE.close < prev2CE.open);
        const ceReclaimedSupport = prevCE.close > prev2CE.low && (ceLongStop ? prevCE.close > ceLongStop : true);
        const ceExpanded = barCE.close > prev2CE.high;
        const ceAboveIndicators = barCE.close > (barCE.ema9 || 0) &&
                                  barCE.close > (barCE.rmiCenter || 0) &&
                                  (!barCE.ema20 || barCE.close > barCE.ema20);

        // PE Option Counter-Check: opposite leg is falling or below EMA
        const peFailing = barPE.close < prevPE.close || (barPE.ema9 && barPE.close < barPE.ema9);

        if (spotTestedR3 && spotReclaimedR3 && spotExpanded &&
            ceTestedSupport && ceReclaimedSupport && ceExpanded && ceAboveIndicators && peFailing) {
          const file = fileForSide("CE");
          const rawSL = Math.min(prev2CE.low, prevCE.low) - 1.0;
          const cappedSL = Math.max(rawSL, barCE.close - 25.0);
          const slDist = barCE.close - cappedSL;
          if (slDist <= 26.0) {
            state.activeTrade = {
              side: "CE",
              strike: cleanStrikeName(file),
              file: file,
              entryTime: t,
              entryIndex: i,
              entryPrice: barCE.close,
              signalHigh: barCE.high,
              stopLoss: cappedSL,
              is3ChartAligned: true,
              signalCandleLow: Math.min(prev2CE.low, prevCE.low),
              reasonShort: "CPR R3 Support Reclaim & Breakout",
              reasoning: `🎯 Trigger: Setup 15 CPR R3 Support Reclaim & Breakout — Spot tested CPR R3 (₹${spotR3.toFixed(2)}) and reclaimed with Candle C closing above Candle A high (₹${barNifty.close.toFixed(2)} > ₹${prev2Nifty.high.toFixed(2)}); CE held Chandelier support and expanded past Candle A high (₹${barCE.close.toFixed(2)} > ₹${prev2CE.high.toFixed(2)}) (Entered CE @ ₹${barCE.close.toFixed(2)}, SL @ ₹${cappedSL.toFixed(2)} [Risk: ${slDist.toFixed(2)} pts])`
            };
          }
        }
      }

      // 2. PE Side: Bearish CPR S3 Support Breakdown / Reclaim
      if (!state.activeTrade && !isStrictBull && barNifty.s3) {
        const spotS3 = barNifty.s3;
        // Candle A (i-2): Spot tests or pierces CPR S3 from above
        const spotTestedS3 = (prev2Nifty.low <= spotS3 + 5.0) || (prev2Nifty.close <= spotS3 + 5.0);
        // Candle B (i-1): Spot breaks below S3
        const spotBrokeS3 = prevNifty.close < spotS3;
        // Candle C (i): Spot closes below Candle A low
        const spotExpandedDown = barNifty.close < prev2Nifty.low;

        // PE Option Confirmation:
        const peLongStop = prev2PE.longStop || prevPE.longStop || barPE.longStop;
        const peTestedSupport = peLongStop ? (prev2PE.low <= peLongStop + 6.0) : (prev2PE.close < prev2PE.open);
        const peReclaimedSupport = prevPE.close > prev2PE.low && (peLongStop ? prevPE.close > peLongStop : true);
        const peExpanded = barPE.close > prev2PE.high;
        const peAboveIndicators = barPE.close > (barPE.ema9 || 0) &&
                                  barPE.close > (barPE.rmiCenter || 0) &&
                                  (!barPE.ema20 || barPE.close > barPE.ema20);

        // CE Option Counter-Check: opposite leg is falling
        const ceFailing = barCE.close < prevCE.close || (barCE.ema9 && barCE.close < barCE.ema9);

        if (spotTestedS3 && spotBrokeS3 && spotExpandedDown &&
            peTestedSupport && peReclaimedSupport && peExpanded && peAboveIndicators && ceFailing) {
          const file = fileForSide("PE");
          const rawSL = Math.min(prev2PE.low, prevPE.low) - 1.0;
          const cappedSL = Math.max(rawSL, barPE.close - 25.0);
          const slDist = barPE.close - cappedSL;
          if (slDist <= 26.0) {
            state.activeTrade = {
              side: "PE",
              strike: cleanStrikeName(file),
              file: file,
              entryTime: t,
              entryIndex: i,
              entryPrice: barPE.close,
              signalHigh: barPE.high,
              stopLoss: cappedSL,
              is3ChartAligned: true,
              signalCandleLow: Math.min(prev2PE.low, prevPE.low),
              reasonShort: "CPR S3 Breakdown & Momentum Entry",
              reasoning: `🎯 Trigger: Setup 15 CPR S3 Breakdown & Momentum — Spot broke below CPR S3 (₹${spotS3.toFixed(2)}) with Candle C closing below Candle A low (₹${barNifty.close.toFixed(2)} < ₹${prev2Nifty.low.toFixed(2)}); PE held Chandelier support and expanded past Candle A high (₹${barPE.close.toFixed(2)} > ₹${prev2PE.high.toFixed(2)}) (Entered PE @ ₹${barPE.close.toFixed(2)}, SL @ ₹${cappedSL.toFixed(2)} [Risk: ${slDist.toFixed(2)} pts])`
            };
          }
        }
      }
    }
  }

  // Setup 16: Macro Regime Inflection Reversal Entry
  if (opts.enableMacroRegimeInflection && !state.activeTrade && barNifty && barCE && barPE) {
    // 1. Strict Bull -> Bearish PE Reversal
    if (isStrictBull) {
      const spotShort = barNifty.shortSignal === 1;
      const peBuy = (barPE.longSignal === 1 || barPE.emaBuyHM === 1);
      const peCrossRMI = barPE.rmiCenter && (barPE.low <= barPE.rmiCenter + 1.0 && barPE.close > barPE.rmiCenter);
      const peCrossCE = barPE.shortStop && (barPE.low <= barPE.shortStop + 1.0 && barPE.close >= barPE.shortStop - 1.0);
      const peCrossing = peCrossRMI || peCrossCE;

      const ceShort = barCE.shortSignal === 1;
      const ceBelowRMI = barCE.rmiCenter && (barCE.close < barCE.rmiCenter);
      const ceBelowCE = barCE.longStop && (barCE.close < barCE.longStop);
      const ceBreakdown = ceShort && (ceBelowRMI || ceBelowCE);

      if (spotShort && peBuy && peCrossing && ceBreakdown) {
        const file = fileForSide("PE");
        const rawSL = barPE.low;
        let effectiveRisk = barPE.close - rawSL;
        if (effectiveRisk < 3.0) effectiveRisk = 10.0;
        effectiveRisk = Math.min(effectiveRisk, opts.macroInflectionMaxRisk || 20.0);
        const stopLoss = barPE.close - effectiveRisk;
        const targetPrice = barPE.close + ((opts.macroInflectionRRFactor || 4.0) * effectiveRisk);

        state.activeTrade = {
          side: "PE",
          strike: cleanStrikeName(file),
          file: file,
          entryTime: t,
          entryIndex: i,
          entryPrice: barPE.close,
          signalHigh: barPE.high,
          stopLoss: stopLoss,
          targetPrice: targetPrice,
          effectiveRisk: effectiveRisk,
          is3ChartAligned: true,
          signalCandleLow: barPE.low,
          isSetup16Trade: true,
          reasonShort: "Macro Regime Inflection Reversal",
          reasoning: `🎯 Trigger: Setup 16 Macro Regime Inflection Reversal — Spot fired Sell Signal (₹${barNifty.close.toFixed(2)}), CE broke below ${ceBelowCE ? "CE Line" : "RMI"} (₹${barCE.close.toFixed(2)}) with Sell Signal, and PE crossed ${peCrossRMI ? "RMI" : "CE Line"} (₹${barPE.close.toFixed(2)}) with Buy Signal (Entered PE @ ₹${barPE.close.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)} [Capped Risk: ${effectiveRisk.toFixed(2)} pts], 1:4 Target @ ₹${targetPrice.toFixed(2)})`
        };
        return;
      }
    }

    // 2. Strict Bear -> Bullish CE Reversal
    if (isStrictBear) {
      const spotBuy = barNifty.longSignal === 1;
      const ceBuy = (barCE.longSignal === 1 || barCE.emaBuyHM === 1);
      const ceCrossRMI = barCE.rmiCenter && (barCE.low <= barCE.rmiCenter + 1.0 && barCE.close > barCE.rmiCenter);
      const ceCrossCE = barCE.shortStop && (barCE.low <= barCE.shortStop + 1.0 && barCE.close >= barCE.shortStop - 1.0);
      const ceCrossing = ceCrossRMI || ceCrossCE;

      const peShort = barPE.shortSignal === 1;
      const peBelowRMI = barPE.rmiCenter && (barPE.close < barPE.rmiCenter);
      const peBelowCE = barPE.longStop && (barPE.close < barPE.longStop);
      const peBreakdown = peShort && (peBelowRMI || peBelowCE);

      if (spotBuy && ceBuy && ceCrossing && peBreakdown) {
        const file = fileForSide("CE");
        const rawSL = barCE.low;
        let effectiveRisk = barCE.close - rawSL;
        if (effectiveRisk < 3.0) effectiveRisk = 10.0;
        effectiveRisk = Math.min(effectiveRisk, opts.macroInflectionMaxRisk || 20.0);
        const stopLoss = barCE.close - effectiveRisk;
        const targetPrice = barCE.close + ((opts.macroInflectionRRFactor || 4.0) * effectiveRisk);

        state.activeTrade = {
          side: "CE",
          strike: cleanStrikeName(file),
          file: file,
          entryTime: t,
          entryIndex: i,
          entryPrice: barCE.close,
          signalHigh: barCE.high,
          stopLoss: stopLoss,
          targetPrice: targetPrice,
          effectiveRisk: effectiveRisk,
          is3ChartAligned: true,
          signalCandleLow: barCE.low,
          isSetup16Trade: true,
          reasonShort: "Macro Regime Inflection Reversal",
          reasoning: `🎯 Trigger: Setup 16 Macro Regime Inflection Reversal — Spot fired Buy Signal (₹${barNifty.close.toFixed(2)}), PE broke below ${peBelowCE ? "CE Line" : "RMI"} (₹${barPE.close.toFixed(2)}) with Sell Signal, and CE crossed ${ceCrossRMI ? "RMI" : "CE Line"} (₹${barCE.close.toFixed(2)}) with Buy Signal (Entered CE @ ₹${barCE.close.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)} [Capped Risk: ${effectiveRisk.toFixed(2)} pts], 1:4 Target @ ₹${targetPrice.toFixed(2)})`
        };
        return;
      }
    }
  }

  // Setup 16: Macro Regime Inflection Reversal Entry
  if (opts.enableMacroRegimeInflection && !state.activeTrade && barNifty && barCE && barPE) {
    // 1. Strict Bull -> Bearish PE Reversal
    if (isStrictBull) {
      const spotShort = barNifty.shortSignal === 1;
      const peBuy = (barPE.longSignal === 1 || barPE.emaBuyHM === 1);
      const peCrossRMI = barPE.rmiCenter && (barPE.low <= barPE.rmiCenter + 1.0 && barPE.close > barPE.rmiCenter);
      const peCrossCE = barPE.shortStop && (barPE.low <= barPE.shortStop + 1.0 && barPE.close >= barPE.shortStop - 1.0);
      const peCrossing = peCrossRMI || peCrossCE;

      const ceShort = barCE.shortSignal === 1;
      const ceBelowRMI = barCE.rmiCenter && (barCE.close < barCE.rmiCenter);
      const ceBelowCE = barCE.longStop && (barCE.close < barCE.longStop);
      const ceBreakdown = ceShort && (ceBelowRMI || ceBelowCE);

      if (spotShort && peBuy && peCrossing && ceBreakdown) {
        const file = fileForSide("PE");
        const rawSL = barPE.low;
        const effectiveRisk = Math.min(barPE.close - rawSL, opts.macroInflectionMaxRisk || 20.0);
        const stopLoss = barPE.close - effectiveRisk;
        const targetPrice = barPE.close + ((opts.macroInflectionRRFactor || 4.0) * effectiveRisk);

        state.activeTrade = {
          side: "PE",
          strike: cleanStrikeName(file),
          file: file,
          entryTime: t,
          entryIndex: i,
          entryPrice: barPE.close,
          signalHigh: barPE.high,
          stopLoss: stopLoss,
          targetPrice: targetPrice,
          effectiveRisk: effectiveRisk,
          is3ChartAligned: true,
          signalCandleLow: barPE.low,
          isSetup16Trade: true,
          reasonShort: "Macro Regime Inflection Reversal",
          reasoning: `🎯 Trigger: Setup 16 Macro Regime Inflection Reversal — Spot fired Sell Signal (₹${barNifty.close.toFixed(2)}), CE broke below ${ceBelowCE ? "CE Line" : "RMI"} (₹${barCE.close.toFixed(2)}) with Sell Signal, and PE crossed ${peCrossRMI ? "RMI" : "CE Line"} (₹${barPE.close.toFixed(2)}) with Buy Signal (Entered PE @ ₹${barPE.close.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)} [Capped Risk: ${effectiveRisk.toFixed(2)} pts], 1:4 Target @ ₹${targetPrice.toFixed(2)})`
        };
        return;
      }
    }

    // 2. Strict Bear -> Bullish CE Reversal
    if (isStrictBear) {
      const spotBuy = barNifty.longSignal === 1;
      const ceBuy = (barCE.longSignal === 1 || barCE.emaBuyHM === 1);
      const ceCrossRMI = barCE.rmiCenter && (barCE.low <= barCE.rmiCenter + 1.0 && barCE.close > barCE.rmiCenter);
      const ceCrossCE = barCE.shortStop && (barCE.low <= barCE.shortStop + 1.0 && barCE.close >= barCE.shortStop - 1.0);
      const ceCrossing = ceCrossRMI || ceCrossCE;

      const peShort = barPE.shortSignal === 1;
      const peBelowRMI = barPE.rmiCenter && (barPE.close < barPE.rmiCenter);
      const peBelowCE = barPE.longStop && (barPE.close < barPE.longStop);
      const peBreakdown = peShort && (peBelowRMI || peBelowCE);

      if (spotBuy && ceBuy && ceCrossing && peBreakdown) {
        const file = fileForSide("CE");
        const rawSL = barCE.low;
        const effectiveRisk = Math.min(barCE.close - rawSL, opts.macroInflectionMaxRisk || 20.0);
        const stopLoss = barCE.close - effectiveRisk;
        const targetPrice = barCE.close + ((opts.macroInflectionRRFactor || 4.0) * effectiveRisk);

        state.activeTrade = {
          side: "CE",
          strike: cleanStrikeName(file),
          file: file,
          entryTime: t,
          entryIndex: i,
          entryPrice: barCE.close,
          signalHigh: barCE.high,
          stopLoss: stopLoss,
          targetPrice: targetPrice,
          effectiveRisk: effectiveRisk,
          is3ChartAligned: true,
          signalCandleLow: barCE.low,
          isSetup16Trade: true,
          reasonShort: "Macro Regime Inflection Reversal",
          reasoning: `🎯 Trigger: Setup 16 Macro Regime Inflection Reversal — Spot fired Buy Signal (₹${barNifty.close.toFixed(2)}), PE broke below ${peBelowCE ? "CE Line" : "RMI"} (₹${barPE.close.toFixed(2)}) with Sell Signal, and CE crossed ${ceCrossRMI ? "RMI" : "CE Line"} (₹${barCE.close.toFixed(2)}) with Buy Signal (Entered CE @ ₹${barCE.close.toFixed(2)}, SL @ ₹${stopLoss.toFixed(2)} [Capped Risk: ${effectiveRisk.toFixed(2)} pts], 1:4 Target @ ₹${targetPrice.toFixed(2)})`
        };
        return;
      }
    }
  }

  // Setup 1: Standard Buy Signal / 9 EMA HM Cross with Multi-Chart confirmation & Zone Width Cap
  const checkSides = ["PE", "CE"];
  for (const side of checkSides) {
      const isMacroBlocked = (side === "PE" && isStrictBull) || (side === "CE" && isStrictBear);

      const curBar = side === "PE" ? barPE : barCE;
      const prevBar = side === "PE" ? prevPE : prevCE;
      const oppBar = side === "PE" ? barCE : barPE;
      const prevOpp = side === "PE" ? prevCE : prevPE;
      const file = fileForSide(side);

      if (curBar && (curBar.longSignal === 1 || curBar.emaBuyHM === 1)) {
        // Option 9 EMA Filter: Option price must hold above its own 9 EMA to confirm bullish momentum
        if (opts.enableOption9EMAFilter && curBar.ema9 && curBar.close <= curBar.ema9) {
          state.skippedTrades.push({
            id: `S${state.skippedTrades.length + 1}`,
            day: dayKey,
            dayLabel: dayLabel,
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            entryTime: `${dayKey}T${t}:00+05:30`,
            entryPrice: curBar.close,
            status: "SKIPPED",
            skipReason: `Option 9 EMA Filter: ${side} Buy signal at ${t}, but option close (₹${curBar.close.toFixed(2)}) is <= its 9 EMA (₹${curBar.ema9.toFixed(2)})`,
            reasoning: `🛡️ Option 9 EMA Protection Skip: ${side} signal on ${cleanStrikeName(file)} at ₹${curBar.close.toFixed(2)} skipped because price is trading below its 9 EMA (₹${curBar.ema9.toFixed(2)}).`
          });
          continue;
        }

        let confirmed = false;
        let confirmReason = "";

        if (side === "PE") {
          const hasCEShort = (oppBar && oppBar.shortSignal === 1) || (prevOpp && prevOpp.shortSignal === 1);
          const hasNShort = (barNifty && barNifty.shortSignal === 1);
          const hasHM = curBar.emaBuyHM === 1;
          const hasRMI = curBar.rmiCenter && curBar.low <= curBar.rmiCenter && curBar.close > curBar.rmiCenter;
          if (hasCEShort || hasNShort || hasHM || hasRMI) {
            confirmed = true;
            confirmReason = hasCEShort ? "CE Short" : (hasNShort ? "Nifty Short" : "HM/RMI Confirmed");
          }
        } else {
          const hasPEShort = (oppBar && oppBar.shortSignal === 1) || (prevOpp && prevOpp.shortSignal === 1);
          const hasHM = curBar.emaBuyHM === 1;
          const hasRMI = curBar.rmiCenter && curBar.low <= curBar.rmiCenter && curBar.close > curBar.rmiCenter;
          if (hasPEShort || hasHM || hasRMI) {
            confirmed = true;
            confirmReason = hasHM ? "HM Cross" : (hasPEShort ? "PE Short" : "RMI Bounce");
          }
        }

        // Proximity & Wick Rule
        const structuralLines = [
          { name: "CPR PP", val: curBar.pp },
          { name: "CPR R1", val: curBar.r1 },
          { name: "CPR S1", val: curBar.s1 },
          { name: "CPR R3", val: curBar.r3 },
          { name: "CPR S3", val: curBar.s3 },
          { name: "CPR CR", val: curBar.cr },
          { name: "CPR CS", val: curBar.cs },
          { name: "RMI Center", val: curBar.rmiCenter },
          { name: "CE Short Stop", val: curBar.shortStop },
          { name: "CE Long Stop", val: curBar.longStop }
        ].filter(l => l.val != null && !isNaN(l.val));

        const lowerWick = Math.min(curBar.open, curBar.close) - curBar.low;
        const upperWick = curBar.high - Math.max(curBar.open, curBar.close);

        let lineRejectionSkip = null;
        for (const lineObj of structuralLines) {
          const isTouchingOrNear = (curBar.low <= lineObj.val + 5 && curBar.high >= lineObj.val - 5);
          if (isTouchingOrNear) {
            const hasUpperRejection = (upperWick > 0 && upperWick >= lowerWick) || (curBar.close < curBar.open);
            if (hasUpperRejection && curBar.close <= lineObj.val) {
              lineRejectionSkip = lineObj;
              break;
            }
          }
        }

        const touchesOverheadResistance = lineRejectionSkip ||
          (curBar.rmiCenter && curBar.high >= curBar.rmiCenter && curBar.close < curBar.rmiCenter) ||
          (curBar.shortStop && curBar.high >= curBar.shortStop - 1 && curBar.close < curBar.shortStop);

        if (touchesOverheadResistance) {
          const lineName = lineRejectionSkip ? lineRejectionSkip.name : (curBar.rmiCenter ? "RMI Center" : "CE Short Stop");
          const lineVal = lineRejectionSkip ? lineRejectionSkip.val : (curBar.rmiCenter || curBar.shortStop);

          const isHammer = lowerWick > upperWick && curBar.ema9 && curBar.close > curBar.ema9;
          if (lineRejectionSkip && lineRejectionSkip.name === "CPR R1" && opts.enableCPRReversalEntry && t >= "09:15" && t <= "11:00") {
            const oppSide = side === "PE" ? "CE" : "PE";
            const oppFile = fileForSide(oppSide);
            const oppBar = side === "PE" ? barCE : barPE;
            if (oppBar) {
              state.pendingCPRReversal = {
                active: true,
                triggerSide: side,
                targetSide: oppSide,
                triggerStrike: cleanStrikeName(file),
                triggerTime: t,
                signalIndex: i,
                r1Level: lineRejectionSkip.val,
                oppBar0Low: oppBar.low,
                oppBar0High: oppBar.high,
                oppBar0Close: oppBar.close,
                targetFile: oppFile,
                targetStrike: cleanStrikeName(oppFile)
              };
            }
          }
          let maxRecentHigh = curBar.high;
          const barMap = side === "PE" ? peMap : ceMap;
          if (barMap && times) {
            for (let k = Math.max(0, i - 10); k < i; k++) {
              const bPrev = barMap.get(times[k]);
              if (bPrev && bPrev.high > maxRecentHigh) maxRecentHigh = bPrev.high;
            }
          }
          const dropDist = maxRecentHigh - curBar.low;
          const isSteepDrop = dropDist >= 35.0;

          const isRMICenterSkip = (lineRejectionSkip && lineRejectionSkip.name === "RMI Center") ||
            (!lineRejectionSkip && curBar.rmiCenter && curBar.high >= curBar.rmiCenter && curBar.close < curBar.rmiCenter);
          if (opts.enableRMIReclaimEntry && isRMICenterSkip) {
            state.pendingRMIReclaim = {
              active: true,
              side: side,
              file: file,
              signalIndex: i,
              signalTime: t,
              signalClose: curBar.close,
              signalLow: curBar.low,
              signalHigh: curBar.high,
              rmiCenter: curBar.rmiCenter,
              isSteepDrop: isSteepDrop,
              dropDist: dropDist
            };
          }

          if (opts.enableHammerContinuation && isHammer) {
            state.pendingHammerBreak = {
              active: true,
              side: side,
              file: file,
              signalIndex: i,
              signalTime: t,
              triggerClose: curBar.close,
              signalLow: curBar.low,
              signalHigh: curBar.high,
              structuralName: lineName,
              structuralVal: lineVal,
              isSteepDrop: isSteepDrop,
              dropDist: dropDist
            };
          }

          const isCELineSkip = lineName.includes("CE Short Stop") || lineName.includes("CE Long Stop");
          if (opts.enableCELineWickBreakout && isCELineSkip && !state.activeTrade) {
            const targetBreakoutHigh = Math.max(curBar.high, prevBar ? prevBar.high : curBar.high);
            state.pendingCELineBreakout = {
              active: true,
              side: side,
              file: file,
              signalIndex: i,
              signalTime: t,
              signalHigh: curBar.high,
              signalLow: curBar.low,
              prevHigh: prevBar ? prevBar.high : curBar.high,
              targetHigh: targetBreakoutHigh,
              candleATime: t,
              expireIndex: i + 4
            };
          }

          state.skippedTrades.push({
            id: `S${state.skippedTrades.length + 1}`,
            day: dayKey,
            dayLabel: dayLabel,
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            entryTime: `${dayKey}T${t}:00+05:30`,
            entryPrice: curBar.close,
            status: "SKIPPED",
            skipReason: `Overhead Resistance / Wick Filter: ${lineName} (₹${lineVal.toFixed(2)}) rejection — Upper Wick (₹${upperWick.toFixed(2)}) vs Lower Wick (₹${lowerWick.toFixed(2)})${isHammer ? ' — Queued for Setup 9 hammer continuation' : (isCELineSkip && opts.enableCELineWickBreakout ? ' — Queued for Setup 17 CE Line breakout' : ' without clean breakout')}`,
            reasoning: isHammer
              ? `🛡️ Proximity & Wick Protection Skip: Buy signal candle tested ${lineName} (₹${lineVal.toFixed(2)}) with lower wick (₹${lowerWick.toFixed(2)}) > upper wick (₹${upperWick.toFixed(2)}) (hammer). Queued for Setup 9 confirmation on candle close > ₹${curBar.close.toFixed(2)} within 3 bars.`
              : `🛡️ Proximity & Wick Protection Skip: Buy signal candle tested ${lineName} (₹${lineVal.toFixed(2)}) from below and failed with upper wick rejection.${isCELineSkip && opts.enableCELineWickBreakout ? ` Queued for Setup 17 breakout on candle close > ₹${Math.max(curBar.high, prevBar ? prevBar.high : curBar.high).toFixed(2)} within 4 bars.` : ''}`
          });
          continue;
        }

        const distToPP = (barNifty && barNifty.pp) ? Math.abs(barNifty.close - barNifty.pp) : 999;
        const isNearPivotInflection = opts.enablePivotRetracementQueue && distToPP <= 25 && barNifty && (
          (side === "PE" && isStrictBull && (barNifty.shortSignal === 1 || barNifty.close < barNifty.open - 20)) ||
          (side === "CE" && isStrictBear && (barNifty.longSignal === 1 || barNifty.close > barNifty.open + 20))
        );

        const isCounterBreakoutFlipped = state.justExitedReason && state.justExitedReason.includes('Counter-Breakout Exit') && state.justExitedSide !== side;
        if (isMacroBlocked && !isCounterBreakoutFlipped && !isNearPivotInflection) continue;

        // Nifty 50 9 EMA Alignment Filter
        if (opts.enableNifty9EMAAlignment && (curBar.emaBuyHM === 1 || confirmReason === "HM Cross") && barNifty && barNifty.ema9) {
          const niftyPassed = side === "CE" ? (barNifty.close > barNifty.ema9) : (barNifty.close < barNifty.ema9);
          if (!niftyPassed) {
            state.skippedTrades.push({
              id: `S${state.skippedTrades.length + 1}`,
              day: dayKey,
              dayLabel: dayLabel,
              side: side,
              strike: cleanStrikeName(file),
              file: file,
              entryTime: `${dayKey}T${t}:00+05:30`,
              entryPrice: curBar.close,
              status: "SKIPPED",
              skipReason: `Nifty 9 EMA Filter: ${side} EMA confirmation at ${t}, but Nifty 50 closed ${side === "CE" ? "below" : "above"} its 9 EMA (₹${barNifty.close.toFixed(2)} vs 9 EMA ₹${barNifty.ema9.toFixed(2)})`,
              reasoning: `🛡️ Nifty 50 Confluence Protection Skip: ${side} confirmed 9 EMA entry on ${cleanStrikeName(file)} at ₹${curBar.close.toFixed(2)}, but Nifty 50 failed directional alignment (Close ₹${barNifty.close.toFixed(2)} ${side === "CE" ? "<=" : ">="} 9 EMA ₹${barNifty.ema9.toFixed(2)}). Trade skipped.`
            });
            continue;
          }
        }

        if (!confirmed) {
          if (opts.enableCandleBTrendBreakout && !state.activeTrade) {
            state.pendingCandleBAlignment = {
              active: true,
              side: side,
              file: file,
              signalIndex: i,
              signalHigh: curBar.high,
              signalLow: curBar.low,
              candleATime: t
            };
          }
          state.skippedTrades.push({
            id: `S${state.skippedTrades.length + 1}`,
            day: dayKey,
            dayLabel: dayLabel,
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            entryTime: `${dayKey}T${t}:00+05:30`,
            entryPrice: curBar.close,
            status: "SKIPPED",
            skipReason: `2-Chart Confluence Filter: ${side} Buy signal at ₹${curBar.close.toFixed(2)} lacked 2nd chart confirmation`,
            reasoning: `🛡️ Confluence Protection Skip: ${side} formed a lone Buy signal on ${cleanStrikeName(file)} at ₹${curBar.close.toFixed(2)}, but counter-strike and Nifty did not confirm.`
          });
          continue;
        }

        const floor = prevBar ? prevBar.low : curBar.low;
        const zoneWidth = curBar.close - floor;

        if (zoneWidth > opts.maxZoneWidth) {
          state.skippedTrades.push({
            id: `S${state.skippedTrades.length + 1}`,
            day: dayKey,
            dayLabel: dayLabel,
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            entryTime: `${dayKey}T${t}:00+05:30`,
            entryPrice: curBar.close,
            status: "SKIPPED",
            skipReason: `Buy Zone Width (${zoneWidth.toFixed(2)} pts) > max ${opts.maxZoneWidth.toFixed(2)} pts threshold (Floor: ₹${floor.toFixed(2)}, Signal: ₹${curBar.close.toFixed(2)}) — Queued for 50% discount pullback`,
            reasoning: `🛡️ Risk Management Skip: Buy zone width spanning ${zoneWidth.toFixed(2)} pts (> ${opts.maxZoneWidth} pts). Queued for 50% pullback entry near ₹${(floor + zoneWidth * opts.zoneRetracementPct).toFixed(2)}.`
          });
          state.pendingRetracement = {
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            floor: floor,
            signalLow: curBar.low,
            signalHigh: curBar.high,
            signalIndex: i,
            candleBLow: null,
            isShallowBullish: false,
            targetLevel: floor + (zoneWidth * opts.zoneRetracementPct),
            active: true
          };
        } else {
          if (isNearPivotInflection && isMacroBlocked) continue;
          const safety = checkPreEntrySafety(side, file, curBar, oppBar, barNifty, t, i, `${side} Buy Signal (${confirmReason || "2-Chart Confirmed"})`, null, opts, state);
          if (!safety.allowed) {
            recordSkip(safety, side, file, curBar.close, t);
            continue;
          }

          const is3ChartAligned = (side === "CE")
            ? (curBar && (curBar.longSignal === 1 || curBar.emaBuyHM === 1) &&
               barNifty && (barNifty.close > (barNifty.ema9 || barNifty.open)) &&
               oppBar && (oppBar.shortSignal === 1 || oppBar.close < (oppBar.ema9 || oppBar.open)))
            : (curBar && (curBar.longSignal === 1 || curBar.emaBuyHM === 1) &&
               barNifty && (barNifty.close < (barNifty.ema9 || barNifty.open)) &&
               oppBar && (oppBar.shortSignal === 1 || oppBar.close > (oppBar.ema9 || oppBar.open)));

          state.activeTrade = {
            side: side,
            strike: cleanStrikeName(file),
            file: file,
            entryTime: t,
            entryIndex: i,
            entryPrice: curBar.close,
            signalHigh: curBar.high,
            is3ChartAligned: !!is3ChartAligned,
            signalCandleLow: curBar.low,
            stopLoss: curBar.low,
            reasonShort: `${side} Buy Signal (${confirmReason || "2-Chart Confirmed"})`,
            reasoning: `🎯 Trigger: ${side} Buy signal on ${cleanStrikeName(file)} at ₹${curBar.close.toFixed(2)} with 2-chart confluence confirmation (${confirmReason}) and narrow risk zone (${zoneWidth.toFixed(2)} pts <= ${opts.maxZoneWidth} pts)`
          };
          break;
        }
      }
    }

  // Setup 10: Detect Candle A — Chandelier Exit Line First Touch-and-Hold
  state.lastCETouchIndex = state.lastCETouchIndex || { CE: -999, PE: -999 };
  if (opts.enableCESpringboard && (!state.pendingCEBounce || !state.pendingCEBounce.active) && !state.activeTrade) {
    for (const side of ["CE", "PE"]) {
      if (side === "CE" && isStrictBear) continue;
      if (side === "PE" && isStrictBull) continue;
      const curBar = side === "CE" ? barCE : barPE;
      const file = fileForSide(side);
      if (!curBar || !curBar.longStop) continue;
      const longStop = curBar.longStop;

      // Fresh pullback requirement: no touch in the last 10 bars (30m)
      if (i - state.lastCETouchIndex[side] < 10) continue;

      const distA = curBar.low - longStop;
      const touchedLine = (distA >= -3.0 && distA <= 3.5) && (curBar.close > longStop);
      if (touchedLine) {
        state.lastCETouchIndex[side] = i;
        state.pendingCEBounce = {
          active: true,
          side: side,
          file: file,
          signalIndex: i,
          candleATime: t,
          candleAClose: curBar.close,
          candleALow: curBar.low,
          candleAHigh: curBar.high,
          candleALongStop: longStop
        };
        break;
      }
    }
  }
}

/**
 * Universal step function: processes a single 3-minute candle for the day across Spot, CE, and PE.
 */
function processConfluenceBar(ctx) {
  const {
    t, i, times,
    barCE, barPE, barNifty,
    prevCE, prevPE, prevNifty,
    state, opts,
    dayKey, dayLabel,
    currentCEFile, currentPEFile,
    fileForSide,
    lastCEPrice, lastPEPrice,
    peMap, ceMap, niftyMap
  } = ctx;

  if (barNifty) {
    state.dayHigh = Math.max(state.dayHigh || 0, barNifty.high || barNifty.close);
    state.dayLow = Math.min(state.dayLow || Infinity, barNifty.low || barNifty.close);
  }

  const regime = computeMacroRegime(barNifty, opts, state);
  const isStrictBull = regime.isStrictBull;
  const isStrictBear = regime.isStrictBear;

  state.justExitedReason = null;
  state.justExitedSide = null;

  // Track active Sell Zones dynamically per strike side
  if (!state.sellZones) {
    state.sellZones = { CE: null, PE: null };
  }

  // Update CE Sell Zone
  if (barCE) {
    if (state.sellZones.CE && state.sellZones.CE.active) {
      if (barCE.close > state.sellZones.CE.ceiling && prevCE && prevCE.close > state.sellZones.CE.ceiling) {
        state.sellZones.CE.active = false;
      }
    }
    if (barCE.shortSignal === 1) {
      const pHigh = prevCE ? prevCE.high : barCE.high;
      const pLow = prevCE ? prevCE.low : barCE.low;
      const pClose = prevCE ? prevCE.close : barCE.close;
      const ceil = Math.max(barCE.high, pHigh, barCE.shortStop || 0);
      const flr = Math.min(pLow, pClose, barCE.low);
      state.sellZones.CE = {
        ceiling: ceil,
        floor: flr,
        high: ceil,
        low: flr,
        active: true,
        createdTime: t,
        createdIndex: i
      };
    }
  }

  // Update PE Sell Zone
  if (barPE) {
    if (state.sellZones.PE && state.sellZones.PE.active) {
      if (barPE.close > state.sellZones.PE.ceiling && prevPE && prevPE.close > state.sellZones.PE.ceiling) {
        state.sellZones.PE.active = false;
      }
    }
    if (barPE.shortSignal === 1) {
      const pHigh = prevPE ? prevPE.high : barPE.high;
      const pLow = prevPE ? prevPE.low : barPE.low;
      const pClose = prevPE ? prevPE.close : barPE.close;
      const ceil = Math.max(barPE.high, pHigh, barPE.shortStop || 0);
      const flr = Math.min(pLow, pClose, barPE.low);
      state.sellZones.PE = {
        ceiling: ceil,
        floor: flr,
        high: ceil,
        low: flr,
        active: true,
        createdTime: t,
        createdIndex: i
      };
    }
  }

  // Record skip helper for CPR reversals and Sell Zone breakouts
  function recordSkip(safety, side, file, price, tVal) {
    if (opts.enableCPRReversalEntry && safety && safety.isCPRReversalCandidate && tVal >= "09:15" && tVal <= "11:00") {
      const curBar = side === "PE" ? (peMap ? peMap.get(tVal) : barPE) : (ceMap ? ceMap.get(tVal) : barCE);
      const oppBar = side === "PE" ? (ceMap ? ceMap.get(tVal) : barCE) : (peMap ? peMap.get(tVal) : barPE);
      const oppSide = side === "PE" ? "CE" : "PE";
      const oppFile = fileForSide(oppSide);
      const sigIdx = times ? times.indexOf(tVal) : i;
      if (curBar && oppBar) {
        state.pendingCPRReversal = {
          active: true,
          triggerSide: side,
          targetSide: oppSide,
          triggerStrike: cleanStrikeName(file),
          triggerTime: tVal,
          signalIndex: sigIdx,
          r1Level: curBar.r1,
          oppBar0Low: oppBar.low,
          oppBar0High: oppBar.high,
          oppBar0Close: oppBar.close,
          targetFile: oppFile,
          targetStrike: cleanStrikeName(oppFile)
        };
      }
    }

    if (opts.enableSellZoneBreakout && safety && safety.isSellZoneTrap && !state.activeTrade) {
      const sigIdx = times ? times.indexOf(tVal) : i;
      const expiryBars = opts.sellZoneBreakoutExpiryBars || 4;
      state.pendingSellZoneBreakout = {
        active: true,
        side: side,
        file: file,
        signalIndex: sigIdx,
        expireIndex: sigIdx + expiryBars,
        ceiling: safety.ceiling,
        signalLow: safety.signalLow,
        triggerTime: tVal
      };
    }

    state.skippedTrades.push({
      id: `S${state.skippedTrades.length + 1}`,
      day: dayKey,
      dayLabel: dayLabel,
      side: side,
      strike: cleanStrikeName(file),
      file: file,
      entryTime: `${dayKey}T${tVal}:00+05:30`,
      entryPrice: price,
      status: "SKIPPED",
      skipReason: safety.skipReason,
      reasoning: safety.reasoning
    });
  }

  // 1. EVALUATE EXITS FOR ACTIVE POSITION
  if (state.activeTrade) {
    const curBar = state.activeTrade.side === "CE" ? barCE : barPE;
    const oppBar = state.activeTrade.side === "CE" ? barPE : barCE;
    const prevCurBar = state.activeTrade.side === "CE" ? prevCE : prevPE;
    const barsHeld = i - state.activeTrade.entryIndex;

    const exitRes = evaluateTradeExits({
      activeTrade: state.activeTrade,
      curBar, oppBar, prevCurBar,
      barCE, barPE, barNifty,
      t, i, barsHeld,
      opts,
      lastCEPrice, lastPEPrice,
      dayKey, dayLabel
    });

    if (exitRes.exited) {
      exitRes.tradeRecord.id = `T${state.executedTrades.length + 1}`;
      state.executedTrades.push(exitRes.tradeRecord);
      state.justExitedReason = exitRes.exitReason;
      state.justExitedSide = exitRes.exitSide;
      state.activeTrade = null;

      if (opts.enableSellZoneBreakout && exitRes.exitReason && exitRes.exitReason.includes("Sell Zone Rejection") && curBar) {
        state.pendingSellZoneBreakout = {
          active: true,
          side: exitRes.exitSide,
          file: fileForSide(exitRes.exitSide),
          signalIndex: i,
          expireIndex: i + (opts.breakoutExpiryBars || 15),
          ceiling: curBar.high,
          signalLow: curBar.low
        };
      }

      // Track consecutive losses for daily circuit breaker
      const isWin = (exitRes.tradeRecord.points !== undefined && exitRes.tradeRecord.points > 0) ||
                    (exitRes.tradeRecord.netPnL !== undefined && exitRes.tradeRecord.netPnL > 0);
      if (isWin) {
        state.dailyConsecutiveLosses = 0;
      } else {
        state.dailyConsecutiveLosses = (state.dailyConsecutiveLosses || 0) + 1;
        state.dailyLosses = (state.dailyLosses || 0) + 1;
      }
    }
  }

  // 2. EVALUATE ENTRIES (if flat)
  evaluateTradeEntries({
    state,
    barCE, barPE, barNifty,
    prevCE, prevPE, prevNifty,
    t, i, times, opts,
    isStrictBull, isStrictBear,
    dayKey, dayLabel,
    currentCEFile, currentPEFile,
    fileForSide,
    recordSkip,
    peMap, ceMap, niftyMap
  });
}

module.exports = {
  cleanStrikeName,
  normalizeOptions,
  computeMacroRegime,
  checkPreEntrySafety,
  evaluateTradeExits,
  evaluateTradeEntries,
  processConfluenceBar
};
