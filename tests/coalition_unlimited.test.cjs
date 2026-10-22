'use strict';
const fs=require('node:fs'), path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'site/assets/app.js'),'utf8').replace(/\binit\(\);\s*$/,'');
const ctx=vm.createContext({console});vm.runInContext(source,ctx);
const data=JSON.parse(fs.readFileSync(path.join(root,'site/data/polls.json'),'utf8'));
function run(expression){return vm.runInContext(expression,ctx);}
ctx.rows=data.polls;
run(`PARTY_NAMES=['FdI','PD','M5S','Lega','FI','AVS','A','IV','+E','NM','ScN','PLD','FN'];
state.polls=rows;state.selected=new Set(PARTY_NAMES);state.coalitionMode=true;
state.coalitionMembers=new Set(['FdI','Lega','FI','NM','ScN','PLD']);state.coalitionBMembers=new Set(['PD','M5S','AVS']);`);
// Strict aggregation continues to reject incomplete individual polls; no zeros.
assert.equal(run(`chartRows(rows).filter(r=>isValue(r[COALITION_KEY])).length`),0);
// But the new labelled fallback uses only recently observed component series.
const estimated=run(`estimatedCoalitionLatest(rows,coalitionMembers(),weekEndingSunday(rows.at(-1).date))`);
assert.ok(estimated && estimated.current && estimated.current.mean > 30 && estimated.current.mean < 60);
assert.equal(estimated.current.sparse.includes('ScN'),true);
const view=run('renderSupermedia(rows)');
const synthetic=view.traces.find(t=>t.type==='bar'&&t.name.startsWith('Ultima'));
assert.ok(synthetic,'Should include the synthesized coalition in current bars');
assert.ok(synthetic.customdata.some(row=>row[2].includes('Simulazione')),'Synthetic coalition must be labelled');
assert.ok(view.description.includes('somma indicativa'), 'Description must state approximation');
const series=run('syntheticCoalitionTrace(chartRows(rows),COALITION_KEY)');
assert.ok(series && series.x.length>=1);
const ci=run('renderCI(chartRows(rows))');
assert.ok(ci.description.includes('gli IC campionari NON sono calcolabili'));
assert.ok(!ci.traces.some(t=>t.legendgroup=== '__custom_coalition__' && t.error_y),'No invented CIs');
console.log('OK unlimited coalition: no artificial max, labelled aggregate estimate, sparse-party caution, no invented CIs');
