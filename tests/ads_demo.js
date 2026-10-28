// 広告3媒体の書き出し（架空）を、src/Code.gs を変えずに Config だけで1枚にまとめる例。Run: node tests/ads_demo.js
// Google のサービスは偽物（スタブ）に置き換えている。実際の Google スプレッドシートでは、まだこの広告データで実行していない。
// 実行日時は 2026-10-28 10:00（日本時間）に固定。シートのタイムゾーンは Asia/Tokyo。
const fs = require('fs'), vm = require('vm');
function parse(f) {
  return fs.readFileSync(f, 'utf8').trim().split('\n').map(l => {
    const out = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out;
  });
}
const D = 'sample_data/ads/';
const tabs = { 'Config': parse(D + 'config_ads.csv'), 'Google広告': parse(D + 'google_ads.csv'), 'Meta広告': parse(D + 'meta_ads.csv'), 'Yahoo広告': parse(D + 'yahoo_ads.csv') };
function sheet(n) { let d = tabs[n] || []; tabs[n] = d; return { getDataRange: () => ({ getValues: () => d.map(r => r.slice()) }), getLastRow: () => d.length, appendRow: r => d.push(r), clearContents: () => { d.length = 0 },
  getRange: (r) => ({ setValues: v => { v.forEach((x, i) => d[r - 1 + i] = x) }, setFontWeight: () => {} }), setFrozenRows: () => {} } }
const TZ = 'Asia/Tokyo';
const ss = { getSheetByName: n => tabs[n] ? sheet(n) : null, insertSheet: n => { tabs[n] = []; return sheet(n) }, toast: () => {}, getSpreadsheetTimeZone: () => TZ };
function fmt(d, tz, pat) { const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(x => p[x.type] = x.value); return pat.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second); }
const FIXED = Date.UTC(2026, 9, 28, 1, 0, 0);
const R = Date;
function FixedDate(...a) { return a.length ? new R(...a) : new R(FIXED); }
FixedDate.prototype = R.prototype; FixedDate.UTC = R.UTC; FixedDate.parse = R.parse; FixedDate.now = () => FIXED;
const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Utilities: { formatDate: fmt }, console, Date: FixedDate };
vm.createContext(ctx); vm.runInContext(fs.readFileSync('src/Code.gs', 'utf8'), ctx); ctx.runConsolidation();
const yen = n => Number(n).toLocaleString('ja-JP') + '円';
const t = d => fmt(d, TZ, 'yyyy-MM-dd HH:mm');
console.log('■ Consolidated（1枚にまとめた表）');
console.log('日付 | キャンペーン | 名前 | クリック | 費用 | 元の行');
const c = tabs['Consolidated']; const h = c[0];
c.slice(1).forEach(r => { const g = k => r[h.indexOf(k)]; console.log([fmt(g('date'), TZ, 'yyyy-MM-dd'), g('sku'), g('item_name'), g('qty'), yen(g('unit_price')), g('source')].join(' | ')); });
console.log('\n■ Duplicates log（同じキャンペーン・同じ日の重なり）');
tabs['Duplicates log'].slice(1).forEach(r => console.log([r[1], '外した行 ' + r[2], '残した行 ' + r[3], r[5]].join(' | ')));
console.log('\n■ Run log');
tabs['Run log'].slice(1).forEach(r => console.log(['開始 ' + t(r[0]), '状態 ' + r[2], '読んだ行 ' + r[3], '書いた行 ' + r[4], '重なり ' + r[5], 'エラー ' + r[6]].join(' | ')));
const ok = c.length - 1 === 8 && tabs['Duplicates log'].length - 1 === 2;
console.log(ok ? '\nPASS 10行を読み、8行にまとめ、重なり2行を記録' : '\nFAIL'); if (!ok) process.exit(1);
