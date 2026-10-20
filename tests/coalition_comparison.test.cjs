'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../site/assets/app.js'),'utf8').replace(/\binit\(\);\s*$/,'');
const context={console,window:{matchMedia:()=>({matches:false})},document:{getElementById:()=>({})}};
vm.createContext(context);vm.runInContext(source,context);
const run=code=>vm.runInContext(code,context);
const rows=[];
for(let i=0;i<8;i++){
  const d=new Date(Date.UTC(2025,8,10+i*7)).toISOString().slice(0,10);
  rows.push({date:d,firm:'Istituto A',n:1000,FdI:25+i*.1,Lega:8,FI:8,PD:21+i*.1,M5S:12,AVS:6});
}
for(let i=0;i<8;i++){
  const d=new Date(Date.UTC(2026,8,10+i*7)).toISOString().slice(0,10);
  rows.push({date:d,firm:'Istituto A',n:1000,FdI:29+i*.1,Lega:7,FI:7,PD:22+i*.1,M5S:11,AVS:7});
}
rows.push({date:'2026-10-30',firm:'Istituto B',n:1000,FdI:30,Lega:7,FI:7,PD:22,M5S:11}); // missing AVS
run(`PARTY_NAMES=['FdI','PD','M5S','Lega','FI','AVS'];state.polls=${JSON.stringify(rows)};state.coalitionMode=true;state.reportedMode=false;state.coalitionMembers=new Set(['FdI','Lega','FI']);state.coalitionBMembers=new Set(['PD','M5S','AVS']);state.coalitionName='Coalizione A';state.coalitionBName='Coalizione B';state.showHistorical=true;state.from='2026-10-01';state.to='2026-10-31';state.tab='super';`);
assert.equal(run('chartParties().length'),2,'show two independently defined coalitions');
assert.equal(run('chartRows(state.polls).at(-1)[COALITION_B_KEY]'),null,'missing B component is not zero');
assert.equal(run('chartRows(state.polls)[0][COALITION_KEY]'),41);
assert.equal(run('chartRows(state.polls)[0][COALITION_B_KEY]'),39);
const supermedia=run('renderSupermedia(state.polls)');
assert.equal(supermedia.traces.length,2,'both current and pale historical bars');
assert.ok(supermedia.gap && Number.isFinite(supermedia.gap.value),'gap only if two comparably recent series');
assert.equal(supermedia.traces[1].y.length,2,'two bars, one per coalition');
const gapValue=supermedia.gap.value;
assert.ok(Math.abs(gapValue-(supermedia.traces[1].y[0]-supermedia.traces[1].y[1]))<30, 'gap relates to the two current estimates');
run("state.showHistorical=false;");
assert.equal(run('renderSupermedia(state.polls).traces.length'),1,'historical bars can be hidden');
run("state.showHistorical=true;state.from='2025-09-01';state.to='2025-10-10';");
assert.equal(run('renderSupermedia(state.polls).gap.value'),gapValue,'supermedia and gap ignore date range');
run("state.coalitionBMembers=new Set();");
assert.equal(run('renderSupermedia(state.polls).gap'),null,'no gap for one coalition');
assert.equal(run('chartParties().length'),1,'one coalition is supported');
run("state.reportedMode=true;state.coalitionScenario='Scenario X';state.coalitionPolls=[{date:'2024-02-10',firm:'Istituto Z',scenario:'Scenario X',CSX:42,CDX:45,n:900}];");
const historic=run('renderSupermedia([])');
assert.equal(historic.observedOnly,true,'sparse reported scenarios fall back to dated observations');
assert.equal(historic.traces.length,1,'historical scenario has no invented lowess bar');
assert.deepEqual(Array.from(historic.traces[0].y),[45,42]);
assert.match(historic.description,/NON sono supermedie/);
run("state.coalitionPolls=[];");
assert.equal(run('renderSupermedia([]).traces.length'),0,'no observations are not fabricated');
const html=fs.readFileSync(path.join(__dirname,'../site/index.html'),'utf8');
assert.ok(html.includes('id="historical-date-controls"'));
assert.ok(html.includes('id="coalition-gap"'));
assert.ok(html.indexOf('01 / ULTIMA SUPERMEDIA') < html.indexOf('02 / SERIE STORICHE'));
console.log('OK v10: two named coalitions, same-poll aggregation, gap, history toggle, date independence, sparse Wikipedia fallback and ordered methodology');
