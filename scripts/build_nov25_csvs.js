const fs = require('fs');
const path = require('path');

const CHARTS_DIR = path.join(__dirname, '..', 'Chartsdata');
const DATA_DIR = path.join(__dirname, '..', 'data');
const sessionPath = path.join(DATA_DIR, 'live_session_2026-11-25.json');
const webhooksPath = path.join(DATA_DIR, 'live_webhooks_2026-11-25.jsonl');

const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

// Build indexed maps of webhook payloads by time and chartRole
const hookMap = new Map();
if (fs.existsSync(webhooksPath)) {
  const lines = fs.readFileSync(webhooksPath, 'utf8').trim().split('\n');
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line).payload;
      if (!parsed || !parsed.chartRole) continue;
      let t = '';
      if (parsed.time) {
        const d = new Date(Number(parsed.time) || parsed.time);
        const ist = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
        t = ist.slice(0, 5);
      }
      if (t) {
        hookMap.set(`${parsed.chartRole}_${t}`, parsed);
      }
    } catch {}
  }
}

const CSV_HEADER = 'time,open,high,low,close,EMA BUY (HM Confirmed),EMA BUY (HM Mismatch),EMA SELL (HM Confirmed),EMA SELL (HM Mismatch),VWAP,S3,R3,S1,R1,S2,R2,PP,CR,CS,9 EMA,20 EMA,200 EMA,Long Signal,Short Signal,RMI Center,Long Stop,Long Stop Start,Buy Label,Short Stop,Short Stop Start,Sell Label,RSI,Centre line,Volume strength,Price strength';

function formatVal(v) {
  if (v === undefined || v === null || isNaN(v)) return '';
  return String(v);
}

function buildRows(role) {
  const rows = [];
  let lastSpot = null;

  for (const b of session.syncedBars) {
    const t = b.time; // "HH:MM"
    const isoTime = `2026-11-25T${t}:00+05:30`;
    let hook = hookMap.get(`${role}_${t}`) || {};
    let barData = null;

    if (role === 'SPOT') {
      barData = b.spot || hook;
      if (b.spot) lastSpot = b.spot;
      else if (!barData.close && lastSpot) barData = { ...lastSpot };
    } else if (role === 'CE') {
      barData = b.ce || hook;
    } else if (role === 'PE') {
      barData = b.pe || hook;
    }

    if (!barData || (!barData.close && !hook.close)) continue;

    const open = formatVal(barData.open !== undefined ? barData.open : hook.open);
    const high = formatVal(barData.high !== undefined ? barData.high : hook.high);
    const low = formatVal(barData.low !== undefined ? barData.low : hook.low);
    const close = formatVal(barData.close !== undefined ? barData.close : hook.close);
    const emaBuyHM = formatVal(barData.emaBuyHM || hook.emaBuyHM || 0);
    const emaSellHM = formatVal(barData.emaSellHM || hook.emaSellHM || 0);
    const s3 = formatVal(barData.s3 !== undefined ? barData.s3 : hook.s3);
    const r3 = formatVal(barData.r3 !== undefined ? barData.r3 : hook.r3);
    const s1 = formatVal(barData.s1 !== undefined ? barData.s1 : hook.s1);
    const r1 = formatVal(barData.r1 !== undefined ? barData.r1 : hook.r1);
    const pp = formatVal(barData.pp !== undefined ? barData.pp : hook.pp);
    const cr = formatVal(barData.cr !== undefined ? barData.cr : hook.cr);
    const cs = formatVal(barData.cs !== undefined ? barData.cs : hook.cs);
    const ema9 = formatVal(barData.ema9 !== undefined ? barData.ema9 : hook.ema9);
    const ema20 = formatVal(barData.ema20 !== undefined ? barData.ema20 : hook.ema20);
    const ema200 = formatVal(barData.ema200 !== undefined ? barData.ema200 : hook.ema200);
    const longSignal = formatVal(barData.longSignal || hook.longSignal || 0);
    const shortSignal = formatVal(barData.shortSignal || hook.shortSignal || 0);
    const rmiCenter = formatVal(barData.rmiCenter !== undefined ? barData.rmiCenter : hook.rmiCenter);
    const longStop = formatVal(barData.longStop !== undefined ? barData.longStop : hook.longStop);
    const shortStop = formatVal(barData.shortStop !== undefined ? barData.shortStop : hook.shortStop);

    // Columns:
    // time,open,high,low,close,EMA BUY (HM Confirmed),EMA BUY (HM Mismatch),EMA SELL (HM Confirmed),EMA SELL (HM Mismatch),VWAP,S3,R3,S1,R1,S2,R2,PP,CR,CS,9 EMA,20 EMA,200 EMA,Long Signal,Short Signal,RMI Center,Long Stop,Long Stop Start,Buy Label,Short Stop,Short Stop Start,Sell Label,RSI,Centre line,Volume strength,Price strength
    const line = [
      isoTime, open, high, low, close,
      emaBuyHM, '', emaSellHM, '', '',
      s3, r3, s1, r1, '', '',
      pp, cr, cs,
      ema9, ema20, ema200,
      longSignal, shortSignal,
      rmiCenter, longStop, '', '',
      shortStop, '', '',
      '', '', '', ''
    ].join(',');

    rows.push(line);
  }

  return rows;
}

// 1. Build CE
const ceRows = buildRows('CE');
const ceCsv = CSV_HEADER + '\n' + ceRows.join('\n');
fs.writeFileSync(path.join(CHARTS_DIR, 'NSE_NIFTY261201C25500, 3.csv'), ceCsv);
fs.writeFileSync(path.join(DATA_DIR, 'NSE_NIFTY261201C25500, 3.csv'), ceCsv);
console.log(`✅ Saved CE CSV (25500 CE) with ${ceRows.length} bars`);

// 2. Build PE
const peRows = buildRows('PE');
const peCsv = CSV_HEADER + '\n' + peRows.join('\n');
fs.writeFileSync(path.join(CHARTS_DIR, 'NSE_NIFTY261201P25800, 3.csv'), peCsv);
fs.writeFileSync(path.join(DATA_DIR, 'NSE_NIFTY261201P25800, 3.csv'), peCsv);
console.log(`✅ Saved PE CSV (25800 PE) with ${peRows.length} bars`);

// 3. Build Spot & Append to NIFTY (11)
const spotRows = buildRows('SPOT');
const nifty11Path = path.join(CHARTS_DIR, 'NSE_NIFTY, 3 (11).csv');
if (fs.existsSync(nifty11Path)) {
  let content = fs.readFileSync(nifty11Path, 'utf8').trim();
  // Filter out any existing 2026-11-25 rows first
  const existingLines = content.split('\n').filter(l => !l.startsWith('2026-11-25'));
  content = existingLines.join('\n') + '\n' + spotRows.join('\n');
  fs.writeFileSync(nifty11Path, content);
  fs.writeFileSync(path.join(DATA_DIR, 'NSE_NIFTY, 3 (11).csv'), content);
  console.log(`✅ Updated NIFTY (11) with ${spotRows.length} bars for 2026-11-25`);
}
