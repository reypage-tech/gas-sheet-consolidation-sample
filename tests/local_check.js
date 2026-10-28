// Local logic check with Node and stubbed Sheets objects (not real Google). Run: node tests/local_check.js
// SHEET_TZ sets the stubbed spreadsheet time zone (default Asia/Tokyo). TZ sets the script process time zone.
// Example of the case found in a real run: TZ=Asia/Tokyo SHEET_TZ=America/Los_Angeles node tests/local_check.js
const fs=require('fs');const vm=require('vm');
function parse(f){return fs.readFileSync(f,'utf8').trim().split('\n').map(l=>l.split(','));}
const tabs={'Config':parse('sample_data/config.csv'),'North Branch':parse('sample_data/north_branch.csv'),'South Branch':parse('sample_data/south_branch.csv'),'Warehouse':parse('sample_data/warehouse.csv')};
function sheet(n){let d=tabs[n]||[];tabs[n]=d;return{getDataRange:()=>({getValues:()=>d.map(r=>r.slice())}),getLastRow:()=>d.length,appendRow:r=>d.push(r),clearContents:()=>{d.length=0},
getRange:(r,c,nr,nc)=>({setValues:v=>{v.forEach((x,i)=>d[r-1+i]=x)},setFontWeight:()=>{}}),setFrozenRows:()=>{}}}
function makeSS(store){return{getSheetByName:n=>store[n]?sheetOf(store,n):null};}
function sheetOf(store,n){const d=store[n];return{getDataRange:()=>({getValues:()=>d.map(r=>r.slice())})};}
// Case 2 (SEPARATE=1): Warehouse lives in another fake file, Config points to it by spreadsheet_id.
const other={};
if(process.env.SEPARATE){other['Warehouse']=tabs['Warehouse'];delete tabs['Warehouse'];tabs['Config'].forEach((r,i)=>{if(i&&r[0]==='Warehouse')r[4]='FAKE_FILE_ID';});}
const ss={getSheetByName:n=>tabs[n]?sheet(n):null,insertSheet:n=>{tabs[n]=[];return sheet(n)},toast:m=>console.log('TOAST',m),getSpreadsheetTimeZone:()=>SHEET_TZ};
const SHEET_TZ=process.env.SHEET_TZ||'Asia/Tokyo';
function fmt(d,tz,pat){const p={};new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).forEach(x=>p[x.type]=x.value);return pat.replace('yyyy',p.year).replace('MM',p.month).replace('dd',p.day).replace('HH',p.hour).replace('mm',p.minute).replace('ss',p.second);}
const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:id=>{if(id!=='FAKE_FILE_ID')throw new Error('not found');return makeSS(other);}},Utilities:{formatDate:fmt},console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/Code.gs','utf8'),ctx);ctx.runConsolidation();
for(const n of ['Consolidated','Duplicates log','Run log'])console.log(n,JSON.stringify(tabs[n],null,0));
// Dates as the sheet shows them (spreadsheet time zone). Expected per source CSV: S-501 is 2026-10-01.
const shown=tabs['Consolidated'].slice(1).map(r=>r[0]+' '+fmt(r[2],SHEET_TZ,'yyyy-MM-dd'));
console.log('DATES ('+SHEET_TZ+')',shown.join(', '));
const s501=shown.find(x=>x.startsWith('S-501 '));
if(s501!=='S-501 2026-10-01'){console.log('FAIL S-501 date',s501);process.exit(1);}
console.log('PASS S-501 shown as 2026-10-01');
