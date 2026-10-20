const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../site/assets/app.js'),'utf8').replace(/\binit\(\);\s*$/,'');
const canvas={_fullData:[]};
const context={document:{getElementById:(id)=>id==='chart'?canvas:null}, window:{matchMedia:()=>({matches:false})},console};
vm.createContext(context);vm.runInContext(source,context);
const run=(str)=>vm.runInContext(str,context);
run("PARTY_NAMES=['FdI','PD','Lega'];state.selected=new Set(['FdI','PD']);state.coalitionMode=true;");
const rows=[
 {date:'2026-08-25',firm:'A',n:1000,FdI:26,PD:20},
 {date:'2026-09-01',firm:'A',n:1000,FdI:27,PD:21},
 {date:'2026-09-01',firm:'B',n:1000,FdI:26},
 {date:'2026-09-08',firm:'A',n:1000,FdI:28,PD:22},
 {date:'2026-09-15',firm:'A',n:1000,FdI:29,PD:22},
 {date:'2026-09-22',firm:'A',n:1000,FdI:30,PD:22},
 {date:'2026-09-29',firm:'A',n:1000,FdI:30,PD:23},
 {date:'2026-10-06',firm:'A',n:1000,FdI:31,PD:23},
 {date:'2026-10-13',firm:'A',n:1000,FdI:31,PD:24},
];
const json=JSON.stringify(rows);
run(`var testRows=${json}; var derived=chartRows(testRows);`);
assert.equal(run('derived[1][COALITION_KEY]'),48);
assert.equal(run('derived[2][COALITION_KEY]'),null,'missing PD must not be silently interpreted as zero');
assert.equal(run('renderTrend(derived).traces.length'),2,'coalition replaces individual curves');
assert.equal(run('renderCI(derived).traces.length'),2,'coalition receives per-poll CI');
const model=run('supermediaSnapshot(derived,chartParties())');
assert.equal(model.items.length,1);
assert.equal(model.items[0].party,'__custom_coalition__');
assert.ok(model.items[0].current>50);
assert.ok(model.items[0].previous!==null,'month-ago comparator available');
assert.equal(run('renderSupermedia(derived).traces.length'),2);
run('state.tab="cv";');
assert.equal(run('renderCV(testRows).traces.length'),0,'CV still enforces minimum 3 firms, unaffected by coalition mode');
run('state.coalitionMode=false;state.tab="trend";');
assert.equal(run('renderTrend(testRows).traces.length'),4,'parties display individually when coalition off');
run(`state.tab='ci'; lastRender={traces:[
 {legendgroup:'FdI',mode:'markers',name:'FdI · sondaggi'},
 {legendgroup:'FdI',mode:'lines',name:'FdI · LOWESS'},
 {legendgroup:'PD',mode:'markers',name:'PD · sondaggi'},
 {legendgroup:'PD',mode:'lines',name:'PD · LOWESS'}
],layout:layoutBase(),title:'Intervalli di confidenza campionari'};
`);
canvas._fullData=[{visible:true},{visible:true},{visible:'legendonly'},{visible:'legendonly'}];
const exported=run('exportTracesForPng()');
assert.equal(exported.length,2,'hidden legendonly party is fully removed from export');
assert.equal(exported.filter(t=>t.showlegend).length,1,'one legend entry per party');
assert.equal(exported.find(t=>t.showlegend).name,'FdI');
assert.match(run('exportLayoutForPng(exportTracesForPng()).annotations.find(a=>a.text?.includes("Intervalli")).text'),/FdI/);
console.log('OK coalition strict summing, 3 tabs, snapshot historical comparator, clean PNG legend');
