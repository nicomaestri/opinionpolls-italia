const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Keep regression tests aligned with the coalition checkbox selector (v8).
// Displayed parties and coalition members must be independent selections.
const source = fs.readFileSync(path.join(__dirname, '../site/assets/app.js'), 'utf8')
  .replace(/\binit\(\);\s*$/, '');
const canvas = { _fullData: [] };
const context = {
  document: { getElementById: id => (id === 'chart' ? canvas : null) },
  window: { matchMedia: () => ({ matches: false }) },
  console
};
vm.createContext(context);
vm.runInContext(source, context);
const run = expression => vm.runInContext(expression, context);

run("PARTY_NAMES=['FdI','PD','Lega']; state.selected=new Set(['Lega']); state.coalitionMembers=new Set(['FdI','PD']); state.coalitionMode=true;");
const rows = [
  { date:'2025-09-10', firm:'A', n:1000, FdI:24, PD:19 },
  { date:'2025-09-17', firm:'A', n:1000, FdI:24.5, PD:19.5 },
  { date:'2025-10-01', firm:'A', n:1000, FdI:25, PD:20 },
  { date:'2025-10-08', firm:'A', n:1000, FdI:25.5, PD:20.5 },
  { date:'2026-08-25', firm:'A', n:1000, FdI:26, PD:20 },
  { date:'2026-09-01', firm:'A', n:1000, FdI:27, PD:21 },
  { date:'2026-09-01', firm:'B', n:1000, FdI:26 },
  { date:'2026-09-08', firm:'A', n:1000, FdI:28, PD:22 },
  { date:'2026-09-15', firm:'A', n:1000, FdI:29, PD:22 },
  { date:'2026-09-22', firm:'A', n:1000, FdI:30, PD:22 },
  { date:'2026-09-29', firm:'A', n:1000, FdI:30, PD:23 },
  { date:'2026-10-06', firm:'A', n:1000, FdI:31, PD:23 },
  { date:'2026-10-13', firm:'A', n:1000, FdI:31, PD:24 }
];
run(`var testRows=${JSON.stringify(rows)}; state.polls=testRows; var derived=chartRows(testRows);`);

assert.equal(run('coalitionMembers().join(",")'), 'FdI,PD', 'the coalition uses checkbox members, not displayed-party filters');
assert.equal(run('selectedParties().join(",")'), 'Lega', 'displayed-party filters remain separate');
assert.equal(run('derived[5][COALITION_KEY]'), 48, 'sum both components in the same poll');
assert.equal(run('derived[6][COALITION_KEY]'), null, 'missing PD must not silently count as zero');
assert.equal(run('renderTrend(derived).traces.length'), 2, 'coalition replaces individual curves in trends');
assert.equal(run('renderCI(derived).traces.length'), 2, 'coalition receives per-poll confidence intervals');

const model = run('supermediaSnapshot(derived,chartParties())');
assert.equal(model.items.length, 1);
assert.equal(model.items[0].party, '__custom_coalition__');
assert.ok(model.items[0].current > 50);
assert.ok(model.items[0].previous !== null, 'a historical observation near one year earlier gives a comparison bar');
assert.ok(model.comparison.startsWith('2025-10'), 'historical comparison is annual, not monthly');

const originalSuper = run('renderSupermedia(testRows)');
assert.equal(originalSuper.traces.length, 2);
assert.equal(originalSuper.traces[0].showlegend, false);
assert.equal(originalSuper.traces[1].showlegend, false);
// Historical bar is visible to the right, partially overlapped by the foreground bar.
const oldTrace=originalSuper.traces[0],newTrace=originalSuper.traces[1];
assert.ok(oldTrace.offset>newTrace.offset, 'pale historic bar must be shifted right');
assert.ok(oldTrace.offset<newTrace.offset+newTrace.width, 'bars must overlap, not be detached');
assert.equal(oldTrace.text[0],`${model.items[0].previous.toFixed(1)}%`,'historic bar has its own percentage label');
assert.equal(newTrace.text[0],`${model.items[0].current.toFixed(1)}%`,'current bar has its own percentage label');

run("state.from='2026-10-01'; state.to='2026-10-13';");
const filteredSuper = run('renderSupermedia(testRows.filter(inWindow))');
assert.deepEqual(filteredSuper.traces.map(t=>t.y), originalSuper.traces.map(t=>t.y),
  'changing the date window must not change the latest supermedia');

// A newly founded party/coalition without a year of observations has no pale bar.
run('var shortRows=testRows.filter(r=>r.date>="2026-08-01");');
const recentOnly = run('supermediaSnapshot(chartRows(shortRows),chartParties())');
assert.equal(recentOnly.items[0].previous, null, 'no one-year comparison without historical data');

run('state.tab="cv";');
assert.equal(run('renderCV(testRows).traces.length'), 0,
  'CV requires 3 firms and must ignore the coalition selector');
run("state.coalitionMode=false;state.selected=new Set(['FdI','PD']);state.tab='trend';");
assert.equal(run('renderTrend(testRows).traces.length'), 4, 'individual series return when coalition mode is off');

run(`state.tab='ci'; lastRender={traces:[
 {legendgroup:'FdI',mode:'markers',name:'FdI · sondaggi'},
 {legendgroup:'FdI',mode:'lines',name:'FdI · LOWESS'},
 {legendgroup:'PD',mode:'markers',name:'PD · sondaggi'},
 {legendgroup:'PD',mode:'lines',name:'PD · LOWESS'}
],layout:layoutBase(),title:'Intervalli di confidenza campionari'};`);
canvas._fullData=[{visible:true},{visible:true},{visible:'legendonly'},{visible:'legendonly'}];
const exported = run('exportTracesForPng()');
assert.equal(exported.length,2,'hidden party is removed completely from the PNG');
assert.equal(exported.filter(t=>t.showlegend).length,1,'one legend entry per visible party');
assert.equal(exported.find(t=>t.showlegend).name,'FdI');
assert.match(run('exportLayoutForPng(exportTracesForPng()).annotations.find(a=>a.text?.includes("Intervalli")).text'),/FdI/);

run(`state.from='2026-01-01';state.to='2026-12-31';state.reportedMode=true;state.coalitionMode=false;state.coalitionScenario='CSX vs. CDX vs. FN';state.coalitionPolls=[
  {date:'2026-05-27',firm:'BiDiMedia',scenario:'CSX vs. CDX vs. FN',n:1000,CSX:45.6,CDX:45.1},
  {date:'2026-09-15',firm:'Eumetra',scenario:'CSX vs. CDX vs. FN',n:800,CSX:41.9,CDX:40.7},
  {date:'2026-10-15',firm:'SWG',scenario:'Another coalition scenario',n:1200,CSX:44.6,CDX:44.0}
];state.tab='trend';`);
assert.equal(run('chartParties().join(",")'),'CSX,CDX','published coalition series use directly surveyed values');
assert.equal(run('displayedRows(testRows).length'),2,'do not pool surveys with different coalition scenarios');
assert.equal(run('renderTrend(displayedRows(testRows)).traces.length'),2,'two published coalition series');
run('state.reportedMode=false;');

console.log('OK v9 coalition checkboxes, strict same-poll sums, annual supermedia, date-filter independence and PNG legends');
