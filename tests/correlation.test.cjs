'use strict';
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const path = join(__dirname, '..','site','assets','app.js');
// Load pure dashboard statistics without starting the browser application.
const source = readFileSync(path, 'utf8').replace(/\binit\(\);\s*$/, '');
const context = vm.createContext({console, Intl, Date, Math, Map, Set});
vm.runInContext(source, context, {filename:'app.js'});
const calc = expr => vm.runInContext(expr, context);

const m1 = new Map(Array.from({length:10},(_,i)=>[String(i),i]));
const m2 = new Map(Array.from({length:10},(_,i)=>[String(i),20-2*i]));
const m3 = new Map(Array.from({length:10},(_,i)=>[String(i),4]));
context.testA=m1;
context.testB=m2;
context.testC=m3;
assert.equal(calc('pearsonCommon(testA,testB).r'),-1);
assert.equal(calc('pearsonCommon(testA,testA).r'),1);
assert.equal(calc('pearsonCommon(testA,testC).r'),null);
assert.equal(calc('pearsonCommon(testA,new Map(Array.from(testB).slice(0,7))).r'),null);
assert.equal(calc('pearsonCommon(testA,new Map(Array.from(testB).slice(0,7))).n'),7);

const points=[];
for(let i=0;i<9;i++) {
  const date=new Date(Date.UTC(2026,0,4+i*7)).toISOString().slice(0,10);
  if(i===4) continue;
  points.push({date,firm:'pollster',FdI:20+i*.25,PD:25-i*.15});
}
context.testRows=points;
const first=calc('correlationSeries(testRows,"FdI","changes")');
assert.equal(first.has('2026-02-08'), false, 'must not interpolate across missing weeks');
assert.equal(first.size,6, 'eight levels with one missing week have six adjacent differences');
const second=calc('correlationSeries(testRows,"FdI","levels")');
assert.equal(second.size,8);
console.log('Correlation checks passed: negative/positive r, insufficient sample, zero variance, missing-week gaps.');
