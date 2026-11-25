/* ═══════════════════════════════════════════════════════════
   VIVEK'S TRADING DASHBOARD — MAIN JS
   WebSocket client, signal rendering, options chain, TV chart
   ═══════════════════════════════════════════════════════════ */

// ─── CONFIG ────────────────────────────────────────────────
const CONFIG = {
  wsUrl: `ws://${location.host}`,
  apiBase: '',
  optionsSymbol: 'NIFTY',
  optionsRefreshMs: 60000,
  mockNiftyPrice: 23341.75,
  mockVix: 14.25,
};

// ─── STATE ──────────────────────────────────────────────────
const state = {
  ws: null,
  wsConnected: false,
  signals: [],
  activeBias: null,
  lastSignal: null,
  optionsData: null,
  recommendedStrike: null,
  pendingModal: null,
  tvWidget: null,
  currentSymbol: 'NSE:NIFTY1!',
  niftyPrice: CONFIG.mockNiftyPrice,

  // Live Waterfall State & Multi-Dimensional Filters (Screenshot 2 & 3 Parity)
  liveWaterfall: null,
  sideFilter: 'ALL',
  setupFilter: 'ALL',
  statusFilter: 'ALL',
  resultFilter: 'ALL',
  searchQuery: '',
  cockpit: {
    spot: null,
    ce: null,
    pe: null,
    lastSyncTime: null,
  },
  activeTrade: null,
  waterfallTrades: [],
  waterfallSkips: [],
  allSignals: [],
  syncedBars: [],
  pendingQueues: {},
  lastSkipped: null,
  renderedWaterfallList: [],
  sessionStats: null,
};

// ─── UTILITY ────────────────────────────────────────────────
function formatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return '—'; }
}

function formatPrice(p) {
  if (!p || isNaN(p)) return '—';
  return Number(p).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtINR(val) {
  if (val == null || isNaN(val)) return '₹0.00';
  const prefix = val < 0 ? '-₹' : '₹';
  return prefix + Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderCurrentLogTable() {
  // Safe fallback if called
  renderWaterfallLiveTable();
}

function formatOI(oi) {
  if (!oi) return '—';
  const n = Number(oi);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toString();
}

function dirClass(dir) {
  if (!dir) return 'neutral';
  const d = dir.toUpperCase();
  if (d === 'BUY') return 'buy';
  if (d === 'SELL') return 'sell';
  if (d === 'EXIT') return 'exit';
  return 'neutral';
}

function tierLabel(tier) {
  if (tier === 1) return 'T1';
  if (tier === 'EXIT' || tier === 0) return 'EXIT';
  if (tier === 2) return 'T2';
  return 'T3';
}

function tierClass(tier) {
  if (tier === 1) return 't1';
  if (tier === 'EXIT') return 'texit';
  if (tier === 2) return 't2';
  return 't3';
}

// ─── CLOCK ──────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    document.getElementById('clockTime').textContent = timeStr;

    const h = now.getHours(), m = now.getMinutes();
    const isOpen = (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
    const isPremarket = h === 9 && m < 15;
    const dot = document.getElementById('statusDot');
    const label = document.getElementById('statusLabel');

    if (isOpen) {
      dot.className = 'status-dot open';
      label.textContent = 'Market Open';
    } else if (isPremarket) {
      dot.className = 'status-dot premarket';
      label.textContent = 'Pre-Market';
    } else {
      dot.className = 'status-dot closed';
      label.textContent = 'Market Closed';
    }
  }
  tick();
  setInterval(tick, 1000);
}

// ─── LIVE DATA SYNC ──────────────────────────────────────────
// No mocked market data — live NIFTY and options values arrive strictly via webhooks.

// ─── TRADINGVIEW WIDGET (OPTIONAL CONTAINER) ─────────────────
function initTVWidget(symbol = 'NSE:NIFTY1!') {
  const container = document.getElementById('tradingview_chart');
  if (!container || typeof TradingView === 'undefined') return;
  container.innerHTML = '';
  try {
    state.tvWidget = new TradingView.widget({
      autosize: true,
      symbol: symbol,
      interval: '3',
      timezone: 'Asia/Kolkata',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#0f1628',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      container_id: 'tradingview_chart',
      studies: [
        { id: 'MASimple@tv-scriptstd', inputs: { length: 9, source: 'close' } },
        { id: 'MASimple@tv-scriptstd', inputs: { length: 20, source: 'close' } },
        { id: 'MASimple@tv-scriptstd', inputs: { length: 200, source: 'close' } },
      ],
      overrides: {
        'mainSeriesProperties.candleStyle.upColor': '#22c55e',
        'mainSeriesProperties.candleStyle.downColor': '#ef4444',
        'mainSeriesProperties.candleStyle.wickUpColor': '#22c55e',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
        'paneProperties.background': '#0f1628',
        'paneProperties.backgroundType': 'solid',
      },
    });
  } catch (e) {
    console.warn('TradingView widget initialization skipped:', e);
  }
}

// ─── CHART SYMBOL SWITCH ─────────────────────────────────────
function setupChartControls() {
  document.querySelectorAll('.btn-chip[data-symbol]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-chip[data-symbol]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSymbol = btn.dataset.symbol;
      initTVWidget(state.currentSymbol);
    });
  });
}

// ─── WEBSOCKET ───────────────────────────────────────────────
function connectWS() {
  const dot = document.getElementById('wsDot');
  const label = document.getElementById('wsLabel');

  try {
    state.ws = new WebSocket(CONFIG.wsUrl);

    state.ws.onopen = () => {
      state.wsConnected = true;
      dot.className = 'ws-dot connected';
      label.textContent = 'Live';
      showToast('info', '📡 Connected', 'WebSocket connected to backend');
    };

    state.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    };

    state.ws.onclose = () => {
      state.wsConnected = false;
      dot.className = 'ws-dot disconnected';
      label.textContent = 'Disconnected';
      setTimeout(connectWS, 3000); // auto-reconnect
    };

    state.ws.onerror = () => {
      dot.className = 'ws-dot disconnected';
      label.textContent = 'Error';
    };
  } catch (e) {
    dot.className = 'ws-dot disconnected';
    label.textContent = 'No Backend';
    console.warn('WebSocket connection failed — running in demo mode');
    runDemoMode();
  }
}

function handleWsMessage(msg) {
  try {
    switch (msg.type) {
      case 'INIT':
        initFromServer(msg.data);
        break;
      case 'LIVE_WATERFALL_INIT':
        handleLiveWaterfallInit(msg.data);
        break;
      case 'LIVE_TICK':
        handleLiveTick(msg.data);
        break;
      case 'LIVE_BAR_SYNC':
        handleLiveBarSync(msg.data);
        break;
      case 'WATERFALL_TRADE_OPEN':
        handleWaterfallTradeOpen(msg.data);
        break;
      case 'WATERFALL_MILESTONE_REACHED':
        handleWaterfallMilestoneReached(msg.data);
        break;
      case 'WATERFALL_TRADE_EXIT':
        handleWaterfallTradeExit(msg.data);
        break;
      case 'WATERFALL_SL_UPDATE':
        handleWaterfallSLUpdate(msg.data);
        break;
      case 'WATERFALL_TRADE_SKIPPED':
        handleWaterfallTradeSkipped(msg.data);
        break;
      case 'LIVE_WATERFALL_RESET':
        handleLiveWaterfallReset(msg.data);
        break;
      case 'SIGNAL':
        addSignal(msg.data, false);
        break;
      case 'ALERT':
        addSignal(msg.data, false);
        if (msg.data.requiresAction) showTradeModal(msg.data);
        break;
      case 'RESET':
        resetUI();
        break;
    }
  } catch (err) {
    console.error('Error handling WebSocket message:', msg?.type, err);
  }
}

function initFromServer(data) {
  if (data.signals && data.signals.length > 0) {
    data.signals.slice().reverse().forEach(s => addSignal(s, true));
  }
  updateStats(data.stats);
  if (data.activeBias) updateBias(data.activeBias, data.lastSignal);
}

// ─── LIVE WATERFALL ENGINE HANDLERS ─────────────────────────
function handleLiveWaterfallInit(data) {
  if (!data) return;
  try {
    state.liveWaterfall = data;
    state.cockpit = data.cockpit || {};
    state.activeTrade = data.activeTrade || null;
    state.waterfallTrades = data.executedTrades ? [...data.executedTrades] : [];
    state.waterfallSkips = data.skippedTrades ? [...data.skippedTrades] : [];
    state.allSignals = data.allSignals ? [...data.allSignals] : [];
    state.syncedBars = data.syncedBars ? [...data.syncedBars] : [];
    state.pendingQueues = data.pending || {};

    if (data.cockpit?.spot) updateCockpitTile('SPOT', data.cockpit.spot);
    if (data.cockpit?.ce) updateCockpitTile('CE', data.cockpit.ce);
    if (data.cockpit?.pe) updateCockpitTile('PE', data.cockpit.pe);

    updateActiveTradeCard(data.activeTrade);
    updateSessionStats(data.summary, data.dayLabel);
    updateDirectiveHub();
  } catch (e) {
    console.error('Error in handleLiveWaterfallInit:', e);
  }
  renderWaterfallLiveTable();
}

function handleLiveTick(data) {
  if (!data) return;
  try {
    if (data.chartRole && data.bar) {
      updateCockpitTile(data.chartRole, data.bar);
    }
    if (data.cockpit) {
      state.cockpit = { ...state.cockpit, ...data.cockpit };
    }
    // If active trade is open, refresh live P&L with this tick
    if (state.activeTrade) {
      updateActiveTradeCard(state.activeTrade);
    }
    updateDirectiveHub();
  } catch (e) {
    console.warn('Error in handleLiveTick:', e);
  }
}

function handleLiveBarSync(data) {
  if (!data) return;
  try {
    if (data.cockpit) {
      state.cockpit = data.cockpit;
      if (data.cockpit.spot) updateCockpitTile('SPOT', data.cockpit.spot);
      if (data.cockpit.ce) updateCockpitTile('CE', data.cockpit.ce);
      if (data.cockpit.pe) updateCockpitTile('PE', data.cockpit.pe);
    }
    state.activeTrade = data.activeTrade;
    state.pendingQueues = data.pending || {};
    if (data.allSignals) {
      state.allSignals = data.allSignals;
    }
    if (data.syncedBars) {
      state.syncedBars = data.syncedBars;
    }
    updateActiveTradeCard(data.activeTrade);
    updateSessionStats(data.summary);
    updateDirectiveHub();
  } catch (e) {
    console.error('Error in handleLiveBarSync:', e);
  }
  renderWaterfallLiveTable();
}

function handleWaterfallTradeOpen(data) {
  if (!data || !data.trade) return;
  const t = data.trade;
  state.activeTrade = t;
  state.waterfallTrades.push(t);
  state.allSignals.push({ ...t, status: 'EXECUTED' });
  updateActiveTradeCard(t);
  const isCE = t.side === 'CE';
  showToast(isCE ? 'buy' : 'sell', `🎯 Live Trade OPEN: ${t.side} ${t.strike}`, `Entered @ ₹${formatPrice(t.entryPrice)} | SL: ₹${formatPrice(t.stopLoss)} | ${t.reasonShort || t.setupName}`);

  // Show trade entry popup modal
  showTradeEntryModal(t);

  // Flash signal panel
  const panel = document.getElementById('panelSignals');
  if (panel) {
    panel.classList.remove('flash-buy', 'flash-sell');
    void panel.offsetWidth;
    panel.classList.add(isCE ? 'flash-buy' : 'flash-sell');
  }

  updateSessionStats(data.sessionStats);
  updateDirectiveHub();
  renderWaterfallLiveTable();
}

// ─── TRADE ENTRY POPUP MODAL ─────────────────────────────────
function showTradeEntryModal(trade) {
  const overlay = document.getElementById('tradeEntryModalOverlay');
  const title   = document.getElementById('tradeEntryTitle');
  const sub     = document.getElementById('tradeEntrySubtitle');
  const body    = document.getElementById('tradeEntryBody');
  if (!overlay || !body) return;

  const isCE = trade.side === 'CE';
  const sideColor = isCE ? 'green' : 'red';
  const sideEmoji = isCE ? '📈' : '📉';

  if (title) {
    title.textContent = `${sideEmoji} NEW ${trade.side} TRADE — ACTION REQUIRED`;
    title.style.color = isCE ? '#22c55e' : '#ef4444';
  }
  if (sub) sub.textContent = `${trade.strike} | Setup: ${trade.reasonShort || trade.setupName || '3-Chart Confluence'}`;

  body.innerHTML = `
    <div class="trade-entry-grid">
      <div class="te-item">
        <div class="te-label">Strike & Side</div>
        <div class="te-value ${sideColor}">${trade.strike} ${trade.side}</div>
      </div>
      <div class="te-item">
        <div class="te-label">Setup / Signal</div>
        <div class="te-value blue" style="font-size:13px; margin-top:2px;">${trade.reasonShort || trade.setupName || '3-Chart Confluence'}</div>
      </div>
      <div class="te-item">
        <div class="te-label">Entry Price</div>
        <div class="te-value ${sideColor}">₹${formatPrice(trade.entryPrice)}</div>
      </div>
      <div class="te-item">
        <div class="te-label">Stop Loss</div>
        <div class="te-value red">₹${formatPrice(trade.stopLoss)}</div>
      </div>
      <div class="te-item">
        <div class="te-label">Entry Time</div>
        <div class="te-value" style="font-size:15px;">${trade.entryTime || '—'} IST</div>
      </div>
      <div class="te-item">
        <div class="te-label">Lot Size</div>
        <div class="te-value amber">${trade.lotSize || 75} qty</div>
      </div>
    </div>
    <div class="te-directive-box ${isCE ? '' : 'pe-trade'}">
      <strong>🚀 ZERODHA ACTION:</strong> BUY <b>${trade.strike}</b> ${trade.side} — <b>${trade.lotSize || 75} qty</b> at market price (≈ ₹${formatPrice(trade.entryPrice)}).<br>
      Set <strong>Stop Loss Limit</strong> @ <span style="color:#ef4444; font-weight:700;">₹${formatPrice(trade.stopLoss)}</span> immediately after entry.<br>
      <span style="color:var(--text-secondary); font-size:11px;">Engine will send exit signal via WebSocket when SL/Target/Exit trigger fires.</span>
    </div>
  `;

  overlay.style.display = 'flex';
  // Auto-dismiss after 60 seconds if user doesn't close
  clearTimeout(state._tradeModalTimer);
  state._tradeModalTimer = setTimeout(() => hideTradeEntryModal(), 60000);
}

function hideTradeEntryModal() {
  const overlay = document.getElementById('tradeEntryModalOverlay');
  if (overlay) overlay.style.display = 'none';
  clearTimeout(state._tradeModalTimer);
}
window.hideTradeEntryModal = hideTradeEntryModal;

// ─── AUDIO CHIME SYNTHESIZER (Web Audio API) ─────────────────
function playChime(milestone) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const freq = milestone === 50 ? 880 : (milestone === 30 ? 659.25 : 523.25);
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + 0.15);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
  } catch (e) {
    // Autoplay policy or unsupported
  }
}

// ─── MILESTONE TARGET MET HANDLERS ───────────────────────────
function handleWaterfallMilestoneReached(data) {
  if (!data) return;
  const m = data.milestone;
  const isCE = data.side === 'CE';

  // 1. Play subtle audio chime
  playChime(m);

  // 2. Update badges in active trade card
  if (state.activeTrade) {
    state.activeTrade.milestones = data.milestones || state.activeTrade.milestones;
    updateActiveTradeCard(state.activeTrade);
  }

  // 3. Show high-priority Toast
  const emoji = m === 50 ? '🏆' : (m === 30 ? '🚀' : '🎯');
  showToast(
    'buy',
    `${emoji} MILESTONE: +${m} PTS REACHED!`,
    `${data.strike} ${data.side} @ ₹${formatPrice(data.currentPrice)} (+${data.pointsRun} pts | +₹${formatPrice(data.pnl)}). Discretionary exit available!`
  );

  // 4. Show milestone popup modal
  showMilestoneModal(data);
}

function showMilestoneModal(data) {
  const overlay = document.getElementById('milestoneModalOverlay');
  const title = document.getElementById('milestoneModalTitle');
  const sub = document.getElementById('milestoneModalSubtitle');
  const icon = document.getElementById('milestoneModalIcon');
  const body = document.getElementById('milestoneModalBody');
  if (!overlay || !body) return;

  const m = data.milestone;
  const emoji = m === 50 ? '🏆' : (m === 30 ? '🚀' : '🎯');
  const isCE = data.side === 'CE';

  if (icon) icon.textContent = emoji;
  if (title) {
    title.textContent = `${emoji} +${m} PTS MILESTONE REACHED!`;
    title.style.color = m === 50 ? '#38bdf8' : (m === 30 ? '#a78bfa' : '#22c55e');
  }
  if (sub) {
    sub.textContent = `${data.strike} ${data.side} | Entry: ₹${formatPrice(data.entryPrice)} • Peak: ₹${formatPrice(data.currentPrice)} @ ${data.time || '—'} IST`;
  }

  let adviceText = '';
  if (m === 25) {
    adviceText = `<strong>🎯 Milestone 1 Secured (+₹${formatPrice(data.pnl)}):</strong> You can comfortably exit your position in Zerodha now, or move your Stop Loss to entry price (breakeven) to let the rest run risk-free.`;
  } else if (m === 30) {
    adviceText = `<strong>🚀 Milestone 2 Runner (+₹${formatPrice(data.pnl)}):</strong> Trade has established strong momentum (+30 pts). Excellent spot to lock in gains or trail your stop loss tightly behind recent 3m candle low.`;
  } else {
    adviceText = `<strong>🏆 Major Target Reached (+₹${formatPrice(data.pnl)}):</strong> Full +50 point runner target achieved! Institutional supply zones may be near. Recommended to take full or partial profits in Zerodha.`;
  }

  body.innerHTML = `
    <div class="milestone-callout">
      <div>
        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Gross Run Captured</div>
        <div class="milestone-callout-pts">+${data.pointsRun || m} pts</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">Profit / Lot (${data.lotSize || 75} qty)</div>
        <div class="milestone-callout-pnl">+₹${formatPrice(data.pnl || (m * (data.lotSize || 75)))}</div>
      </div>
    </div>

    <div class="trade-entry-grid" style="margin-bottom:10px;">
      <div class="te-item">
        <div class="te-label">Option Contract</div>
        <div class="te-value ${isCE ? 'green' : 'red'}" style="font-size:15px;">${data.strike} ${data.side}</div>
      </div>
      <div class="te-item">
        <div class="te-label">Entry Price</div>
        <div class="te-value" style="font-size:15px;">₹${formatPrice(data.entryPrice)}</div>
      </div>
      <div class="te-item">
        <div class="te-label">Current / Trigger Price</div>
        <div class="te-value ${isCE ? 'green' : 'red'}" style="font-size:15px;">₹${formatPrice(data.currentPrice)}</div>
      </div>
      <div class="te-item">
        <div class="te-label">Trigger Time</div>
        <div class="te-value" style="font-size:15px;">${data.time || '—'} IST</div>
      </div>
    </div>

    <div class="te-directive-box ${isCE ? '' : 'pe-trade'}" style="font-size:12px; line-height:1.5;">
      ${adviceText}
    </div>
  `;

  overlay.style.display = 'flex';
  state._currentMilestoneTrade = data;

  clearTimeout(state._milestoneModalTimer);
  state._milestoneModalTimer = setTimeout(() => hideMilestoneModal(), 45000);
}

function hideMilestoneModal() {
  const overlay = document.getElementById('milestoneModalOverlay');
  if (overlay) overlay.style.display = 'none';
  clearTimeout(state._milestoneModalTimer);
}
window.hideMilestoneModal = hideMilestoneModal;

async function manualExitTrade(reason = 'Manual Discretionary Exit (Target Reached)') {
  try {
    const res = await fetch('/api/live/manual-exit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast('buy', '🚪 Position Closed', `Exited ${data.trade.strike} @ ₹${formatPrice(data.trade.exitPrice)} (Net: ₹${formatPrice(data.trade.netPnL)})`);
      hideMilestoneModal();
    } else {
      showToast('neutral', '⚠️ No Active Trade', data.message || 'Position may have already closed.');
    }
  } catch (e) {
    showToast('neutral', '⚠️ Exit Request Failed', e.message);
  }
}
window.manualExitTrade = manualExitTrade;

function manualExitFromModal() {
  const data = state._currentMilestoneTrade;
  const reason = data ? `Discretionary Exit (+${data.milestone} pts Target Met)` : 'Manual Discretionary Exit';
  manualExitTrade(reason);
}
window.manualExitFromModal = manualExitFromModal;

function handleWaterfallTradeExit(data) {
  if (!data || !data.trade) return;
  const t = data.trade;
  const idx = state.waterfallTrades.findIndex(x => x.id === t.id || (x.entryTime === t.entryTime && x.strike === t.strike));
  if (idx >= 0) state.waterfallTrades[idx] = t;
  else state.waterfallTrades.push(t);

  const sIdx = state.allSignals.findIndex(x => x.id === t.id || (x.entryTime === t.entryTime && x.strike === t.strike));
  if (sIdx >= 0) state.allSignals[sIdx] = { ...t, status: 'EXECUTED' };
  else state.allSignals.push({ ...t, status: 'EXECUTED' });

  state.activeTrade = null;
  updateActiveTradeCard(null);

  const sign = t.netPnL >= 0 ? '+' : '';
  showToast(t.isWin ? 'buy' : 'sell', `🚪 Trade EXIT: ${t.side} ${t.strike}`, `Exited @ ₹${formatPrice(t.exitPrice)} | Net P&L: ${sign}₹${formatPrice(t.netPnL)} (${t.exitReason})`);

  updateSessionStats(data.sessionStats);
  updateDirectiveHub();
  renderWaterfallLiveTable();
}

function handleWaterfallSLUpdate(data) {
  if (!data || !data.trade) return;
  if (state.activeTrade) {
    state.activeTrade.stopLoss = data.newSL;
    updateActiveTradeCard(state.activeTrade);
  }
  updateDirectiveHub();
  showToast('info', `🛡️ Trailing SL Updated`, `${data.trade.strike} SL moved to ₹${formatPrice(data.newSL)}`);
}

function handleWaterfallTradeSkipped(data) {
  if (!data || !data.skipped) return;
  const s = data.skipped;
  state.waterfallSkips.push(s);
  state.lastSkipped = s;
  state.allSignals.push({ ...s, status: 'SKIPPED' });

  showToast('neutral', `🛡️ Pre-Entry Safety Skip`, `${s.side} ${s.strike}: ${s.skipReason}`);
  updateSessionStats(data.sessionStats);
  updateDirectiveHub();
  renderWaterfallLiveTable();
}

function handleLiveWaterfallReset(data) {
  state.waterfallTrades = [];
  state.waterfallSkips = [];
  state.allSignals = [];
  state.syncedBars = [];
  state.activeTrade = null;
  state.lastSkipped = null;
  state.pendingQueues = {};
  state.cockpit = { spot: null, ce: null, pe: null, lastSyncTime: null };

  // Reset tile displays
  ['spot', 'ce', 'pe'].forEach(role => {
    const elPrice = document.getElementById(`${role}ClosePrice`);
    const elTime = document.getElementById(`${role}SubTime`);
    const elDot = document.getElementById(`${role}SyncDot`);
    if (elPrice) elPrice.textContent = '—';
    if (elTime) elTime.textContent = '—';
    if (elDot) elDot.className = 'sync-dot';
  });

  updateActiveTradeCard(null);
  updateSessionStats(data?.summary || { totalTrades: 0, totalNetPnL: 0, winRate: 0, skippedTradesCount: 0 });
  updateDirectiveHub();
  renderWaterfallLiveTable();
  showToast('info', '🔄 Session Reset', 'Live waterfall session cleared.');
}

// ─── COCKPIT UI UPDATERS ────────────────────────────────────
function updateCockpitTile(role, bar) {
  if (!bar) return;
  const roleLower = role.toLowerCase();

  if (roleLower === 'spot') {
    const elName = document.getElementById('spotName');
    const elPrice = document.getElementById('spotClosePrice');
    const elTime = document.getElementById('spotSubTime');
    const elEMA9 = document.getElementById('spotEMA9');
    const elPP = document.getElementById('spotPP');
    const elEMA200 = document.getElementById('spotEMA200');
    const elDot = document.getElementById('spotSyncDot');

    if (elName) elName.textContent = bar.symbol || 'NIFTY 50';
    if (elPrice) elPrice.textContent = `₹${formatPrice(bar.close)}`;
    if (elTime) elTime.textContent = bar.timeOnly || formatTime(bar.time);
    if (elEMA9) elEMA9.textContent = bar.ema9 ? formatPrice(bar.ema9) : '—';
    if (elPP) elPP.textContent = bar.pp ? formatPrice(bar.pp) : '—';
    if (elEMA200) elEMA200.textContent = bar.ema200 ? formatPrice(bar.ema200) : '—';
    if (elDot) elDot.className = 'sync-dot synced';
  } else if (roleLower === 'ce') {
    const elName = document.getElementById('ceName');
    const elPrice = document.getElementById('ceClosePrice');
    const elTime = document.getElementById('ceSubTime');
    const elEMA9 = document.getElementById('ceEMA9');
    const elPP = document.getElementById('cePP');
    const elRMI = document.getElementById('ceRMI');
    const elStop = document.getElementById('ceStop');
    const elDot = document.getElementById('ceSyncDot');

    if (elName) elName.textContent = bar.symbol || 'NIFTY CE';
    if (elPrice) elPrice.textContent = `₹${formatPrice(bar.close)}`;
    if (elTime) elTime.textContent = bar.timeOnly || formatTime(bar.time);
    if (elEMA9) elEMA9.textContent = bar.ema9 ? formatPrice(bar.ema9) : '—';
    if (elPP) elPP.textContent = bar.pp ? formatPrice(bar.pp) : '—';
    if (elRMI) elRMI.textContent = bar.rsi != null ? Number(bar.rsi).toFixed(1) : (bar.rmiCenter != null ? Number(bar.rmiCenter).toFixed(1) : '—');
    if (elStop) elStop.textContent = bar.longStop ? formatPrice(bar.longStop) : (bar.shortStop ? formatPrice(bar.shortStop) : '—');
    if (elDot) elDot.className = 'sync-dot synced';
  } else if (roleLower === 'pe') {
    const elName = document.getElementById('peName');
    const elPrice = document.getElementById('peClosePrice');
    const elTime = document.getElementById('peSubTime');
    const elEMA9 = document.getElementById('peEMA9');
    const elPP = document.getElementById('pePP');
    const elRMI = document.getElementById('peRMI');
    const elStop = document.getElementById('peStop');
    const elDot = document.getElementById('peSyncDot');

    if (elName) elName.textContent = bar.symbol || 'NIFTY PE';
    if (elPrice) elPrice.textContent = `₹${formatPrice(bar.close)}`;
    if (elTime) elTime.textContent = bar.timeOnly || formatTime(bar.time);
    if (elEMA9) elEMA9.textContent = bar.ema9 ? formatPrice(bar.ema9) : '—';
    if (elPP) elPP.textContent = bar.pp ? formatPrice(bar.pp) : '—';
    if (elRMI) elRMI.textContent = bar.rsi != null ? Number(bar.rsi).toFixed(1) : (bar.rmiCenter != null ? Number(bar.rmiCenter).toFixed(1) : '—');
    if (elStop) elStop.textContent = bar.longStop ? formatPrice(bar.longStop) : (bar.shortStop ? formatPrice(bar.shortStop) : '—');
    if (elDot) elDot.className = 'sync-dot synced';
  }
}

function updateActiveTradeCard(trade) {
  state.activeTrade = trade;
  const tile = document.getElementById('tileActiveTrade');
  const badge = document.getElementById('posBadge');
  const statusEl = document.getElementById('activeTradeStatus');
  const pulse = document.getElementById('activePulse');
  const pnlVal = document.getElementById('activeTradePnLVal');
  const ptsVal = document.getElementById('activeTradePtsVal');
  const entryEl = document.getElementById('wfEntryPrice');
  const slEl = document.getElementById('wfStopLoss');
  const barsEl = document.getElementById('wfBarsHeld');
  const setupEl = document.getElementById('wfSetupName');

  if (!tile) return;

  if (trade) {
    const isCE = trade.side === 'CE';
    tile.className = `cockpit-tile active-trade-tile ${isCE ? 'in-trade' : 'in-trade-pe'}`;
    if (badge) {
      badge.textContent = `LONG ${trade.side}`;
      badge.className = `role-badge ${isCE ? 'ce' : 'pe'}`;
    }
    if (statusEl) statusEl.textContent = `${trade.side} ${trade.strike}`;
    if (pulse) pulse.className = `active-pulse ${isCE ? 'pulse-green' : 'pulse-red'}`;

    // Get current option close price from cockpit
    const currentOptBar = isCE ? state.cockpit.ce : state.cockpit.pe;
    const currentPrice = currentOptBar?.close || trade.entryPrice;
    const pts = currentPrice - trade.entryPrice;
    const pnl = pts * (trade.lotSize || 75);

    if (pnlVal) {
      pnlVal.textContent = `${pnl >= 0 ? '+' : ''}₹${formatPrice(pnl)}`;
      pnlVal.className = `active-pnl-val ${pnl >= 0 ? 'green' : 'red'}`;
    }
    if (ptsVal) {
      ptsVal.textContent = `(${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts)`;
    }
    if (entryEl) entryEl.textContent = `₹${formatPrice(trade.entryPrice)}`;
    if (slEl) slEl.textContent = trade.stopLoss ? `₹${formatPrice(trade.stopLoss)}` : '—';
    if (barsEl) barsEl.textContent = trade.barsHeld || 0;
    if (setupEl) setupEl.textContent = trade.reasonShort || trade.setupName || '—';
    updateActiveTradeMilestoneBadges(trade.milestones);
  } else {
    tile.className = 'cockpit-tile active-trade-tile';
    if (badge) {
      badge.textContent = 'POSITION';
      badge.className = 'role-badge pos';
    }
    if (statusEl) statusEl.textContent = 'FLAT / WAITING';
    if (pulse) pulse.className = 'active-pulse';
    if (pnlVal) {
      pnlVal.textContent = '—';
      pnlVal.className = 'active-pnl-val';
    }
    if (ptsVal) ptsVal.textContent = '—';
    if (entryEl) entryEl.textContent = '—';
    if (slEl) slEl.textContent = '—';
    if (barsEl) barsEl.textContent = '0';
    if (setupEl) setupEl.textContent = '—';
    updateActiveTradeMilestoneBadges(null);
  }
}

function updateActiveTradeMilestoneBadges(milestones) {
  const b25 = document.getElementById('badgeM25');
  const b30 = document.getElementById('badgeM30');
  const b50 = document.getElementById('badgeM50');
  const t25 = document.getElementById('txtM25');
  const t30 = document.getElementById('txtM30');
  const t50 = document.getElementById('txtM50');
  const btnExit = document.getElementById('btnActiveManualExit');

  const m25Hit = !!milestones?.pts25?.reached;
  const m30Hit = !!milestones?.pts30?.reached;
  const m50Hit = !!milestones?.pts50?.reached;

  if (b25) {
    b25.className = `milestone-badge ${m25Hit ? 'hit' : ''}`;
    if (t25) t25.textContent = m25Hit ? '✅' : '⏳';
  }
  if (b30) {
    b30.className = `milestone-badge ${m30Hit ? 'hit' : ''}`;
    if (t30) t30.textContent = m30Hit ? '✅' : '⏳';
  }
  if (b50) {
    b50.className = `milestone-badge ${m50Hit ? 'hit' : ''}`;
    if (t50) t50.textContent = m50Hit ? '✅' : '⏳';
  }
  if (btnExit) {
    btnExit.style.display = (m25Hit || m30Hit || m50Hit) ? 'inline-flex' : 'none';
  }
}

function updateSessionStats(stats, dayLabel) {
  if (!stats) return;
  state.sessionStats = stats;

  const netPnL = stats.totalNetPnL || 0;
  const grossPnL = stats.totalGrossPnL != null ? stats.totalGrossPnL : (stats.totalGrossPoints ? stats.totalGrossPoints * 75 : netPnL);
  const brokerage = stats.totalCommission || 0;

  // 1. Net P&L Card
  const pnlEl = document.getElementById('valNetPnL');
  const cardNet = document.getElementById('cardNetPnL');
  const grossEl = document.getElementById('valGrossPnL');
  const brokEl = document.getElementById('valBrokerage');

  if (pnlEl) {
    pnlEl.textContent = `${netPnL >= 0 ? '+' : ''}₹${formatPrice(netPnL)}`;
    pnlEl.className = `kpi-value ${netPnL >= 0 ? 'c-green' : 'c-red'}`;
  }
  if (cardNet) {
    cardNet.className = `kpi-card ${netPnL >= 0 ? 'highlight-green' : 'highlight-red'}`;
  }
  if (grossEl) grossEl.textContent = `${grossPnL >= 0 ? '+' : ''}₹${formatPrice(grossPnL)}`;
  if (brokEl) brokEl.textContent = `₹${brokerage.toLocaleString('en-IN')}`;

  // Runner Milestone Cards (25, 30, 50 pts reach)
  const execTrades = state.waterfallTrades || [];
  const r25Count = stats.runner25Trades !== undefined ? stats.runner25Trades : execTrades.filter(t => t.is25pointsReached || (t.maxPointsRun >= 25.0) || t.milestones?.pts25?.reached).length;
  const r30Count = stats.runner30Trades !== undefined ? stats.runner30Trades : execTrades.filter(t => t.is30pointsReached || (t.maxPointsRun >= 30.0) || t.milestones?.pts30?.reached).length;
  const r50Count = stats.runner50Trades !== undefined ? stats.runner50Trades : execTrades.filter(t => t.is50pointsReached || (t.maxPointsRun >= 50.0) || t.milestones?.pts50?.reached).length;
  const totTrades = stats.totalTrades || execTrades.length || 1;
  const r25Pct = stats.runner25Pct !== undefined ? stats.runner25Pct : ((r25Count / totTrades) * 100).toFixed(1);
  const r30Pct = stats.runner30Pct !== undefined ? stats.runner30Pct : ((r30Count / totTrades) * 100).toFixed(1);
  const r50Pct = stats.runner50Pct !== undefined ? stats.runner50Pct : ((r50Count / totTrades) * 100).toFixed(1);

  const lot = 75;
  const r25Profit = stats.runner25Profit !== undefined ? stats.runner25Profit : (r25Count * 25.0 * lot);
  const r30Profit = stats.runner30Profit !== undefined ? stats.runner30Profit : (r30Count * 30.0 * lot);
  const r50Profit = stats.runner50Profit !== undefined ? stats.runner50Profit : (r50Count * 50.0 * lot);

  const el25Prof = document.getElementById('val25PtsProfit');
  if (el25Prof) el25Prof.textContent = `+${fmtINR(r25Profit)}`;
  const el25 = document.getElementById('val25PtsCount');
  if (el25) el25.textContent = `${r25Count} Trades`;
  const el25Pct = document.getElementById('val25PtsPct');
  if (el25Pct) el25Pct.textContent = `${r25Pct}%`;

  const el30Prof = document.getElementById('val30PtsProfit');
  if (el30Prof) el30Prof.textContent = `+${fmtINR(r30Profit)}`;
  const el30 = document.getElementById('val30PtsCount');
  if (el30) el30.textContent = `${r30Count} Trades`;
  const el30Pct = document.getElementById('val30PtsPct');
  if (el30Pct) el30Pct.textContent = `${r30Pct}%`;

  const el50Prof = document.getElementById('val50PtsProfit');
  if (el50Prof) el50Prof.textContent = `+${fmtINR(r50Profit)}`;
  const el50 = document.getElementById('val50PtsCount');
  if (el50) el50.textContent = `${r50Count} Trades`;
  const el50Pct = document.getElementById('val50PtsPct');
  if (el50Pct) el50Pct.textContent = `${r50Pct}%`;

  // 2. Win Rate Card
  const winRateEl = document.getElementById('valWinRate');
  const winsEl = document.getElementById('valWins');
  const lossEl = document.getElementById('valLosses');
  const totalTradesEl = document.getElementById('valTotalTrades');

  if (winRateEl) winRateEl.textContent = `${stats.winRate || 0}%`;
  if (winsEl) winsEl.textContent = `${stats.winTrades || 0} Wins`;
  if (lossEl) lossEl.textContent = `${stats.lossTrades || 0} Losses`;
  if (totalTradesEl) totalTradesEl.textContent = stats.totalTrades || 0;

  // 3. Profit Factor Card
  const pfEl = document.getElementById('valProfitFactor');
  const gProfEl = document.getElementById('valGrossProfit');
  const gLossEl = document.getElementById('valGrossLoss');

  if (pfEl) pfEl.textContent = (stats.profitFactor || 0).toFixed(2);
  if (gProfEl) gProfEl.textContent = `₹${Math.round(stats.grossProfit || 0).toLocaleString('en-IN')}`;
  if (gLossEl) gLossEl.textContent = `₹${Math.round(stats.grossLoss || 0).toLocaleString('en-IN')}`;

  // 4. Avg Win / Avg Loss Card
  const payoffEl = document.getElementById('valPayoffRatio');
  const avgWinEl = document.getElementById('valAvgWin');
  const avgLossEl = document.getElementById('valAvgLoss');

  if (payoffEl) payoffEl.textContent = `${(stats.riskReward || 0).toFixed(2)}x`;
  if (avgWinEl) avgWinEl.textContent = `₹${Math.round(stats.avgWin || 0).toLocaleString('en-IN')}`;
  if (avgLossEl) avgLossEl.textContent = `₹${Math.round(stats.avgLoss || 0).toLocaleString('en-IN')}`;

  // 5. Max Drawdown Card
  const maxDDEl = document.getElementById('valMaxDrawdown');
  if (maxDDEl) {
    const dd = stats.maxDrawdown || 0;
    maxDDEl.textContent = `-₹${Math.abs(dd).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // 6. Filtered / Skipped Card
  const skipsEl = document.getElementById('valSkippedCount');
  if (skipsEl) {
    skipsEl.textContent = `${stats.skippedTradesCount || 0} Signals`;
  }
}

// ─── LIVE ACTION DIRECTIVE COMMAND CENTER ───────────────────
function updateDirectiveHub() {
  const card = document.getElementById('directiveCard');
  const badge = document.getElementById('dirBadge');
  const title = document.getElementById('dirTitle');
  const timeEl = document.getElementById('dirTime');
  const actionBox = document.getElementById('actionInstructionBox');
  const actionIcon = document.getElementById('actionIcon');
  const actionMain = document.getElementById('actionMainLine');
  const actionSub = document.getElementById('actionSubLine');

  if (!card) return;

  const sp = state.cockpit?.spot;
  const ce = state.cockpit?.ce;
  const pe = state.cockpit?.pe;
  const syncTime = state.cockpit?.lastSyncTime || sp?.timeOnly || sp?.time;

  // 1. Sync Time Header
  if (timeEl) {
    const tStr = syncTime ? (typeof syncTime === 'string' && syncTime.length <= 8 ? syncTime : formatTime(syncTime)) : '—';
    timeEl.textContent = `Sync: ${tStr} IST`;
  }

  // 2. SPOT Checklist Tile
  const chkSpotSymbol = document.getElementById('chkSpotSymbol');
  const chkSpotPrice = document.getElementById('chkSpotPrice');
  const chkSpotDot = document.getElementById('chkSpotDot');
  const chkSpotBias = document.getElementById('chkSpotBias');
  const chkSpotRule = document.getElementById('chkSpotRule');

  if (chkSpotSymbol) chkSpotSymbol.textContent = sp?.symbol || 'NIFTY 50';
  if (chkSpotPrice) chkSpotPrice.textContent = sp?.close != null ? `₹${formatPrice(sp.close)}` : '—';
  if (chkSpotDot) chkSpotDot.className = `check-status-dot ${sp ? 'synced' : ''}`;
  if (chkSpotRule) {
    chkSpotRule.innerHTML = sp
      ? `9 EMA: <b>₹${formatPrice(sp.ema9)}</b> • CPR: <b>₹${formatPrice(sp.pp)}</b> • 200 EMA: <b>₹${formatPrice(sp.ema200)}</b>`
      : `9 EMA: <b>—</b> • CPR: <b>—</b>`;
  }
  if (chkSpotBias) {
    if (!sp) {
      chkSpotBias.className = 'check-bias-pill wait';
      chkSpotBias.textContent = 'Awaiting Sync';
    } else if (sp.close > sp.ema9 && sp.close > (sp.pp || 0)) {
      chkSpotBias.className = 'check-bias-pill pass';
      chkSpotBias.textContent = 'Bullish (> 9 & PP)';
    } else if (sp.close < sp.ema9 && sp.close < (sp.pp || 999999)) {
      chkSpotBias.className = 'check-bias-pill fail';
      chkSpotBias.textContent = 'Bearish (< 9 & PP)';
    } else {
      chkSpotBias.className = 'check-bias-pill wait';
      chkSpotBias.textContent = 'Mixed / Rangebound';
    }
  }

  // 3. CE Checklist Tile
  const chkCESymbol = document.getElementById('chkCESymbol');
  const chkCEPrice = document.getElementById('chkCEPrice');
  const chkCEDot = document.getElementById('chkCEDot');
  const chkCEBias = document.getElementById('chkCEBias');
  const chkCERule = document.getElementById('chkCERule');

  if (chkCESymbol) chkCESymbol.textContent = ce?.symbol || 'Waiting CE...';
  if (chkCEPrice) chkCEPrice.textContent = ce?.close != null ? `₹${formatPrice(ce.close)}` : '—';
  if (chkCEDot) chkCEDot.className = `check-status-dot ${ce ? 'synced' : ''}`;
  if (chkCEBias && chkCERule) {
    if (!ce) {
      chkCEBias.className = 'check-bias-pill wait';
      chkCEBias.textContent = 'Awaiting CE Bar';
      chkCERule.innerHTML = `Needs 3m close <b id="chkCETarget">> 9 EMA</b> for Buy`;
    } else if (ce.ema9 != null) {
      if (ce.close > ce.ema9) {
        chkCEBias.className = 'check-bias-pill pass';
        chkCEBias.textContent = 'Above 9 EMA (Buy Ready)';
        chkCERule.innerHTML = `Satisfied @ <b>₹${formatPrice(ce.close)}</b> (> 9 EMA ₹${formatPrice(ce.ema9)})`;
      } else {
        chkCEBias.className = 'check-bias-pill wait';
        chkCEBias.textContent = 'Below 9 EMA';
        chkCERule.innerHTML = `Needs 3m close <b>> ₹${formatPrice(ce.ema9)}</b> (LTP ₹${formatPrice(ce.close)})`;
      }
    }
  }

  // 4. PE Checklist Tile
  const chkPESymbol = document.getElementById('chkPESymbol');
  const chkPEPrice = document.getElementById('chkPEPrice');
  const chkPEDot = document.getElementById('chkPEDot');
  const chkPEBias = document.getElementById('chkPEBias');
  const chkPERule = document.getElementById('chkPERule');

  if (chkPESymbol) chkPESymbol.textContent = pe?.symbol || 'Waiting PE...';
  if (chkPEPrice) chkPEPrice.textContent = pe?.close != null ? `₹${formatPrice(pe.close)}` : '—';
  if (chkPEDot) chkPEDot.className = `check-status-dot ${pe ? 'synced' : ''}`;
  if (chkPEBias && chkPERule) {
    if (!pe) {
      chkPEBias.className = 'check-bias-pill wait';
      chkPEBias.textContent = 'Awaiting PE Bar';
      chkPERule.innerHTML = `Needs 3m close <b id="chkPETarget">> 9 EMA</b> for Buy`;
    } else if (pe.ema9 != null) {
      if (pe.close > pe.ema9) {
        chkPEBias.className = 'check-bias-pill pass';
        chkPEBias.textContent = 'Above 9 EMA (Buy Ready)';
        chkPERule.innerHTML = `Satisfied @ <b>₹${formatPrice(pe.close)}</b> (> 9 EMA ₹${formatPrice(pe.ema9)})`;
      } else {
        chkPEBias.className = 'check-bias-pill wait';
        chkPEBias.textContent = 'Below 9 EMA';
        chkPERule.innerHTML = `Needs 3m close <b>> ₹${formatPrice(pe.ema9)}</b> (LTP ₹${formatPrice(pe.close)})`;
      }
    }
  }

  // 5. Action Directive Card & Zerodha Instruction Box
  const activeTrade = state.activeTrade;
  if (activeTrade) {
    const isCE = activeTrade.side === 'CE';
    const optBar = isCE ? ce : pe;
    const ltp = optBar?.close || activeTrade.entryPrice;
    const pts = ltp - activeTrade.entryPrice;
    const pnl = pts * (activeTrade.lotSize || 75);
    const sign = pts >= 0 ? '+' : '';

    card.className = `directive-card ${isCE ? 'buy-action' : 'sell-action'}`;
    if (badge) {
      badge.className = `directive-badge ${isCE ? 'buy' : 'sell'}`;
      badge.textContent = `🟢 LIVE ${activeTrade.side} LONG POSITION`;
    }
    if (title) {
      title.textContent = `Active Order: ${activeTrade.side} ${activeTrade.strike} | Current LTP: ₹${formatPrice(ltp)} (${sign}${pts.toFixed(1)} pts / ${sign}₹${formatPrice(pnl)})`;
    }
    if (actionBox) {
      actionBox.className = `action-instruction-box ${isCE ? 'buy' : 'sell'}`;
    }
    if (actionIcon) actionIcon.textContent = '🎯';
    if (actionMain) {
      actionMain.textContent = `ZERODHA ORDER: LONG ${activeTrade.side} ${activeTrade.strike} @ ₹${formatPrice(activeTrade.entryPrice)}`;
    }
    if (actionSub) {
      actionSub.innerHTML = `<strong>ACTION REQUIRED:</strong> In Zerodha, buy <b>1 lot (75 qty)</b> of <b>${activeTrade.strike} ${activeTrade.side}</b>. Set Initial Stoploss-Limit @ <b style="color:var(--red);">₹${formatPrice(activeTrade.stopLoss)}</b>. Initial Profit Target: <b style="color:var(--green);">₹${formatPrice(activeTrade.entryPrice + 15)} (+15 pts)</b>. Setup: <em>${activeTrade.reasonShort || activeTrade.setupName}</em>.`;
    }
  } else if (state.lastSkipped) {
    const sk = state.lastSkipped;
    card.className = 'directive-card skip-action';
    if (badge) {
      badge.className = 'directive-badge skip';
      badge.textContent = '🛡️ TRADE FILTERED BY SAFETY ENGINE';
    }
    if (title) {
      title.textContent = `Pre-Entry Capital Protection Activated (${sk.time || 'Last Bar'})`;
    }
    if (actionBox) {
      actionBox.className = 'action-instruction-box skip';
    }
    if (actionIcon) actionIcon.textContent = '🛡️';
    if (actionMain) {
      actionMain.textContent = `DO NOT ENTER — SIGNAL BLOCKED BY SAFETY RULE`;
    }
    if (actionSub) {
      actionSub.innerHTML = `<strong>FILTER REASON:</strong> <b style="color:var(--amber);">${sk.skipReason}</b> on attempted <b>${sk.side} ${sk.strike}</b>. Capital preserved! Do not place any order in Zerodha. Awaiting next valid confluence bar.`;
    }
  } else {
    card.className = 'directive-card';
    if (badge) {
      badge.className = 'directive-badge flat';
      badge.textContent = '⚪ FLAT / SCANNING';
    }
    if (title) {
      title.textContent = 'Market State: Scanning Confluence Setup (Spot + CE + PE 3m Bars)';
    }
    if (actionBox) {
      actionBox.className = 'action-instruction-box flat';
    }
    if (actionIcon) actionIcon.textContent = '🛡️';
    if (actionMain) {
      actionMain.textContent = 'CAPITAL PROTECTED — AWAITING CONFLUENCE ENTRY';
    }
    if (actionSub) {
      actionSub.textContent = 'No entry condition satisfied. Do not place any trade in Zerodha. Live engine evaluates 3m synchronized candle closes.';
    }
  }
}

// ─── WATERFALL LIVE TABLE & FILTERS (Screenshot 3 Parity) ───
function setupWaterfallToolbar() {
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterType = btn.dataset.filter;
      const val = btn.dataset.val;

      // Deactivate siblings in same group
      document.querySelectorAll(`.filter-btn[data-filter="${filterType}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (filterType === 'side') state.sideFilter = val;
      if (filterType === 'setup') state.setupFilter = val;
      if (filterType === 'status') state.statusFilter = val;
      if (filterType === 'res') state.resultFilter = val;

      renderWaterfallLiveTable();
    });
  });

  const searchInput = document.getElementById('inpSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderWaterfallLiveTable();
    });
  }

  // Bind reasoning modal close listeners
  document.getElementById('reasoningClose')?.addEventListener('click', hideReasoningModal);
  document.getElementById('btnReasoningClose')?.addEventListener('click', hideReasoningModal);
  document.getElementById('reasoningModalOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideReasoningModal();
  });
}

function renderWaterfallLiveTable() {
  const tbody = document.getElementById('tradeTableBody');
  const countBadge = document.getElementById('tradeLogCount');
  if (!tbody) return;

  // 1. Build unified signal list
  let list = [];

  // If live trade is active, inject it as the topmost LIVE row
  if (state.activeTrade) {
    const isCE = state.activeTrade.side === 'CE';
    const optBar = isCE ? state.cockpit?.ce : state.cockpit?.pe;
    const ltp = optBar?.close || state.activeTrade.entryPrice;
    const pts = ltp - state.activeTrade.entryPrice;
    const pnl = pts * (state.activeTrade.lotSize || 75);

    list.push({
      ...state.activeTrade,
      status: 'LIVE',
      currentPrice: ltp,
      grossPoints: pts,
      netPnL: pnl,
      time: state.activeTrade.entryTime,
      isLive: true,
    });
  }

  // If server sent allSignals, use it
  if (state.allSignals && state.allSignals.length > 0) {
    state.allSignals.forEach(s => {
      // Don't duplicate active trade
      if (state.activeTrade && (s.id === state.activeTrade.id || (s.entryTime === state.activeTrade.entryTime && s.strike === state.activeTrade.strike && !s.exitTime))) {
        return;
      }
      list.push(s);
    });
  } else {
    // Merge executed & skipped
    (state.waterfallTrades || []).forEach(t => {
      if (state.activeTrade && (t.id === state.activeTrade.id || (t.entryTime === state.activeTrade.entryTime && t.strike === state.activeTrade.strike && !t.exitTime))) {
        return;
      }
      list.push({ ...t, status: 'EXECUTED' });
    });
    (state.waterfallSkips || []).forEach(s => {
      list.push({ ...s, status: 'SKIPPED' });
    });
  }

  // Include 3-minute candle evaluation records
  (state.syncedBars || []).forEach(b => {
    // If a trade or skip occurred at this exact candle bar, the trade/skip already represents this bar
    const hasTradeOrSkip = list.some(item => {
      const itemTime = item.entryTime || item.time || '';
      return itemTime.includes(b.time);
    });
    if (!hasTradeOrSkip) {
      list.push({
        id: b.id,
        isCandleBar: true,
        status: b.status || 'SCANNING',
        time: b.time,
        timeFull: b.timeFull,
        day: b.day,
        dayLabel: b.dayLabel,
        side: '3M',
        strike: b.spot?.symbol || 'NIFTY 50',
        entryTime: b.timeFull,
        entryPrice: b.spot?.close || null,
        cePrice: b.ce?.close || null,
        pePrice: b.pe?.close || null,
        exitPrice: null,
        exitTime: null,
        exitReason: b.decision || 'Scanning / Capital Protected',
        grossPoints: null,
        netPnL: null,
        duration: '3m Bar',
        reasoning: b.decision,
        spot: b.spot,
        ce: b.ce,
        pe: b.pe
      });
    }
  });

  // Sort newest first
  list.sort((a, b) => {
    if (a.status === 'LIVE') return -1;
    if (b.status === 'LIVE') return 1;
    const tA = a.entryTime || a.time || '';
    const tB = b.entryTime || b.time || '';
    return tA > tB ? -1 : 1;
  });

  // 2. Multi-dimensional filtering (Screenshot 3 Parity)
  let filtered = list;

  // Side filter
  if (state.sideFilter && state.sideFilter !== 'ALL') {
    filtered = filtered.filter(x => x.side === state.sideFilter);
  }

  // Setup filter
  if (state.setupFilter && state.setupFilter !== 'ALL') {
    filtered = filtered.filter(x => {
      const s = `${x.setupName || ''} ${x.setupAttempted || ''} ${x.reasonShort || ''}`.toUpperCase();
      if (state.setupFilter === 'CONFLUENCE') return s.includes('CONFLUENCE') || s.includes('INFLECTION');
      if (state.setupFilter === 'CE_BOUNCE') return s.includes('CE BOUNCE') || s.includes('CE LINE');
      if (state.setupFilter === 'RMI_BOUNCE') return s.includes('RMI');
      if (state.setupFilter === 'BREAKOUT') return s.includes('BREAKOUT') || s.includes('HAMMER');
      if (state.setupFilter === 'EMA') return s.includes('9 EMA') || s.includes('EMA');
      return true;
    });
  }

  // Status filter
  if (state.statusFilter && state.statusFilter !== 'ALL') {
    if (state.statusFilter === 'EXECUTED') {
      filtered = filtered.filter(x => x.status === 'EXECUTED' || x.status === 'LIVE');
    } else if (state.statusFilter === 'SKIPPED') {
      filtered = filtered.filter(x => x.status === 'SKIPPED');
    } else if (state.statusFilter === 'SCANNING') {
      filtered = filtered.filter(x => x.isCandleBar || x.status === 'SCANNING');
    }
  }

  // Result filter
  if (state.resultFilter && state.resultFilter !== 'ALL') {
    if (state.resultFilter === 'WIN') filtered = filtered.filter(x => x.isWin);
    if (state.resultFilter === 'LOSS') filtered = filtered.filter(x => x.status === 'EXECUTED' && !x.isWin);
  }

  // Search filter
  if (state.searchQuery) {
    const q = state.searchQuery;
    filtered = filtered.filter(x => {
      const str = `${x.strike || ''} ${x.side || ''} ${x.setupName || ''} ${x.setupAttempted || ''} ${x.skipReason || ''} ${x.exitReason || ''} ${x.time || ''} ${x.entryTime || ''}`.toLowerCase();
      return str.includes(q);
    });
  }

  state.renderedWaterfallList = filtered;

  // Update count badge
  const totalExec = list.filter(x => x.status === 'EXECUTED' || x.status === 'LIVE').length;
  const totalSkip = list.filter(x => x.status === 'SKIPPED').length;
  const totalCandles = list.filter(x => x.isCandleBar || x.status === 'SCANNING').length;
  if (countBadge) {
    countBadge.textContent = `${filtered.length} OF ${list.length} RECORDS (${totalExec} EXECUTED • ${totalSkip} SKIPPED • ${totalCandles} MONITORED 3M BARS)`;
  }

  if (filtered.length === 0) {
    let msg = '🟢 3-Chart synchronization active (Spot, CE, PE). Awaiting next 3-minute candle close...';
    if (state.statusFilter === 'EXECUTED') msg = 'No executed trades recorded yet today.';
    if (state.statusFilter === 'SKIPPED') msg = 'No safety filter rejections recorded yet today.';
    if (state.statusFilter === 'SCANNING') msg = 'No monitored 3m candle bars recorded yet.';
    if (state.searchQuery) msg = `No records matching "${state.searchQuery}".`;

    tbody.innerHTML = `<tr class="log-empty-row"><td colspan="17" style="text-align:center; padding:30px; color:var(--text-muted);">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((item, idx) => {
    const isCE = item.side === 'CE';
    const num = idx + 1;
    const isLive = item.status === 'LIVE';
    const isExec = item.status === 'EXECUTED';
    const isSkip = item.status === 'SKIPPED';
    const isCandle = item.isCandleBar || item.status === 'SCANNING';

    if (isCandle) {
      return `
        <tr class="row-monitored" onclick="window.openReasoningModal(${idx})" title="Click row to view 3m candle confluence audit" style="cursor:pointer;">
          <td style="color:var(--text-muted);">${num}</td>
          <td><span class="badge-status-monitored">🔍 Monitored</span></td>
          <td class="mono" style="font-size:11px;">Today ${item.time || '—'} IST</td>
          <td><span class="badge-side-spot" style="background:rgba(56,189,248,0.12); color:#38bdf8; font-weight:700; font-size:10px; padding:2px 6px; border-radius:4px;">3M BAR</span></td>
          <td>
            <strong>${item.spot?.symbol || 'NIFTY 50'}</strong>
            <span class="setup-tag" style="background:rgba(56,189,248,0.1);color:#38bdf8;">Confluence Scan</span>
          </td>
          <td class="mono" style="font-size:11px;">${item.time || '—'} IST</td>
          <td class="mono" style="font-weight:600;">₹${formatPrice(item.entryPrice)}</td>
          <td class="mono" style="font-size:11px; color:var(--accent-green); font-weight:600;">CE: ₹${formatPrice(item.cePrice)}</td>
          <td class="mono" style="font-size:11px; color:var(--accent-red); font-weight:600;">PE: ₹${formatPrice(item.pePrice)}</td>
          <td style="font-size:11px; color:var(--text-muted); max-width:280px;" title="${(item.exitReason || '').replace(/"/g, '&quot;')}">
            ${item.exitReason}
          </td>
          <td class="mono" style="color:var(--text-muted);">—</td>
          <td class="mono" style="color:var(--text-muted); text-align:center;">—</td>
          <td class="mono" style="color:var(--text-muted); text-align:center;">—</td>
          <td class="mono" style="color:var(--text-muted); text-align:center;">—</td>
          <td class="mono" style="color:var(--text-muted);">—</td>
          <td style="font-size:11px; color:var(--text-secondary);">3m Bar</td>
          <td>
            <button class="reason-pill" onclick="event.stopPropagation(); window.openReasoningModal(${idx})">
              Details 🔍
            </button>
          </td>
        </tr>
      `;
    }

    const timeStr = isExec
      ? `${item.entryTime || '—'} → ${item.exitTime || '—'}`
      : (item.entryTime || item.time || '—');

    let statusBadge = '';
    let rowClass = '';

    if (isLive) {
      statusBadge = '<span class="badge-status badge-status-live">🚨 Live</span>';
      rowClass = 'row-live';
    } else if (isExec) {
      statusBadge = item.isWin
        ? '<span class="badge-status badge-status-executed">✓ Executed</span>'
        : '<span class="badge-status badge-status-executed" style="border-color:rgba(239,68,68,0.4);color:var(--red);">✗ Loss</span>';
    } else if (isSkip) {
      statusBadge = '<span class="badge-status badge-status-skipped">🚫 Skipped</span>';
      rowClass = 'row-skipped';
    }

    const sideBadge = item.side
      ? `<span class="${isCE ? 'badge-side-ce' : 'badge-side-pe'}">${item.side}</span>`
      : '—';

    const strikeAndSetup = `
      <strong>${item.strike || 'NIFTY'}</strong>
      <span class="setup-tag">${item.setupName || item.setupAttempted || 'Confluence'}</span>
    `;

    const entryPrice = item.entryPrice != null || item.price != null
      ? `₹${formatPrice(item.entryPrice || item.price)}`
      : '—';

    let exitTarget = '—';
    if (isLive) {
      exitTarget = `<span style="color:var(--red);font-weight:600;">SL ₹${formatPrice(item.stopLoss)}</span>`;
    } else if (item.exitPrice != null) {
      exitTarget = `₹${formatPrice(item.exitPrice)}`;
    }

    let reasonCol = '—';
    if (isSkip) {
      reasonCol = `<span style="color:var(--amber);font-size:11px;font-weight:600;">🛡️ ${item.skipReason || 'Pre-entry safety filter'}</span>`;
    } else if (isLive) {
      reasonCol = `<span style="color:var(--green);font-size:11px;font-weight:600;">🎯 Open Position (Trailing SL)</span>`;
    } else if (item.exitReason) {
      reasonCol = `<span style="color:var(--text-secondary);font-size:11px;">${item.exitReason}</span>`;
    }

    let ptsCol = '—';
    let pnlCol = '—';
    if (item.grossPoints != null) {
      const color = item.grossPoints >= 0 ? 'var(--green)' : 'var(--red)';
      ptsCol = `<span style="color:${color};font-weight:700;">${item.grossPoints >= 0 ? '+' : ''}${formatPrice(item.grossPoints)}</span>`;
    }
    if (item.netPnL != null) {
      const color = item.netPnL >= 0 ? 'var(--green)' : 'var(--red)';
      pnlCol = `<span style="color:${color};font-weight:800;">${item.netPnL >= 0 ? '+' : ''}₹${formatPrice(item.netPnL)}</span>`;
    }

    let durationCol = '—';
    if (item.barsHeld != null) {
      durationCol = `${item.barsHeld} bars (${item.barsHeld * 3}m)`;
    } else if (isLive) {
      durationCol = `${item.barsHeld || 0} bars held`;
    }

    const maxPts = item.maxPointsRun !== undefined ? item.maxPointsRun : (item.grossPoints !== null ? item.grossPoints : 0);
    const hit25 = item.is25pointsReached || (item.milestones?.pts25?.reached) || (maxPts >= 25.0);
    const hit30 = item.is30pointsReached || (item.milestones?.pts30?.reached) || (maxPts >= 30.0);
    const hit50 = item.is50pointsReached || (item.milestones?.pts50?.reached) || (maxPts >= 50.0);

    const m25Cell = (isExec || isLive)
      ? (hit25
          ? `<span class="badge-win" style="display:inline-flex; align-items:center; gap:3px; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;" title="Peak: +${maxPts} pts">✅ <span style="font-size:10px; opacity:0.85;">(+${maxPts})</span></span>`
          : `<span style="display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted);" title="Peak: +${maxPts} pts"><span style="color:#ef4444; opacity:0.8;">❌</span> <span style="font-size:10px;">(+${maxPts})</span></span>`
        )
      : '—';

    const m30Cell = (isExec || isLive)
      ? (hit30
          ? `<span class="badge-win" style="display:inline-flex; align-items:center; gap:3px; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;" title="Peak: +${maxPts} pts">✅ <span style="font-size:10px; opacity:0.85;">(+${maxPts})</span></span>`
          : `<span style="display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted);" title="Peak: +${maxPts} pts"><span style="color:#ef4444; opacity:0.8;">❌</span> <span style="font-size:10px;">(+${maxPts})</span></span>`
        )
      : '—';

    const m50Cell = (isExec || isLive)
      ? (hit50
          ? `<span class="badge-win" style="display:inline-flex; align-items:center; gap:3px; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;" title="Peak: +${maxPts} pts">✅ <span style="font-size:10px; opacity:0.85;">(+${maxPts})</span></span>`
          : `<span style="display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted);" title="Peak: +${maxPts} pts"><span style="color:#ef4444; opacity:0.8;">❌</span> <span style="font-size:10px;">(+${maxPts})</span></span>`
        )
      : '—';

    const reasonBtn = `
      <button class="reason-pill ${isSkip ? 'skipped' : ''}" onclick="event.stopPropagation(); window.openReasoningModal(${idx})">
        Details 🔍
      </button>
    `;

    return `
      <tr class="${rowClass}" onclick="window.openReasoningModal(${idx})" title="Click row to view strategy reasoning & execution notes" style="cursor:pointer;">
        <td style="color:var(--text-muted);">${num}</td>
        <td>${statusBadge}</td>
        <td class="mono" style="font-size:11px;">Today ${item.entryTime || item.time || '—'}</td>
        <td>${sideBadge}</td>
        <td>${strikeAndSetup}</td>
        <td class="mono">${item.entryTime || item.time || '—'}</td>
        <td class="mono">${entryPrice}</td>
        <td class="mono">${item.exitTime || '—'}</td>
        <td class="mono">${exitTarget}</td>
        <td>${reasonCol}</td>
        <td class="mono">${ptsCol}</td>
        <td style="text-align:center;">${m25Cell}</td>
        <td style="text-align:center;">${m30Cell}</td>
        <td style="text-align:center;">${m50Cell}</td>
        <td class="mono">${pnlCol}</td>
        <td style="font-size:11px;color:var(--text-secondary);">${durationCol}</td>
        <td>${reasonBtn}</td>
      </tr>
    `;
  }).join('');
}

// ─── REASONING MODAL (DRILL-DOWN) ───────────────────────────
function openReasoningModal(idx) {
  const item = state.renderedWaterfallList?.[idx];
  if (!item) return;

  const overlay = document.getElementById('reasoningModalOverlay');
  const title = document.getElementById('reasoningTitle');
  const sub = document.getElementById('reasoningSubtitle');
  const icon = document.getElementById('reasoningIcon');
  const body = document.getElementById('reasoningBody');

  if (!overlay || !body) return;

  // Handle 3-Minute Candle Monitored Bar
  if (item.isCandleBar || item.status === 'SCANNING') {
    if (icon) icon.textContent = '🔍';
    if (title) title.textContent = '🔍 3-Minute Candle Confluence Audit';
    if (sub) sub.textContent = `${item.time} IST Candle Close • NIFTY Spot, CE & PE Evaluation`;

    const spot = item.spot || {};
    const ce = item.ce || {};
    const pe = item.pe || {};

    body.innerHTML = `
      <div class="reason-meta-grid">
        <div class="reason-meta-item">
          <span class="reason-meta-lbl">Engine Verdict</span>
          <span class="reason-meta-val" style="color:#38bdf8; font-weight:800;">
            🛡️ CAPITAL PROTECTED (SCANNING)
          </span>
        </div>
        <div class="reason-meta-item">
          <span class="reason-meta-lbl">Evaluation Timestamp</span>
          <span class="reason-meta-val mono">${item.time} IST (Today)</span>
        </div>
        <div class="reason-meta-item">
          <span class="reason-meta-lbl">NIFTY 50 Spot Close</span>
          <span class="reason-meta-val mono" style="font-weight:700;">₹${formatPrice(spot.close)} (9 EMA: ₹${formatPrice(spot.ema9)})</span>
        </div>
        <div class="reason-meta-item">
          <span class="reason-meta-lbl">CE Option (${ce.symbol || 'CE'})</span>
          <span class="reason-meta-val mono" style="color:var(--green); font-weight:700;">₹${formatPrice(ce.close)} (9 EMA: ₹${formatPrice(ce.ema9)})</span>
        </div>
        <div class="reason-meta-item">
          <span class="reason-meta-lbl">PE Option (${pe.symbol || 'PE'})</span>
          <span class="reason-meta-val mono" style="color:var(--red); font-weight:700;">₹${formatPrice(pe.close)} (9 EMA: ₹${formatPrice(pe.ema9)})</span>
        </div>
        <div class="reason-meta-item">
          <span class="reason-meta-lbl">Zerodha Directive</span>
          <span class="reason-meta-val" style="color:var(--text-muted); font-weight:700;">Zero orders placed (No entry condition met)</span>
        </div>
      </div>

      <div class="reason-bullets" style="margin-top:14px;">
        <div class="reason-bullet-item">
          <strong>1. Spot Market Structure:</strong>
          <div>NIFTY Spot closed at <b>₹${formatPrice(spot.close)}</b> ${spot.ema9 ? (spot.close > spot.ema9 ? `above 9 EMA (₹${formatPrice(spot.ema9)}) — Structural Bullish` : `below 9 EMA (₹${formatPrice(spot.ema9)}) — Structural Bearish`) : ''}${spot.pp ? `, CPR Pivot: ₹${formatPrice(spot.pp)}` : ''}.</div>
        </div>

        <div class="reason-bullet-item">
          <strong>2. Options Multi-Chart Alignment:</strong>
          <div>
            <b>Call (CE):</b> ₹${formatPrice(ce.close)} ${ce.ema9 ? (ce.close > ce.ema9 ? `(Above 9 EMA ₹${formatPrice(ce.ema9)})` : `(Below 9 EMA ₹${formatPrice(ce.ema9)})`) : ''}${ce.longStop ? ` • Long Stop: ₹${formatPrice(ce.longStop)}` : ''}<br>
            <b>Put (PE):</b> ₹${formatPrice(pe.close)} ${pe.ema9 ? (pe.close > pe.ema9 ? `(Above 9 EMA ₹${formatPrice(pe.ema9)})` : `(Below 9 EMA ₹${formatPrice(pe.ema9)})`) : ''}${pe.shortStop ? ` • Short Stop: ₹${formatPrice(pe.shortStop)}` : ''}
          </div>
        </div>

        <div class="reason-bullet-item">
          <strong>3. Confluence Engine Decision:</strong>
          <div style="font-weight:700; color:#38bdf8; margin-top:3px;">
            ${item.decision || item.reasoning || 'Evaluated 3m bar closes. No fresh entry setup triggered; capital protected.'}
          </div>
        </div>
      </div>
    `;

    overlay.style.display = 'flex';
    return;
  }

  const isSkip = item.status === 'SKIPPED';
  const isLive = item.status === 'LIVE';
  const isExec = item.status === 'EXECUTED';
  const isCE = item.side === 'CE';

  if (icon) icon.textContent = isSkip ? '🛡️' : (isLive ? '🚨' : (item.isWin ? '🟢' : '🎯'));
  if (title) {
    title.textContent = isSkip
      ? '🛡️ Safety Filter Capital Protection Breakdown'
      : (isLive ? '🚨 Live Order Execution Breakdown' : '🎯 Trade Confluence & Execution Breakdown');
  }
  if (sub) {
    sub.textContent = `${item.side || ''} ${item.strike || 'NIFTY'} | Setup: ${item.reasonShort || item.setupName || item.setupAttempted || '3-Chart Confluence'}`;
  }

  const rawReasoning = item.reasoning || item.reasonShort || item.skipReason || 'No detailed reasoning recorded.';
  const reasonBullets = rawReasoning
    .split(' • ')
    .map(b => b.trim())
    .filter(Boolean);

  body.innerHTML = `
    <div class="reason-meta-grid">
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">Engine Verdict</span>
        <span class="reason-meta-val" style="color:${isSkip ? 'var(--amber)' : (item.isWin || isLive ? 'var(--green)' : 'var(--red)')};">
          ${isSkip ? '🚫 FILTERED (CAPITAL PROTECTED)' : (isLive ? '🚨 LIVE OPEN POSITION' : (item.isWin ? '✅ WINNING TRADE' : '❌ LOSS TRADE'))}
        </span>
      </div>
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">Instrument / Strike</span>
        <span class="reason-meta-val">${item.side || '—'} ${item.strike || '—'}</span>
      </div>
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">Time Window</span>
        <span class="reason-meta-val mono">${item.entryTime || item.time || '—'}${item.exitTime ? ` → ${item.exitTime}` : ''}</span>
      </div>
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">Option Price / Entry</span>
        <span class="reason-meta-val mono">₹${formatPrice(item.entryPrice || item.price)}</span>
      </div>
      ${item.exitPrice != null ? `
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">Exit Price</span>
        <span class="reason-meta-val mono">₹${formatPrice(item.exitPrice)}</span>
      </div>
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">Net P&L (1 Lot)</span>
        <span class="reason-meta-val mono" style="color:${item.netPnL >= 0 ? 'var(--green)' : 'var(--red)'};">
          ${item.netPnL >= 0 ? '+' : ''}₹${formatPrice(item.netPnL)} (${item.grossPoints >= 0 ? '+' : ''}${formatPrice(item.grossPoints)} pts)
        </span>
      </div>` : ''}
      ${(item.status === 'EXECUTED' || item.status === 'LIVE') ? `
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">25 Pts Reached?</span>
        <span class="reason-meta-val" style="color:${(item.is25pointsReached || item.milestones?.pts25?.reached) ? '#4ade80' : 'var(--text-muted)'}; font-weight:700;">
          ${(item.is25pointsReached || item.milestones?.pts25?.reached) ? '✅ Yes' : '❌ No'} <span style="font-size:10px; font-weight:normal;">(+${item.maxPointsRun !== undefined ? item.maxPointsRun : (item.grossPoints || 0)} pts)</span>
        </span>
      </div>
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">30 Pts Reached?</span>
        <span class="reason-meta-val" style="color:${(item.is30pointsReached || item.milestones?.pts30?.reached) ? '#4ade80' : 'var(--text-muted)'}; font-weight:700;">
          ${(item.is30pointsReached || item.milestones?.pts30?.reached) ? '✅ Yes' : '❌ No'} <span style="font-size:10px; font-weight:normal;">(+${item.maxPointsRun !== undefined ? item.maxPointsRun : (item.grossPoints || 0)} pts)</span>
        </span>
      </div>
      <div class="reason-meta-item">
        <span class="reason-meta-lbl">50 Pts Reached?</span>
        <span class="reason-meta-val" style="color:${(item.is50pointsReached || item.milestones?.pts50?.reached) ? '#4ade80' : 'var(--text-muted)'}; font-weight:700;">
          ${(item.is50pointsReached || item.milestones?.pts50?.reached) ? '✅ Yes' : '❌ No'} <span style="font-size:10px; font-weight:normal;">(+${item.maxPointsRun !== undefined ? item.maxPointsRun : (item.grossPoints || 0)} pts)</span>
        </span>
      </div>` : ''}
    </div>

    <div class="reason-box">
      <div class="reason-box-title">
        <span>📋 Complete Strategy Reasoning & Execution Notes</span>
      </div>
      <div class="reason-box-content">
        <ul class="reason-notes-list">
          ${reasonBullets.map(bullet => `<li>${bullet}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
}
window.openReasoningModal = openReasoningModal;

function hideReasoningModal() {
  const overlay = document.getElementById('reasoningModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ─── SIGNAL RENDERING ────────────────────────────────────────
function addSignal(signal, silent = false) {
  state.signals.unshift(signal);
  if (state.signals.length > 50) state.signals.pop();

  // Update bias
  if (signal.strength !== 'CONTEXT' || signal.tier === 1) {
    updateBias(signal.direction, signal);
  }

  // Update indicator chips
  updateIndicatorChips(signal);

  // Render card in signal list
  renderSignalCard(signal, silent);

  // Update badge count
  const signalBadgeEl = document.getElementById('signalBadge');
  if (signalBadgeEl) signalBadgeEl.textContent = state.signals.length;
  const rawCountEl = document.getElementById('countRawSignals');
  if (rawCountEl) rawCountEl.textContent = state.signals.length;

  if (state.activeTab === 'rawSignals') {
    renderCurrentLogTable();
  }

  // Show toast for tier 1 / exit signals
  if (!silent && (signal.tier === 1 || signal.strength === 'EXIT')) {
    const dir = dirClass(signal.direction);
    const icon = signal.strength === 'EXIT' ? '🚨' : (dir === 'buy' ? '🟢' : '🔴');
    showToast(dir, `${icon} ${signal.alert}`, `Price: ₹${formatPrice(signal.price)}`);

    // Flash the signal panel
    const panel = document.getElementById('panelSignals');
    if (panel) {
      panel.classList.remove('flash-buy', 'flash-sell');
      void panel.offsetWidth;
      panel.classList.add(dir === 'sell' ? 'flash-sell' : 'flash-buy');
    }
  }
}

function renderSignalCard(signal, silent) {
  const list = document.getElementById('signalList');
  if (!list) return; // signal list panel removed from live dashboard
  const emptyEl = list.querySelector('.signal-empty');
  if (emptyEl) emptyEl.remove();

  const dir = dirClass(signal.direction);
  const tier = signal.tier;
  const tClass = tier === 1 ? 'tier-1-card' : (signal.strength === 'EXIT' ? 'tier-exit-card' : '');

  const card = document.createElement('div');
  card.className = `signal-card ${dir} ${tClass}`;
  card.id = `signal-${signal.id}`;
  card.innerHTML = `
    <div class="signal-card-top">
      <span class="signal-name">${signal.alert}</span>
      <span class="signal-dir-badge ${dir}">${signal.direction}</span>
    </div>
    <div class="signal-card-bottom">
      <span class="signal-price">₹${formatPrice(signal.price)}</span>
      <span class="signal-tier ${tierClass(tier)}">${tierLabel(tier)}</span>
      <span class="signal-time">${formatTime(signal.receivedAt || signal.time)}</span>
    </div>
  `;
  card.addEventListener('click', () => showTradeModal(signal));
  list.insertBefore(card, list.firstChild);

  // Keep max 30 cards in DOM
  const cards = list.querySelectorAll('.signal-card');
  if (cards.length > 30) cards[cards.length - 1].remove();
}

function addToLogTable(signal) {
  if (state.activeTab === 'rawSignals') {
    renderCurrentLogTable();
  }
}

// ─── BIAS BANNER ─────────────────────────────────────────────
function updateBias(direction, signal) {
  state.activeBias = direction;
  state.lastSignal = signal;

  const banner = document.getElementById('biasBanner');
  const dirEl = document.getElementById('biasDirection');
  const signalEl = document.getElementById('biasSignalName');
  const priceEl = document.getElementById('biasPriceLabel');

  // Elements removed from live dashboard — gracefully skip
  if (!banner || !dirEl) return;

  banner.className = 'bias-banner';
  dirEl.className = 'bias-direction';

  const dir = dirClass(direction);
  if (dir === 'buy') {
    banner.classList.add('bias-buy');
    dirEl.classList.add('buy');
    dirEl.textContent = '🟢 BUY';
  } else if (dir === 'sell') {
    banner.classList.add('bias-sell');
    dirEl.classList.add('sell');
    dirEl.textContent = '🔴 SELL';
  } else if (dir === 'exit') {
    banner.classList.add('bias-exit');
    dirEl.classList.add('exit');
    dirEl.textContent = '🚨 EXIT';
  } else {
    dirEl.textContent = 'NEUTRAL';
  }

  if (signal) {
    if (signalEl) signalEl.textContent = signal.alert || '';
    if (priceEl) priceEl.textContent = signal.price ? `@ ₹${formatPrice(signal.price)}` : '';
  }
}

function updateStats(stats) {
  if (!stats) return;
  const elTotal = document.getElementById('statTotal');
  const elBuy   = document.getElementById('statBuy');
  const elSell  = document.getElementById('statSell');
  const elExit  = document.getElementById('statExit');
  if (elTotal) elTotal.textContent = stats.totalSignals || 0;
  if (elBuy)   elBuy.textContent   = stats.buySignals  || 0;
  if (elSell)  elSell.textContent  = stats.sellSignals || 0;
  if (elExit)  elExit.textContent  = stats.exitSignals || 0;
}

// ─── INDICATOR CHIPS ─────────────────────────────────────────
function updateIndicatorChips(signal) {
  const name = (signal.alert || '').toLowerCase();
  const dir = dirClass(signal.direction);

  const chipMap = {
    'ema9': ['9 ema', '9 & 20 ema'],
    'ema20': ['20 ema', '9 & 20 ema'],
    'ema200': ['200 ema'],
    'cpr': ['cpr', 'structural'],
    'ce': ['ce '],
    'rmi': ['rmi'],
    'hm': ['hilega', 'hm confirmed'],
    'triple': ['triple alignment'],
  };

  for (const [key, keywords] of Object.entries(chipMap)) {
    if (keywords.some(k => name.includes(k))) {
      const chip = document.getElementById(`ind_${key}`);
      const val = document.getElementById(`val_${key}`);
      if (chip) {
        chip.className = `ind-chip ${dir === 'buy' ? 'bull' : dir === 'sell' ? 'bear' : ''}`;
        if (val) val.textContent = signal.direction;
      }
    }
  }
}

// ─── TRADE MODAL ─────────────────────────────────────────────
function showTradeModal(signal) {
  state.pendingModal = signal;
  const dir = dirClass(signal.direction);
  const modal = document.getElementById('tradeModal');
  const overlay = document.getElementById('modalOverlay');

  // Set modal class
  modal.className = `modal-card ${dir}-modal`;
  document.getElementById('modalHeader').className = `modal-header ${dir}-header`;

  // Icon and title
  const icons = { buy: '🟢', sell: '🔴', exit: '🚨', neutral: '📊' };
  document.getElementById('modalIcon').textContent = icons[dir] || '🔔';
  document.getElementById('modalTitle').textContent = signal.alert;
  document.getElementById('modalSubtitle').textContent = `${signal.direction} signal received at ${formatTime(signal.receivedAt || signal.time)}`;

  // Details
  document.getElementById('modalSignalName').textContent = signal.alert;
  const dirEl = document.getElementById('modalDirection');
  dirEl.textContent = signal.direction;
  dirEl.style.color = dir === 'buy' ? 'var(--green)' : dir === 'sell' ? 'var(--red)' : dir === 'exit' ? 'var(--amber)' : 'var(--text-primary)';
  document.getElementById('modalPrice').textContent = `₹${formatPrice(signal.price)}`;
  document.getElementById('modalTime').textContent = formatTime(signal.receivedAt || signal.time);

  // ── Trade recommendation (enriched from server or computed locally) ──
  let rec = signal.recommended || getRecommendedStrike(signal.price, signal.direction);
  // Try to enrich LTP from local cache if server didn't have it yet
  if (rec && !rec.ltp) rec = enrichWithCacheLTP(rec);

  const strikes = signal.strikes || null;

  if (rec && dir !== 'exit') {
    // Primary strike
    document.getElementById('recStrike').innerHTML =
      `${rec.label} <span style="font-size:11px;font-weight:500;opacity:0.75;margin-left:6px;">(${rec.action})</span>`;
    document.getElementById('recStrike').style.color = dir === 'buy' ? 'var(--green)' : 'var(--red)';

    // LTP from NSE chain
    const ltpText = rec.ltp ? `₹${formatPrice(rec.ltp)}` : '—';
    const ltpSource = strikes?.optionsSource === 'live' ? ' 🟢' : strikes?.optionsSource === 'mock' ? ' ⚠️ mock' : '';
    document.getElementById('recLTP').innerHTML = `${ltpText}${ltpSource}`;
    document.getElementById('recCost').textContent = rec.estCost ? `₹${rec.estCost.toLocaleString('en-IN')} (${rec.lotSize} qty)` : '—';

    // Build Zerodha instruction
    const instrText = dir === 'buy'
      ? `Search "${rec.label}" in Zerodha → BUY 1 lot (${rec.lotSize || 75} qty) at Market`
      : `Search "${rec.label}" in Zerodha → BUY 1 lot (${rec.lotSize || 75} qty) at Market (PE for bearish)`;
    document.getElementById('instrDetails').textContent = instrText;

    // Inject indicator mini-panel if we have indicator data
    const inds = signal.indicators || {};
    const hasInds = Object.values(inds).some(v => v !== null);
    let indPanel = document.getElementById('modalIndicatorPanel');
    if (!indPanel) {
      indPanel = document.createElement('div');
      indPanel.id = 'modalIndicatorPanel';
      indPanel.className = 'modal-indicator-panel';
      document.getElementById('tradeRecommendation').after(indPanel);
    }
    if (hasInds) {
      const fmt = v => v != null ? Number(v).toFixed(1) : '—';
      const chips = [
        inds.ema9   != null ? `<span class="ind-mini">9EMA <b>${fmt(inds.ema9)}</b></span>` : '',
        inds.ema20  != null ? `<span class="ind-mini">20EMA <b>${fmt(inds.ema20)}</b></span>` : '',
        inds.ema200 != null ? `<span class="ind-mini">200EMA <b>${fmt(inds.ema200)}</b></span>` : '',
        inds.pp     != null ? `<span class="ind-mini">CPR PP <b>${fmt(inds.pp)}</b></span>` : '',
        inds.rmi    != null ? `<span class="ind-mini">RMI <b>${fmt(inds.rmi)}</b></span>` : '',
        inds.rsi    != null ? `<span class="ind-mini">RSI <b>${fmt(inds.rsi)}</b></span>` : '',
        inds.longStop  != null ? `<span class="ind-mini stop-long">Long Stop <b>${fmt(inds.longStop)}</b></span>` : '',
        inds.shortStop != null ? `<span class="ind-mini stop-short">Short Stop <b>${fmt(inds.shortStop)}</b></span>` : '',
        inds.vwap   != null ? `<span class="ind-mini">VWAP <b>${fmt(inds.vwap)}</b></span>` : '',
      ].filter(Boolean).join('');
      indPanel.innerHTML = `<div class="ind-mini-label">📊 Indicators at Signal</div><div class="ind-mini-chips">${chips}</div>`;
      indPanel.style.display = 'block';
    } else {
      indPanel.style.display = 'none';
    }

    // Secondary reference strike (opposite leg)
    let altPanel = document.getElementById('modalAltStrike');
    if (!altPanel) {
      altPanel = document.createElement('div');
      altPanel.id = 'modalAltStrike';
      altPanel.className = 'modal-alt-strike';
      document.getElementById('manualInstruction').after(altPanel);
    }
    if (rec.altStrike) {
      const altLTP = rec.altLTP || getOptionLTPFromCache(rec.altStrike, rec.altType);
      altPanel.innerHTML = `<span class="alt-label">Reference ${rec.altType}:</span> <span class="alt-strike">${rec.altStrike} ${rec.altType}</span> ${altLTP ? `<span class="alt-ltp">LTP ₹${formatPrice(altLTP)}</span>` : ''}`;
      altPanel.style.display = 'flex';
    } else {
      altPanel.style.display = 'none';
    }

    document.getElementById('tradeRecommendation').style.display = 'block';
    document.getElementById('manualInstruction').style.display = 'flex';

    // Action button
    const execBtn = document.getElementById('btnExecute');
    execBtn.className = `btn-primary ${dir === 'sell' ? 'sell-action' : ''}`;
    execBtn.textContent = `✅ Mark as Executed (${rec.label})`;

  } else if (dir === 'exit') {
    document.getElementById('recStrike').textContent = '🚨 EXIT YOUR OPEN POSITION';
    document.getElementById('recStrike').style.color = 'var(--amber)';
    document.getElementById('recLTP').textContent = '—';
    document.getElementById('recCost').textContent = '—';
    document.getElementById('instrDetails').textContent = 'Go to Zerodha → Positions → Exit/Square off your open NIFTY options position immediately';
    document.getElementById('tradeRecommendation').style.display = 'block';
    document.getElementById('manualInstruction').style.display = 'flex';
    const ep = document.getElementById('modalIndicatorPanel'); if (ep) ep.style.display = 'none';
    const ap = document.getElementById('modalAltStrike');      if (ap) ap.style.display = 'none';
    document.getElementById('btnExecute').textContent = '✅ Mark as Exited';
    document.getElementById('btnExecute').className = 'btn-primary sell-action';
  } else {
    document.getElementById('tradeRecommendation').style.display = 'none';
    document.getElementById('manualInstruction').style.display = 'none';
    const ep = document.getElementById('modalIndicatorPanel'); if (ep) ep.style.display = 'none';
    const ap = document.getElementById('modalAltStrike');      if (ap) ap.style.display = 'none';
  }

  overlay.style.display = 'flex';
}

function getRecommendedStrike(price, direction) {
  if (!price || !direction) return null;
  const spot = parseFloat(price);
  if (isNaN(spot)) return null;
  const nearestFifty = Math.round(spot / 50) * 50;
  if (direction === 'BUY')  return { action: 'BUY CE', strike: nearestFifty + 200, type: 'CE', label: `${nearestFifty + 200} CE`, ltp: null, estCost: null, lotSize: 75 };
  if (direction === 'SELL') return { action: 'BUY PE', strike: nearestFifty - 200, type: 'PE', label: `${nearestFifty - 200} PE`, ltp: null, estCost: null, lotSize: 75 };
  return null;
}

function getOptionLTPFromCache(strike, type) {
  if (!state.optionsData) return null;
  const strikes = state.optionsData?.data?.records?.data || [];
  const row = strikes.find(s => s.strikePrice === strike);
  if (!row) return null;
  return type === 'CE' ? row.CE?.lastPrice : row.PE?.lastPrice;
}

// Enrich a recommendation object with live LTP from local options cache
function enrichWithCacheLTP(rec) {
  if (!rec || rec.ltp) return rec; // already has LTP from server
  const ltp = getOptionLTPFromCache(rec.strike, rec.type);
  if (!ltp) return rec;
  return { ...rec, ltp, estCost: Math.round(ltp * (rec.lotSize || 75)) };
}

function hideModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  state.pendingModal = null;
}

// ─── OPTIONS CHAIN ────────────────────────────────────────────
async function fetchOptions() {
  const btn = document.getElementById('btnRefreshOptions');
  btn.classList.add('spinning');

  try {
    const resp = await fetch(`${CONFIG.apiBase}/api/options/${CONFIG.optionsSymbol}`);
    const json = await resp.json();
    state.optionsData = json;
    renderOptionsChain(json);

    const now = new Date();
    document.getElementById('optionsRefreshInfo').textContent =
      `${json.source === 'mock' ? '⚠️ Mock data — ' : '✅ Live — '}Last fetched: ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
  } catch (e) {
    document.getElementById('optionsTable').innerHTML = `<div class="loading-pulse">Failed to load options data</div>`;
  } finally {
    btn.classList.remove('spinning');
  }
}

function renderOptionsChain(json) {
  const records = json?.data?.records;
  if (!records) return;

  const spot = records.underlyingValue || state.niftyPrice;
  document.getElementById('spotPrice').textContent = formatPrice(spot);

  const atmStrike = Math.round(spot / 50) * 50;
  const recommended = state.activeBias ? getRecommendedStrike(spot, state.activeBias) : null;
  state.recommendedStrike = recommended;

  // Expiry dates
  const expirySelect = document.getElementById('selectExpiry');
  if (records.expiryDates && expirySelect.options.length <= 1) {
    expirySelect.innerHTML = records.expiryDates.map(d => `<option>${d}</option>`).join('');
  }

  const allStrikes = records.data || [];
  // Show ±6 strikes from ATM
  const relevant = allStrikes.filter(s => Math.abs(s.strikePrice - atmStrike) <= 300)
                              .sort((a, b) => b.strikePrice - a.strikePrice);

  // Calculate PCR
  const totalCeOI = allStrikes.reduce((s, r) => s + (r.CE?.openInterest || 0), 0);
  const totalPeOI = allStrikes.reduce((s, r) => s + (r.PE?.openInterest || 0), 0);
  const pcr = totalCeOI > 0 ? (totalPeOI / totalCeOI).toFixed(2) : '—';
  document.getElementById('pcrVal').textContent = pcr;
  document.getElementById('sentimentVal').textContent = pcr !== '—'
    ? (pcr > 1.2 ? '🟢 Bullish' : pcr < 0.8 ? '🔴 Bearish' : '⚪ Neutral')
    : '—';

  // Max pain
  const maxPainStrike = atmStrike; // simplified — real calc needs full chain sum
  document.getElementById('maxPainVal').textContent = maxPainStrike.toLocaleString('en-IN');

  const maxOI = Math.max(...allStrikes.map(s => Math.max(s.CE?.openInterest || 0, s.PE?.openInterest || 0)));

  const tbody = document.getElementById('optionsTable');
  tbody.innerHTML = relevant.map(row => {
    const strike = row.strikePrice;
    const isATM = Math.abs(strike - atmStrike) < 30;
    const isRecCE = recommended?.type === 'CE' && recommended?.strike === strike;
    const isRecPE = recommended?.type === 'PE' && recommended?.strike === strike;

    const ceOI = row.CE?.openInterest || 0;
    const peOI = row.PE?.openInterest || 0;
    const ceLTP = row.CE?.lastPrice || 0;
    const peLTP = row.PE?.lastPrice || 0;

    const ceBarW = maxOI > 0 ? Math.max(2, Math.round((ceOI / maxOI) * 60)) : 2;
    const peBarW = maxOI > 0 ? Math.max(2, Math.round((peOI / maxOI) * 60)) : 2;

    let rowClass = isATM ? 'atm' : '';
    if (isRecCE) rowClass += ' recommended-ce';
    if (isRecPE) rowClass += ' recommended-pe';

    const ceRecBadge = isRecCE ? '<span class="opt-rec-badge">REC</span>' : '';
    const peRecBadge = isRecPE ? '<span class="opt-rec-badge pe">REC</span>' : '';

    return `
      <div class="options-row ${rowClass}">
        <div class="oi-bar-wrap">
          <div class="oi-bar ce" style="width:${ceBarW}px"></div>
          <span class="opt-oi">${formatOI(ceOI)}</span>
        </div>
        <span class="opt-ltp ce">${formatPrice(ceLTP)}${ceRecBadge}</span>
        <span class="opt-strike">${strike.toLocaleString('en-IN')}</span>
        <span class="opt-ltp pe">${formatPrice(peLTP)}${peRecBadge}</span>
        <div class="oi-bar-wrap" style="justify-content:flex-start;">
          <span class="opt-oi">${formatOI(peOI)}</span>
          <div class="oi-bar pe" style="width:${peBarW}px"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────
function showToast(type, title, msg) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-msg">${msg}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

// ─── RESET UI ─────────────────────────────────────────────────
function resetUI() {
  state.signals = [];
  state.activeBias = null;
  const signalListEl = document.getElementById('signalList');
  if (signalListEl) signalListEl.innerHTML = `
    <div class="signal-empty">
      <div class="empty-icon">📭</div>
      <p>Cleared. Waiting for signals...</p>
      <button class="btn-ghost" id="btnMockSignalList">Fire Mock Signal</button>
    </div>`;
  const biasDir = document.getElementById('biasDirection');
  const biasBan = document.getElementById('biasBanner');
  const sigBadge = document.getElementById('signalBadge');
  if (biasDir) { biasDir.textContent = 'WAITING FOR SIGNAL'; biasDir.className = 'bias-direction'; }
  if (biasBan) biasBan.className = 'bias-banner';
  if (sigBadge) sigBadge.textContent = '0';
  const elTotal = document.getElementById('statTotal');
  const elBuy   = document.getElementById('statBuy');
  const elSell  = document.getElementById('statSell');
  const elExit  = document.getElementById('statExit');
  if (elTotal) elTotal.textContent = '0';
  if (elBuy)   elBuy.textContent   = '0';
  if (elSell)  elSell.textContent  = '0';
  if (elExit)  elExit.textContent  = '0';
  renderWaterfallLiveTable();
  updateDirectiveHub();
  attachMockBtnListener();
}

// ─── MOCK SIGNAL BUTTON ───────────────────────────────────────
function fireMockSignal() {
  fetch('/api/live/mock-candle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time: new Date().toISOString()
    })
  })
    .then(r => r.json())
    .then(data => {
      console.log('Mock candle processed:', data);
      showToast('info', '🧪 Mock Candle Synchronized', 'Simulated 3-chart bar executed through shared rules engine.');
    })
    .catch(() => {
      showToast('info', '🧪 Demo Mode', 'Could not reach server endpoint.');
    });
}

// ─── DEMO MODE (no backend) ────────────────────────────────────
function runDemoMode() {
  showToast('info', '🧪 Demo Mode', 'Backend not connected — using mock data');
}

// ─── COPY TRADE DETAILS ────────────────────────────────────────
function copyTradeDetails() {
  if (!state.pendingModal) return;
  const s = state.pendingModal;
  const rec = s.recommended || getRecommendedStrike(s.price, s.direction);
  const text = `Signal: ${s.alert}\nDirection: ${s.direction}\nNIFTY Price: ₹${formatPrice(s.price)}\nRecommended: ${rec ? rec.label : '—'}\nTime: ${formatTime(s.receivedAt || s.time)}`;
  navigator.clipboard?.writeText(text).then(() => showToast('info', '📋 Copied', 'Trade details copied to clipboard'));
}

function attachMockBtnListener() {
  const btn = document.getElementById('btnMockSignalList');
  if (btn) btn.addEventListener('click', fireMockSignal);
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Clock
  startClock();

  // Setup Waterfall Toolbar, Table & Directives
  setupWaterfallToolbar();
  renderWaterfallLiveTable();
  updateDirectiveHub();

  // WebSocket
  connectWS();

  // Options chain (if container present)
  if (document.getElementById('optionsTable')) {
    fetchOptions();
    setInterval(fetchOptions, CONFIG.optionsRefreshMs);
  }

  // Mock signal buttons
  const btnMock = document.getElementById('btnMockSignal');
  if (btnMock) btnMock.addEventListener('click', fireMockSignal);
  attachMockBtnListener();

  // Reset live session button
  const btnReset = document.getElementById('btnResetLiveSession');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm("Reset today's live waterfall trading session?")) {
        fetch('/api/live/reset', { method: 'POST' })
          .then(r => r.json())
          .then(() => showToast('info', '🔄 Session Reset', 'Waterfall session has been reset.'))
          .catch(err => console.error(err));
      }
    });
  }

  // Clear signals
  const btnClear = document.getElementById('btnClearSignals');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      fetch('/api/signals', { method: 'DELETE' }).catch(() => resetUI());
    });
  }

  // Trade Entry Modal close
  const tradeEntryClose = document.getElementById('tradeEntryClose');
  if (tradeEntryClose) tradeEntryClose.addEventListener('click', hideTradeEntryModal);
  const btnTradeEntryDismiss = document.getElementById('btnTradeEntryDismiss');
  if (btnTradeEntryDismiss) btnTradeEntryDismiss.addEventListener('click', hideTradeEntryModal);
  const tradeEntryOverlay = document.getElementById('tradeEntryModalOverlay');
  if (tradeEntryOverlay) tradeEntryOverlay.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideTradeEntryModal();
  });

  // Modal (old signal flow — null-safe since elements may not exist in live dashboard)
  document.getElementById('modalClose')?.addEventListener('click', hideModal);
  document.getElementById('btnIgnore')?.addEventListener('click', hideModal);
  document.getElementById('btnExecute')?.addEventListener('click', () => {
    hideModal();
    showToast('info', '✅ Marked Executed', 'Trade logged. Place order in Zerodha app.');
  });
  document.getElementById('btnCopyTrade')?.addEventListener('click', copyTradeDetails);
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal();
  });

  // Options refresh
  document.getElementById('btnRefreshOptions')?.addEventListener('click', fetchOptions);

  // ── Telegram Settings Modal Handlers ───────────────────────
  const tgOverlay = document.getElementById('telegramModalOverlay');
  const btnTgOpen = document.getElementById('btnTelegramSettings');
  const btnTgClose = document.getElementById('btnTelegramClose');
  const btnTgCancel = document.getElementById('btnTgCancel');
  const btnTgSave = document.getElementById('btnTgSave');
  const btnTgTest = document.getElementById('btnTgTest');
  const tgStatus = document.getElementById('tgStatusMsg');

  function openTelegramModal() {
    if (!tgOverlay) return;
    tgOverlay.style.display = 'flex';
    if (tgStatus) tgStatus.style.display = 'none';

    fetch('/api/telegram/config')
      .then(r => r.json())
      .then(d => {
        if (d.status === 'ok' && d.config) {
          const c = d.config;
          const inpChat = document.getElementById('inpTelegramChatId');
          const inpTok = document.getElementById('inpTelegramToken');
          if (inpChat) inpChat.value = c.chatId || '';
          if (inpTok && c.hasBotToken) {
            inpTok.placeholder = `Configured (${c.botTokenMasked})`;
          }
          if (document.getElementById('chkTgEnabled')) document.getElementById('chkTgEnabled').checked = c.enabled !== false;
          if (document.getElementById('chkTgEntries')) document.getElementById('chkTgEntries').checked = c.sendEntries !== false;
          if (document.getElementById('chkTgMilestones')) document.getElementById('chkTgMilestones').checked = c.sendMilestones !== false;
          if (document.getElementById('chkTgSL')) document.getElementById('chkTgSL').checked = c.sendSLUpdates !== false;
          if (document.getElementById('chkTgExits')) document.getElementById('chkTgExits').checked = c.sendExits !== false;
        }
      })
      .catch(e => console.warn('Could not load Telegram config:', e));
  }

  function closeTelegramModal() {
    if (tgOverlay) tgOverlay.style.display = 'none';
  }

  btnTgOpen?.addEventListener('click', openTelegramModal);
  btnTgClose?.addEventListener('click', closeTelegramModal);
  btnTgCancel?.addEventListener('click', closeTelegramModal);
  tgOverlay?.addEventListener('click', e => {
    if (e.target === tgOverlay) closeTelegramModal();
  });

  btnTgSave?.addEventListener('click', () => {
    const token = document.getElementById('inpTelegramToken')?.value.trim();
    const chatId = document.getElementById('inpTelegramChatId')?.value.trim();
    const payload = {
      enabled: document.getElementById('chkTgEnabled')?.checked !== false,
      chatId: chatId,
      sendEntries: document.getElementById('chkTgEntries')?.checked !== false,
      sendMilestones: document.getElementById('chkTgMilestones')?.checked !== false,
      sendSLUpdates: document.getElementById('chkTgSL')?.checked !== false,
      sendExits: document.getElementById('chkTgExits')?.checked !== false
    };
    if (token) payload.botToken = token;

    if (btnTgSave) {
      btnTgSave.disabled = true;
      btnTgSave.textContent = 'Saving...';
    }

    fetch('/api/telegram/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(d => {
        if (btnTgSave) {
          btnTgSave.disabled = false;
          btnTgSave.textContent = '💾 Save Settings';
        }
        if (d.status === 'ok') {
          if (tgStatus) {
            tgStatus.style.display = 'block';
            tgStatus.style.background = 'rgba(34,197,94,0.15)';
            tgStatus.style.color = '#4ade80';
            tgStatus.style.border = '1px solid rgba(34,197,94,0.3)';
            tgStatus.textContent = '✓ Telegram settings saved successfully!';
          }
          setTimeout(() => { closeTelegramModal(); }, 1200);
          showToast('info', '📱 Telegram Configured', 'Mobile alerts are active.');
        } else {
          if (tgStatus) {
            tgStatus.style.display = 'block';
            tgStatus.style.background = 'rgba(239,68,68,0.15)';
            tgStatus.style.color = '#f87171';
            tgStatus.style.border = '1px solid rgba(239,68,68,0.3)';
            tgStatus.textContent = d.message || 'Error saving settings';
          }
        }
      })
      .catch(err => {
        if (btnTgSave) {
          btnTgSave.disabled = false;
          btnTgSave.textContent = '💾 Save Settings';
        }
        if (tgStatus) {
          tgStatus.style.display = 'block';
          tgStatus.style.background = 'rgba(239,68,68,0.15)';
          tgStatus.style.color = '#f87171';
          tgStatus.textContent = 'Error: ' + err.message;
        }
      });
  });

  btnTgTest?.addEventListener('click', () => {
    const token = document.getElementById('inpTelegramToken')?.value.trim();
    const chatId = document.getElementById('inpTelegramChatId')?.value.trim();

    if (btnTgTest) {
      btnTgTest.disabled = true;
      btnTgTest.textContent = 'Sending...';
    }
    if (tgStatus) tgStatus.style.display = 'none';

    fetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: token, chatId: chatId })
    })
      .then(r => r.json())
      .then(d => {
        if (btnTgTest) {
          btnTgTest.disabled = false;
          btnTgTest.textContent = '🔔 Send Test Alert to Phone';
        }
        if (tgStatus) {
          tgStatus.style.display = 'block';
          if (d.ok) {
            tgStatus.style.background = 'rgba(34,197,94,0.15)';
            tgStatus.style.color = '#4ade80';
            tgStatus.style.border = '1px solid rgba(34,197,94,0.3)';
            tgStatus.textContent = '✓ Check your phone! Test alert received on Telegram.';
            showToast('success', '🔔 Phone Buzzing!', 'Telegram test alert delivered successfully.');
          } else {
            tgStatus.style.background = 'rgba(239,68,68,0.15)';
            tgStatus.style.color = '#f87171';
            tgStatus.style.border = '1px solid rgba(239,68,68,0.3)';
            tgStatus.textContent = '❌ ' + (d.error || 'Failed to send alert');
          }
        }
      })
      .catch(err => {
        if (btnTgTest) {
          btnTgTest.disabled = false;
          btnTgTest.textContent = '🔔 Send Test Alert to Phone';
        }
        if (tgStatus) {
          tgStatus.style.display = 'block';
          tgStatus.style.background = 'rgba(239,68,68,0.15)';
          tgStatus.style.color = '#f87171';
          tgStatus.textContent = 'Error: ' + err.message;
        }
      });
  });
});
