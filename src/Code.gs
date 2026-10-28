/**
 * Sheet Consolidation sample (fictional data only).
 * Pulls rows from several source tabs with different column names,
 * normalizes them into one "Consolidated" tab, skips duplicate rows
 * and logs them to "Duplicates log", and writes one line per run to "Run log".
 */
var SHEETS = {
  CONFIG: 'Config',
  OUT: 'Consolidated',
  DUP: 'Duplicates log',
  LOG: 'Run log'
};
// Standard columns of the consolidated sheet.
var STD = ['record_id', 'sku', 'date', 'item_name', 'qty', 'unit_price', 'branch', 'updated_at'];
// Duplicate key: same SKU + same date. The row with the latest updated_at is kept.
var KEY_FIELDS = ['sku', 'date'];
// All date handling uses the spreadsheet time zone (File > Settings), set once per run.
var TZ_ = 'Asia/Tokyo';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Consolidation')
    .addItem('Run consolidation', 'runConsolidation')
    .addItem('Create Config sheet template', 'createConfigTemplate')
    .addToUi();
}

/**
 * Config rows: source_tab | standard_column | source_column | format (optional) | spreadsheet_id (optional)
 * spreadsheet_id blank = the tab is in this file. Otherwise the tab is read from that file with openById.
 */
function readConfig_(ss) {
  var sh = ss.getSheetByName(SHEETS.CONFIG);
  if (!sh) throw new Error('Config sheet not found. Use menu: Create Config sheet template.');
  var rows = sh.getDataRange().getValues().slice(1);
  var map = {};
  rows.forEach(function (r) {
    var tab = String(r[0]).trim();
    if (!tab) return;
    map[tab] = map[tab] || {};
    var id = String(r[4] || '').trim();
    if (id) map[tab].__spreadsheetId = id;
    map[tab][String(r[1]).trim()] = { col: String(r[2]).trim(), format: String(r[3] || '').trim() };
  });
  return map;
}

function runConsolidation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  TZ_ = ss.getSpreadsheetTimeZone() || TZ_;
  var started = new Date();
  var stats = { read: 0, written: 0, dupes: 0, errors: 0 };
  var note = '';
  try {
    var config = readConfig_(ss);
    var all = [];
    var invalid = [];
    var files = {};
    Object.keys(config).forEach(function (tab) {
      var sh;
      try { sh = sourceFile_(ss, config[tab].__spreadsheetId, files).getSheetByName(tab); }
      catch (err) { invalid.push([tab, '', 'Cannot open file: ' + err.message]); return; }
      if (!sh) { invalid.push([tab, '', 'Source tab not found']); return; }
      var values = sh.getDataRange().getValues();
      var header = values.shift().map(function (h) { return String(h).trim(); });
      values.forEach(function (row, i) {
        if (row.join('') === '') return;
        stats.read++;
        var rec = normalizeRow_(row, header, config[tab], tab);
        if (rec.error) { invalid.push([tab, i + 2, rec.error]); stats.errors++; return; }
        rec.source = tab + '!' + (i + 2);
        all.push(rec);
      });
    });
    var result = dedupe_(all);
    stats.dupes = result.removed.length;
    stats.written = result.kept.length;
    writeOutput_(ss, result.kept);
    writeDuplicates_(ss, result.removed, started);
    if (invalid.length) note = invalid.length + ' row(s) skipped: ' + invalid.slice(0, 3).map(function (x) { return x.join(' '); }).join('; ');
    log_(ss, started, 'OK', stats, note);
    ss.toast(stats.written + ' rows consolidated, ' + stats.dupes + ' duplicate rows skipped and logged.', 'Consolidation');
  } catch (e) {
    log_(ss, started, 'ERROR', stats, e.message);
    throw e;
  }
}

/**
 * Separate-file path: opens another spreadsheet by ID (cached per run).
 * Not yet tested in real Google; checked only with the local stub in tests/local_check.js.
 * Needs the broader "spreadsheets" OAuth scope set in appsscript.json.
 */
function sourceFile_(ss, id, cache) {
  if (!id) return ss;
  if (!cache[id]) cache[id] = SpreadsheetApp.openById(id);
  return cache[id];
}

function normalizeRow_(row, header, tabMap, tab) {
  var rec = {};
  for (var i = 0; i < STD.length; i++) {
    var f = STD[i];
    var m = tabMap[f];
    if (f === 'branch' && !m) { rec.branch = tab; continue; }
    if (!m) { rec[f] = ''; continue; }
    if (m.col.indexOf('=') === 0) { rec[f] = m.col.slice(1); continue; } // constant value
    var idx = header.indexOf(m.col);
    if (idx < 0) return { error: 'Column "' + m.col + '" missing' };
    rec[f] = row[idx];
  }
  rec.sku = normalizeSku_(rec.sku);
  rec.item_name = String(rec.item_name).trim();
  rec.qty = toNumber_(rec.qty);
  rec.unit_price = toNumber_(rec.unit_price);
  rec.date = toDate_(rec.date, (tabMap.date || {}).format);
  rec.updated_at = toDate_(rec.updated_at, (tabMap.updated_at || {}).format) || rec.date;
  if (!rec.sku) return { error: 'SKU empty' };
  if (!rec.date) return { error: 'Date not readable' };
  return rec;
}

/** "ab 100", "ab_100", "AB100" all become "AB-100". */
function normalizeSku_(v) {
  var s = String(v).trim().toUpperCase().replace(/[\s_]+/g, '-');
  var m = s.match(/^([A-Z]+)(\d+)$/);
  return m ? m[1] + '-' + m[2] : s;
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? '' : n;
}

/** Accepts Date objects, yyyy-mm-dd, yyyy/mm/dd, dd/mm/yyyy (format "DMY"), mm/dd/yyyy (format "MDY"). */
function toDate_(v, format) {
  if (v instanceof Date) return v;
  var s = String(v).trim();
  if (!s) return null;
  var t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  var hh = t ? +t[1] : 0, mi = t ? +t[2] : 0, se = t && t[3] ? +t[3] : 0;
  var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return zonedDate_(+m[1], +m[2], +m[3], hh, mi, se);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (m) return format === 'DMY' ? zonedDate_(+m[3], +m[2], +m[1], hh, mi, se) : zonedDate_(+m[3], +m[1], +m[2], hh, mi, se);
  var d = new Date(s);
  return isNaN(d) ? null : d;
}

/** Builds the instant for a wall-clock time in the spreadsheet time zone (not the script time zone). */
function zonedDate_(y, mo, d, hh, mi, se) {
  var guess = new Date(Date.UTC(y, mo - 1, d, hh, mi, se));
  for (var i = 0; i < 2; i++) {
    var shown = Utilities.formatDate(guess, TZ_, 'yyyy-MM-dd HH:mm:ss').split(/[- :]/).map(Number);
    var diff = Date.UTC(shown[0], shown[1] - 1, shown[2], shown[3], shown[4], shown[5]) - Date.UTC(y, mo - 1, d, hh, mi, se);
    guess = new Date(guess.getTime() - diff);
  }
  return guess;
}

/** Keeps the row with the latest updated_at per SKU + date. Others are returned as removed. */
function dedupe_(records) {
  var best = {};
  var removed = [];
  records.forEach(function (r) {
    var key = r.sku + '|' + dayKey_(r.date);
    var cur = best[key];
    if (!cur) { best[key] = r; return; }
    if (r.updated_at > cur.updated_at) { removed.push({ rec: cur, keptBy: r.source, keptRec: r, key: key }); best[key] = r; }
    else { removed.push({ rec: r, keptBy: cur.source, keptRec: cur, key: key }); }
  });
  var kept = Object.keys(best).map(function (k) { return best[k]; });
  kept.sort(function (a, b) { return a.date - b.date || (a.sku < b.sku ? -1 : 1); });
  return { kept: kept, removed: removed };
}

function dayKey_(d) {
  return Utilities.formatDate(d, TZ_, 'yyyy-MM-dd');
}

function writeOutput_(ss, rows) {
  var sh = ss.getSheetByName(SHEETS.OUT) || ss.insertSheet(SHEETS.OUT);
  sh.clearContents();
  var out = [STD.concat(['source'])].concat(rows.map(function (r) {
    return STD.map(function (f) { return r[f]; }).concat([r.source]);
  }));
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.getRange(1, 1, 1, out[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function writeDuplicates_(ss, removed, runAt) {
  var sh = ss.getSheetByName(SHEETS.DUP) || ss.insertSheet(SHEETS.DUP);
  if (sh.getLastRow() === 0) sh.appendRow(['run_at', 'key (sku|date)', 'skipped_source', 'kept_source', 'skipped_updated_at', 'reason']);
  if (!removed.length) return;
  var rows = removed.map(function (d) {
    return [runAt, d.key, d.rec.source, d.keptBy, d.rec.updated_at, (d.rec.updated_at < (d.keptRec ? d.keptRec.updated_at : 0) ? 'Same SKU and date; older updated_at' : 'Same SKU and date; first read kept')];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function log_(ss, started, status, s, note) {
  var sh = ss.getSheetByName(SHEETS.LOG) || ss.insertSheet(SHEETS.LOG);
  if (sh.getLastRow() === 0) sh.appendRow(['started_at', 'seconds', 'status', 'rows_read', 'rows_written', 'duplicates_skipped', 'rows_with_errors', 'note']);
  sh.appendRow([started, (new Date() - started) / 1000, status, s.read, s.written, s.dupes, s.errors, note || '']);
}

function createConfigTemplate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.CONFIG) || ss.insertSheet(SHEETS.CONFIG);
  sh.clearContents();
  var rows = [['source_tab', 'standard_column', 'source_column', 'format', 'spreadsheet_id']].concat(CONFIG_SAMPLE.map(function (r) { return r.concat(['']); }));
  sh.getRange(1, 1, rows.length, 5).setValues(rows);
}

// Matches the sample CSVs in /sample_data.
var CONFIG_SAMPLE = [
  ['North Branch', 'record_id', 'ID', ''], ['North Branch', 'sku', 'SKU', ''], ['North Branch', 'date', 'Date', ''],
  ['North Branch', 'item_name', 'Item', ''], ['North Branch', 'qty', 'Qty', ''], ['North Branch', 'unit_price', 'Price', ''],
  ['North Branch', 'updated_at', 'Last Updated', ''],
  ['South Branch', 'record_id', 'Order No', ''], ['South Branch', 'sku', 'Product Code', ''], ['South Branch', 'date', 'Order Date', 'DMY'],
  ['South Branch', 'item_name', 'Description', ''], ['South Branch', 'qty', 'Quantity', ''], ['South Branch', 'unit_price', 'Unit Cost (USD)', ''],
  ['South Branch', 'updated_at', 'Modified', 'DMY'],
  ['Warehouse', 'record_id', 'ref', ''], ['Warehouse', 'sku', 'item_code', ''], ['Warehouse', 'date', 'txn_date', 'MDY'],
  ['Warehouse', 'item_name', 'name', ''], ['Warehouse', 'qty', 'units', ''], ['Warehouse', 'unit_price', 'cost', ''],
  ['Warehouse', 'updated_at', 'edited', 'MDY']
];
