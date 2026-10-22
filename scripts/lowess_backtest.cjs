#!/usr/bin/env node
'use strict';
// Time-ordered one-week-ahead evaluation of the exact site LOWESS implementation.
// Uses the site archive; no future weeks enter a fit.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'site/data/polls.json'),'utf8'));
const src=fs.readFileSync(path.join(root,'site/assets/app.js'),'utf8').replace(/\binit\(\);\s*$/,'');
const context=vm.createContext({console});vm.runInContext(src,context);
const partyNames = data.parties.filter(p=>['FdI','PD','M5S','Lega','FI','AVS','A','IV','NM','FN','PLD','ScN'].includes(p));
const candidates=[.10,.15,.20,.25,.30,.35,.40,.50];
const historySize=20; // Minimum weeks in each training fold
const actuals=[];
for(const p of partyNames){
  context.pollsInput=data.polls;context.partyInput=p;
  const weekly=vm.runInContext('weeklyStats(pollsInput,partyInput)',context);
  if(weekly.length<historySize+8)continue;
  // Ending at every week, use only previous weeks; stop at 2026 snapshots just as available.
  for(let t=Math.max(historySize,weekly.length-52);t<weekly.length;t++){
    const past=weekly.slice(0,t).map(r=>({date:r.date,y:r.mean}));
    const record={party:p,year:weekly[t].date.slice(0,4),actual:weekly[t].mean,n:past.length,pred:{}};
    context.pastInput=past;
    for(const a of candidates){context.alphaInput=a;record.pred[a]=vm.runInContext('lowess(pastInput,alphaInput).at(-1)',context);}
    record.pred['naive']=past.at(-1).y;
    actuals.push(record);
  }
}
if(!actuals.length){console.error('Insufficient history');process.exit(1);}
function summarize(key, records){
  const errors=records.map(r=>r.pred[key]-r.actual);
  return {span:key,n:records.length,rmse:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),mae:errors.reduce((s,e)=>s+Math.abs(e),0)/errors.length};
}
const output={archive_updated:data.updated_utc,first_date:data.polls[0].date,last_date:data.polls.at(-1).date,
  note:'One-week-ahead prediction of next weekly poll average using frozen previous-week LOWESS endpoint. One equal-weight contribution per firm/week, as in site; test scores are NOT validation against true support. Historical 2026 snapshot may differ from live archive.',
  by_party:Object.fromEntries([...new Set(actuals.map(r=>r.party))].map(p=>[p,[...candidates,'naive'].map(a=>summarize(a,actuals.filter(r=>r.party===p)))])),
  pooled:[...candidates,'naive'].map(a=>summarize(a,actuals))};
console.log(`Snapshot ${output.first_date} to ${output.last_date}, ${actuals.length} forecasts`);
console.log('Span\tN\tRMSE(pp)\tMAE(pp)');
for(const row of output.pooled)console.log(`${row.span}\t${row.n}\t${row.rmse.toFixed(4)}\t${row.mae.toFixed(4)}`);
console.log('Best:',output.pooled.filter(r=>r.span!=='naive').sort((a,b)=>a.rmse-b.rmse)[0].span);
if(process.argv.includes('--json'))fs.writeFileSync(path.join(root,'lowess_backtest_results.json'),JSON.stringify(output,null,2));
