const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../site/assets/app.js'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'../site/assets/style.css'),'utf8');
assert.match(code,/paper_bgcolor:\s*['"]#ffffff['"]/);
assert.match(code,/plot_bgcolor:\s*['"]#ffffff['"]/);
assert.match(code,/github\.com\/nicomaestri\/opinionpolls-italia/);
assert.match(code,/withChartSignature\(layout\)/);
assert.match(code,/annotations:\s*\[\.\.\.\(layout\.annotations\|\|\[\]\),signature\]/);
assert.match(code,/function exportLayoutForPng\(/);
assert.match(code,/function exportChartPng\(\)/);
assert.match(code,/function exportHeading\(\)/);
assert.match(code,/modeBarButtonsToRemove:\s*\[['"]toImage['"]/);
assert.match(code,/layout\.yaxis=\{\.\.\.axes,type:'category',autorange:'reversed',showgrid:false,tickfont:/);
assert.doesNotMatch(code,/scaleanchor:\s*['"]x['"]/);
assert.match(code,/layout\.height\s*=\s*layout\.height\s*\|\|\s*\(mobile\s*\?\s*515\s*:\s*460\)/, 'explicit chart height prevents stale Plotly sizing after OLS charts');
assert.match(code,/layout\.autosize\s*=\s*true/, 'Plotly must recalculate width on tab changes');
assert.match(css,/\.plot-wrap\.corr-scroll/);
assert.match(css,/@media\(max-width:680px\)/);
assert.match(code,/function exportTracesForPng\(\)/);
assert.match(code,/function liveVisibleTraces\(\)/);
console.log('OK white PNG export, visible-trace legend filtering, title, signature, rectangular heatmap and mobile scrolling');

// Run the new user-coalition/snapshot/export regression checks in the existing CI job.
require('./coalition_snapshot.test.cjs');

// v10 regressions are part of the GitHub Actions test step.
require('./coalition_comparison.test.cjs');

require('./coalition_menu.test.cjs');
