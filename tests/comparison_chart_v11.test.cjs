'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../site/assets/app.js'),'utf8').replace(/\binit\(\);\s*$/,'');
const context={console,window:{matchMedia:()=>({matches:false})},document:{getElementById:()=>({})}};
vm.createContext(context);vm.runInContext(source,context);
const run=expr=>vm.runInContext(expr,context);
const rows=[];
for(const year of [2025,2026])for(let i=0;i<10;i++){
 const d=new Date(Date.UTC(year,7,30+i*7)).toISOString().slice(0,10);
 rows.push({date:d,firm:'Istituto X',n:900,FdI:year===2025?27+i*.1:29+i*.1,
   Lega:8,FI:8,PD:year===2025?20+i*.1:21+i*.1,M5S:12,AVS:6,FN:year===2025?2:7,A:3.2});
}
run(`PARTY_NAMES=['FdI','PD','M5S','Lega','FI','AVS','FN','A'];state.polls=${JSON.stringify(rows)};
state.coalitionMode=true;state.reportedMode=false;
state.coalitionMembers=new Set(['FdI','Lega','FI']);
state.coalitionBMembers=new Set(['PD','M5S','AVS']);
state.comparisonExtras=new Set(['FN','A']);
state.coalitionName='CDX';state.coalitionBName='CSX';state.tab='super';`);
assert.equal(run('chartParties().join(",")'),'__custom_coalition__,__custom_coalition_b__,FN,A');
assert.equal(run('chartRows(state.polls)[0].FN'),2,'standalone parties are not altered');
const res=run('renderSupermedia(state.polls)');
assert.equal(res.traces.length,2,'annual comparison remains available');
assert.equal(res.traces[1].y.length,4,'two coalitions and two standalone parties');
assert.ok(res.gap && Number.isFinite(res.gap.value),'gap is calculated even with other series');
assert.equal(res.gap.labelA,'CDX');assert.equal(res.gap.labelB,'CSX');
const gap=res.gap.value;
run("state.from='2025-09-01';state.to='2025-09-10';");
assert.equal(run('renderSupermedia(state.polls).gap.value'),gap,'full archive independent from historic filter');
run("state.tab='trend';state.from='2025-08-01';state.to='2026-12-01';");
assert.ok(run('renderTrend(displayedRows(state.polls)).traces.length')>=8,'four LOWESS historical series');
run("state.tab='ci';");
assert.ok(run('renderCI(displayedRows(state.polls)).traces.length')>=8,'four CI series');
run(`state.tab='super';state.customChartTitle='CDX, CSX, FN e Azione';
 lastRender={traces:renderSupermedia(state.polls).traces,layout:renderSupermedia(state.polls).layout,
 title:state.customChartTitle,observedOnly:false};`);
const layout=run('exportLayoutForPng(lastRender.traces)');
assert.ok(layout.annotations.some(a=>a.text?.includes('CDX, CSX, FN e Azione')),'custom title appears in exported PNG');
assert.ok(layout.annotations.some(a=>a.text?.includes('LOWESS')),'LOWESS terminology is retained in the PNG');
console.log('OK v11: A+B+standalone parties, stable gap, original-poll sums, LOWESS and custom PNG title');
