const fs = require('fs');
const path = require('path');
const rules = require('./confluence-rules');

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
      rmiCenter: parseFloat(row['RMI Center']) || null,
      pp: parseFloat(row['PP']) || null,
      cr: parseFloat(row['CR']) || null,
      cs: parseFloat(row['CS']) || null,
      r1: parseFloat(row['R1']) || null,
      r3: parseFloat(row['R3']) || null,
      s1: parseFloat(row['S1']) || null,
      s3: parseFloat(row['S3']) || null,
      ema200: parseFloat(row['200 EMA']) || null,
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
// Helper: resolve option file dynamically based on existing files in chartsDir (including subdirectories like October-expiry)
function resolveOptionFile(chartsDir, fileOrStrike) {
  if (fs.existsSync(path.join(chartsDir, fileOrStrike))) return fileOrStrike;
  const match = fileOrStrike.match(/([CP])(\d+)/i) || fileOrStrike.match(/(\d+)\s*([CP]E)/i);
  if (match) {
    let type, strike;
    if (match[1].toUpperCase() === 'C' || match[1].toUpperCase() === 'P') {
      type = match[1].toUpperCase();
      strike = match[2];
    } else {
      strike = match[1];
      type = match[2].toUpperCase().startsWith('C') ? 'C' : 'P';
    }
    const targetPattern = new RegExp(`NIFTY\\d+${type}${strike},\\s*3.*\\.csv$`, 'i');
    try {
      const files = fs.readdirSync(chartsDir);
      const matches = files.filter(f => targetPattern.test(f)).sort().reverse();
      if (matches.length > 0) return matches[0];
    } catch (e) { }
  }
  const subdirs = [
    path.join('..', 'Backup-charts', 'Backuptill-13nov'),
    path.join('..', 'Backup-charts', 'November3rd-expiry'),
    path.join('..', 'Backup-charts', 'October-expiry'),
    path.join('..', 'Backup-charts', 'October-expiry-2'),
    path.join('..', 'Backup-charts', 'Backups'),
    path.join('..', 'Backup-charts', 'Backups-2'),
    path.join('..', 'Backup-charts', 'Backups-3'),
    path.join('..', 'Backup-charts', 'Backups-4'),
    path.join('..', 'Backup-charts'),
    'October-expiry-2',
    'October-expiry',
    'Backups',
    'Backups-2',
    'Backups-3',
    'Backups-4'
  ];
  for (const sub of subdirs) {
    if (fs.existsSync(path.join(chartsDir, sub, fileOrStrike))) return path.join(sub, fileOrStrike);
    if (match) {
      try {
        const subPath = path.join(chartsDir, sub);
        if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
          const subFiles = fs.readdirSync(subPath);
          const targetPattern = new RegExp(`NIFTY\\d+${match[1] || ''}${match[2] || ''},\\s*3.*\\.csv$`, 'i');
          const subMatches = subFiles.filter(f => targetPattern.test(f)).sort().reverse();
          if (subMatches.length > 0) return path.join(sub, subMatches[0]);
        }
      } catch (e) { }
    }
  }
  return fileOrStrike;
}

// Option A: Single Primary Strike per side (±200 OTM from Ref) — No duplicate strikes
const SINGLE_PRIMARY_ASSIGNMENTS = {
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
  },
  '2026-10-05': {
    dayLabel: 'Monday, Oct 05',
    niftyOpen: 22537.50,
    refStrike: 22500,
    CE: ['NSE_NIFTY261013C22300, 3.csv'],
    PE: ['NSE_NIFTY261013P22700, 3.csv']
  },
  '2026-10-06': {
    dayLabel: 'Tuesday, Oct 06',
    niftyOpen: 22609.75,
    refStrike: 22600,
    CE: ['NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22800, 3.csv']
  },
  '2026-10-07': {
    dayLabel: 'Wednesday, Oct 07',
    niftyOpen: 22692.40,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-08': {
    dayLabel: 'Thursday, Oct 08',
    niftyOpen: 22589.65,
    refStrike: 22600,
    CE: ['NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22800, 3.csv']
  },
  '2026-10-09': {
    dayLabel: 'Friday, Oct 09',
    niftyOpen: 22317.00,
    refStrike: 22300,
    CE: ['NSE_NIFTY261027C22100, 3.csv'],
    PE: ['NSE_NIFTY261027P22500, 3.csv']
  },
  '2026-10-12': {
    dayLabel: 'Monday, Oct 12',
    niftyOpen: 22593.65,
    refStrike: 22600,
    CE: ['NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22800, 3.csv']
  },
  '2026-10-13': {
    dayLabel: 'Tuesday, Oct 13',
    niftyOpen: 22367.35,
    refStrike: 22400,
    CE: ['NSE_NIFTY261027C22200, 3.csv'],
    PE: ['NSE_NIFTY261027P22600, 3.csv']
  },
  '2026-10-14': {
    dayLabel: 'Wednesday, Oct 14',
    niftyOpen: 22717.20,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-15': {
    dayLabel: 'Thursday, Oct 15',
    niftyOpen: 22686.45,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-16': {
    dayLabel: 'Friday, Oct 16',
    niftyOpen: 23065.25,
    refStrike: 23100,
    CE: ['NSE_NIFTY261027C22900, 3.csv'],
    PE: ['NSE_NIFTY261027P23300, 3.csv']
  },
  '2026-10-19': {
    dayLabel: 'Monday, Oct 19',
    niftyOpen: 23138.75,
    refStrike: 23100,
    CE: ['NSE_NIFTY261027C22900, 3.csv'],
    PE: ['NSE_NIFTY261027P23300, 3.csv']
  },
  '2026-10-21': {
    dayLabel: 'Wednesday, Oct 21',
    niftyOpen: 23016.25,
    refStrike: 23000,
    CE: ['NSE_NIFTY261027C22800, 3.csv'],
    PE: ['NSE_NIFTY261027P23200, 3.csv']
  },
  '2026-10-22': {
    dayLabel: 'Thursday, Oct 22',
    niftyOpen: 22691.15,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-23': {
    dayLabel: 'Friday, Oct 23',
    niftyOpen: 22745.75,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-26': {
    dayLabel: 'Monday, Oct 26',
    niftyOpen: 22508.10,
    refStrike: 22500,
    CE: ['NSE_NIFTY261109C22500, 3.csv'],
    PE: ['NSE_NIFTY261109P22700, 3.csv']
  },
  '2026-10-27': {
    dayLabel: 'Tuesday, Oct 27',
    niftyOpen: 22707.25,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-28': {
    dayLabel: 'Wednesday, Oct 28',
    niftyOpen: 22691.50,
    refStrike: 22700,
    CE: ['NSE_NIFTY261103C22500, 3.csv'],
    PE: ['NSE_NIFTY261103P22900, 3.csv']
  },
  '2026-10-29': {
    dayLabel: 'Thursday, Oct 29',
    niftyOpen: 22695.25,
    refStrike: 22700,
    CE: ['NSE_NIFTY261103C22500, 3.csv'],
    PE: ['NSE_NIFTY261103P22900, 3.csv']
  },
  '2026-10-30': {
    dayLabel: 'Friday, Oct 30',
    niftyOpen: 22966.35,
    refStrike: 23000,
    CE: ['NSE_NIFTY261103C22800, 3.csv'],
    PE: ['NSE_NIFTY261103P23200, 3.csv']
  },
  '2026-11-02': {
    dayLabel: 'Monday, Nov 02',
    niftyOpen: 23248.65,
    refStrike: 23000,
    CE: ['NSE_NIFTY261103C23000, 3.csv'],
    PE: ['NSE_NIFTY261103P23400, 3.csv']
  },
  '2026-11-03': {
    dayLabel: 'Tuesday, Nov 03',
    niftyOpen: 23582.95,
    refStrike: 23600,
    CE: ['NSE_NIFTY261103C23500, 3.csv'],
    PE: ['NSE_NIFTY261103P23800, 3.csv']
  },
  '2026-11-04': {
    dayLabel: 'Wednesday, Nov 04',
    niftyOpen: 23742.50,
    refStrike: 23850,
    CE: ['NSE_NIFTY261109C23700, 3.csv'],
    PE: ['NSE_NIFTY261109P24000, 3.csv']
  },
  '2026-11-05': {
    dayLabel: 'Thursday, Nov 05',
    niftyOpen: 24386.30,
    refStrike: 24400,
    CE: ['NSE_NIFTY261109C24200, 3.csv'],
    PE: ['NSE_NIFTY261109P24600, 3.csv']
  },
  '2026-11-06': {
    dayLabel: 'Friday, Nov 06',
    niftyOpen: 24516.65,
    refStrike: 24500,
    CE: ['NSE_NIFTY261109C24300, 3 (1).csv'],
    PE: ['NSE_NIFTY261109P24700, 3 (1).csv']
  },
  '2026-11-09': {
    dayLabel: 'Monday, Nov 09',
    niftyOpen: 25073.10,
    refStrike: 25100,
    CE: ['NSE_NIFTY261109C24900, 3.csv'],
    PE: ['NSE_NIFTY261109P25300, 3.csv']
  },
  '2026-11-11': {
    dayLabel: 'Wednesday, Nov 11',
    niftyOpen: 25329.20,
    refStrike: 25300,
    CE: ['NSE_NIFTY261117C25100, 3.csv'],
    PE: ['NSE_NIFTY261117P25500, 3.csv']
  },
  '2026-11-12': {
    dayLabel: 'Thursday, Nov 12',
    niftyOpen: 25216.90,
    refStrike: 25200,
    CE: ['NSE_NIFTY261117C25000, 3.csv'],
    PE: ['NSE_NIFTY261117P25400, 3.csv']
  },
  '2026-11-13': {
    dayLabel: 'Friday, Nov 13',
    niftyOpen: 25201.90,
    refStrike: 25200,
    CE: ['NSE_NIFTY261117C25000, 3.csv'],
    PE: ['NSE_NIFTY261117P25400, 3.csv']
  },
  '2026-11-16': {
    dayLabel: 'Monday, Nov 16',
    niftyOpen: 25198.50,
    refStrike: 25200,
    CE: ['NSE_NIFTY261123C25000, 3.csv'],
    PE: ['NSE_NIFTY261123P25400, 3.csv']
  },
  '2026-11-17': {
    dayLabel: 'Tuesday, Nov 17',
    niftyOpen: 25282.60,
    refStrike: 25300,
    CE: ['NSE_NIFTY261123C25100, 3.csv'],
    PE: ['NSE_NIFTY261123P25500, 3.csv']
  },
  '2026-11-18': {
    dayLabel: 'Wednesday, Nov 18',
    niftyOpen: 25334.40,
    refStrike: 25300,
    CE: ['NSE_NIFTY261123C25100, 3.csv'],
    PE: ['NSE_NIFTY261123P25500, 3.csv']
  },
  '2026-11-19': {
    dayLabel: 'Thursday, Nov 19',
    niftyOpen: 25197.00,
    refStrike: 25200,
    CE: ['NSE_NIFTY261123C25000, 3.csv'],
    PE: ['NSE_NIFTY261123P25400, 3.csv']
  },
  '2026-11-20': {
    dayLabel: 'Friday, Nov 20',
    niftyOpen: 25368.05,
    refStrike: 25400,
    CE: ['NSE_NIFTY261123C25200, 3.csv'],
    PE: ['NSE_NIFTY261123P25600, 3.csv']
  },
  '2026-11-23': {
    dayLabel: 'Monday, Nov 23',
    niftyOpen: 25937.70,
    refStrike: 25900,
    CE: ['NSE_NIFTY261123C25700, 3 (1).csv'],
    PE: ['NSE_NIFTY261123P26100, 3.csv']
  },
  '2026-11-25': {
    dayLabel: 'Wednesday, Nov 25',
    niftyOpen: 25734.30,
    refStrike: 25700,
    CE: ['NSE_NIFTY261201C25500, 3.csv'],
    PE: ['NSE_NIFTY261201P25800, 3.csv']
  },
  '2026-11-26': {
    dayLabel: 'Thursday, Nov 26',
    niftyOpen: 25877.05,
    refStrike: 25900,
    CE: ['NSE_NIFTY261201C25700, 3.csv'],
    PE: ['NSE_NIFTY261201P26000, 3.csv']
  }
};

const MULTI_STRIKE_ASSIGNMENTS = {
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
  },
  '2026-10-05': {
    dayLabel: 'Monday, Oct 05',
    niftyOpen: 22537.50,
    refStrike: 22500,
    CE: ['NSE_NIFTY261013C22300, 3.csv', 'NSE_NIFTY261013C22200, 3.csv'],
    PE: ['NSE_NIFTY261013P22700, 3.csv', 'NSE_NIFTY261013P22800, 3.csv']
  },
  '2026-10-06': {
    dayLabel: 'Tuesday, Oct 06',
    niftyOpen: 22609.75,
    refStrike: 22600,
    CE: ['NSE_NIFTY261027C22400, 3.csv', 'NSE_NIFTY261027C22300, 3.csv'],
    PE: ['NSE_NIFTY261027P22800, 3.csv', 'NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-07': {
    dayLabel: 'Wednesday, Oct 07',
    niftyOpen: 22692.40,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv', 'NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv', 'NSE_NIFTY261027P23000, 3.csv']
  },
  '2026-10-08': {
    dayLabel: 'Thursday, Oct 08',
    niftyOpen: 22589.65,
    refStrike: 22600,
    CE: ['NSE_NIFTY261027C22400, 3.csv', 'NSE_NIFTY261027C22300, 3.csv'],
    PE: ['NSE_NIFTY261027P22800, 3.csv', 'NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-09': {
    dayLabel: 'Friday, Oct 09',
    niftyOpen: 22317.00,
    refStrike: 22300,
    CE: ['NSE_NIFTY261027C22100, 3.csv', 'NSE_NIFTY261027C22200, 3.csv'],
    PE: ['NSE_NIFTY261027P22500, 3.csv', 'NSE_NIFTY261027P22600, 3.csv']
  },
  '2026-10-12': {
    dayLabel: 'Monday, Oct 12',
    niftyOpen: 22593.65,
    refStrike: 22600,
    CE: ['NSE_NIFTY261027C22400, 3.csv', 'NSE_NIFTY261027C22300, 3.csv'],
    PE: ['NSE_NIFTY261027P22800, 3.csv', 'NSE_NIFTY261027P22900, 3.csv']
  },
  '2026-10-13': {
    dayLabel: 'Tuesday, Oct 13',
    niftyOpen: 22367.35,
    refStrike: 22400,
    CE: ['NSE_NIFTY261027C22200, 3.csv', 'NSE_NIFTY261027C22100, 3.csv'],
    PE: ['NSE_NIFTY261027P22600, 3.csv', 'NSE_NIFTY261027P22700, 3.csv']
  },
  '2026-10-14': {
    dayLabel: 'Wednesday, Oct 14',
    niftyOpen: 22717.20,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv', 'NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv', 'NSE_NIFTY261027P23000, 3.csv']
  },
  '2026-10-15': {
    dayLabel: 'Thursday, Oct 15',
    niftyOpen: 22686.45,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv', 'NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv', 'NSE_NIFTY261027P23000, 3.csv']
  },
  '2026-10-16': {
    dayLabel: 'Friday, Oct 16',
    niftyOpen: 23065.25,
    refStrike: 23100,
    CE: ['NSE_NIFTY261027C22900, 3.csv', 'NSE_NIFTY261027C22800, 3.csv'],
    PE: ['NSE_NIFTY261027P23300, 3.csv', 'NSE_NIFTY261027P23400, 3.csv']
  },
  '2026-10-19': {
    dayLabel: 'Monday, Oct 19',
    niftyOpen: 23138.75,
    refStrike: 23100,
    CE: ['NSE_NIFTY261027C22900, 3.csv', 'NSE_NIFTY261027C22800, 3.csv'],
    PE: ['NSE_NIFTY261027P23300, 3.csv', 'NSE_NIFTY261027P23400, 3.csv']
  },
  '2026-10-21': {
    dayLabel: 'Wednesday, Oct 21',
    niftyOpen: 23016.25,
    refStrike: 23000,
    CE: ['NSE_NIFTY261027C22800, 3.csv', 'NSE_NIFTY261027C22700, 3.csv'],
    PE: ['NSE_NIFTY261027P23200, 3.csv', 'NSE_NIFTY261027P23300, 3.csv']
  },
  '2026-10-22': {
    dayLabel: 'Thursday, Oct 22',
    niftyOpen: 22691.15,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv', 'NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv', 'NSE_NIFTY261027P23000, 3.csv']
  },
  '2026-10-23': {
    dayLabel: 'Friday, Oct 23',
    niftyOpen: 22745.75,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv', 'NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv', 'NSE_NIFTY261027P23000, 3.csv']
  },
  '2026-10-26': {
    dayLabel: 'Monday, Oct 26',
    niftyOpen: 22508.10,
    refStrike: 22500,
    CE: ['NSE_NIFTY261109C22500, 3.csv', 'NSE_NIFTY261109C22400, 3.csv'],
    PE: ['NSE_NIFTY261109P22700, 3.csv', 'NSE_NIFTY261109P22800, 3.csv']
  },
  '2026-10-27': {
    dayLabel: 'Tuesday, Oct 27',
    niftyOpen: 22707.25,
    refStrike: 22700,
    CE: ['NSE_NIFTY261027C22500, 3.csv', 'NSE_NIFTY261027C22400, 3.csv'],
    PE: ['NSE_NIFTY261027P22900, 3.csv', 'NSE_NIFTY261027P23000, 3.csv']
  },
  '2026-10-28': {
    dayLabel: 'Wednesday, Oct 28',
    niftyOpen: 22691.50,
    refStrike: 22700,
    CE: ['NSE_NIFTY261103C22500, 3.csv', 'NSE_NIFTY261103C22400, 3.csv'],
    PE: ['NSE_NIFTY261103P22900, 3.csv', 'NSE_NIFTY261103P23000, 3.csv']
  },
  '2026-10-29': {
    dayLabel: 'Thursday, Oct 29',
    niftyOpen: 22695.25,
    refStrike: 22700,
    CE: ['NSE_NIFTY261103C22500, 3.csv', 'NSE_NIFTY261103C22400, 3.csv'],
    PE: ['NSE_NIFTY261103P22900, 3.csv', 'NSE_NIFTY261103P23000, 3.csv']
  },
  '2026-10-30': {
    dayLabel: 'Friday, Oct 30',
    niftyOpen: 22966.35,
    refStrike: 23000,
    CE: ['NSE_NIFTY261103C22800, 3.csv', 'NSE_NIFTY261103C22700, 3.csv'],
    PE: ['NSE_NIFTY261103P23200, 3.csv', 'NSE_NIFTY261103P23300, 3.csv']
  },
  '2026-11-02': {
    dayLabel: 'Monday, Nov 02',
    niftyOpen: 23248.65,
    refStrike: 23000,
    CE: ['NSE_NIFTY261103C23000, 3.csv', 'NSE_NIFTY261103C22900, 3.csv'],
    PE: ['NSE_NIFTY261103P23400, 3.csv', 'NSE_NIFTY261103P23500, 3.csv']
  },
  '2026-11-03': {
    dayLabel: 'Tuesday, Nov 03',
    niftyOpen: 23582.95,
    refStrike: 23600,
    CE: ['NSE_NIFTY261103C23500, 3.csv', 'NSE_NIFTY261103C23400, 3.csv'],
    PE: ['NSE_NIFTY261103P23800, 3.csv', 'NSE_NIFTY261103P23700, 3.csv']
  },
  '2026-11-04': {
    dayLabel: 'Wednesday, Nov 04',
    niftyOpen: 23742.50,
    refStrike: 23850,
    CE: ['NSE_NIFTY261109C23700, 3.csv'],
    PE: ['NSE_NIFTY261109P24000, 3.csv']
  },
  '2026-11-05': {
    dayLabel: 'Thursday, Nov 05',
    niftyOpen: 24386.30,
    refStrike: 24400,
    CE: ['NSE_NIFTY261109C24200, 3.csv'],
    PE: ['NSE_NIFTY261109P24600, 3.csv']
  },
  '2026-11-06': {
    dayLabel: 'Friday, Nov 06',
    niftyOpen: 24516.65,
    refStrike: 24500,
    CE: ['NSE_NIFTY261109C24300, 3 (1).csv'],
    PE: ['NSE_NIFTY261109P24700, 3 (1).csv']
  },
  '2026-11-09': {
    dayLabel: 'Monday, Nov 09',
    niftyOpen: 25073.10,
    refStrike: 25100,
    CE: ['NSE_NIFTY261109C24900, 3.csv'],
    PE: ['NSE_NIFTY261109P25300, 3.csv']
  },
  '2026-11-11': {
    dayLabel: 'Wednesday, Nov 11',
    niftyOpen: 25329.20,
    refStrike: 25300,
    CE: ['NSE_NIFTY261117C25100, 3.csv'],
    PE: ['NSE_NIFTY261117P25500, 3.csv']
  },
  '2026-11-12': {
    dayLabel: 'Thursday, Nov 12',
    niftyOpen: 25216.90,
    refStrike: 25200,
    CE: ['NSE_NIFTY261117C25000, 3.csv'],
    PE: ['NSE_NIFTY261117P25400, 3.csv']
  },
  '2026-11-13': {
    dayLabel: 'Friday, Nov 13',
    niftyOpen: 25201.90,
    refStrike: 25200,
    CE: ['NSE_NIFTY261117C25000, 3.csv'],
    PE: ['NSE_NIFTY261117P25400, 3.csv']
  },
  '2026-11-16': {
    dayLabel: 'Monday, Nov 16',
    niftyOpen: 25198.50,
    refStrike: 25200,
    CE: ['NSE_NIFTY261123C25000, 3.csv'],
    PE: ['NSE_NIFTY261123P25400, 3.csv']
  },
  '2026-11-17': {
    dayLabel: 'Tuesday, Nov 17',
    niftyOpen: 25282.60,
    refStrike: 25300,
    CE: ['NSE_NIFTY261123C25100, 3.csv'],
    PE: ['NSE_NIFTY261123P25500, 3.csv']
  },
  '2026-11-18': {
    dayLabel: 'Wednesday, Nov 18',
    niftyOpen: 25334.40,
    refStrike: 25300,
    CE: ['NSE_NIFTY261123C25100, 3.csv'],
    PE: ['NSE_NIFTY261123P25500, 3.csv']
  },
  '2026-11-19': {
    dayLabel: 'Thursday, Nov 19',
    niftyOpen: 25197.00,
    refStrike: 25200,
    CE: ['NSE_NIFTY261123C25000, 3.csv'],
    PE: ['NSE_NIFTY261123P25400, 3.csv']
  },
  '2026-11-20': {
    dayLabel: 'Friday, Nov 20',
    niftyOpen: 25368.05,
    refStrike: 25400,
    CE: ['NSE_NIFTY261123C25200, 3.csv'],
    PE: ['NSE_NIFTY261123P25600, 3.csv']
  },
  '2026-11-23': {
    dayLabel: 'Monday, Nov 23',
    niftyOpen: 25937.70,
    refStrike: 25900,
    CE: ['NSE_NIFTY261123C25700, 3 (1).csv'],
    PE: ['NSE_NIFTY261123P26100, 3.csv']
  },
  '2026-11-25': {
    dayLabel: 'Wednesday, Nov 25',
    niftyOpen: 25734.30,
    refStrike: 25700,
    CE: ['NSE_NIFTY261201C25500, 3.csv'],
    PE: ['NSE_NIFTY261201P25800, 3.csv']
  },
  '2026-11-26': {
    dayLabel: 'Thursday, Nov 26',
    niftyOpen: 25877.05,
    refStrike: 25900,
    CE: ['NSE_NIFTY261201C25700, 3.csv'],
    PE: ['NSE_NIFTY261201P26000, 3.csv']
  }
};

const DEFAULT_ASSIGNMENTS = SINGLE_PRIMARY_ASSIGNMENTS;

/**
 * Extracts clean strike label from filename:
 * 'NSE_NIFTY261013C22900, 3.csv' -> '22900 CE'
 */
function cleanStrikeName(filename) {
  const match = filename.match(/NIFTY\d+([CP])(\d+)/i);
  if (match) {
    const type = match[1].toUpperCase() === 'C' ? 'CE' : 'PE';
    return `${match[2]} ${type}`;
  }
  return filename.replace(/,.*$/, '');
}

function resolveNiftyPath(chartsDir, dayKey) {
  const searchDirs = [
    chartsDir,
    path.join(chartsDir, '..', 'Backup-charts', 'Backuptill-13nov'),
    path.join(chartsDir, '..', 'Backup-charts')
  ];
  const candidates = [
    'NSE_NIFTY, 3 (12).csv',
    'NSE_NIFTY, 3 (11).csv',
    'NSE_NIFTY, 3 (10).csv',
    'NSE_NIFTY, 3 (9).csv',
    'NSE_NIFTY, 3 (8).csv',
    'NSE_NIFTY, 3 (7).csv',
    'NSE_NIFTY, 3 (6).csv',
    'NSE_NIFTY, 3 (5).csv',
    'NSE_NIFTY, 3 (4).csv',
    'NSE_NIFTY, 3 (3).csv',
    'NSE_NIFTY, 3 (2).csv',
    'NSE_NIFTY, 3 (1).csv',
    'NSE_NIFTY, 3.csv'
  ];
  if (dayKey) {
    let bestFile = null;
    let maxBars = 0;
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const c of candidates) {
        const p = path.join(dir, c);
        if (fs.existsSync(p)) {
          const lines = fs.readFileSync(p, 'utf8').split('\n');
          const count = lines.filter(l => l.startsWith(dayKey)).length;
          if (count > maxBars) {
            maxBars = count;
            bestFile = p;
          }
        }
      }
    }
    if (bestFile) return bestFile;
  }
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const c of candidates) {
      const p = path.join(dir, c);
      if (fs.existsSync(p)) return p;
    }
  }
  return path.join(chartsDir, 'NSE_NIFTY, 3 (10).csv');
}

function runConfluenceDay(dayKey, dayCfg, options = {}) {
  const chartsDir = options.chartsDir;
  const opts = rules.normalizeOptions({ ...options, chartsDir });

  const niftyPath = resolveNiftyPath(chartsDir, dayKey);
  const niftyBars = parseCSV(fs.readFileSync(niftyPath, "utf8")).filter(b => b.day === dayKey);
  const ceFile = resolveOptionFile(chartsDir, dayCfg.CE[0]);
  const peFile = resolveOptionFile(chartsDir, dayCfg.PE[0]);
  const ceBars = parseCSV(fs.readFileSync(path.join(chartsDir, ceFile), "utf8")).filter(b => b.day === dayKey);
  const peBars = parseCSV(fs.readFileSync(path.join(chartsDir, peFile), "utf8")).filter(b => b.day === dayKey);

  const ceMap = new Map(ceBars.map(b => [b.timeOnly, b]));
  const peMap = new Map(peBars.map(b => [b.timeOnly, b]));
  const niftyMap = new Map(niftyBars.map(b => [b.timeOnly, b]));
  const times = Array.from(new Set([...niftyBars.map(b => b.timeOnly), ...ceBars.map(b => b.timeOnly), ...peBars.map(b => b.timeOnly)])).sort();

  const state = {
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
    justExitedSide: null
  };

  let currentCEFile = ceFile;
  let currentPEFile = peFile;

  function fileForSide(s) {
    return s === "PE" ? currentPEFile : currentCEFile;
  }

  let lastCEPrice = null, lastPEPrice = null;

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const prevT = i > 0 ? times[i - 1] : null;
    const barNifty = niftyMap.get(t);
    const prevNifty = prevT ? niftyMap.get(prevT) : null;

    const barCE = ceMap.get(t);
    const barPE = peMap.get(t);
    if (barCE) lastCEPrice = barCE.close;
    if (barPE) lastPEPrice = barPE.close;
    const prevCE = prevT ? ceMap.get(prevT) : null;
    const prevPE = prevT ? peMap.get(prevT) : null;

    rules.processConfluenceBar({
      t, i, times,
      barCE, barPE, barNifty,
      prevCE, prevPE, prevNifty,
      state, opts,
      dayKey, dayLabel: dayCfg.dayLabel,
      currentCEFile, currentPEFile,
      fileForSide,
      lastCEPrice, lastPEPrice,
      peMap, ceMap, niftyMap
    });
  }

  return { executedTrades: state.executedTrades, skippedTrades: state.skippedTrades };
}

/**
 * Runs the waterfall backtest.
 */
function runWaterfallBacktest(options = {}) {
  const chartsDir = options.chartsDir || path.join(__dirname, '..', 'Chartsdata');
  const lotSize = parseInt(options.lotSize || 75, 10);
  const commissionPerOrder = parseFloat(options.commission !== undefined ? options.commission : 20);
  const slippagePts = parseFloat(options.slippage || 0);
  const entryStartTime = options.entryStartTime || '09:18';
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
  const maxSellZoneRetests = options.maxSellZoneRetests !== undefined ? parseInt(options.maxSellZoneRetests, 10) : 2;
  const filterInsideBuyZone = options.filterInsideBuyZone !== undefined ? (options.filterInsideBuyZone === true || options.filterInsideBuyZone === 'true') : true;
  const maxBuyZoneBounces = options.maxBuyZoneBounces !== undefined ? parseInt(options.maxBuyZoneBounces, 10) : 2;
  const enableSellZoneBreakout = options.enableSellZoneBreakout !== undefined ? (options.enableSellZoneBreakout === true || options.enableSellZoneBreakout === 'true') : true;
  const sellZoneMinHeadroom = options.sellZoneMinHeadroom !== undefined ? parseFloat(options.sellZoneMinHeadroom) : 15.0;
  const sellZoneBreakoutExpiryBars = options.sellZoneBreakoutExpiryBars !== undefined ? parseInt(options.sellZoneBreakoutExpiryBars, 10) : 4;
  const breakoutExpiryBars = options.breakoutExpiryBars !== undefined ? parseInt(options.breakoutExpiryBars, 10) : 15;
  const enableBreakoutSL = options.enableBreakoutSL !== undefined ? (options.enableBreakoutSL === true || options.enableBreakoutSL === 'true') : true;
  const entrySignalMode = options.entrySignalMode || 'both'; // 'ce_bounce', 'rmi', 'ema', 'both'
  const enableRMIBounceEntry = options.enableRMIBounceEntry !== undefined ? (options.enableRMIBounceEntry === true || options.enableRMIBounceEntry === 'true') : (entrySignalMode === 'both' || entrySignalMode === 'rmi');
  const enableCEBounceEntry = options.enableCEBounceEntry !== undefined ? (options.enableCEBounceEntry === true || options.enableCEBounceEntry === 'true') : (entrySignalMode === 'both' || entrySignalMode === 'ce_bounce');
  const enableCEFloorSL = options.enableCEFloorSL !== undefined ? (options.enableCEFloorSL === true || options.enableCEFloorSL === 'true') : true;
  const enableRMIFloorExit = options.enableRMIFloorExit !== undefined ? (options.enableRMIFloorExit === true || options.enableRMIFloorExit === 'true') : true;
  const enableRMIRejectionExit = options.enableRMIRejectionExit !== undefined ? (options.enableRMIRejectionExit === true || options.enableRMIRejectionExit === 'true') : true;
  const enableCETargetTouch = options.enableCETargetTouch !== undefined ? (options.enableCETargetTouch === true || options.enableCETargetTouch === 'true') : true;

  // Confluence Engine parameters
  const enableConfluenceMode = options.enableConfluenceMode !== undefined ? (options.enableConfluenceMode === true || options.enableConfluenceMode === 'true') : true;
  const maxZoneWidth = options.maxZoneWidth !== undefined ? parseFloat(options.maxZoneWidth) : 20.0;
  const zoneRetracementPct = options.zoneRetracementPct !== undefined ? parseFloat(options.zoneRetracementPct) : 0.50;
  const stagnationBars = options.stagnationBars !== undefined ? parseInt(options.stagnationBars, 10) : 10;
  const minConfluence = options.minConfluence !== undefined ? parseInt(options.minConfluence, 10) : 2;
  const enableCPRExits = options.enableCPRExits !== undefined ? (options.enableCPRExits === true || options.enableCPRExits === 'true') : true;
  const enableHMVolExit = options.enableHMVolExit !== undefined ? (options.enableHMVolExit === true || options.enableHMVolExit === 'true') : true;
  const filterFalseRejections = options.filterFalseRejections !== undefined ? (options.filterFalseRejections === true || options.filterFalseRejections === 'true') : true;
  const enableStrictBull = options.enableStrictBull !== undefined ? (options.enableStrictBull === true || options.enableStrictBull === 'true') : true;
  const enableStrictBear = options.enableStrictBear !== undefined ? (options.enableStrictBear === true || options.enableStrictBear === 'true') : true;
  const enableHammerContinuation = options.enableHammerContinuation !== undefined ? (options.enableHammerContinuation === true || options.enableHammerContinuation === 'true') : true;
  const enableCELineBounce = false; // Always disabled
  const enableNifty9EMAAlignment = options.enableNifty9EMAAlignment !== undefined ? (options.enableNifty9EMAAlignment === true || options.enableNifty9EMAAlignment === 'true') : true;
  const enableCounterBreakoutExit = options.enableCounterBreakoutExit !== undefined ? (options.enableCounterBreakoutExit === true || options.enableCounterBreakoutExit === 'true') : true;
  const enableCandleBRMIReclaim = options.enableCandleBRMIReclaim !== undefined ? (options.enableCandleBRMIReclaim === true || options.enableCandleBRMIReclaim === 'true') : true;
  const enableRMISupportHold = options.enableRMISupportHold !== undefined ? (options.enableRMISupportHold === true || options.enableRMISupportHold === 'true') : true;
  const rmiSupportHoldThreshold = options.rmiSupportHoldThreshold !== undefined ? parseFloat(options.rmiSupportHoldThreshold) : 10.0;
  const enableCrossStrikeInflection = options.enableCrossStrikeInflection !== undefined ? (options.enableCrossStrikeInflection === true || options.enableCrossStrikeInflection === 'true') : true;
  const crossStrikeMinWick = options.crossStrikeMinWick !== undefined ? parseFloat(options.crossStrikeMinWick) : 6.0;
  const maxCEBounceSLDist = options.maxCEBounceSLDist !== undefined ? parseFloat(options.maxCEBounceSLDist) : 15.0;
  const sellZoneMinWick = options.sellZoneMinWick !== undefined ? parseFloat(options.sellZoneMinWick) : 4.0;
  const enableCPRResistanceFilter = options.enableCPRResistanceFilter !== undefined ? (options.enableCPRResistanceFilter === true || options.enableCPRResistanceFilter === 'true') : true;
  const cprCeilingBuffer = options.cprCeilingBuffer !== undefined ? parseFloat(options.cprCeilingBuffer) : 5.0;
  const openingCprBuffer = options.openingCprBuffer !== undefined ? parseFloat(options.openingCprBuffer) : 8.0;
  const enableSpotCPRConflictFilter = options.enableSpotCPRConflictFilter !== undefined ? (options.enableSpotCPRConflictFilter === true || options.enableSpotCPRConflictFilter === 'true') : true;
  const enableOpeningClimaxFilter = options.enableOpeningClimaxFilter !== undefined ? (options.enableOpeningClimaxFilter === true || options.enableOpeningClimaxFilter === 'true') : true;
  const maxClimaxStretch = options.maxClimaxStretch !== undefined ? parseFloat(options.maxClimaxStretch) : 35.0;
  const enableBounceExhaustionFilter = options.enableBounceExhaustionFilter !== undefined ? (options.enableBounceExhaustionFilter === true || options.enableBounceExhaustionFilter === 'true') : true;
  const maxBounceUpperWick = options.maxBounceUpperWick !== undefined ? parseFloat(options.maxBounceUpperWick) : 12.0;
  const maxBounceTwoBarRange = options.maxBounceTwoBarRange !== undefined ? parseFloat(options.maxBounceTwoBarRange) : 65.0;
  const enableCPRReversalEntry = options.enableCPRReversalEntry !== undefined ? (options.enableCPRReversalEntry === true || options.enableCPRReversalEntry === 'true') : true;
  const enableDualCeilingFilter = options.enableDualCeilingFilter !== undefined ? (options.enableDualCeilingFilter === true || options.enableDualCeilingFilter === 'true') : true;
  const enablePivotRetracementQueue = options.enablePivotRetracementQueue !== undefined ? (options.enablePivotRetracementQueue === true || options.enablePivotRetracementQueue === 'true') : true;
  const enableRMIReclaimEntry = options.enableRMIReclaimEntry !== undefined ? (options.enableRMIReclaimEntry === true || options.enableRMIReclaimEntry === 'true') : true;
  const enableCandleBTrendBreakout = options.enableCandleBTrendBreakout !== undefined ? (options.enableCandleBTrendBreakout === true || options.enableCandleBTrendBreakout === 'true') : true;
  const maxCandleBTrendSLDist = options.maxCandleBTrendSLDist !== undefined ? parseFloat(options.maxCandleBTrendSLDist) : 20.0;
  const enableCELineWickBreakout = options.enableCELineWickBreakout !== undefined ? (options.enableCELineWickBreakout === true || options.enableCELineWickBreakout === 'true') : true;
  const maxCELineWickBreakoutSLDist = options.maxCELineWickBreakoutSLDist !== undefined ? parseFloat(options.maxCELineWickBreakoutSLDist) : 45.0;
  const enableDeadCatBounceGuard = options.enableDeadCatBounceGuard !== undefined ? (options.enableDeadCatBounceGuard === true || options.enableDeadCatBounceGuard === 'true') : true;
  const enableMacroRegimeInflection = options.enableMacroRegimeInflection !== undefined ? (options.enableMacroRegimeInflection === true || options.enableMacroRegimeInflection === 'true') : false;
  const macroInflectionMaxRisk = options.macroInflectionMaxRisk !== undefined ? parseFloat(options.macroInflectionMaxRisk) : 20.0;
  const macroInflectionRRFactor = options.macroInflectionRRFactor !== undefined ? parseFloat(options.macroInflectionRRFactor) : 4.0;
  const enableDailyCircuitBreaker = options.enableDailyCircuitBreaker !== undefined ? (options.enableDailyCircuitBreaker === true || options.enableDailyCircuitBreaker === 'true') : false;
  const maxConsecutiveLosses = options.maxConsecutiveLosses !== undefined ? parseInt(options.maxConsecutiveLosses, 10) : 2;
  const enableCPRSqueezeGuard = options.enableCPRSqueezeGuard !== undefined ? (options.enableCPRSqueezeGuard === true || options.enableCPRSqueezeGuard === 'true') : true;
  const enableUnifiedReclaim = options.enableUnifiedReclaim !== undefined ? (options.enableUnifiedReclaim === true || options.enableUnifiedReclaim === 'true') : true;
  const enableCESpringboard = options.enableCESpringboard !== undefined ? (options.enableCESpringboard === true || options.enableCESpringboard === 'true') : true;
  const enableSpot200EMAGuard = options.enableSpot200EMAGuard !== undefined ? (options.enableSpot200EMAGuard === true || options.enableSpot200EMAGuard === 'true') : true;
  const fixedTarget = (options.fixedTarget !== undefined && options.fixedTarget !== '' && !isNaN(parseFloat(options.fixedTarget))) ? parseFloat(options.fixedTarget) : null;

  const DEFAULT_DATE_FILTER = '2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-11-02,2026-11-03,2026-11-04,2026-11-05,2026-11-06,2026-11-09,2026-11-11,2026-11-12,2026-11-13,2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20,2026-11-23,2026-11-25,2026-11-26';
  const dateFilter = options.dateFilter !== undefined ? options.dateFilter : DEFAULT_DATE_FILTER;
  let assignments = options.assignments;
  if (!assignments) {
    assignments = (strikeMode === 'all' || strikeMode === 'multi') ? { ...MULTI_STRIKE_ASSIGNMENTS } : { ...SINGLE_PRIMARY_ASSIGNMENTS };
  }

  // Cache parsed CSV files to avoid reloading repeatedly
  const fileCache = new Map();
  function getBarsForFile(fname) {
    const resolvedName = resolveOptionFile(chartsDir, fname);
    if (fileCache.has(resolvedName)) return fileCache.get(resolvedName);
    const filepath = path.join(chartsDir, resolvedName);
    if (!fs.existsSync(filepath)) {
      console.warn(`File not found: ${filepath}`);
      return [];
    }
    const content = fs.readFileSync(filepath, 'utf8');
    const parsed = parseCSV(content);
    fileCache.set(resolvedName, parsed);
    return parsed;
  }

  // Auto-discover any new days present in Nifty CSV and Chartsdata (for tomorrow and future live data)
  try {
    const niftyFile = resolveNiftyPath(chartsDir);
    if (fs.existsSync(niftyFile)) {
      const allNiftyBars = getBarsForFile(path.basename(niftyFile));
      const dayOpens = new Map();
      allNiftyBars.forEach(b => {
        if (!dayOpens.has(b.day)) dayOpens.set(b.day, b.open);
      });
      for (const [dayKey, open] of dayOpens.entries()) {
        if (!assignments[dayKey]) {
          const refStrike = Math.round(open / 100) * 100;
          const cePrimary = resolveOptionFile(chartsDir, `C${refStrike - 200}`);
          const pePrimary = resolveOptionFile(chartsDir, `P${refStrike + 200}`);
          if (fs.existsSync(path.join(chartsDir, cePrimary)) && fs.existsSync(path.join(chartsDir, pePrimary))) {
            const dt = new Date(dayKey + 'T09:15:00+05:30');
            const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit' });
            assignments[dayKey] = {
              dayLabel,
              niftyOpen: open,
              refStrike,
              CE: [cePrimary],
              PE: [pePrimary]
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn('Auto-discovery error:', e.message);
  }
  if (dateFilter && dateFilter !== 'ALL') {
    const filterDays = dateFilter.split(',').map(s => s.trim());
    const filtered = {};
    for (const d of filterDays) {
      if (assignments[d]) filtered[d] = assignments[d];
    }
    if (Object.keys(filtered).length > 0) {
      assignments = filtered;
    }
  }

  const rawTrades = [];
  const skippedTrades = [];

  // Iterate over each assigned day and chart
  for (const [dayKey, dayCfg] of Object.entries(assignments)) {
    // If Confluence Mode is enabled, run coordinated 3-chart engine
    if (enableConfluenceMode) {
      const confRes = runConfluenceDay(dayKey, dayCfg, {
        chartsDir,
        lotSize,
        commission: commissionPerOrder,
        entryStartTime,
        entryEndTime,
        maxZoneWidth,
        zoneRetracementPct,
        stagnationBars,
        minConfluence,
        enableCPRExits,
        enableHMVolExit,
        filterFalseRejections,
        enableStrictBull,
        enableStrictBear,
        filterInsideSellZone,
        sellZoneMinHeadroom,
        enableSellZoneBreakout,
        sellZoneBreakoutExpiryBars,
        enableHammerContinuation,
        enableCELineBounce,
        enableNifty9EMAAlignment,
        enableCounterBreakoutExit,
        enableCandleBRMIReclaim,
        enableRMISupportHold,
        rmiSupportHoldThreshold,
        enableCrossStrikeInflection,
        crossStrikeMinWick,
        maxCEBounceSLDist,
        sellZoneMinWick,
        enableCPRResistanceFilter,
        cprCeilingBuffer,
        openingCprBuffer,
        enableSpotCPRConflictFilter,
        enableOpeningClimaxFilter,
        maxClimaxStretch,
        enableBounceExhaustionFilter,
        maxBounceUpperWick,
        maxBounceTwoBarRange,
        enableCPRReversalEntry,
        enableDualCeilingFilter,
        enablePivotRetracementQueue,
        enableRMIReclaimEntry,
        enableCandleBTrendBreakout,
        maxCandleBTrendSLDist,
        enableCELineWickBreakout,
        maxCELineWickBreakoutSLDist,
        enableDeadCatBounceGuard,
        enableMacroRegimeInflection,
        macroInflectionMaxRisk,
        macroInflectionRRFactor,
        enableDailyCircuitBreaker,
        maxConsecutiveLosses,
        enableCPRSqueezeGuard,
        enableUnifiedReclaim,
        enableCESpringboard,
        enableSpot200EMAGuard,
        fixedTarget
      });
      rawTrades.push(...confRes.executedTrades);
      skippedTrades.push(...confRes.skippedTrades);
      continue;
    }

    for (const side of ['CE', 'PE']) {
      const files = dayCfg[side] || [];
      for (const fname of files) {
        const resolvedName = resolveOptionFile(chartsDir, fname);
        const allBars = getBarsForFile(fname);
        const dayBars = allBars.filter(b => b.day === dayKey);
        if (!dayBars.length) continue;

        const strikeName = cleanStrikeName(resolvedName);
        let inPosition = false;
        let activeTrade = null;
        let activeSellZone = null;
        let activeBuyZone = null;
        let pendingSellZoneBreakout = null;

        for (let i = 0; i < dayBars.length; i++) {
          const bar = dayBars[i];
          const isLastBar = (i === dayBars.length - 1);
          const isEOD = bar.timeOnly >= '15:15';

          // Update Sell Zone tracking:
          // Invalidate active zone if price breaks out with sustained closes strictly above the zone ceiling
          const prevBar = i > 0 ? dayBars[i - 1] : bar;
          let sellZoneBrokeThisBar = false;
          if (activeSellZone && activeSellZone.active) {
            if (bar.close > activeSellZone.high && prevBar.close > activeSellZone.high) {
              activeSellZone.active = false;
              sellZoneBrokeThisBar = true;
            }
          }

          // Invalidate active Buy Zone if price breaks down with sustained closes strictly below zone floor
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
            const ceil = Math.max(bar.high, prevBar.high);
            const flr = Math.min(prevBar.low, prevBar.close);

            // If no active Sell Zone exists, or previous zone was broken/exhausted, initialize Parent Sell Zone
            if (!activeSellZone || !activeSellZone.active) {
              activeSellZone = {
                high: ceil,
                low: flr,
                buyRetestCount: 0,
                active: true,
                createdTime: bar.timeOnly
              };
            }
            // If already inside or below an active Parent Sell Zone, preserve the parent resistance bounds
          }

          // Exit condition if in position
          if (inPosition && activeTrade) {
            if (bar.high > (activeTrade.maxHigh || 0)) {
              activeTrade.maxHigh = bar.high;
            }
            let shouldExit = false;
            let exitPrice = 0;
            let exitReason = '';

            // 1. Check Target points exit (e.g. +15 points)
            if (targetPts > 0 && bar.high >= (activeTrade.entryPrice + targetPts)) {
              shouldExit = true;
              exitPrice = activeTrade.entryPrice + targetPts;
              exitReason = `Target (+${targetPts} pts)`;
            }
            // 1b. Breakout SL: for breakout trades, exit immediately if candle closes below cleared Sell Zone ceiling
            if (!shouldExit && enableBreakoutSL && activeTrade.isBreakoutEntry && i > activeTrade.entryIndex && activeTrade.clearedSellZoneHigh && bar.close < activeTrade.clearedSellZoneHigh) {
              shouldExit = true;
              exitPrice = Math.max(0.05, bar.close - slippagePts);
              exitReason = `Breakout SL (Closed ₹${bar.close.toFixed(1)} < Ceiling ₹${activeTrade.clearedSellZoneHigh.toFixed(1)})`;
            }
            // 1c. RMI Floor SL: For RMI Bounce trades (or all trades if enableRMIFloorExit), exit if candle closes below RMI Center
            if (!shouldExit && (enableRMIFloorExit || activeTrade.isRMIBounceEntry) && i > activeTrade.entryIndex && bar.rmiCenter !== null && !isNaN(bar.rmiCenter) && bar.close < bar.rmiCenter) {
              shouldExit = true;
              exitPrice = Math.max(0.05, bar.close - slippagePts);
              exitReason = activeTrade.isRMIBounceEntry
                ? `RMI Bounce SL (Closed ₹${bar.close.toFixed(1)} < RMI ₹${bar.rmiCenter.toFixed(1)})`
                : `RMI Floor Broken (Closed ₹${bar.close.toFixed(1)} < RMI ₹${bar.rmiCenter.toFixed(1)})`;
            }
            // 1c2. CE Floor Broken SL: For CE Bounce trades (or all trades if enableCEFloorSL), exit if candle closes below CE floor (longStop)
            if (!shouldExit && (enableCEFloorSL || activeTrade.isCEBounceEntry) && i > activeTrade.entryIndex && bar.longStop !== null && !isNaN(bar.longStop) && bar.longStop > 0 && bar.close < bar.longStop) {
              shouldExit = true;
              exitPrice = Math.max(0.05, bar.close - slippagePts);
              exitReason = activeTrade.isCEBounceEntry
                ? `CE Floor Broken SL (Closed ₹${bar.close.toFixed(1)} < CE ₹${bar.longStop.toFixed(1)})`
                : `CE Support Broken SL (Closed ₹${bar.close.toFixed(1)} < CE ₹${bar.longStop.toFixed(1)})`;
            }
            // 1d. CE Line Touch Target: If price touches or reaches Chandelier Exit resistance line
            const ceLine = bar.shortStop;
            const hasCe = ceLine !== null && !isNaN(ceLine) && ceLine > 0;
            if (!shouldExit && enableCETargetTouch && hasCe && bar.high >= ceLine) {
              shouldExit = true;
              exitPrice = Math.max(0.05, Math.min(bar.high, ceLine) - slippagePts);
              exitReason = `CE Line Touch (Target ₹${ceLine.toFixed(1)})`;
            }
            // 2. Near-CE Trailing Low Exit: for trades forming <= 5 pts from CE, exit when previous candle's low is broken
            if (!shouldExit && enableNearCETrail && activeTrade.isNearCE && i > activeTrade.entryIndex && bar.low < dayBars[i - 1].low) {
              shouldExit = true;
              exitPrice = Math.max(0.05, Math.min(bar.open, dayBars[i - 1].low) - slippagePts);
              exitReason = `Near-CE Exit (Prev Low ₹${dayBars[i - 1].low.toFixed(2)} Broken)`;
            }
            // 3. Redefined CE Chandelier Exit Rejection:
            // Condition 1: Must Actually Touch/Pierce CE Line (high >= ceLine - ceRejectionDist) & Close Below / Rejection Wick
            // Condition 2: Previous Candle Touched CE Line, Current Candle Breaks Previous Candle's Low
            if (!shouldExit && enableCERejectionExit && i > activeTrade.entryIndex) {
              const prevBar = dayBars[i - 1];
              const prevCe = prevBar.shortStop;
              const prevHasCe = prevCe !== null && !isNaN(prevCe) && prevCe > 0;

              // Rule 1: Must Actually Touch/Pierce CE Line and Close Below (Rejection Wick)
              const touchedThisBar = hasCe && (bar.high >= ceLine || (ceRejectionDist > 0 && (ceLine - bar.high <= ceRejectionDist)));
              const closedBelowThisBar = hasCe && (bar.close < ceLine);
              const rejectionWick = touchedThisBar && closedBelowThisBar;

              // Rule 2: Previous Candle Touched CE Line, Current Candle Breaks Previous Candle's Low
              const prevTouchedCE = prevHasCe && (prevBar.high >= prevCe || (ceRejectionDist > 0 && (prevCe - prevBar.high <= ceRejectionDist)));
              const currentBreaksPrevLow = prevTouchedCE && (bar.low < prevBar.low);

              if (rejectionWick) {
                shouldExit = true;
                exitPrice = Math.max(0.05, bar.close - slippagePts);
                exitReason = `CE Rejection (Touched CE ₹${ceLine.toFixed(1)}, Closed ₹${bar.close.toFixed(1)})`;
              } else if (currentBreaksPrevLow) {
                shouldExit = true;
                exitPrice = Math.max(0.05, Math.min(bar.open, prevBar.low) - slippagePts);
                exitReason = `CE Low Broken Exit (Prev touched CE ₹${prevCe.toFixed(1)}, Low ₹${prevBar.low.toFixed(1)} Broken)`;
              }
            }
            // 3b. Section 15.5 RMI Wick Rejection Exit:
            // Bar 1 wicks up into RMI resistance (high >= RMI) and closes below; Bar 2 closes below Bar 1 high and below RMI
            if (!shouldExit && enableRMIRejectionExit && i > activeTrade.entryIndex + 1 && prevBar.rmiCenter !== null && bar.rmiCenter !== null) {
              const prevTouchedRMI = prevBar.high >= prevBar.rmiCenter;
              const prevClosedBelowRMI = prevBar.close < prevBar.rmiCenter;
              const currBelowPrevHigh = bar.close < prevBar.high;
              const currBelowRMI = bar.close < bar.rmiCenter;
              if (prevTouchedRMI && prevClosedBelowRMI && currBelowPrevHigh && currBelowRMI) {
                shouldExit = true;
                exitPrice = Math.max(0.05, bar.close - slippagePts);
                exitReason = `RMI Rejection Exit Sec 15.5 (Touched ₹${prevBar.rmiCenter.toFixed(1)}, Rejected ₹${bar.close.toFixed(1)})`;
              }
            }
            // 4. Buy Zone Invalidation Exit (confirmed when 2 consecutive candles close strictly below the Buy Zone support floor)
            if (!shouldExit && filterInsideBuyZone && activeBuyZone && bar.close < activeBuyZone.low && prevBar.close < activeBuyZone.low) {
              shouldExit = true;
              exitPrice = Math.max(0.05, bar.close - slippagePts);
              exitReason = `Buy Zone Invalidated (2 Closes Below ₹${activeBuyZone.low.toFixed(1)})`;
            }
            // 5. Check Standalone HM Bearish exit (RSI < 3 EMA & RSI < 21 WMA)
            const isHMBearish = (bar.rsi !== null && bar.priceStrength !== null && bar.volStrength !== null) &&
              (bar.rsi < bar.priceStrength && bar.rsi < bar.volStrength);
            if (!shouldExit && (exitOnHMBearish || activeTrade.isRMIBounceEntry || activeTrade.isCEBounceEntry) && isHMBearish) {
              shouldExit = true;
              exitPrice = Math.max(0.05, bar.close - slippagePts);
              exitReason = `HM Bearish Exit (RSI ${bar.rsi.toFixed(1)} < P&V)`;
            }
            // 5. Point 1: Indicator Short Signal exit (MUST be HM Bearish confirmed if requireHMExitConfirmation is true)
            if (!shouldExit) {
              const isHMBearishState = (bar.rsi !== null && bar.priceStrength !== null && bar.volStrength !== null)
                ? (bar.rsi < bar.priceStrength && bar.rsi < bar.volStrength)
                : true;

              if (bar.shortSignal === 1) {
                // Check if price is resting inside active Buy Zone (demand support)
                let isInsideBuyZone = false;
                if (filterInsideBuyZone && activeBuyZone && activeBuyZone.active) {
                  if (bar.close >= activeBuyZone.low && bar.close <= activeBuyZone.high) {
                    activeBuyZone.bounceCount = (activeBuyZone.bounceCount || 0) + 1;
                    if (activeBuyZone.bounceCount <= maxBuyZoneBounces) {
                      isInsideBuyZone = true;
                      if (!activeTrade.buyZoneNotes) activeTrade.buyZoneNotes = [];
                      activeTrade.buyZoneNotes.push(`Sell Signal at ${bar.timeOnly} ignored (Inside Buy Zone [₹${activeBuyZone.low.toFixed(1)} - ₹${activeBuyZone.high.toFixed(1)}], Bounce #${activeBuyZone.bounceCount})`);
                    } else {
                      activeBuyZone.active = false; // exhausted after max bounces
                    }
                  }
                }

                if (!isInsideBuyZone) {
                  // If requireHMExitConfirmation is enabled, do NOT exit if HM is still bullish/neutral!
                  if (!requireHMExitConfirmation || isHMBearishState) {
                    shouldExit = true;
                    exitPrice = Math.max(0.05, bar.close - slippagePts);
                    exitReason = requireHMExitConfirmation ? 'Short Signal (HM Confirmed)' : 'Short Signal';
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

              const peakHigh = activeTrade.maxHigh ? Math.max(activeTrade.maxHigh, exitPrice) : exitPrice;
              const maxPointsRun = Math.round((peakHigh - activeTrade.entryPrice) * 100) / 100;
              const is25pointsReached = maxPointsRun >= 25.0;
              const is30pointsReached = maxPointsRun >= 30.0;
              const is50pointsReached = maxPointsRun >= 50.0;

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
                isBreakoutEntry: activeTrade.isBreakoutEntry || false,
                clearedSellZoneHigh: activeTrade.clearedSellZoneHigh || null,
                breakoutOrigTime: activeTrade.breakoutOrigTime || null,
                isRMIBounceEntry: activeTrade.isRMIBounceEntry || false,
                rmiCenterAtEntry: activeTrade.rmiCenterAtEntry || null,
                isCEBounceEntry: activeTrade.isCEBounceEntry || false,
                ceFloorAtEntry: activeTrade.ceFloorAtEntry || null,
                reasonShort: activeTrade.reasonShort,
                reasoning: (activeTrade.buyZoneNotes && activeTrade.buyZoneNotes.length)
                  ? `${activeTrade.reasoning} • 🛡️ ${activeTrade.buyZoneNotes.join(' • ')} • 🚪 Exit: ${exitReason}`
                  : `${activeTrade.reasoning} • 🚪 Exit: ${exitReason}`,
                lotSize: lotSize,
                grossPoints: grossPoints,
                grossPnL: grossPnL,
                commission: totalCommission,
                netPnL: netPnL,
                barsHeld: barsHeld,
                durationMinutes: barsHeld * 3,
                isWin: netPnL > 0,
                peakHigh: peakHigh,
                maxPointsRun: maxPointsRun,
                is25pointsReached: is25pointsReached,
                is30pointsReached: is30pointsReached,
                is50pointsReached: is50pointsReached
              });

              inPosition = false;
              activeTrade = null;
              continue;
            }
          }

          // Track and expire pending Sell Zone breakout candidate
          if (pendingSellZoneBreakout) {
            pendingSellZoneBreakout.barsWaiting++;
            // Cancel if an opposing short signal fired, or max wait bars exceeded, or EOD
            if (bar.shortSignal === 1 || pendingSellZoneBreakout.barsWaiting > pendingSellZoneBreakout.maxWaitBars || isEOD) {
              pendingSellZoneBreakout = null;
            }
          }

          // Trigger breakout entry if Sell Zone broke this bar
          const isWithinEntryHours = (bar.timeOnly >= entryStartTime && bar.timeOnly <= entryEndTime);
          if (!inPosition && isWithinEntryHours && pendingSellZoneBreakout && sellZoneBrokeThisBar) {
            inPosition = true;
            const entryPrice = bar.close + slippagePts;
            const ceLine = bar.longStop || bar.shortStop;
            const ceDist = (ceLine !== null && !isNaN(ceLine)) ? Math.round(Math.abs(bar.close - ceLine) * 100) / 100 : null;
            const isNearCE = enableNearCETrail && (ceDist !== null && ceDist <= ceNearThreshold);

            activeTrade = {
              day: dayKey,
              dayLabel: dayCfg.dayLabel || dayKey,
              side: side,
              strike: strikeName,
              file: fname,
              entryTime: bar.time,
              entryPrice: Math.round(entryPrice * 100) / 100,
              entryIndex: i,
              isNearCE: isNearCE,
              ceLine: ceLine,
              ceDist: ceDist,
              isBreakoutEntry: true,
              clearedSellZoneHigh: pendingSellZoneBreakout.zoneCeiling,
              breakoutOrigTime: pendingSellZoneBreakout.originalTimeOnly,
              reasonShort: `Breakout: Sell Zone Cleared`,
              reasoning: `🚀 Breakout Entry: Parent Sell Zone [₹${pendingSellZoneBreakout.zoneFloor.toFixed(1)} – ₹${pendingSellZoneBreakout.zoneCeiling.toFixed(1)}] ceiling broken with 2 closes above • Original 9 EMA signal at ${pendingSellZoneBreakout.originalTimeOnly} IST (₹${pendingSellZoneBreakout.originalPrice.toFixed(2)}) was blocked (Attempt #${pendingSellZoneBreakout.retestCount}) • Re-entered on confirmed breakout at ${bar.timeOnly} IST (Close ₹${bar.close.toFixed(2)}) • 🛡️ Breakout SL: ₹${pendingSellZoneBreakout.zoneCeiling.toFixed(1)} (Ceiling)`
            };

            const flr = Math.min(bar.low, prevBar.low);
            const ceil = Math.max(bar.open, bar.close, prevBar.close);
            activeBuyZone = {
              high: ceil,
              low: flr,
              bounceCount: 0,
              active: true,
              createdTime: bar.timeOnly
            };

            pendingSellZoneBreakout = null;
            continue;
          }

          // Entry condition if not in position (skip entries before 9:30 AM and after 2:45 PM IST)
          if (!inPosition && isWithinEntryHours) {
            // HM PVR Bullish State: Indicator EMA BUY (HM Confirmed) flag OR manual calculation RSI > 3 EMA & RSI > 21 WMA
            const hasHMMetrics = (bar.rsi !== null && bar.priceStrength !== null && bar.volStrength !== null);
            const isHMBullishState = (bar.emaBuyHM === 1) || (hasHMMetrics ? (bar.rsi > bar.priceStrength && bar.rsi > bar.volStrength) : false);

            const hasRMI = (bar.rmiCenter !== null && !isNaN(bar.rmiCenter) && prevBar.rmiCenter !== null && !isNaN(prevBar.rmiCenter));
            // 2-Bar RMI Support Bounce:
            // Bar 1 (prevBar): wick pierced/tested RMI from above (low <= rmiCenter), closed back above (close > rmiCenter)
            // Bar 2 (bar): closes above RMI (close > rmiCenter) AND closes above Bar 1 low (close > prevBar.low)
            const isRMIBounce = hasRMI &&
              (prevBar.low <= prevBar.rmiCenter && prevBar.close > prevBar.rmiCenter) &&
              (bar.close > bar.rmiCenter && bar.close > prevBar.low);

            // CE Pullback / Floor Bounce Entry:
            // Bar 1 (prevBar): wicks into/near green CE trailing floor (longStop) and closes above (low <= longStop + 3pt && close > longStop)
            // Bar 2 (bar): confirms support floor by closing above CE longStop and above Bar 1's low (close > longStop && close > prevBar.low)
            const hasLongStop = (bar.longStop !== null && !isNaN(bar.longStop) && bar.longStop > 0);
            const prevHasLongStop = (prevBar.longStop !== null && !isNaN(prevBar.longStop) && prevBar.longStop > 0);
            const prevTestedCEFloor = prevHasLongStop && (prevBar.low <= prevBar.longStop || (prevBar.low - prevBar.longStop <= 3.0));
            const prevHeldCEFloor = prevHasLongStop && (prevBar.close > prevBar.longStop);
            const currConfirmedCEFloor = hasLongStop && (bar.close > bar.longStop && bar.close > prevBar.low);
            const isCEBounce = hasLongStop && prevHasLongStop && prevTestedCEFloor && prevHeldCEFloor && currConfirmedCEFloor;

            const isLongSignal = (bar.longSignal === 1);
            let isEntryTrigger = false;
            if (entrySignalMode === 'ce_bounce') {
              isEntryTrigger = isCEBounce;
            } else if (entrySignalMode === 'rmi') {
              isEntryTrigger = isRMIBounce;
            } else if (entrySignalMode === 'ema') {
              isEntryTrigger = isLongSignal;
            } else {
              isEntryTrigger = (enableRMIBounceEntry && isRMIBounce) || (enableCEBounceEntry && isCEBounce) || isLongSignal;
            }

            // Determine composite trigger display name
            let trigName = '9 EMA Buy';
            if (isCEBounce && isRMIBounce && isLongSignal) {
              trigName = 'Triple Confluence (9 EMA + RMI + CE Bounce)';
            } else if (isCEBounce && isLongSignal) {
              trigName = '9 EMA + CE Bounce';
            } else if (isCEBounce && isRMIBounce) {
              trigName = 'RMI + CE Floor Bounce';
            } else if (isCEBounce) {
              trigName = 'CE Pullback Floor Bounce';
            } else if (isRMIBounce && isLongSignal) {
              trigName = '9 EMA + RMI Bounce';
            } else if (isRMIBounce) {
              trigName = 'RMI Support Bounce';
            }

            // Rule 1: Whenever the buy signal forms inside the active sell zone, do not attempt the trade
            let shouldSkipDueToSellZone = false;
            if (isEntryTrigger && (!requireHMBullish || isHMBullishState)) {
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
                        isRMIBounceEntry: isRMIBounce,
                        rmiCenterAtEntry: bar.rmiCenter,
                        isCEBounceEntry: isCEBounce,
                        ceFloorAtEntry: hasLongStop ? bar.longStop : null,
                        skipReason: `${trigName} signal inside Parent Sell Zone [₹${activeSellZone.low.toFixed(1)} - ₹${activeSellZone.high.toFixed(1)}] (Attempt #${activeSellZone.buyRetestCount})`,
                        reasonShort: `Blocked: Inside Sell Zone (Attempt #${activeSellZone.buyRetestCount})`,
                        reasoning: `🛑 Signal Blocked: ${trigName} signal fired at ${bar.timeOnly} IST on ${strikeName} (Close ₹${bar.close.toFixed(2)}) • Trapped inside active Parent Sell Zone [₹${activeSellZone.low.toFixed(2)} – ₹${activeSellZone.high.toFixed(2)}] • Retest Attempt #${activeSellZone.buyRetestCount} (Max allowed: ${maxSellZoneRetests}) • Filtered to avoid buying against resistance ceiling`
                      });

                      if (enableSellZoneBreakout) {
                        pendingSellZoneBreakout = {
                          originalTime: bar.time,
                          originalTimeOnly: bar.timeOnly,
                          originalPrice: bar.close,
                          retestCount: activeSellZone.buyRetestCount,
                          zoneCeiling: activeSellZone.high,
                          zoneFloor: activeSellZone.low,
                          barsWaiting: 0,
                          maxWaitBars: breakoutExpiryBars
                        };
                      }
                    }
                  } else {
                    // More than 2 buy attempts absorb/exhaust the zone
                    activeSellZone.active = false;
                  }
                }
              }
            } else if (isEntryTrigger && requireHMBullish && !isHMBullishState) {
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
                isRMIBounceEntry: isRMIBounce,
                rmiCenterAtEntry: bar.rmiCenter,
                isCEBounceEntry: isCEBounce,
                ceFloorAtEntry: hasLongStop ? bar.longStop : null,
                skipReason: `HM Not Bullish (RSI ${bar.rsi ? bar.rsi.toFixed(1) : 'N/A'} < P/V strength)`,
                reasonShort: 'Blocked: HM Not Bullish',
                reasoning: `🛑 Signal Blocked: ${trigName} signal fired at ${bar.timeOnly} IST on ${strikeName} (Close ₹${bar.close.toFixed(2)}) • Hybrid Momentum not confirmed bullish • RSI (${bar.rsi ? bar.rsi.toFixed(1) : 'N/A'}) vs Price (${bar.priceStrength ? bar.priceStrength.toFixed(1) : 'N/A'}) / Volume (${bar.volStrength ? bar.volStrength.toFixed(1) : 'N/A'})`
              });
            }

            const isEntryValid = isEntryTrigger && (!requireHMBullish || isHMBullishState) && !shouldSkipDueToSellZone;

            if (isEntryValid) {
              pendingSellZoneBreakout = null;
              inPosition = true;
              const entryPrice = bar.close + slippagePts;

              // Check if entry forms near the Chandelier Exit (CE) line (<= 5 pts)
              const ceLine = bar.longStop || bar.shortStop;
              const ceDist = (ceLine !== null && !isNaN(ceLine)) ? Math.round(Math.abs(bar.close - ceLine) * 100) / 100 : null;
              const isNearCE = (ceDist !== null && ceDist <= ceNearThreshold);

              let reasonShort = '9 EMA Long Signal';
              if (isCEBounce && isRMIBounce && isLongSignal) {
                reasonShort = 'Triple Confluence Buy';
              } else if (isCEBounce && isLongSignal) {
                reasonShort = '9 EMA + CE Bounce';
              } else if (isCEBounce && isRMIBounce) {
                reasonShort = 'RMI + CE Floor Bounce';
              } else if (isCEBounce) {
                reasonShort = 'CE Pullback Floor Bounce';
              } else if (isRMIBounce && isLongSignal) {
                reasonShort = '9 EMA + RMI Bounce';
              } else if (isRMIBounce) {
                reasonShort = 'RMI Support Bounce';
              } else if (isHMBullishState && bar.close >= (bar.vwap || bar.close)) {
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

              const triggerDesc = isCEBounce
                ? `🎯 Trigger: CE Pullback Floor Bounce confirmed at ${bar.timeOnly} IST on ${strikeName} (Prev Low ₹${prevBar.low.toFixed(2)} tested CE Floor ₹${prevBar.longStop.toFixed(2)}, Close ₹${bar.close.toFixed(2)} held support above CE ₹${bar.longStop.toFixed(2)}) • 🛡️ CE Floor SL: ₹${bar.longStop.toFixed(2)}`
                : (isRMIBounce
                  ? `🎯 Trigger: RMI Support Bounce confirmed at ${bar.timeOnly} IST on ${strikeName} (Prev Low ₹${prevBar.low.toFixed(2)} tested RMI ₹${prevBar.rmiCenter.toFixed(2)}, Close ₹${bar.close.toFixed(2)} held support)`
                  : `🎯 Trigger: 9 EMA Long Signal fired at ${bar.timeOnly} IST on ${strikeName}`);

              const reasonParts = [
                triggerDesc,
                isNearCE ? `🎯 Near-CE Setup: Entry ₹${bar.close.toFixed(2)} is within ${ceDist} pts of Chandelier Line (₹${ceLine.toFixed(2)})` : null,
                `📊 Price Action: Close ₹${bar.close.toFixed(2)} ${bar.ema9 ? 'crossed above 9 EMA (₹' + bar.ema9.toFixed(2) + ')' : ''}`,
                hasLongStop ? `🟢 CE Floor: ₹${bar.longStop.toFixed(2)} (Bullish Support Regime)` : null,
                hasRMI ? `📐 RMI Center: ₹${bar.rmiCenter.toFixed(2)} (${bar.close >= bar.rmiCenter ? 'Above RMI • Dynamic Support' : 'Below RMI'})` : null,
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
                isBreakoutEntry: false,
                isRMIBounceEntry: isRMIBounce,
                rmiCenterAtEntry: bar.rmiCenter,
                isCEBounceEntry: isCEBounce,
                ceFloorAtEntry: hasLongStop ? bar.longStop : null,
                reasonShort: reasonShort,
                reasoning: reasonParts.join(' • '),
                buyZoneNotes: []
              };

              const flr = Math.min(bar.low, prevBar.low);
              const ceil = Math.max(bar.open, bar.close, prevBar.close);
              activeBuyZone = {
                high: ceil,
                low: flr,
                bounceCount: 0,
                active: true,
                createdTime: bar.timeOnly
              };
            }
          }
        }
      }
    }
  }

  // Cross-Leg Coordination: Ensure opposing open trades are exited when a Breakout Entry occurs
  // (e.g. if PE triggers breakout entry at 12:09, ensure any CE trade active on that day is exited at or before 12:09)
  for (const tBreakout of rawTrades.filter(t => t.isBreakoutEntry)) {
    const oppSide = tBreakout.side === 'CE' ? 'PE' : 'CE';
    const oppTrades = rawTrades.filter(t => t.day === tBreakout.day && t.side === oppSide);
    for (const oppTrade of oppTrades) {
      if (oppTrade.entryTime < tBreakout.entryTime && oppTrade.exitTime > tBreakout.entryTime) {
        // Find the bar for the opposite trade at breakout time
        const oppBars = getBarsForFile(oppTrade.file).filter(b => b.day === oppTrade.day);
        const exitBarIdx = oppBars.findIndex(b => b.time === tBreakout.entryTime);
        const exitBar = exitBarIdx !== -1 ? oppBars[exitBarIdx] : oppBars[oppBars.length - 1];
        const newExitPrice = Math.max(0.05, (exitBar ? exitBar.close : oppTrade.entryPrice) - slippagePts);

        oppTrade.exitTime = tBreakout.entryTime;
        oppTrade.exitPrice = Math.round(newExitPrice * 100) / 100;
        oppTrade.exitReason = `Opposite Leg Breakout Exit (${tBreakout.side} Breakout Triggered @ ${tBreakout.entryTime.substring(11, 16)})`;
        oppTrade.grossPoints = Math.round((oppTrade.exitPrice - oppTrade.entryPrice) * 100) / 100;
        oppTrade.grossPnL = Math.round(oppTrade.grossPoints * lotSize * 100) / 100;
        oppTrade.netPnL = Math.round((oppTrade.grossPnL - oppTrade.commission) * 100) / 100;
        oppTrade.isWin = oppTrade.netPnL > 0;
        if (exitBarIdx !== -1 && oppTrade.entryIndex !== undefined) {
          oppTrade.barsHeld = Math.max(1, exitBarIdx - oppTrade.entryIndex);
          oppTrade.durationMinutes = oppTrade.barsHeld * 3;
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

  const runner25Trades = processedTrades.filter(t => t.is25pointsReached || (t.maxPointsRun >= 25.0)).length;
  const runner30Trades = processedTrades.filter(t => t.is30pointsReached || (t.maxPointsRun >= 30.0)).length;
  const runner50Trades = processedTrades.filter(t => t.is50pointsReached || (t.maxPointsRun >= 50.0)).length;
  const runner25Pct = totalTrades > 0 ? Math.round((runner25Trades / totalTrades) * 1000) / 10 : 0;
  const runner30Pct = totalTrades > 0 ? Math.round((runner30Trades / totalTrades) * 1000) / 10 : 0;
  const runner50Pct = totalTrades > 0 ? Math.round((runner50Trades / totalTrades) * 1000) / 10 : 0;

  const runner25GrossProfit = Math.round(runner25Trades * 25.0 * lotSize * 100) / 100;
  const runner30GrossProfit = Math.round(runner30Trades * 30.0 * lotSize * 100) / 100;
  const runner50GrossProfit = Math.round(runner50Trades * 50.0 * lotSize * 100) / 100;

  const runner25NetProfit = Math.round(processedTrades.reduce((acc, t) => {
    const reached = t.is25pointsReached || (t.maxPointsRun >= 25.0);
    if (reached) {
      const comm = t.commission !== undefined ? t.commission : (commissionPerOrder * 2);
      return acc + (25.0 * lotSize - comm);
    }
    return acc + t.netPnL;
  }, 0) * 100) / 100;

  const runner30NetProfit = Math.round(processedTrades.reduce((acc, t) => {
    const reached = t.is30pointsReached || (t.maxPointsRun >= 30.0);
    if (reached) {
      const comm = t.commission !== undefined ? t.commission : (commissionPerOrder * 2);
      return acc + (30.0 * lotSize - comm);
    }
    return acc + t.netPnL;
  }, 0) * 100) / 100;

  const runner50NetProfit = Math.round(processedTrades.reduce((acc, t) => {
    const reached = t.is50pointsReached || (t.maxPointsRun >= 50.0);
    if (reached) {
      const comm = t.commission !== undefined ? t.commission : (commissionPerOrder * 2);
      return acc + (50.0 * lotSize - comm);
    }
    return acc + t.netPnL;
  }, 0) * 100) / 100;

  const runner25Profit = runner25NetProfit;
  const runner30Profit = runner30NetProfit;
  const runner50Profit = runner50NetProfit;

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

    const dSkipped = skippedTrades.filter(s => s.day === dayKey).length;

    const dRunner25 = dTrades.filter(t => t.is25pointsReached || (t.maxPointsRun >= 25.0));
    const runner25Trades = dRunner25.length;
    const runner25GrossProfit = Math.round(runner25Trades * 25.0 * lotSize * 100) / 100;

    const dRunner30 = dTrades.filter(t => t.is30pointsReached || (t.maxPointsRun >= 30.0));
    const runner30Trades = dRunner30.length;
    const runner30GrossProfit = Math.round(runner30Trades * 30.0 * lotSize * 100) / 100;

    const dRunner50 = dTrades.filter(t => t.is50pointsReached || (t.maxPointsRun >= 50.0));
    const runner50Trades = dRunner50.length;
    const runner50GrossProfit = Math.round(runner50Trades * 50.0 * lotSize * 100) / 100;

    const target25NetPnL = Math.round(dTrades.reduce((acc, t) => {
      const reached = t.is25pointsReached || (t.maxPointsRun >= 25.0);
      if (reached) {
        const comm = t.commission !== undefined ? t.commission : (commissionPerOrder * 2);
        return acc + (25.0 * lotSize - comm);
      }
      return acc + t.netPnL;
    }, 0) * 100) / 100;

    const target30NetPnL = Math.round(dTrades.reduce((acc, t) => {
      const reached = t.is30pointsReached || (t.maxPointsRun >= 30.0);
      if (reached) {
        const comm = t.commission !== undefined ? t.commission : (commissionPerOrder * 2);
        return acc + (30.0 * lotSize - comm);
      }
      return acc + t.netPnL;
    }, 0) * 100) / 100;

    const target50NetPnL = Math.round(dTrades.reduce((acc, t) => {
      const reached = t.is50pointsReached || (t.maxPointsRun >= 50.0);
      if (reached) {
        const comm = t.commission !== undefined ? t.commission : (commissionPerOrder * 2);
        return acc + (50.0 * lotSize - comm);
      }
      return acc + t.netPnL;
    }, 0) * 100) / 100;

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
      points: Math.round(dTrades.reduce((acc, t) => acc + t.grossPoints, 0) * 100) / 100,
      skipped: dSkipped,
      runner25Trades,
      runner25Profit: target25NetPnL,
      runner25GrossProfit,
      target25NetPnL,
      runner30Trades,
      runner30Profit: target30NetPnL,
      runner30GrossProfit,
      target30NetPnL,
      runner50Trades,
      runner50Profit: target50NetPnL,
      runner50GrossProfit,
      target50NetPnL
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
      dateRange: (() => {
        const sortedDayKeys = Object.keys(assignments).sort();
        return sortedDayKeys.length ? `${sortedDayKeys[0]} to ${sortedDayKeys[sortedDayKeys.length - 1]}` : 'N/A';
      })(),
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
      runner25Trades,
      runner30Trades,
      runner50Trades,
      runner25Pct,
      runner30Pct,
      runner50Pct,
      runner25Profit,
      runner30Profit,
      runner50Profit,
      runner25NetProfit,
      runner30NetProfit,
      runner50NetProfit,
      runner25GrossProfit,
      runner30GrossProfit,
      runner50GrossProfit,
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
        isRMIBounceEntry: s.isRMIBounceEntry || false,
        rmiCenterAtEntry: s.rmiCenterAtEntry || null,
        isCEBounceEntry: s.isCEBounceEntry || false,
        ceFloorAtEntry: s.ceFloorAtEntry || null,
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
  DEFAULT_ASSIGNMENTS,
  SINGLE_PRIMARY_ASSIGNMENTS,
  resolveOptionFile,
  resolveNiftyPath,
  runConfluenceDay
};
