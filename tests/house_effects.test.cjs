'use strict';
const assert = require('node:assert/strict');
const {estimate,prepare} = require('../site/assets/house_effects.js');
function isoWeek(i){return new Date(Date.UTC(2026,0,4+7*i)).toISOString().slice(0,10);}
const biases={Alpha:1.2,Beta:-0.4,Gamma:-0.8};
const polls=[];
for(let t=0;t<16;t++){
 for(const [firm,bias] of Object.entries(biases)) {
   polls.push({date:isoWeek(t),firm,FdI:22+0.55*t+bias,n:1000});
 }
}
let r=estimate(polls,'FdI');
assert(r.ok,'OLS identifiable in balanced panel');
assert.equal(r.weekCount,16);
assert.equal(r.firmCount,3);
assert.equal(r.n,48);
for(const e of r.effects){assert(Math.abs(e.effect-biases[e.firm])<1e-8,e.firm+' effect must match synthetic truth');}
assert(Math.abs(r.effects.reduce((s,e)=>s+e.effect,0))<1e-9,'sum-zero normalization');
// Within-week duplicates of an existing poll should not upweight that firm.
const duplicate=polls.concat([{date:isoWeek(0),firm:'Alpha',FdI:22+1.2,n:1000}]);
r=estimate(duplicate,'FdI');
assert(r.ok);
for(const e of r.effects)assert(Math.abs(e.effect-biases[e.firm])<1e-8);
assert.equal(prepare(duplicate,'FdI').length,48,'one firm/week average');
// If there is no variation across firms in the same week, the model must not
// invent differences from the large common temporal trend.
const identical=[];
for(let t=0;t<16;t++)for(const firm of Object.keys(biases))identical.push({date:isoWeek(t),firm,FdI:20+2*t});
r=estimate(identical,'FdI');
assert(r.ok);for(const e of r.effects)assert(Math.abs(e.effect)<1e-8);
// Incomparable time supports and very short time ranges must not yield apparent effects.
const sparse=[];
for(let t=0;t<4;t++)for(const firm of Object.keys(biases))sparse.push({date:isoWeek(t),firm,FdI:20+t+biases[firm]});
assert.equal(estimate(sparse,'FdI').ok,false);
const tiny=estimate(polls.slice(0,3),'FdI');assert.equal(tiny.ok,false);
console.log('House effects checks passed: time FE, normalization, duplicated polls, zero bias and insufficient data.');
