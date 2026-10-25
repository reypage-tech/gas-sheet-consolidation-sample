// Local logic check with Node and stubbed Sheets objects (not real Google). Run: TZ=Asia/Tokyo node tests/local_check.js
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
const ss={getSheetByName:n=>tabs[n]?sheet(n):null,insertSheet:n=>{tabs[n]=[];return sheet(n)},toast:m=>console.log('TOAST',m)};
const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:id=>{if(id!=='FAKE_FILE_ID')throw new Error('not found');return makeSS(other);}},Utilities:{formatDate:(d)=>d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()},console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/Code.gs','utf8'),ctx);ctx.runConsolidation();
for(const n of ['Consolidated','Duplicates log','Run log'])console.log(n,JSON.stringify(tabs[n],null,0));
