# 🌊 TV-Strategy: Live 3-Chart Waterfall Confluence Trading Engine

A high-performance algorithmic trading platform and live confluence execution engine for **NIFTY 50 Options**, featuring real-time 3-chart triangulation (NIFTY Spot, CE Option, and PE Option), automated risk management, milestone runner tracking, and instant Telegram mobile push alerts.

---

## 🚀 Key Features

* **Universal 3-Chart Confluence Engine (18 Setups):**
  * Evaluates 3-minute candle bar closes in lockstep across Spot, In-The-Money / At-The-Money CE, and PE.
  * Captures systematic momentum setups including Confluence crossovers, Hammer continuation, CE 2-candle bounce, Cross-strike inflection, Candle B trend breakouts, and Pivot 50% retracements.
  * **Spot 200 EMA Floor Defense Guard:** Protects against counter-rally traps by suppressing PE breakout buys when Spot tests and defends its 200 EMA.
* **Live Trading Dashboard & Triangulation Cockpit:**
  * Real-time WebSocket streaming of live ticks, candle audits, and open position P&L.
  * Detailed trade log with multi-dimensional filtering (Side, Setup, Status, Wins/Losses) and per-candle confluence audits.
  * Capital protection status updates on every 3-minute bar.
* **Automated Runner Milestones & Trailing Stop Loss:**
  * Real-time monitoring of option runner targets: **+25 pts**, **+30 pts**, and **+50 pts** milestones.
  * Adaptive trailing stop loss (locking in break-even and trailing behind candle lows).
* **Instant Telegram Mobile Push Notifications:**
  * Instant smartphone alerts for Trade Entry (with exact strike, price, and initial SL), Runner Milestones reached, Trailing SL adjustments, and Trade Exit summaries.
* **Interactive 20-Day Waterfall Backtester:**
  * Full backtesting suite replicating historical execution bar-by-bar across 20+ trading days with granular P&L analytics, win rate, profit factor, and maximum drawdown metrics.

---

## 🛠️ Project Structure

```
TV-Strategy/
├── backend/
│   ├── confluence-rules.js     # Universal rules engine (Single source of truth)
│   ├── live-waterfall.js       # Real-time 3-chart sync & candle evaluation
│   ├── waterfall-backtest.js   # Multi-day waterfall backtest runner
│   ├── telegram-notifier.js    # Telegram Bot integration & alerts
│   ├── server.js               # Express, WebSocket & Webhook server
│   ├── backtest.js             # General spot backtester
│   └── options-backtest.js     # Options strike backtester
├── config/
│   ├── telegram.json           # Telegram bot credentials (ignored in git)
│   └── telegram.example.json   # Template for Telegram configuration
├── scripts/
│   └── dashboard.js            # Frontend WebSocket & UI rendering logic
├── styles/
│   └── main.css                # Dark-mode cockpit UI styling
├── data/                       # Historical session logs & sample datasets
├── Chartsdata/                 # Multi-strike 3-minute historical data
├── index.html                  # Live Cockpit & Trading Dashboard
├── waterfall-backtest.html     # Interactive Waterfall Backtest UI
├── UNIVERSAL_ENTRY_EXIT_LOGICS.md # Comprehensive strategy documentation
├── Viveks-Strategy-Backtest.pine  # TradingView Pine Script Indicator
├── .env.example                # Environment variables template
└── package.json
```

---

## 🚦 Quick Start

### 1. Installation

```bash
git clone https://github.com/Vivek-S55/TV-Strategy.git
cd TV-Strategy
npm install
```

### 2. Configuration

Copy the example environment file and configure your port and Telegram credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_chat_id
```

### 3. Start the Server

```bash
npm start
```
* Dashboard URL: `http://localhost:3000`
* Waterfall Backtest: `http://localhost:3000/waterfall-backtest.html`
* Webhook Endpoint: `http://localhost:3000/webhook`

---

## 📱 Telegram Alerts Setup

1. Open Telegram and search for `@BotFather`. Send `/newbot` to create your bot and copy the **Bot Token**.
2. Search for `@userinfobot` to get your **Chat ID**.
3. Send `/start` to your newly created bot.
4. In the Dashboard header, click the **📱 Telegram** button, paste your Token & Chat ID, and click **Send Test Alert** to verify.

---

## 📈 Performance Summary (21-Day Confluence Backtest: Oct 26 – Nov 25)

* **Total Trades:** 126 (70 Wins / 56 Losses)
* **Win Rate:** 55.6%
* **Net P&L:** +₹116,070.00 (75 qty / 1 lot)
* **Profit Factor:** 2.92
* **Average Win / Loss:** 2.34x
* **November 25 Session:** 10 Trades (4 Wins / 6 Losses) • Net P&L: +₹11,498.75 • Profit Factor: 2.77

---

## 📄 License

ISC License. Built for algorithmic trading with TradingView webhooks.

