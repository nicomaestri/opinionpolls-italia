'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../site/assets/app.js'),'utf8').replace(/\binit\(\);\s*$/,'');
class FakeElement {
  constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.value='';this.checked=false;this.disabled=false;this.open=false;this.style={};this.textContent='';this.className='';}
  append(...nodes){this.children.push(...nodes);}
  addEventListener(event,fn){this.handlers[event]=fn;}
  setAttribute(name,value){this[name]=value;}
}
const context={console,window:{matchMedia:()=>({matches:false})},document:{createElement:tag=>new FakeElement(tag),createTextNode:text=>({tag:'text',text}),getElementById:()=>({})}};
vm.createContext(context);vm.runInContext(source,context);
const run=code=>vm.runInContext(code,context);
run(`PARTY_NAMES=['FdI','PD','M5S','Lega','FI','AVS'];state.coalitionMembers=new Set(['FdI','Lega','FI']);state.coalitionBMembers=new Set(['PD','M5S','AVS']);state.coalitionMode=false;state.reportedMode=false;state.coalitionName='Coalizione A';state.coalitionBName='Coalizione B';render=()=>{};var menu=buildCoalitionMenu();menu.open=true;`);
const menu=run('menu');
function walk(n){return [n,...(n.children||[]).flatMap(walk)];}
const nodes=walk(menu);
const checks=nodes.filter(n=>n.tag==='input'&&n.type==='checkbox');
assert.equal(checks.length,12,'two separate checklists');
checks[0].checked=false;checks[0].handlers.change();
assert.equal(menu.open,true,'changing a checkbox does not close the menu');
assert.equal(run('state.coalitionMembers.has("FdI")'),true,'edits remain draft until apply');
checks[0].checked=true;checks[0].handlers.change();
const apply=nodes.find(n=>n.className==='coalition-toggle');
const select=nodes.find(n=>n.tag==='select');select.value='custom';
apply.handlers.click();
assert.equal(run('state.coalitionMode'),true,'apply activates custom comparison');
assert.equal(run('state.coalitionMembers.size'),3);
assert.equal(run('state.coalitionBMembers.size'),3);
assert.equal(menu.open,false,'menu closes only when applied');
console.log('OK v10 coalition menu: two checklists, draft selection persists, apply closes');
