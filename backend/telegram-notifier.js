const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'telegram.json');

class TelegramNotifier {
  constructor() {
    this.config = {
      enabled: true,
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
      sendEntries: true,
      sendMilestones: true,
      sendSLUpdates: true,
      sendExits: true
    };
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
      }
    } catch (e) {
      console.warn('⚠️ Could not load telegram.json:', e.message);
    }
  }

  saveConfig(newConfig) {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      this.config = { ...this.config, ...newConfig };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      return { status: 'ok', config: this.getPublicConfig() };
    } catch (e) {
      console.error('⚠️ Could not save telegram.json:', e.message);
      return { status: 'error', message: e.message };
    }
  }

  getPublicConfig() {
    return {
      enabled: !!this.config.enabled,
      hasBotToken: !!(this.config.botToken && this.config.botToken.length > 10),
      botTokenMasked: this.config.botToken ? `${this.config.botToken.substring(0, 6)}...${this.config.botToken.slice(-4)}` : '',
      chatId: this.config.chatId || '',
      sendEntries: this.config.sendEntries !== false,
      sendMilestones: this.config.sendMilestones !== false,
      sendSLUpdates: this.config.sendSLUpdates !== false,
      sendExits: this.config.sendExits !== false
    };
  }

  async send(text) {
    if (!this.config.enabled) return { sent: false, reason: 'Disabled' };
    const token = this.config.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = this.config.chatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return { sent: false, reason: 'Bot Token or Chat ID missing' };
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await axios.post(url, {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }, { timeout: 8000 });

      return { sent: true, messageId: res.data?.result?.message_id };
    } catch (e) {
      const errMsg = e.response?.data?.description || e.message;
      console.error(`⚠️ Telegram send failed: ${errMsg}`);
      return { sent: false, error: errMsg };
    }
  }

  // 1. Trade Open Alert
  async sendTradeOpen(trade) {
    if (!this.config.sendEntries) return;
    if (!trade) return;

    const sideBadge = trade.side === 'CE' ? '🟢 CE CALL' : '🔴 PE PUT';
    const entryPrice = trade.entryPrice !== undefined ? `₹${trade.entryPrice.toFixed(2)}` : '—';
    const stopLoss = trade.stopLoss !== undefined ? `₹${trade.stopLoss.toFixed(2)}` : '—';
    const slDist = (trade.entryPrice !== undefined && trade.stopLoss !== undefined)
      ? `${Math.abs(trade.entryPrice - trade.stopLoss).toFixed(2)} pts`
      : '—';
    const time = trade.entryTime ? trade.entryTime.substring(11, 16) : '—';

    const msg = `🎯 <b>TRADE OPENED: ${trade.strike}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Position:</b> ${sideBadge}\n` +
      `• <b>Setup:</b> ${trade.reasonShort || trade.setupName || 'Confluence Entry'}\n` +
      `• <b>Entry Price:</b> <b>${entryPrice}</b>\n` +
      `• <b>Initial SL:</b> <b>${stopLoss}</b> (Risk: ${slDist})\n` +
      `• <b>Time:</b> ${time} IST\n` +
      `• <b>Day:</b> ${trade.dayLabel || trade.day || ''}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <i>Live Waterfall Strategy Cockpit</i>`;

    return this.send(msg);
  }

  // 2. Runner Milestone Alert (+25, +30, +50 pts)
  async sendMilestone(data) {
    if (!this.config.sendMilestones) return;
    if (!data) return;

    const pts = data.points !== undefined ? data.points.toFixed(2) : data.milestone;
    const ltp = data.ltp !== undefined ? `₹${data.ltp.toFixed(2)}` : '—';
    const profit = data.grossPnL !== undefined ? `₹${data.grossPnL.toLocaleString('en-IN')}` : '';

    const icon = data.level === 3 ? '🏆' : (data.level === 2 ? '🚀' : '🎯');

    const msg = `${icon} <b>RUNNER MILESTONE: ${data.label || `+${data.milestone} PTS`}!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Strike:</b> ${data.strike} (${data.side})\n` +
      `• <b>Current LTP:</b> <b>${ltp}</b> (+${pts} pts)\n` +
      `• <b>Unrealized Gain:</b> <b>+${profit}</b> <i>(1 lot)</i>\n` +
      `• <b>Status:</b> Trailing SL actively locking in profits!\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <i>Live Waterfall Strategy Cockpit</i>`;

    return this.send(msg);
  }

  // 3. Trailing SL Update Alert
  async sendSLUpdate(trade, oldSL, newSL) {
    if (!this.config.sendSLUpdates) return;
    if (!trade) return;

    const oldStr = oldSL !== undefined && oldSL !== null ? `₹${oldSL.toFixed(2)}` : '—';
    const newStr = newSL !== undefined && newSL !== null ? `₹${newSL.toFixed(2)}` : '—';

    const msg = `🛡️ <b>STOP LOSS TRAILED: ${trade.strike}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Old SL:</b> ${oldStr}\n` +
      `• <b>New SL:</b> <b>${newStr}</b>\n` +
      `• <b>Current Price:</b> ₹${trade.lastPrice ? trade.lastPrice.toFixed(2) : (trade.entryPrice || 0).toFixed(2)}\n` +
      `• <b>Capital Protected:</b> Downside risk locked out.\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <i>Live Waterfall Strategy Cockpit</i>`;

    return this.send(msg);
  }

  // 4. Trade Exit Alert
  async sendTradeExit(trade, summary) {
    if (!this.config.sendExits) return;
    if (!trade) return;

    const isWin = (trade.netPnL || 0) >= 0;
    const icon = isWin ? '💰' : '🛑';
    const pnlSign = isWin ? '+' : '';
    const pnlStr = `${pnlSign}₹${(trade.netPnL || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const ptsSign = (trade.grossPoints || 0) >= 0 ? '+' : '';
    const ptsStr = `${ptsSign}${(trade.grossPoints || 0).toFixed(2)} pts`;

    const exitPrice = trade.exitPrice !== undefined ? `₹${trade.exitPrice.toFixed(2)}` : '—';
    const time = trade.exitTime ? trade.exitTime.substring(11, 16) : '—';
    const duration = trade.durationMinutes ? `${trade.durationMinutes}m (${trade.barsHeld} bars)` : '—';

    let daySummaryStr = '';
    if (summary && summary.totalNetPnL !== undefined) {
      const dSign = summary.totalNetPnL >= 0 ? '+' : '';
      daySummaryStr = `\n📊 <b>Today's Net P&L:</b> <b>${dSign}₹${summary.totalNetPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b> (${summary.totalTrades} Trades)`;
    }

    const msg = `${icon} <b>TRADE CLOSED: ${trade.strike}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Result:</b> <b>${pnlStr}</b> (${ptsStr})\n` +
      `• <b>Exit Price:</b> <b>${exitPrice}</b> @ ${time} IST\n` +
      `• <b>Duration:</b> ${duration}\n` +
      `• <b>Exit Reason:</b> ${trade.exitReason || 'Signal Invalidation'}\n` +
      `━━━━━━━━━━━━━━━━━━━━${daySummaryStr}\n` +
      `⚡ <i>Live Waterfall Strategy Cockpit</i>`;

    return this.send(msg);
  }

  // 5. Test Alert
  async testAlert() {
    const token = this.config.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = this.config.chatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return { ok: false, error: 'Bot Token or Chat ID is empty. Please enter your credentials first.' };
    }

    const testMsg = `⚡ <b>Vivek's Strategy Dashboard</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <b>Telegram Mobile Alerts Connected!</b>\n\n` +
      `Your phone is now live-linked to the Nifty Waterfall Trading Engine.\n\n` +
      `🔔 You will receive instant push notifications for:\n` +
      `• 🎯 <b>Trade Openings</b> (Strike, Entry, SL, Risk)\n` +
      `• 🚀 <b>Runner Milestones</b> (+25, +30, +50 pts)\n` +
      `• 🛡️ <b>Trailing Stop Loss Updates</b>\n` +
      `• 💰 <b>Trade Exits & Daily Net P&L</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🕒 ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })} IST`;

    const res = await this.send(testMsg);
    if (res.sent) {
      return { ok: true, message: 'Test alert sent successfully to Telegram!' };
    } else {
      return { ok: false, error: res.error || 'Failed to deliver message' };
    }
  }
}

const telegramNotifier = new TelegramNotifier();

module.exports = {
  TelegramNotifier,
  telegramNotifier
};

