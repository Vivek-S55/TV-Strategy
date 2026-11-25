/**
 * LIVE WATERFALL TRADING ENGINE
 * Synchronizes incoming 3-minute bars across NIFTY Spot, CE Option, and PE Option,
 * and executes universal confluence strategy rules in real time.
 */

const fs = require('fs');
const path = require('path');
const rules = require('./confluence-rules');
const { telegramNotifier } = require('./telegram-notifier');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class LiveWaterfallEngine {
  constructor(options = {}) {
    this.options = rules.normalizeOptions(options);
    this.broadcastFn = null; // Injected WebSocket broadcast function
    this.resetSession(false); // initialize memory without wiping disk
    this.loadSessionFromDisk(); // hydrate existing session from disk if available
  }

  loadSessionFromDisk(targetDayKey = null) {
    const today = new Date();
    let dayKey = targetDayKey || today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    let filePath = path.join(DATA_DIR, `live_session_${dayKey}.json`);

    // If session file doesn't exist yet, fallback to latest session
    if (!fs.existsSync(filePath) && !targetDayKey) {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('live_session_') && f.endsWith('.json')).sort();
      if (files.length > 0) {
        filePath = path.join(DATA_DIR, files[files.length - 1]);
        const match = files[files.length - 1].match(/live_session_(.+)\.json/);
        if (match) dayKey = match[1];
      }
    }

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const diskData = JSON.parse(raw);
        if (diskData && diskData.dayKey) {
          this.session.dayKey = diskData.dayKey;
          if (diskData.dayLabel) this.session.dayLabel = diskData.dayLabel;
          this.session.syncedBars = Array.isArray(diskData.syncedBars) ? diskData.syncedBars : [];
          this.session.state.executedTrades = Array.isArray(diskData.executedTrades) ? diskData.executedTrades : [];
          this.session.state.skippedTrades = Array.isArray(diskData.skippedTrades) ? diskData.skippedTrades : [];
          this.session.state.activeTrade = diskData.activeTrade || null;
          if (diskData.cockpit) {
            this.session.cockpit = diskData.cockpit;
          }
          if (this.session.syncedBars.length > 0) {
            this.session.syncedBars.forEach(b => {
              if (b.time && !this.session.times.includes(b.time)) {
                this.session.times.push(b.time);
              }
              if (b.spot) {
                this.session.niftyMap.set(b.time, b.spot);
                this.session.niftyHistory.push(b.spot);
                this.session.lastSpotPrice = b.spot.close;
              }
              if (b.ce) {
                this.session.ceMap.set(b.time, b.ce);
                this.session.ceHistory.push(b.ce);
                this.session.lastCEPrice = b.ce.close;
                this.session.currentCEFile = b.ce.symbol;
              }
              if (b.pe) {
                this.session.peMap.set(b.time, b.pe);
                this.session.peHistory.push(b.pe);
                this.session.lastPEPrice = b.pe.close;
                this.session.currentPEFile = b.pe.symbol;
              }
            });
            this.session.times.sort();
          }
          console.log(`📂 Hydrated active session from disk (${filePath}): ${this.session.syncedBars.length} synced bars, ${this.session.state.executedTrades.length} trades, ${this.session.state.skippedTrades.length} skips.`);
          return true;
        }
      } catch (e) {
        console.warn('⚠️ Could not hydrate session from disk:', e.message);
      }
    }
    return false;
  }

  setBroadcaster(fn) {
    this.broadcastFn = fn;
  }

  saveRawAlert(rawPayload) {
    try {
      const dayKey = this.session?.dayKey || new Date().toLocaleDateString('en-CA');
      const filePath = path.join(DATA_DIR, `live_webhooks_${dayKey}.jsonl`);
      const line = JSON.stringify({ ts: new Date().toISOString(), payload: rawPayload }) + '\n';
      fs.appendFileSync(filePath, line);
    } catch (e) {
      console.warn('⚠️ Could not persist webhook alert to disk:', e.message);
    }
  }

  saveSessionSnapshot() {
    try {
      const dayKey = this.session?.dayKey || new Date().toLocaleDateString('en-CA');
      const filePath = path.join(DATA_DIR, `live_session_${dayKey}.json`);
      fs.writeFileSync(filePath, JSON.stringify(this.getFullState(), null, 2));
    } catch (e) {
      console.warn('⚠️ Could not save session snapshot to disk:', e.message);
    }
  }

  emit(type, data) {
    if (typeof this.broadcastFn === 'function') {
      try {
        this.broadcastFn(type, data);
      } catch (e) {
        console.error('Broadcast error:', e.message);
      }
    }
  }

  /**
   * Evaluates active trade profit against runner milestones (+25, +30, +50 pts)
   * and emits real-time WebSocket notifications once per milestone.
   */
  checkAndEmitMilestones(activeTrade, ltp, high, timeOnly) {
    if (!activeTrade) return;
    activeTrade.milestones = activeTrade.milestones || {
      pts25: { reached: false, time: null, price: null },
      pts30: { reached: false, time: null, price: null },
      pts50: { reached: false, time: null, price: null }
    };

    const effectiveHigh = Math.max(ltp || 0, high || ltp || 0);
    const ptsRun = Math.round((effectiveHigh - activeTrade.entryPrice) * 100) / 100;
    const lotSize = activeTrade.lotSize || this.options.lotSize || 75;

    const milestones = [
      { key: 'pts25', target: 25.0, label: '+25 Points', level: 1 },
      { key: 'pts30', target: 30.0, label: '+30 Points', level: 2 },
      { key: 'pts50', target: 50.0, label: '+50 Points', level: 3 }
    ];

    for (const m of milestones) {
      if (ptsRun >= m.target && (!activeTrade.milestones[m.key] || !activeTrade.milestones[m.key].reached)) {
        activeTrade.milestones[m.key] = {
          reached: true,
          time: timeOnly,
          price: effectiveHigh,
          points: ptsRun
        };

        const grossPnl = Math.round(ptsRun * lotSize * 100) / 100;
        console.log(`\n🎉 [MILESTONE REACHED] ${activeTrade.side} ${activeTrade.strike} reached ${m.label} (+${ptsRun.toFixed(2)} pts | +₹${grossPnl.toFixed(2)}) @ ${timeOnly} IST`);

        this.emit('WATERFALL_MILESTONE_REACHED', {
          milestone: m.target,
          level: m.level,
          label: m.label,
          strike: activeTrade.strike,
          side: activeTrade.side,
          entryPrice: activeTrade.entryPrice,
          currentPrice: effectiveHigh,
          ltp: ltp,
          pointsRun: ptsRun,
          pnl: grossPnl,
          lotSize: lotSize,
          time: timeOnly,
          milestones: activeTrade.milestones
        });

        telegramNotifier.sendMilestone({
          ...m,
          points: ptsRun,
          ltp: effectiveHigh,
          grossPnL: grossPnl,
          strike: activeTrade.strike,
          side: activeTrade.side
        }).catch(e => console.warn('Telegram milestone err:', e.message));
      }
    }
  }

  resetSession(saveToDisk = true) {
    const today = new Date();
    const dayKey = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });

    this.session = {
      dayKey,
      dayLabel,
      startedAt: new Date().toISOString(),
      currentCEFile: 'NIFTY_CE',
      currentPEFile: 'NIFTY_PE',
      lastCEPrice: null,
      lastPEPrice: null,
      lastSpotPrice: null,
      times: [],
      niftyHistory: [],
      ceHistory: [],
      peHistory: [],
      ceMap: new Map(),
      peMap: new Map(),
      niftyMap: new Map(),
      syncedBars: [], // Chronological 3m bar evaluation records
      // 3-chart live status for Cockpit UI
      cockpit: {
        lastSyncTime: null,
        spot: null,
        ce: null,
        pe: null,
      },
      // Strategy State (consumed by confluence-rules.js)
      state: {
        executedTrades: [],
        skippedTrades: [],
        activeTrade: null,
        pendingRetracement: null,
        pendingRMIBounce: null,
        pendingHammerBreak: null,
        pendingCEBounce: null,
        pendingCPRReversal: null,
        pendingRMIReclaim: null,
        pendingCandleBAlignment: null,
        justExitedReason: null,
        justExitedSide: null,
      }
    };

    // Pending incoming buffer keyed by timeOnly (e.g. "09:21")
    this.syncBuffer = new Map();
    this.syncTimers = new Map();

    if (saveToDisk) {
      this.saveSessionSnapshot();
    }

    console.log(`\n🔄 Live Waterfall Session reset for ${dayLabel} (${dayKey})`);
  }

  /**
   * Helper: Parse timestamp into HH:MM (IST) and YYYY-MM-DD
   */
  parseTimestamp(rawTime) {
    let d;
    if (!rawTime) {
      d = new Date();
    } else if (typeof rawTime === 'number') {
      d = new Date(rawTime);
    } else if (typeof rawTime === 'string') {
      const num = Number(rawTime);
      if (!isNaN(num) && rawTime.trim().length >= 10) {
        d = new Date(num);
      } else {
        d = new Date(rawTime);
      }
    }

    if (isNaN(d.getTime())) d = new Date();

    // Convert to IST
    const istStr = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
    const timeOnly = istStr.slice(0, 5); // "HH:MM"
    const dayKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    return { timeOnly, dayKey, isoTime: d.toISOString() };
  }

  /**
   * Normalize an incoming webhook alert into a clean Candle Bar object
   */
  normalizeAlert(payload) {
    let role = (payload.chartRole || '').toUpperCase().trim();
    const symbol = (payload.symbol || payload.ticker || '').trim();

    // Auto-detect & auto-correct role from symbol
    const symUpper = symbol.toUpperCase();
    if (symUpper.includes('CE') || symUpper.includes('CALL') || /C\d+/.test(symUpper)) {
      role = 'CE';
    } else if (symUpper.includes('PE') || symUpper.includes('PUT') || /P\d+/.test(symUpper)) {
      role = 'PE';
    } else if (symUpper.includes('NIFTY') && !symUpper.includes('C') && !symUpper.includes('P')) {
      role = 'SPOT';
    } else if (!role) {
      role = 'SPOT';
    }

    const { timeOnly, dayKey, isoTime } = this.parseTimestamp(payload.time || payload.timestamp);

    const bar = {
      time: isoTime,
      day: dayKey,
      timeOnly: timeOnly,
      symbol: symbol || (role === 'SPOT' ? 'NIFTY 50' : `NIFTY ${role}`),
      chartRole: role,
      open: parseFloat(payload.open) || 0,
      high: parseFloat(payload.high) || 0,
      low: parseFloat(payload.low) || 0,
      close: parseFloat(payload.close || payload.price) || 0,
      ema9: parseFloat(payload.ema9) || null,
      ema20: parseFloat(payload.ema20) || null,
      ema200: parseFloat(payload.ema200) || null,
      pp: parseFloat(payload.pp) || null,
      r1: parseFloat(payload.r1) || null,
      s1: parseFloat(payload.s1) || null,
      r2: parseFloat(payload.r2) || null,
      s2: parseFloat(payload.s2) || null,
      r3: parseFloat(payload.r3) || null,
      s3: parseFloat(payload.s3) || null,
      cr: parseFloat(payload.cr) || null,
      cs: parseFloat(payload.cs) || null,
      longStop: parseFloat(payload.longStop) || null,
      shortStop: parseFloat(payload.shortStop) || null,
      rmiCenter: parseFloat(payload.rmiCenter) || null,
      longSignal: parseInt(payload.longSignal, 10) || 0,
      shortSignal: parseInt(payload.shortSignal, 10) || 0,
      emaBuyHM: parseInt(payload.emaBuyHM, 10) || 0,
      emaSellHM: parseInt(payload.emaSellHM, 10) || 0,
      rsi: parseFloat(payload.rsi) || null,
      volStrength: parseFloat(payload.volStrength) || null,
      priceStrength: parseFloat(payload.priceStrength) || null,
      receivedAt: new Date().toISOString()
    };

    return bar;
  }

  /**
   * Main entry point when a TradingView webhook arrives.
   * Buffers alerts across the 3 charts and executes synchronously when all 3 arrive.
   */
  handleIncomingAlert(rawPayload) {
    const bar = this.normalizeAlert(rawPayload);
    const { timeOnly, chartRole, day } = bar;

    // Auto-rollover to new day if incoming alert is for a new date
    if (day && this.session.dayKey && day !== this.session.dayKey) {
      console.log(`🌅 New trading day detected (${day} vs current ${this.session.dayKey})! Resetting live session.`);
      this.resetSession(false);
      this.session.dayKey = day;
      const dObj = new Date(day + 'T12:00:00+05:30');
      this.session.dayLabel = dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
    }

    this.saveRawAlert(rawPayload);
    console.log(`📥 [${chartRole}] alert received for ${timeOnly} IST @ ₹${bar.close.toFixed(2)} (${bar.symbol})`);

    // Track latest prices immediately for UI display
    if (chartRole === 'SPOT') {
      this.session.lastSpotPrice = bar.close;
      this.session.cockpit.spot = bar;
    } else if (chartRole === 'CE') {
      this.session.lastCEPrice = bar.close;
      this.session.currentCEFile = bar.symbol;
      this.session.cockpit.ce = bar;
    } else if (chartRole === 'PE') {
      this.session.lastPEPrice = bar.close;
      this.session.currentPEFile = bar.symbol;
      this.session.cockpit.pe = bar;
    }

    // Emit live tick update to UI immediately
    this.emit('LIVE_TICK', {
      chartRole,
      bar,
      cockpit: this.session.cockpit
    });

    // If active trade is running and tick matches active side, evaluate milestone targets in real-time
    const active = this.session.state.activeTrade;
    if (active && (chartRole === active.side || (active.file && bar.symbol && bar.symbol.includes(active.side)))) {
      this.checkAndEmitMilestones(active, bar.close, bar.high || bar.close, timeOnly);
    }

    // Add to sync buffer for this 3-min candle
    if (!this.syncBuffer.has(timeOnly)) {
      this.syncBuffer.set(timeOnly, {});
    }
    const bucket = this.syncBuffer.get(timeOnly);
    bucket[chartRole] = bar;

    const hasSpot = !!bucket['SPOT'];
    const hasCE = !!bucket['CE'];
    const hasPE = !!bucket['PE'];

    // If all 3 charts have arrived for timeOnly -> process immediately!
    if (hasSpot && hasCE && hasPE) {
      if (this.syncTimers.has(timeOnly)) {
        clearTimeout(this.syncTimers.get(timeOnly));
        this.syncTimers.delete(timeOnly);
      }
      this.executeSynchronizedBar(timeOnly, bucket);
    } else {
      // 15-second debounce window: ample time for TradingView to dispatch all 3 charts across ngrok
      if (!this.syncTimers.has(timeOnly)) {
        const timer = setTimeout(() => {
          this.syncTimers.delete(timeOnly);
          console.warn(`⚠️ Sync timer elapsed (15s) for ${timeOnly}. Processing with available charts:`, Object.keys(bucket).filter(k => !k.startsWith('_')));
          this.executeSynchronizedBar(timeOnly, bucket);
        }, 15000);
        this.syncTimers.set(timeOnly, timer);
      }
    }

    return {
      status: 'buffered',
      timeOnly,
      chartRole,
      bufferedRoles: Object.keys(bucket).filter(k => !k.startsWith('_'))
    };
  }

  /**
   * Evaluates the 3-chart candle through the shared confluence rules engine.
   */
  executeSynchronizedBar(timeOnly, bucket) {
    bucket._executed = true;

    const barNifty = bucket['SPOT'] || null;
    const barCE = bucket['CE'] || null;
    const barPE = bucket['PE'] || null;

    if (!barNifty && !barCE && !barPE) return;

    // Maintain maps and history
    if (barNifty) {
      this.session.niftyMap.set(timeOnly, barNifty);
      const exIdx = this.session.niftyHistory.findIndex(b => b.timeOnly === timeOnly);
      if (exIdx >= 0) this.session.niftyHistory[exIdx] = barNifty;
      else this.session.niftyHistory.push(barNifty);
    }
    if (barCE) {
      this.session.ceMap.set(timeOnly, barCE);
      const exIdx = this.session.ceHistory.findIndex(b => b.timeOnly === timeOnly);
      if (exIdx >= 0) this.session.ceHistory[exIdx] = barCE;
      else this.session.ceHistory.push(barCE);
      this.session.lastCEPrice = barCE.close;
    }
    if (barPE) {
      this.session.peMap.set(timeOnly, barPE);
      const exIdx = this.session.peHistory.findIndex(b => b.timeOnly === timeOnly);
      if (exIdx >= 0) this.session.peHistory[exIdx] = barPE;
      else this.session.peHistory.push(barPE);
      this.session.lastPEPrice = barPE.close;
    }

    // Add timeOnly to chronological times if not present
    if (!this.session.times.includes(timeOnly)) {
      this.session.times.push(timeOnly);
      this.session.times.sort();
    }

    const times = this.session.times;
    const i = times.indexOf(timeOnly);
    const prevT = i > 0 ? times[i - 1] : null;
    const prevNifty = prevT ? this.session.niftyMap.get(prevT) : null;
    const prevCE = prevT ? this.session.ceMap.get(prevT) : null;
    const prevPE = prevT ? this.session.peMap.get(prevT) : null;

    const priorActiveTrade = this.session.state.activeTrade ? { ...this.session.state.activeTrade } : null;
    const priorExecutedCount = this.session.state.executedTrades.length;
    const priorSkippedCount = this.session.state.skippedTrades.length;

    // Auto-derive missing indicators (e.g. if TradingView alert only sent OHLC)
    this.deriveMissingIndicators(barNifty, prevNifty);
    this.deriveMissingIndicators(barCE, prevCE);
    this.deriveMissingIndicators(barPE, prevPE);

    // Helper: get current contract file
    const currentCEFile = this.session.currentCEFile;
    const currentPEFile = this.session.currentPEFile;
    const fileForSide = (s) => (s === 'PE' ? currentPEFile : currentCEFile);

    // Call the Shared Rules Engine!
    rules.processConfluenceBar({
      t: timeOnly,
      i,
      times,
      barCE,
      barPE,
      barNifty,
      prevCE,
      prevPE,
      prevNifty,
      state: this.session.state,
      opts: this.options,
      dayKey: this.session.dayKey,
      dayLabel: this.session.dayLabel,
      currentCEFile,
      currentPEFile,
      fileForSide,
      lastCEPrice: this.session.lastCEPrice,
      lastPEPrice: this.session.lastPEPrice,
      peMap: this.session.peMap,
      ceMap: this.session.ceMap,
      niftyMap: this.session.niftyMap
    });

    this.session.cockpit.lastSyncTime = timeOnly;

    // Detect state changes and emit real-time WebSocket events:
    const newActiveTrade = this.session.state.activeTrade;
    const newExecutedCount = this.session.state.executedTrades.length;
    const newSkippedCount = this.session.state.skippedTrades.length;

    let barStatus = 'SCANNING';
    let barDecision = '';
    let executedTrade = null;
    let skippedTrade = null;

    // 1. Trade Exited
    if (newExecutedCount > priorExecutedCount) {
      executedTrade = this.session.state.executedTrades[newExecutedCount - 1];
      barStatus = 'EXIT';
      barDecision = `🚪 Exited ${executedTrade.side} ${executedTrade.strike} @ ₹${executedTrade.exitPrice.toFixed(2)} | Net P&L: ₹${executedTrade.netPnL.toFixed(2)} (${executedTrade.exitReason})`;
      console.log(`\n🚪 [TRADE EXIT] ${executedTrade.side} ${executedTrade.strike} Exited @ ₹${executedTrade.exitPrice.toFixed(2)} | Net P&L: ₹${executedTrade.netPnL.toFixed(2)} (${executedTrade.grossPoints.toFixed(2)} pts) | Reason: ${executedTrade.exitReason}`);
      this.emit('WATERFALL_TRADE_EXIT', {
        trade: executedTrade,
        activeTrade: null,
        sessionStats: this.getLiveSummary()
      });
      telegramNotifier.sendTradeExit(executedTrade, this.getLiveSummary()).catch(e => console.warn('Telegram exit err:', e.message));
    }
    // 2. Trade Entered
    else if (!priorActiveTrade && newActiveTrade) {
      executedTrade = newActiveTrade;
      barStatus = 'EXECUTED';
      barDecision = `✓ Entered ${newActiveTrade.side} ${newActiveTrade.strike} @ ₹${newActiveTrade.entryPrice.toFixed(2)} | SL: ₹${(newActiveTrade.stopLoss || 0).toFixed(2)} | Setup: ${newActiveTrade.reasonShort || newActiveTrade.setupName}`;
      console.log(`\n🎯 [TRADE ENTRY] ${newActiveTrade.side} ${newActiveTrade.strike} Entered @ ₹${newActiveTrade.entryPrice.toFixed(2)} | SL: ₹${(newActiveTrade.stopLoss || 0).toFixed(2)} | Setup: ${newActiveTrade.reasonShort}`);
      this.emit('WATERFALL_TRADE_OPEN', {
        trade: newActiveTrade,
        sessionStats: this.getLiveSummary()
      });
      telegramNotifier.sendTradeOpen(newActiveTrade).catch(e => console.warn('Telegram open err:', e.message));
    }
    // 3. Position Active (Holding)
    else if (newActiveTrade) {
      barStatus = 'IN_POSITION';
      const optBar = newActiveTrade.side === 'CE' ? barCE : barPE;
      const curLtp = optBar ? optBar.close : newActiveTrade.entryPrice;
      const curHigh = optBar ? optBar.high : curLtp;
      this.checkAndEmitMilestones(newActiveTrade, curLtp, curHigh, timeOnly);
      const pts = curLtp - newActiveTrade.entryPrice;
      barDecision = `🎯 Holding ${newActiveTrade.side} ${newActiveTrade.strike} @ ₹${curLtp.toFixed(2)} (${pts >= 0 ? '+' : ''}${pts.toFixed(2)} pts) | SL: ₹${(newActiveTrade.stopLoss || 0).toFixed(2)}`;
    }
    // 4. Trade Skipped
    else if (newSkippedCount > priorSkippedCount) {
      skippedTrade = this.session.state.skippedTrades[newSkippedCount - 1];
      barStatus = 'SKIPPED';
      barDecision = `🚫 Filter Skip: ${skippedTrade.skipReason}`;
      console.log(`\n🛡️ [SKIP] ${skippedTrade.side} ${skippedTrade.strike} skipped: ${skippedTrade.skipReason}`);
      this.emit('WATERFALL_TRADE_SKIPPED', {
        skipped: skippedTrade,
        sessionStats: this.getLiveSummary()
      });
    }
    // 5. Normal Monitored Bar (Capital Protected)
    else {
      barStatus = 'SCANNING';
      const spotClose = barNifty ? `₹${barNifty.close.toFixed(2)}` : '—';
      const spotEMA = barNifty?.ema9 ? `₹${barNifty.ema9.toFixed(2)}` : '—';
      const ceClose = barCE ? `₹${barCE.close.toFixed(2)}` : '—';
      const ceEMA = barCE?.ema9 ? `₹${barCE.ema9.toFixed(2)}` : '—';
      const peClose = barPE ? `₹${barPE.close.toFixed(2)}` : '—';
      const peEMA = barPE?.ema9 ? `₹${barPE.ema9.toFixed(2)}` : '—';

      const ceBias = barCE ? (barCE.close > barCE.ema9 ? `CE ${ceClose} > 9 EMA (${ceEMA})` : `CE ${ceClose} < 9 EMA`) : 'CE —';
      const peBias = barPE ? (barPE.close > barPE.ema9 ? `PE ${peClose} > 9 EMA` : `PE ${peClose} < 9 EMA (${peEMA})`) : 'PE —';

      barDecision = `Capital Protected: Evaluated 3m bar closes (${ceBias}, ${peBias}, Spot ${spotClose}). No fresh crossover setup; awaiting confluence trigger.`;
    }

    // Stop Loss / Trailing Updated
    if (priorActiveTrade && newActiveTrade && priorActiveTrade.stopLoss !== newActiveTrade.stopLoss) {
      console.log(`\n🛡️ [SL TRAIL] ${newActiveTrade.strike} Stop Loss moved from ₹${(priorActiveTrade.stopLoss || 0).toFixed(2)} -> ₹${(newActiveTrade.stopLoss || 0).toFixed(2)}`);
      this.emit('WATERFALL_SL_UPDATE', {
        trade: newActiveTrade,
        oldSL: priorActiveTrade.stopLoss,
        newSL: newActiveTrade.stopLoss
      });
      telegramNotifier.sendSLUpdate(newActiveTrade, priorActiveTrade.stopLoss, newActiveTrade.stopLoss).catch(e => console.warn('Telegram SL err:', e.message));
    }

    const candleAudit = {
      id: `BAR_${timeOnly.replace(':', '')}`,
      time: timeOnly,
      timeFull: `${this.session.dayKey}T${timeOnly}:00+05:30`,
      day: this.session.dayKey,
      dayLabel: this.session.dayLabel,
      status: barStatus,
      decision: barDecision,
      spot: barNifty ? {
        symbol: barNifty.symbol,
        close: barNifty.close,
        open: barNifty.open,
        high: barNifty.high,
        low: barNifty.low,
        ema9: barNifty.ema9,
        ema20: barNifty.ema20,
        ema200: barNifty.ema200,
        pp: barNifty.pp,
        r1: barNifty.r1,
        s1: barNifty.s1,
        longSignal: barNifty.longSignal,
        shortSignal: barNifty.shortSignal
      } : null,
      ce: barCE ? {
        symbol: barCE.symbol,
        close: barCE.close,
        open: barCE.open,
        high: barCE.high,
        low: barCE.low,
        ema9: barCE.ema9,
        pp: barCE.pp,
        rmiCenter: barCE.rmiCenter,
        longStop: barCE.longStop,
        shortStop: barCE.shortStop,
        longSignal: barCE.longSignal,
        shortSignal: barCE.shortSignal,
        emaBuyHM: barCE.emaBuyHM
      } : null,
      pe: barPE ? {
        symbol: barPE.symbol,
        close: barPE.close,
        open: barPE.open,
        high: barPE.high,
        low: barPE.low,
        ema9: barPE.ema9,
        pp: barPE.pp,
        rmiCenter: barPE.rmiCenter,
        longStop: barPE.longStop,
        shortStop: barPE.shortStop,
        longSignal: barPE.longSignal,
        shortSignal: barPE.shortSignal,
        emaBuyHM: barPE.emaBuyHM
      } : null,
      trade: executedTrade,
      skipped: skippedTrade
    };

    if (!this.session.syncedBars) this.session.syncedBars = [];
    const existingIdx = this.session.syncedBars.findIndex(b => b.time === timeOnly);
    if (existingIdx >= 0) {
      this.session.syncedBars[existingIdx] = candleAudit;
    } else {
      this.session.syncedBars.push(candleAudit);
    }

    console.log(`📊 [3m BAR AUDIT] ${timeOnly} IST | Status: ${barStatus} | ${barDecision}`);

    // Always emit full synchronized bar snapshot
    this.emit('LIVE_BAR_SYNC', {
      timeOnly,
      cockpit: this.session.cockpit,
      activeTrade: this.session.state.activeTrade,
      pending: {
        retracement: this.session.state.pendingRetracement,
        hammer: this.session.state.pendingHammerBreak,
        ceBounce: this.session.state.pendingCEBounce,
        cprReversal: this.session.state.pendingCPRReversal,
        rmiReclaim: this.session.state.pendingRMIReclaim,
        rmiBounce: this.session.state.pendingRMIBounce,
        candleBAlignment: this.session.state.pendingCandleBAlignment,
      },
      allSignals: this.getFullState().allSignals,
      syncedBars: this.session.syncedBars,
      latestBar: candleAudit,
      summary: this.getLiveSummary()
    });

    this.saveSessionSnapshot();
  }

  deriveMissingIndicators(bar, prevBar) {
    if (!bar) return;
    // 1. EMA 9
    if (bar.ema9 == null || isNaN(bar.ema9)) {
      if (prevBar && prevBar.ema9 != null) {
        bar.ema9 = Math.round(((bar.close * (2 / 10)) + (prevBar.ema9 * (8 / 10))) * 100) / 100;
      } else {
        bar.ema9 = bar.close;
      }
    }
    // 2. EMA 20
    if (bar.ema20 == null || isNaN(bar.ema20)) {
      if (prevBar && prevBar.ema20 != null) {
        bar.ema20 = Math.round(((bar.close * (2 / 21)) + (prevBar.ema20 * (19 / 21))) * 100) / 100;
      } else {
        bar.ema20 = bar.close;
      }
    }
    // 3. EMA 200
    if (bar.ema200 == null || isNaN(bar.ema200)) {
      if (prevBar && prevBar.ema200 != null) {
        bar.ema200 = Math.round(((bar.close * (2 / 201)) + (prevBar.ema200 * (199 / 201))) * 100) / 100;
      } else {
        bar.ema200 = bar.close;
      }
    }
    // 4. CPR PP
    if (bar.pp == null || isNaN(bar.pp)) {
      bar.pp = prevBar?.pp || Math.round(((bar.high + bar.low + bar.close) / 3) * 100) / 100;
    }
    // 5. Long & Short 9 EMA Signals (only derive if alert omitted them)
    const prevC = prevBar ? prevBar.close : bar.open;
    const prevE = prevBar ? prevBar.ema9 : bar.ema9;
    if (bar.longSignal == null || isNaN(bar.longSignal)) {
      bar.longSignal = (bar.close > bar.ema9 && prevC <= prevE) ? 1 : 0;
    }
    if (bar.shortSignal == null || isNaN(bar.shortSignal)) {
      bar.shortSignal = (bar.close < bar.ema9 && prevC >= prevE) ? 1 : 0;
    }
    // 6. RMI Center
    if (bar.rmiCenter == null || isNaN(bar.rmiCenter)) {
      bar.rmiCenter = bar.rsi != null ? bar.rsi : (prevBar?.rmiCenter || 50.0);
    }
  }

  /**
   * Manually exit the currently active trade (e.g. from UI discretionary target exit).
   */
  manualExitActiveTrade(reason = 'Manual Discretionary Exit (Target Reached)') {
    const active = this.session.state.activeTrade;
    if (!active) return { success: false, message: 'No active trade to exit' };

    const isCE = active.side === 'CE';
    const optBar = isCE ? this.session.cockpit.ce : this.session.cockpit.pe;
    const exitPrice = optBar?.close || (isCE ? this.session.lastCEPrice : this.session.lastPEPrice) || active.entryPrice;
    const grossPoints = Math.round((exitPrice - active.entryPrice) * 100) / 100;
    const lotSize = active.lotSize || this.options.lotSize || 75;
    const grossPnL = Math.round(grossPoints * lotSize * 100) / 100;
    const comm = (this.options.commission || 20) * 2;
    const netPnL = Math.round((grossPnL - comm) * 100) / 100;
    const timeOnly = this.session.cockpit.lastSyncTime || new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'Asia/Kolkata' }).substring(0, 5);

    const peakHigh = active.maxHigh ? Math.max(active.maxHigh, exitPrice) : exitPrice;
    const maxPointsRun = Math.round((peakHigh - active.entryPrice) * 100) / 100;

    const tradeRecord = {
      ...active,
      id: `T${this.session.state.executedTrades.length + 1}`,
      exitTime: `${this.session.dayKey}T${timeOnly}:00+05:30`,
      exitPrice: exitPrice,
      exitReason: reason,
      grossPoints: grossPoints,
      grossPnL: grossPnL,
      commission: comm,
      netPnL: netPnL,
      isWin: netPnL > 0,
      peakHigh: peakHigh,
      maxPointsRun: maxPointsRun,
      is25pointsReached: maxPointsRun >= 25.0,
      is30pointsReached: maxPointsRun >= 30.0,
      is50pointsReached: maxPointsRun >= 50.0,
      milestones: active.milestones || {},
      reasoning: `${active.reasoning || ''} • 🚪 ${reason}`
    };

    this.session.state.executedTrades.push(tradeRecord);
    this.session.state.activeTrade = null;
    this.saveSessionSnapshot();

    console.log(`\n🚪 [MANUAL EXIT] ${tradeRecord.side} ${tradeRecord.strike} Exited @ ₹${exitPrice.toFixed(2)} | Net P&L: ₹${netPnL.toFixed(2)} (${grossPoints.toFixed(2)} pts) | Reason: ${reason}`);

    this.emit('WATERFALL_TRADE_EXIT', {
      trade: tradeRecord,
      activeTrade: null,
      sessionStats: this.getLiveSummary()
    });
    telegramNotifier.sendTradeExit(tradeRecord, this.getLiveSummary()).catch(e => console.warn('Telegram manual exit err:', e.message));

    return { success: true, trade: tradeRecord };
  }

  getLiveSummary() {
    const executed = this.session.state.executedTrades || [];
    const skipped = this.session.state.skippedTrades || [];

    const winTrades = executed.filter(t => t.netPnL > 0);
    const lossTrades = executed.filter(t => t.netPnL < 0);
    const breakevenTrades = executed.filter(t => t.netPnL === 0);

    const totalGrossPnL = Math.round(executed.reduce((acc, t) => acc + (t.grossPnL || (t.grossPoints * (t.lotSize || 75)) || 0), 0) * 100) / 100;
    const totalCommission = Math.round(executed.reduce((acc, t) => acc + (t.commission || 40), 0) * 100) / 100;
    const totalNetPnL = Math.round(executed.reduce((acc, t) => acc + (t.netPnL || 0), 0) * 100) / 100;
    const totalGrossPoints = Math.round(executed.reduce((acc, t) => acc + (t.grossPoints || 0), 0) * 100) / 100;

    const grossProfit = Math.round(winTrades.reduce((acc, t) => acc + (t.netPnL || 0), 0) * 100) / 100;
    const grossLoss = Math.round(Math.abs(lossTrades.reduce((acc, t) => acc + (t.netPnL || 0), 0)) * 100) / 100;
    const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : (grossProfit > 0 ? 999 : 0);

    const totalTrades = executed.length;
    const winRate = totalTrades > 0 ? Math.round((winTrades.length / totalTrades) * 1000) / 10 : 0;
    const avgWin = winTrades.length > 0 ? Math.round((grossProfit / winTrades.length) * 100) / 100 : 0;
    const avgLoss = lossTrades.length > 0 ? Math.round((grossLoss / lossTrades.length) * 100) / 100 : 0;
    const riskReward = avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : 0;

    // Running drawdown calculation
    let runningNetEquity = 0;
    let peakNetEquity = 0;
    let maxDrawdown = 0;

    for (const t of executed) {
      runningNetEquity += (t.netPnL || 0);
      if (runningNetEquity > peakNetEquity) peakNetEquity = runningNetEquity;
      const dd = peakNetEquity - runningNetEquity;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const runner25Trades = executed.filter(t => t.is25pointsReached || (t.maxPointsRun >= 25.0) || t.milestones?.pts25?.reached).length;
    const runner30Trades = executed.filter(t => t.is30pointsReached || (t.maxPointsRun >= 30.0) || t.milestones?.pts30?.reached).length;
    const runner50Trades = executed.filter(t => t.is50pointsReached || (t.maxPointsRun >= 50.0) || t.milestones?.pts50?.reached).length;

    return {
      totalTrades,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      breakevenTrades: breakevenTrades.length,
      winRate,
      totalGrossPnL,
      totalCommission,
      totalNetPnL,
      totalGrossPoints,
      grossProfit,
      grossLoss,
      profitFactor,
      avgWin,
      avgLoss,
      riskReward,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      skippedTradesCount: skipped.length,
      runner25Trades,
      runner30Trades,
      runner50Trades,
      runner25Pct: totalTrades > 0 ? Math.round((runner25Trades / totalTrades) * 1000) / 10 : 0,
      runner30Pct: totalTrades > 0 ? Math.round((runner30Trades / totalTrades) * 1000) / 10 : 0,
      runner50Pct: totalTrades > 0 ? Math.round((runner50Trades / totalTrades) * 1000) / 10 : 0
    };
  }

  getFullState() {
    const executed = (this.session.state.executedTrades || []).map(t => ({ ...t, status: 'EXECUTED' }));
    const skipped = (this.session.state.skippedTrades || []).map(s => ({ ...s, status: 'SKIPPED' }));
    const allSignals = [...executed, ...skipped].sort((a, b) => ((a.time || a.entryTime || '') > (b.time || b.entryTime || '') ? 1 : -1));

    return {
      status: 'ok',
      dayKey: this.session.dayKey,
      dayLabel: this.session.dayLabel,
      cockpit: this.session.cockpit,
      activeTrade: this.session.state.activeTrade,
      pending: {
        retracement: this.session.state.pendingRetracement,
        hammer: this.session.state.pendingHammerBreak,
        ceBounce: this.session.state.pendingCEBounce,
        cprReversal: this.session.state.pendingCPRReversal,
        rmiReclaim: this.session.state.pendingRMIReclaim,
        rmiBounce: this.session.state.pendingRMIBounce,
        candleBAlignment: this.session.state.pendingCandleBAlignment,
      },
      executedTrades: this.session.state.executedTrades,
      skippedTrades: this.session.state.skippedTrades,
      syncedBars: this.session.syncedBars || [],
      allSignals,
      summary: this.getLiveSummary()
    };
  }
}

// Singleton live engine instance
const liveEngine = new LiveWaterfallEngine();

module.exports = {
  LiveWaterfallEngine,
  liveEngine
};

