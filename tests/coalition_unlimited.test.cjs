'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'site/assets/app.js'), 'utf8')
  .replace(/\binit\(\);\s*$/, '');
const ctx = vm.createContext({console});
vm.runInContext(source, ctx);
function run(expression) { return vm.runInContext(expression, ctx); }

// Do not make regression tests depend on how many complete polls Wikipedia
// happens to have on the day the scheduled workflow runs.
const polls = [];
const weeks = ['2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18'];
weeks.forEach((date, i) => {
  // All regular party series are available; one polling firm does not report ScN.
  polls.push({date, firm:'Istituto A', n:1000,
    FdI:27+i, Lega:6, FI:8, NM:1.5, PLD:2.5,
    PD:20+i/4, M5S:12, AVS:6});
});
// ScN is reported only once, by a different firm. Its absent entries are NOT zero.
polls.push({date:'2026-10-18',firm:'Istituto B',n:950,ScN:1.7});
// A genuine same-poll measurement of all six components also exists.
// This must be kept, not discarded just because there are six members.
polls.push({date:'2026-10-18',firm:'Istituto C',n:1200,
  FdI:31,Lega:6,FI:8,NM:1.5,ScN:1.7,PLD:2.5});

ctx.rows = polls;
run(`PARTY_NAMES=['FdI','PD','M5S','Lega','FI','AVS','A','IV','+E','NM','ScN','PLD','FN'];
  state.polls=rows;
  state.selected=new Set(PARTY_NAMES);
  state.coalitionMode=true;
  state.reportedMode=false;
  state.coalitionMembers=new Set(['FdI','Lega','FI','NM','ScN','PLD']);
  state.coalitionBMembers=new Set(['PD','M5S','AVS']);`);

const strictValues = run('chartRows(rows).map(r=>r[COALITION_KEY])');
assert.equal(strictValues.length, polls.length);
assert.equal(strictValues.filter(v=>v !== null).length, 1,
  'Exactly one complete six-party poll in the fixed test fixture');
assert.equal(strictValues.at(-1), 50.7,
  'A six-party coalition must be summed inside the same poll');
assert.equal(strictValues[0], null,
  'If even one component is absent, strict same-poll sum must be missing, not zero-filled');
assert.equal(run('coalitionPollValue(rows[0],coalitionMembers())'), null);

// The synthetic estimate supplements the incomplete polls; it is not passed off
// as a direct surveyed coalition. ScN is deliberately a short observed series.
const estimated = run('estimatedCoalitionLatest(rows,coalitionMembers(),weekEndingSunday(rows.at(-1).date))');
assert.ok(estimated?.current && estimated.current.mean > 30 && estimated.current.mean < 60);
assert.equal(estimated.current.sparse.includes('ScN'), true);

const view = run('renderSupermedia(rows)');
const currentTrace = view.traces.find(t=>t.type==='bar' && t.name.startsWith('Ultima'));
assert.ok(currentTrace, 'Latest supermedia contains a coalition bar');
assert.ok(currentTrace.customdata.some(data=>data[2].includes('Simulazione')),
  'Synthetic coalition is identified as a simulation');
assert.ok(view.description.includes('somma indicativa'),
  'The description must distinguish a sum of individual estimates from direct polls');

const series = run('syntheticCoalitionTrace(chartRows(rows),COALITION_KEY)');
assert.ok(series && series.x.length>=1);
const ci = run('renderCI(chartRows(rows))');
assert.ok(ci.description.includes('gli IC campionari NON sono calcolabili'));
assert.ok(!ci.traces.some(t=>t.legendgroup=== '__custom_coalition__' && t.error_y),
  'Never invent confidence intervals for a synthetic sum of party estimates');
console.log('OK unlimited coalitions: six parties, real complete polls, missing parties, synthetic fallback, no invented CIs');
