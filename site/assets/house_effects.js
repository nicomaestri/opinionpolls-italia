/* Relative polling-firm house effects, OLS with weekly fixed effects.
 * Pure JavaScript: recomputed using the date window selected by the visitor.
 * Estimates are descriptive, not a validation against election results.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HouseEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function weekEnding(iso) {
    const d = new Date(iso+'T12:00:00Z');
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate()+((7-d.getUTCDay())%7));
    return d.toISOString().slice(0,10);
  }
  function avg(a) { return a.reduce((s,x)=>s+x,0)/a.length; }
  // Partial pivoting: detect singular models rather than silently regularizing them.
  function solve(a,b) {
    const n=b.length;
    const A=a.map((r,i)=>[...r,b[i]]);
    const size=Math.max(1,...A.flatMap(r=>r.slice(0,n).map(Math.abs)));
    for(let k=0;k<n;k++) {
      let pivot=k;
      for(let i=k+1;i<n;i++) if(Math.abs(A[i][k])>Math.abs(A[pivot][k])) pivot=i;
      if(Math.abs(A[pivot][k])<1e-10*size) return null;
      [A[k],A[pivot]]=[A[pivot],A[k]];
      for(let i=k+1;i<n;i++) {
        const f=A[i][k]/A[k][k];
        for(let j=k;j<=n;j++) A[i][j]-=f*A[k][j];
      }
    }
    const x=new Array(n).fill(0);
    for(let i=n-1;i>=0;i--) {
      let rhs=A[i][n];
      for(let j=i+1;j<n;j++) rhs-=A[i][j]*x[j];
      x[i]=rhs/A[i][i];
    }
    return x;
  }
  function prepare(polls,party) {
    // One firm/week unit of observation, consistent with weekly series and CV.
    const fw=new Map();
    for(const row of polls) {
      const val=row[party];
      if(!Number.isFinite(val)||typeof row.firm!=='string')continue;
      const week=weekEnding(row.date);
      if(!week)continue;
      const key=JSON.stringify([week,row.firm]);
      if(!fw.has(key)) fw.set(key,{week,firm:row.firm,values:[]});
      fw.get(key).values.push(val);
    }
    return Array.from(fw.values()).map(r=>({week:r.week,firm:r.firm,y:avg(r.values),polls:r.values.length}));
  }
  function trim(rows,minFirmWeeks=3) {
    let current=rows;
    // Remove all firm/weeks with inadequate repeated observations / no contrast.
    for(let step=0;step<=rows.length;step++) {
      const fc=new Map(),wc=new Map();
      for(const row of current) {
        fc.set(row.firm,(fc.get(row.firm)||0)+1);
        wc.set(row.week,(wc.get(row.week)||0)+1);
      }
      const next=current.filter(r=>fc.get(r.firm)>=minFirmWeeks && wc.get(r.week)>=2);
      if(next.length===current.length)break;
      current=next;
    }
    return current;
  }
  function largestConnected(rows) {
    const byWeek=new Map(), byFirm=new Map();
    for(const row of rows) {
      if(!byWeek.has(row.week))byWeek.set(row.week,new Set());
      byWeek.get(row.week).add(row.firm);
      if(!byFirm.has(row.firm))byFirm.set(row.firm,new Set());
      byFirm.get(row.firm).add(row.week);
    }
    const pending=new Set(byFirm.keys()),components=[];
    while(pending.size) {
      const first=pending.values().next().value;
      const component=new Set([first]),queue=[first];pending.delete(first);
      for(let i=0;i<queue.length;i++) {
        for(const week of byFirm.get(queue[i])||[]) {
          for(const firm of byWeek.get(week)||[]) {
            if(!component.has(firm)) {
              component.add(firm);queue.push(firm);pending.delete(firm);
            }
          }
        }
      }
      const obs=rows.filter(r=>component.has(r.firm));
      components.push({firms:component,rows:obs});
    }
    components.sort((a,b)=>b.rows.length-a.rows.length);
    return {rows:components[0]?.rows||[],excluded:components.slice(1).reduce((s,c)=>s+c.firms.size,0)};
  }
  function estimate(polls,party,options={}) {
    const minWeeks=options.minWeeks??8;
    const minFirms=options.minFirms??3;
    const all=prepare(polls,party);
    let rows=trim(all,options.minFirmWeeks??3);
    const connected=largestConnected(rows);
    rows=connected.rows;
    const firms=Array.from(new Set(rows.map(r=>r.firm))).sort((a,b)=>a.localeCompare(b));
    const weeks=Array.from(new Set(rows.map(r=>r.week)));
    if(firms.length<minFirms || weeks.length<minWeeks || rows.length<Math.max(16,firms.length+weeks.length+2)) {
      return {party,ok:false,reason:'Servono almeno 3 istituti, 8 settimane con sovrapposizione e un numero adeguato di osservazioni.',n:rows.length,firmCount:firms.length,weekCount:weeks.length};
    }
    const byWeek=new Map();
    for(const row of rows) {
      if(!byWeek.has(row.week))byWeek.set(row.week,[]);
      byWeek.get(row.week).push(row);
    }
    // The columns of X are (firm indicator - within-week firm share),
    // excluding the first firm. This is the Frisch-Waugh-Lovell transform
    // of OLS with a complete set of weekly fixed effects.
    const k=firms.length-1, ref=firms[0];
    const index=new Map(firms.map((firm,i)=>[firm,i]));
    const XTX=Array.from({length:k},()=>new Array(k).fill(0));
    const XTy=new Array(k).fill(0);
    const residualRows=[];
    let withinSST=0;
    for(const wrows of byWeek.values()) {
      const m=avg(wrows.map(r=>r.y));
      const shares=new Array(k).fill(0);
      for(const r of wrows) {const j=index.get(r.firm)-1;if(j>=0)shares[j]+=1/wrows.length;}
      for(const r of wrows) {
        const xt=shares.map((v,j)=>(index.get(r.firm)===j+1?1:0)-v);
        const yt=r.y-m;
        withinSST+=yt*yt;
        for(let j=0;j<k;j++) {
          XTy[j]+=xt[j]*yt;
          for(let z=0;z<=j;z++)XTX[j][z]+=xt[j]*xt[z];
        }
        residualRows.push({row:r,xt,yt});
      }
    }
    for(let j=0;j<k;j++)for(let z=j+1;z<k;z++)XTX[j][z]=XTX[z][j];
    const beta=solve(XTX,XTy);
    if(!beta)return {party,ok:false,reason:'Il confronto non è identificabile: gli istituti non hanno sufficiente sovrapposizione temporale.',n:rows.length,firmCount:firms.length,weekCount:weeks.length};
    const raw=[0,...beta],center=avg(raw),alpha=raw.map(b=>b-center);
    let sse=0;
    for(const {xt,yt} of residualRows) {
      const err=yt-xt.reduce((s,x,j)=>s+x*beta[j],0);
      sse+=err*err;
    }
    const data=firms.map((firm,i)=>{
      const firmRows=rows.filter(r=>r.firm===firm);
      return {firm,effect:alpha[i],observations:firmRows.length,
        polls:firmRows.reduce((s,r)=>s+r.polls,0),weeks:firmRows.length};
    });
    // Zero-sum normalization is across included firms (unweighted).
    return {party,ok:true,effects:data.sort((a,b)=>a.effect-b.effect),
      n:rows.length,firmCount:firms.length,weekCount:weeks.length,
      excludedFirms:connected.excluded,
      r2Within:withinSST>1e-10?1-sse/withinSST:null,
      reference:ref,normalization:'unweighted-firm-sum-zero',
      methodology:'OLS firm and week fixed effects, firm-week mean, equal observation weights'};
  }
  return {estimate,prepare,weekEnding,solve};
});
