'use strict';

const DEFAULT_PARTIES = ['FdI', 'PD', 'M5S', 'Lega', 'FI', 'AVS', 'A', 'IV', '+E', 'NM', 'ScN', 'PLD', 'FN'];
let PARTY_NAMES = [...DEFAULT_PARTIES];
const COLORS = {CSX:'#c55269',CDX:'#386eb3',FdI:'#436ad9', PD:'#d34f60', M5S:'#ce9c24', Lega:'#349a74', FI:'#5e9cc9', AVS:'#9873c8', A:'#be754a', IV:'#8c62b1', '+E':'#e58a5a', NM:'#657f97', ScN:'#488a8c', PLD:'#b86c8d', FN:'#5d526f', DSP:'#8b8d39', Others:'#85909c'};
const COALITION_KEY = '__custom_coalition__';
const COALITION_COLOR = '#245a87';
const COALITION_B_KEY = '__custom_coalition_b__';
const COALITION_B_COLOR = '#bd5770';
const EXTRA_COLORS = ['#3b8f83','#b97463','#789bc4','#bd698c','#8e82ac','#b09342'];
function colorOf(party) {
  if(party===COALITION_KEY) return COALITION_COLOR;
  if(party===COALITION_B_KEY) return COALITION_B_COLOR;
  if(COLORS[party]) return COLORS[party];
  let hash=0;for(const ch of party)hash=((hash*33)+ch.codePointAt(0))>>>0;
  return EXTRA_COLORS[hash%EXTRA_COLORS.length];
}
const state = {polls:[], selected:new Set(DEFAULT_PARTIES), tab:'super', span:0.30, from:'', to:'', boxParty:'FdI', scale:'share', corrMode:'changes',cvView:'cv',houseView:'ranking',houseParty:'FdI',coalitionMode:false,coalitionName:'Coalizione personalizzata',coalitionMembers:new Set(['FdI','Lega','FI']),coalitionBMembers:new Set(['PD','M5S','AVS']),coalitionBName:'Coalizione B',showHistorical:true,reportedMode:false,coalitionPolls:[],coalitionScenario:'',comparisonExtras:new Set(),customChartTitle:''};
const $ = id => document.getElementById(id);
const dateUTC = date => new Date(`${date}T12:00:00Z`);
const toISO = date => date.toISOString().slice(0,10);
const fmtDate = date => new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(dateUTC(date));
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
const variance = values => values.length > 1 ? values.reduce((acc,v)=>acc+(v-mean(values))**2,0)/(values.length-1) : 0;
const average = values => values.length ? mean(values) : null;
const isValue = v => typeof v === 'number' && Number.isFinite(v);
const numFmt = n => new Intl.NumberFormat('it-IT').format(n);

function weekEndingSunday(iso) {
  const d = dateUTC(iso);
  d.setUTCDate(d.getUTCDate()+((7-d.getUTCDay())%7));
  return toISO(d);
}

function inWindow(p) {return p.date >= state.from && p.date <= state.to;}
function filtered() {return state.polls.filter(inWindow);}
function selectedParties() {return PARTY_NAMES.filter(p=>state.selected.has(p));}
function coalitionMembers() { return PARTY_NAMES.filter(p=>state.coalitionMembers.has(p)); }
function coalitionBMembers() { return PARTY_NAMES.filter(p=>state.coalitionBMembers.has(p)); }
function coalitionActive() { return state.coalitionMode && coalitionMembers().length >= 2; }
function secondCoalitionActive() {return coalitionActive() && coalitionBMembers().length >= 2;}
function reportedActive() { return state.reportedMode && !!state.coalitionScenario; }
// Coalitions and parties can share one comparison chart. Reported Wikipedia
// scenarios remain separate from simulations because they use different questions.
function chartParties() {
  return reportedActive() ? ['CSX','CDX'] : coalitionActive()
    ? [COALITION_KEY,...(secondCoalitionActive()?[COALITION_B_KEY]:[]),...PARTY_NAMES.filter(p=>state.comparisonExtras.has(p))]
    : selectedParties();
}

function reportedRows(rows){return rows.filter(r=>r.scenario===state.coalitionScenario);}
function displayedRows(rows){return reportedActive()?reportedRows(state.coalitionPolls).filter(inWindow):coalitionActive()?chartRows(rows):rows;}
function partyLabel(party) {
  if(party===COALITION_KEY) return state.coalitionName || 'Coalizione A';
  if(party===COALITION_B_KEY) return state.coalitionBName || 'Coalizione B';
  return party==='CSX'?'Centrosinistra (rilevato)':party==='CDX'?'Centrodestra (rilevato)':party;
}
// A missing party estimate is NOT a zero vote share. The coalition observation
// is defined only when all its components were published in the SAME poll.
function coalitionPollValue(poll, members) {
  if(members.length < 2 || !members.every(p => isValue(poll[p]))) return null;
  const sum=members.reduce((acc,p)=>acc+poll[p],0);
  return sum >= 0 && sum <= 100.000001 ? Math.min(100,sum) : null;
}
function chartRows(rows) {
  if(!coalitionActive()) return rows;
  const members=coalitionMembers();
  const others=coalitionBMembers();
  return rows.map(row=>({...row,[COALITION_KEY]:coalitionPollValue(row,members),
    [COALITION_B_KEY]:others.length>=2?coalitionPollValue(row,others):null}));
}
function coalitionAvailability(rows) {
  if(!coalitionActive()) return '';
  const count=rows.filter(r=>isValue(r[COALITION_KEY])).length;
  const second=secondCoalitionActive()?` Coalizione B: ${rows.filter(r=>isValue(r[COALITION_B_KEY])).length}/${rows.length} sondaggi completi.`:'';
  return ` Coalizione A: ${count}/${rows.length} sondaggi completi.${second}`;
}

// Keep firm-level means first; then give each polling firm equal weight per week.
function weeklyStats(polls, party) {
  const weeks = new Map();
  polls.forEach(row=>{
    if (!isValue(row[party])) return;
    const wk=weekEndingSunday(row.date);
    if (!weeks.has(wk)) weeks.set(wk,new Map());
    if (!weeks.get(wk).has(row.firm)) weeks.get(wk).set(row.firm,[]);
    weeks.get(wk).get(row.firm).push(row[party]);
  });
  return Array.from(weeks.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, firms])=>{
    const values = Array.from(firms.values()).map(mean);
    const m=mean(values);
    const sd=Math.sqrt(variance(values));
    return {date, mean:m, firms:values.length, sd, cv:m>0 ? sd/m*100 : null};
  });
}

// Robust LOWESS: local weighted linear regressions with tricube distance weights,
// bisquare residual reweighting (two robustification passes) and adaptive k-nearest span.
function lowess(values, span) {
  const n=values.length;
  if (n<3) return values.map(v=>v.y);
  const x=values.map(v=>dateUTC(v.date).getTime()/86400000), y=values.map(v=>v.y);
  const k=Math.min(n,Math.max(3,Math.ceil(span*n)));
  let robust=new Array(n).fill(1), fitted=new Array(n);
  for (let pass=0;pass<3;pass++) {
    for(let i=0;i<n;i++) {
      const distances=x.map(v=>Math.abs(v-x[i]));
      const sorted=distances.slice().sort((a,b)=>a-b);
      const scale=Math.max(sorted[k-1],1e-9)*1.000001;
      let sw=0,sx=0,sy=0,sxx=0,sxy=0;
      for(let j=0;j<n;j++) {
        const u=distances[j]/scale;
        if (u>=1) continue;
        const w=(1-u**3)**3*robust[j];
        const z=x[j]-x[i];
        sw+=w; sx+=w*z; sy+=w*y[j]; sxx+=w*z*z; sxy+=w*z*y[j];
      }
      const den=sw*sxx-sx*sx;
      fitted[i]=sw<=0 ? y[i] : (Math.abs(den)<1e-10 ? sy/sw : (sy*sxx-sx*sxy)/den);
    }
    if (pass===2) break;
    const errors=y.map((yi,i)=>Math.abs(yi-fitted[i]));
    const sortedErr=errors.slice().sort((a,b)=>a-b);
    const med=sortedErr[Math.floor(n/2)];
    if (med<1e-9) break;
    const cutoff=6*med;
    robust=errors.map(e=>{let u=e/cutoff;return u>=1 ? 0 : (1-u*u)**2;});
  }
  return fitted;
}

const axes={
  gridcolor:'#eef2f7', zeroline:false, linewidth:0, linecolor:'#edf1f7', showline:false,
  tickfont:{color:'#8593aa',size:11}, titlefont:{color:'#7a879b',size:11}
};
const layoutBase=()=>({
  // White, opaque background on the website AND in exported PNG files.
  paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',
  margin:{l:60,r:25,t:18,b:100},
  font:{family:'DM Sans,Arial,sans-serif',color:'#495b76',size:12},
  legend:{orientation:'h',x:0,y:1.15,yanchor:'bottom',font:{size:11},tracegroupgap:4},
  hovermode:'closest',
  xaxis:{...axes,type:'date',tickformat:'%b %Y',hoverformat:'%d %b %Y'},
  yaxis:{...axes,title:'Intenzioni di voto (%)',ticksuffix:'%',rangemode:'tozero'},
  showlegend:true
});
const GITHUB_URL = 'https://github.com/nicomaestri/opinionpolls-italia';
const BRAND_LABEL = 'Opinion Polls Italia · github.com/nicomaestri/opinionpolls-italia';
const config={
  responsive:true,displaylogo:false,scrollZoom:false,
  // The dedicated PNG button below the chart includes title, mode and attribution.
  modeBarButtonsToRemove:['toImage','lasso2d','select2d','autoScale2d','toggleSpikelines'],
  toImageButtonOptions:{format:'png',filename:'opinionpolls-italia',width:1400,height:650,scale:2}
};

// Keep the signature within a reserved white footer in every plot.
// Its anchor is defined in pixels from the chart bottom, so it works
// with rotated boxplot labels and the annotations in correlation heatmaps.
function withChartSignature(layout) {
  const bottomMargin = layout.margin?.b ?? 100;
  const compact = typeof window!=='undefined' && window.matchMedia('(max-width:680px)').matches && !layout.width;
  const signature = {
    xref:'paper',yref:'paper',x:0,y:0,
    xanchor:'left',yanchor:'bottom',yshift:18-bottomMargin,
    showarrow:false,align:'left',
    text:`<a href="${GITHUB_URL}" target="_blank">${compact ? "Opinion Polls Italia · GitHub" : BRAND_LABEL}</a>`,
    font:{family:'DM Sans,Arial,sans-serif',size:11,color:'#64748b'}
  };
  return {...layout,annotations:[...(layout.annotations||[]),signature]};
}

function renderTrend(rows) {
  const traces=[]; let total=0;
  for(const party of chartParties()) {
    const agg=weeklyStats(rows,party);if(!agg.length) continue;
    total+=agg.length;
    const label=partyLabel(party);
    const levels=state.scale==='index' ? agg.map(v=>100*v.mean/agg[0].mean) : agg.map(v=>v.mean);
    traces.push({x:agg.map(v=>v.date),y:levels,name:`${label} · media sett.`,type:'scatter',mode:'lines+markers',line:{color:colorOf(party),width:1},marker:{color:colorOf(party),size:5},opacity:.36,legendgroup:party,hovertemplate:`${label} · %{x}<br>Media: %{y:.2f}${state.scale==='index'?'':'%'}<extra></extra>`});
    if(agg.length>=3)traces.push({x:agg.map(v=>v.date),y:lowess(agg.map((v,i)=>({date:v.date,y:levels[i]})),state.span),name:`${label} · LOWESS`,type:'scatter',mode:'lines',line:{color:colorOf(party),width:3.3},legendgroup:party,hovertemplate:`${label} · LOWESS<br>%{x}: %{y:.2f}${state.scale==='index'?'':'%'}<extra></extra>`});
  }
  const layout=layoutBase();
  if(state.scale==='index'){layout.yaxis={...axes,title:'Indice (prima settimana = 100)',ticksuffix:'',rangemode:'normal'};}
  return {traces,layout,description:`${total} medie partito-settimana. Ogni istituto conta una volta per settimana.${state.scale==='index'?' Indice = 100 alla prima settimana del periodo selezionato.':''}${coalitionAvailability(rows)}`};
}

function renderCI(rows) {
  const traces=[];let count=0,without=0;
  for(const party of chartParties()) {
    const label=partyLabel(party);
    const usable=rows.filter(v=>isValue(v[party]));
    without+=usable.filter(v=>!v.n).length;
    const p=usable.filter(v=>v.n && v.n>=100);
    if(!p.length)continue;
    count+=p.length;
    const halfwidths=p.map(v=>1.96*100*Math.sqrt((v[party]/100)*(1-v[party]/100)/v.n));
    traces.push({type:'scatter',mode:'markers',x:p.map(v=>v.date),y:p.map(v=>v[party]),name:`${label} · sondaggi`,legendgroup:party,marker:{size:6,color:colorOf(party),opacity:.55},error_y:{type:'data',array:halfwidths,visible:true,color:colorOf(party)+'66',thickness:.7,width:1.7},customdata:p.map((v,i)=>[v.firm,v.n,halfwidths[i],Math.max(0,v[party]-halfwidths[i]),Math.min(100,v[party]+halfwidths[i])]),hovertemplate:`${label} · %{x}<br>Istituto: %{customdata[0]}<br>Stima: %{y:.1f}%<br>Campione: %{customdata[1]}<br>IC 95%: [%{customdata[3]:.2f}%, %{customdata[4]:.2f}%]<extra>IC teorico</extra>`});
    const agg=weeklyStats(rows,party);
    if(agg.length>=3)traces.push({type:'scatter',mode:'lines',x:agg.map(v=>v.date),y:lowess(agg.map(v=>({date:v.date,y:v.mean})),state.span),name:`${label} · LOWESS`,legendgroup:party,line:{color:colorOf(party),width:2.7},hovertemplate:`LOWESS ${label}: %{y:.2f}%<extra></extra>`});
  }
  return {traces,layout:layoutBase(),description:`${numFmt(count)} osservazioni con numerosità nota. ${numFmt(without)} misure senza n escluse dagli IC (non dalle altre analisi).${coalitionAvailability(rows)}`};
}

function supermediaSnapshot(rows, parties, span=state.span) {
  const aggregates=new Map(parties.map(p=>[p,weeklyStats(rows,p)]));
  const dates=Array.from(aggregates.values()).flatMap(a=>a.map(d=>d.date));
  if(!dates.length) return {anchor:null,comparison:null,items:[]};
  const anchor=dates.sort().at(-1);  // shared reference week for all displayed parties
  const cutoff=toISO(new Date(dateUTC(anchor).getTime()-365*86400000));
  const items=[];
  for(const party of parties){
    const weekly=aggregates.get(party);
    if(weekly.length<3)continue;
    const latest=weekly.at(-1);
    if((dateUTC(anchor)-dateUTC(latest.date))/86400000>14)continue; // stale series
    // Both current and historical bars are points of the SAME full-archive LOWESS.
    const fitted=lowess(weekly.map(v=>({date:v.date,y:v.mean})),span);
    const current=fitted.at(-1);
    const target=dateUTC(cutoff).getTime();
    let previous=null, previousDate=null;
    const candidates=weekly.map((v,i)=>({index:i,distance:Math.abs(dateUTC(v.date).getTime()-target)/86400000}));
    candidates.sort((a,b)=>a.distance-b.distance);
    if(candidates[0]?.distance<=28){
      previous=fitted[candidates[0].index];
      previousDate=weekly[candidates[0].index].date;
    }
    items.push({party,label:partyLabel(party),current,previous,latest:latest.date,previousDate});
  }
  items.sort((a,b)=>b.current-a.current);
  return {anchor,comparison:cutoff,items};
}
function supermediaObservedFallback(rows, parties) {
  // Historical scenario: show actual last published weekly observations ONLY.
  // This is never described as a LOWESS supermedia.
  const items=[];
  for(const party of parties){
    const weekly=weeklyStats(rows,party);
    if(!weekly.length)continue;
    const last=weekly.at(-1);
    items.push({party,label:partyLabel(party),current:last.mean,previous:null,latest:last.date,previousDate:null,observed:true});
  }
  items.sort((a,b)=>b.current-a.current);
  return items;
}
function coalitionGap(items) {
  // Other parties in the chart must not disable the A–B comparison.
  const a=items.find(d=>d.party===COALITION_KEY);
  const b=items.find(d=>d.party===COALITION_B_KEY);
  if(!a || !b || !isValue(a.current) || !isValue(b.current))return null;
  const days=Math.abs(dateUTC(a.latest)-dateUTC(b.latest))/86400000;
  if(days>14)return null;
  return {labelA:a.label,labelB:b.label,value:a.current-b.current};
}

function renderSupermedia(rows) {
  const sourceRows=reportedActive()?reportedRows(state.coalitionPolls):coalitionActive()?chartRows(state.polls):state.polls;
  const snapshot=supermediaSnapshot(sourceRows,chartParties());
  let items=snapshot.items;
  let observedOnly=false;
  if(reportedActive() && items.length<2){
    items=supermediaObservedFallback(sourceRows,chartParties());
    observedOnly=items.length>0;
  }
  if(!items.length){
    const message=reportedActive()
      ? `Nessun sondaggio disponibile nello scenario «${state.coalitionScenario}». Verifica che la fonte abbia pubblicato rilevazioni con quote CSX/CDX.`
      : 'Nessuna serie con almeno tre settimane recenti di dati disponibili per la supermedia.';
    return {traces:[],layout:layoutBase(),description:message,gap:null,observedOnly:false};
  }
  const xs=items.map((_,i)=>i),colors=items.map(d=>colorOf(d.party));
  const historical=state.showHistorical&&!observedOnly;
  // A lightly offset, partially-overlapping historical bar as requested.
  const previous={type:'bar',name:'LOWESS un anno prima',x:xs,y:items.map(d=>d.previous),
    width:.48,offset:.035,marker:{color:colors.map(c=>lightenHex(c,.64)),line:{width:0}},
    // Historical percentages use annotations (painted above the current bars)
    // so close current and historical values remain readable when offset.
    text:items.map(d=>d.previous===null?'':`${d.previous.toFixed(1)}%`),textposition:'none',cliponaxis:false,
    customdata:items.map(d=>[d.label,d.previousDate||'n.d.']),
    hovertemplate:'%{customdata[0]}<br>LOWESS un anno prima: %{y:.2f}%<br>Settimana: %{customdata[1]}<extra></extra>',showlegend:false};
  const current={type:'bar',name:observedOnly?'Ultima rilevazione osservata':'Ultima supermedia LOWESS',x:xs,y:items.map(d=>d.current),
    width:.64,offset:-.35,marker:{color:colors,line:{width:0}},
    text:items.map(d=>`${d.current.toFixed(1)}%`),textposition:'outside',
    textfont:{size:14,color:'#29405c'},cliponaxis:false,
    customdata:items.map(d=>[d.label,d.latest]),
    hovertemplate:`%{customdata[0]}<br>${observedOnly?'Ultima rilevazione (non LOWESS)':'Ultima LOWESS'}: %{y:.2f}%<br>Settimana: %{customdata[1]}<extra></extra>`,showlegend:false};
  const layout=layoutBase();layout.barmode='overlay';layout.bargap=.18;
  layout.margin={l:58,r:22,t:28,b:94};layout.showlegend=false;
  layout.xaxis={...axes,type:'linear',showgrid:false,tickmode:'array',tickvals:xs,ticktext:items.map(d=>d.label),tickfont:{size:12,color:'#41536d'},range:[-.62,items.length-.38]};
  layout.yaxis={...axes,title:'Intenzioni di voto (%)',ticksuffix:'%',range:[0,Math.max(5,...items.map(d=>d.current),...(historical?items.map(d=>d.previous??0):[0]))*1.23]};
  if(historical){
    layout.annotations=items.flatMap((d,i)=>d.previous===null?[]:[{
      xref:'x',yref:'y',x:i+.27,y:d.previous,showarrow:false,
      xanchor:'left',yanchor:'bottom',xshift:3,yshift:7,
      text:`${d.previous.toFixed(1)}%`,font:{size:items.length>8?10:12,color:lightenHex(colors[i],.26)}
    }]);
  }
  const gap=coalitionActive()&&secondCoalitionActive()?coalitionGap(items):null;
  const sourceNote=reportedActive()?`Scenario Wikipedia: ${state.coalitionScenario}. `:'';
  let description;
  if(observedOnly)description=`${sourceNote}Ultime quote pubblicate: ${items.map(d=>`${d.label} (${d.latest})`).join('; ')}. NON sono supermedie né LOWESS. Nessuna interpolazione o previsione è stata eseguita.`;
  else description=`${sourceNote}${items.length} serie (coalizioni e/o partiti) · ultimo riferimento ${snapshot.anchor}; ${historical?'confronto con LOWESS circa un anno prima. ':'confronto storico disattivato. '}La supermedia usa sempre l'intero archivio.`;
  return {traces:historical?[previous,current]:[current],layout,description,gap,observedOnly};
}

function lightenHex(hex, weight){
  const digits=hex.match(/^#([a-fA-F0-9]{6})$/)?.[1];if(!digits)return '#bfcde6';
  return '#'+[0,2,4].map(i=>Math.round(parseInt(digits.slice(i,i+2),16)*(1-weight)+255*weight).toString(16).padStart(2,'0')).join('');
}

function renderCV(rows) {
  const traces=[];let count=0;
  for (const party of selectedParties()) {
    const agg=weeklyStats(rows,party).filter(v=>v.firms>=3 && isValue(v.cv));
    if (!agg.length) continue;
    count+=agg.length;
    traces.push({x:agg.map(v=>v.date),y:agg.map(v=>v.cv),name:party,type:'scatter',mode:'lines+markers',line:{color:colorOf(party),width:2},marker:{size:5},customdata:agg.map(v=>[v.firms,v.sd]),hovertemplate:`${party} · %{x}<br>CV: %{y:.2f}%<br>Istituti: %{customdata[0]}<br>Deviazione standard: %{customdata[1]:.2f} pp<extra></extra>`});
  }
  const layout=layoutBase();layout.yaxis.title='Coefficiente di variazione tra istituti (%)';layout.yaxis.ticksuffix='%';
  return {traces,layout,description:`${count} coppie partito-settimana con almeno 3 istituti. La dispersione include anche differenze temporali all'interno della settimana.`};
}

// Fixed-effects OLS for the second panel of "Variabilità tra istituti".
// Every estimate is recomputed on the visitor's chosen date window.
function renderHouseEffects(rows) {
  if(typeof HouseEffects==='undefined')return {traces:[],layout:layoutBase(),description:'Modulo OLS non disponibile. Aggiorna la pagina.'};
  const analysis=state.houseView;
  if(analysis==='ranking') {
    const party=state.houseParty;
    const result=HouseEffects.estimate(rows,party);
    if(!result.ok)return {traces:[],layout:layoutBase(),description:`${party}: non stimabile. ${result.reason} Estendi l’intervallo temporale.`};
    const data=result.effects;
    const trace={type:'bar',orientation:'h',y:data.map(d=>d.firm),x:data.map(d=>d.effect),
      marker:{color:data.map(d=>d.effect>=0?'#d26773':'#4274ba')},
      customdata:data.map(d=>[d.observations,d.polls]),
      hovertemplate:'%{y}<br>House effect: %{x:+.2f} pp<br>Settimane: %{customdata[0]}<br>Sondaggi: %{customdata[1]}<extra></extra>'};
    const layout=layoutBase();
    layout.height=Math.max(460,200+data.length*29);
    layout.margin={l:165,r:35,t:22,b:102};layout.showlegend=false;
    layout.xaxis={...axes,title:'Effetto fisso rispetto alla media degli istituti (punti percentuali)',ticksuffix:' pp',zeroline:true,zerolinecolor:'#7486a0',zerolinewidth:1.3};
    layout.yaxis={...axes,type:'category',automargin:false,showgrid:false,autorange:'reversed'};
    return {traces:[trace],layout,description:`${party}: ${data.length} istituti confrontabili, ${result.weekCount} settimane, ${result.n} coppie istituto-settimana. Effetti relativi, normalizzati a somma zero; non misurano l'errore rispetto al consenso vero.${result.excludedFirms?` ${result.excludedFirms} istituti esclusi perché non connessi temporalmente.`:''}`};
  }
  const names=selectedParties(),fits=names.map(p=>HouseEffects.estimate(rows,p));
  const available=fits.filter(f=>f.ok);
  if(!available.length)return {traces:[],layout:layoutBase(),description:'Nessun partito selezionato dispone di sufficiente sovrapposizione tra istituti e settimane nel periodo.'};
  const firms=Array.from(new Set(available.flatMap(f=>f.effects.map(e=>e.firm)))).sort((a,b)=>a.localeCompare(b));
  const valueMap=new Map(available.map(f=>[f.party,new Map(f.effects.map(e=>[e.firm,e]))]));
  const z=firms.map(f=>names.map(p=>valueMap.get(p)?.get(f)?.effect??null));
  const custom=firms.map(f=>names.map(p=>valueMap.get(p)?.get(f)?.observations??null));
  let maximum=.5;
  for(const row of z)for(const val of row)if(val!==null)maximum=Math.max(maximum,Math.abs(val));
  maximum=Math.min(4,Math.ceil(maximum*2)/2);
  const trace={type:'heatmap',x:names,y:firms,z,zmin:-maximum,zmax:maximum,zmid:0,
    colorscale:[[0,'#4274ba'],[.5,'#f7f9fc'],[1,'#d26773']],xgap:3,ygap:3,
    colorbar:{title:{text:'pp',side:'right'},thickness:12,len:.79},
    customdata:custom,
    hoverongaps:false,
    hovertemplate:'%{y} · %{x}<br>House effect: %{z:+.2f} pp<br>Settimane osservate: %{customdata}<extra>OLS a effetti fissi</extra>'};
  const labels=[];
  if(names.length<=9&&firms.length<=19){
    for(let i=0;i<firms.length;i++)for(let j=0;j<names.length;j++){
      const v=z[i][j];if(v===null)continue;
      labels.push({x:names[j],y:firms[i],xref:'x',yref:'y',text:v.toFixed(2),showarrow:false,
        font:{size:11,color:Math.abs(v)>maximum*.63?'#fff':'#284261'}});
    }
  }
  const layout=layoutBase();layout.showlegend=false;
  layout.height=Math.max(485,195+firms.length*31);layout.margin={l:160,r:110,t:18,b:108};
  layout.xaxis={...axes,type:'category',showgrid:false,side:'bottom'};
  layout.yaxis={...axes,type:'category',showgrid:false,autorange:'reversed',tickfont:{size:11,color:'#354963'}};
  layout.annotations=labels;
  return {traces:[trace],layout,description:`House effects OLS in punti percentuali, stimati per partito con effetti fissi settimanali. ${available.length}/${names.length} partiti stimabili. Il bianco/grigio indica assenza di dati sufficienti; le scale sono comuni alle celle. Le stime sono relative agli istituti inclusi in ciascun partito, quindi i confronti tra colonne richiedono prudenza.`};
}

function median(a){const x=a.slice().sort((u,v)=>u-v);return x.length%2 ? x[(x.length-1)/2] : (x[x.length/2-1]+x[x.length/2])/2;}
function renderBox(rows) {
  const party=state.boxParty;
  const groups=new Map();
  for(const p of rows){if(!isValue(p[party]))continue;if(!groups.has(p.firm))groups.set(p.firm,[]);groups.get(p.firm).push(p[party]);}
  const sorted=Array.from(groups).filter(([_,a])=>a.length>=3).sort((a,b)=>median(b[1])-median(a[1]));
  const traces=sorted.map(([firm,values])=>({type:'box',name:firm,y:values,marker:{color:colorOf(party),size:3},line:{color:colorOf(party),width:1.6},fillcolor:colorOf(party)+'22',boxpoints:'outliers',whiskerwidth:.5,hovertemplate:`${firm}<br>Voto: %{y:.2f}%<extra>${values.length} rilevazioni</extra>`,showlegend:false}));
  const layout=layoutBase();layout.xaxis={...axes,type:'category',tickangle:-38,automargin:true};layout.yaxis={...axes,title:`${party} · intenzioni di voto (%)`,ticksuffix:'%'};
  layout.margin={l:60,r:15,t:15,b:145};layout.showlegend=false;
  return {traces,layout,description:`${sorted.length} istituti con almeno 3 sondaggi per ${party} nel periodo. Ordinamento per mediana decrescente.`};
}


// Pearson correlations between the same LOWESS estimates displayed in the trend tab.
// In the changes view, differences are allowed only between *consecutive* weeks.
// No interpolation: comparisons use exact overlaps between observed weekly dates.
function correlationSeries(polls, party, mode) {
  const weekly = weeklyStats(polls, party);
  if(weekly.length < 3) return new Map();
  const fit = lowess(weekly.map(v=>({date:v.date,y:v.mean})),state.span);
  if(mode === 'levels') return new Map(weekly.map((v,i)=>[v.date,fit[i]]));
  const differences=new Map();
  for(let i=1;i<weekly.length;i++) {
    const days=(dateUTC(weekly[i].date)-dateUTC(weekly[i-1].date))/86400000;
    if(days===7) differences.set(weekly[i].date,fit[i]-fit[i-1]);
  }
  return differences;
}

function pearsonCommon(x, y, minN=8) {
  const common=Array.from(x.entries()).filter(([week])=>y.has(week));
  const n=common.length;
  if(n<minN) return {r:null,n};
  const a=common.map(([,v])=>v),b=common.map(([d])=>y.get(d));
  const ma=mean(a), mb=mean(b);
  let covariance=0, sxx=0,syy=0;
  for(let i=0;i<n;i++) {
    const dx=a[i]-ma,dy=b[i]-mb;
    covariance+=dx*dy;sxx+=dx*dx;syy+=dy*dy;
  }
  if(sxx<1e-12 || syy<1e-12) return {r:null,n};
  return {r:Math.max(-1,Math.min(1,covariance/Math.sqrt(sxx*syy))),n};
}

function renderCorrelations(rows) {
  const names=selectedParties();
  const series=new Map(names.map(p=>[p,correlationSeries(rows,p,state.corrMode)]));
  const coeff=[],counts=[],text=[],labelColors=[];
  let valid=0,minCommon=Infinity,maxCommon=0;
  for(let i=0;i<names.length;i++) {
    const rc=[],rn=[],rt=[],rcColors=[];
    for(let j=0;j<names.length;j++) {
      const {r,n}=pearsonCommon(series.get(names[i]),series.get(names[j]));
      rc.push(r);rn.push(n);
      rt.push(r===null?'—':r.toFixed(2));
      rcColors.push(r!==null && Math.abs(r)>.63?'#ffffff':'#243450');
      if(i<j && r!==null) { valid++;minCommon=Math.min(minCommon,n);maxCommon=Math.max(maxCommon,n); }
    }
    coeff.push(rc);counts.push(rn);text.push(rt);labelColors.push(rcColors);
  }
  const trace={type:'heatmap',x:names,y:names,z:coeff,zmin:-1,zmax:1,zmid:0,
    colorscale:[[0,'#2f67bb'],[0.25,'#9fc1ec'],[0.5,'#f6f7fb'],[0.75,'#ec9e98'],[1,'#c14558']],
    colorbar:{title:{text:'Pearson r',side:'right'},tickvals:[-1,-.5,0,.5,1],thickness:13,len:.76,outlinewidth:0},
    customdata:counts,hoverongaps:false,
    hovertemplate:'%{y} × %{x}<br>Correlazione: %{z:.3f}<br>Settimane comuni: %{customdata}<extra></extra>',
    xgap:4,ygap:4};
  const annotations=[];
  const labelSize = names.length >= 12 ? 10 : names.length >= 9 ? 12 : 15;
  for(let i=0;i<names.length;i++)for(let j=0;j<names.length;j++){
    annotations.push({x:names[j],y:names[i],xref:'x',yref:'y',text:text[i][j],
      showarrow:false,font:{family:'DM Sans,Arial,sans-serif',size:labelSize,color:labelColors[i][j]}});
  }
  const layout=layoutBase();
  layout.showlegend=false;
  layout.margin={l:80,r:90,t:24,b:96};
  layout.height=Math.max(470, 120+names.length*50);
  // Avoid scaleanchor/scaleratio: a correlation matrix need not use square cells.
  // Plotly will stretch it into the available rectangular area.
  layout.xaxis={...axes,type:'category',side:'bottom',showgrid:false,tickfont:{size:names.length>10?11:13,color:'#354963'}};
  layout.yaxis={...axes,type:'category',autorange:'reversed',showgrid:false,tickfont:{size:names.length>10?11:13,color:'#354963'}};
  layout.annotations=annotations;
  const desc=state.corrMode==='changes'
    ? 'Correlazione di Pearson delle variazioni settimanali in punti percentuali delle curve LOWESS. Si usano solo settimane consecutive e comuni.'
    : 'Correlazione di Pearson dei livelli delle curve LOWESS, sulle sole settimane comuni.';
  return {traces:[trace],layout,description:`${desc} ${valid} coppie calcolabili (almeno 8 settimane comuni per coppia)${valid?`; sovrapposizione: ${minCommon}–${maxCommon} settimane`:''}. La correlazione non dimostra passaggi di voto o causalità.`};
}

const tabMetadata={
  trend:['Trend delle intenzioni di voto','Medie settimanali con uguale peso per istituto e regressione locale LOWESS.'],
  ci:['Intervalli di confidenza campionari','Ogni punto rappresenta un sondaggio; le barre indicano un IC teorico binomiale al 95%.'],
  cv:['Variabilità tra istituti','Dispersione osservata (CV) e differenze sistematiche tra istituti stimate con effetti fissi OLS.'],
  box:['Distribuzione storica per istituto','Boxplot dei sondaggi per istituto nel periodo selezionato. Scegli il partito da confrontare.'],
  corr:['Correlazioni tra partiti','Matrice di Pearson delle curve LOWESS: confronta livelli oppure variazioni settimanali.'],
  super:['Ultima supermedia','Ultimo valore disponibile della LOWESS per ciascun partito, confrontato con circa un anno prima.']
};


function buildCoalitionMenu(){
  const details=document.createElement('details');details.className='coalition-dropdown';
  const summary=document.createElement('summary');
  summary.textContent=reportedActive()?'Coalizioni rilevate · Wikipedia':coalitionActive()?`Confronto coalizioni${secondCoalitionActive()?' A–B':''}`:'Simula e confronta coalizioni';
  details.append(summary);
  const panel=document.createElement('div');panel.className='coalition-dropdown-panel';
  panel.addEventListener('click',e=>e.stopPropagation());
  const note=document.createElement('p');note.className='coalition-note';
  note.textContent='Crea fino a due coalizioni con selezioni indipendenti. I valori sono calcolati automaticamente dai sondaggi, senza digitare percentuali.';
  panel.append(note);
  const modeSelect=document.createElement('select');modeSelect.setAttribute('aria-label','Modalità di coalizione');
  for(const [value,label] of [['custom','Coalizioni personalizzate A–B'],['reported','Coalizioni rilevate · Wikipedia']]){
    const o=document.createElement('option');o.value=value;o.textContent=label;o.selected=(value===(reportedActive()?'reported':'custom'));modeSelect.append(o);
  }
  const modeWrap=document.createElement('div');modeWrap.className='coalition-mode-options';modeWrap.append(modeSelect);panel.append(modeWrap);
  const custom=document.createElement('div');custom.className='coalition-custom';
  const drafts=[new Set(state.coalitionMembers),new Set(state.coalitionBMembers)];
  const extraDraft=new Set(state.comparisonExtras);
  const names=[state.coalitionName,state.coalitionBName];
  const groupWidgets=[];
  function addGroup(i){
    const group=document.createElement('section');group.className='coalition-group';
    const heading=document.createElement('strong');heading.textContent=`Coalizione ${i===0?'A':'B'}`;group.append(heading);
    const nameLabel=document.createElement('label');nameLabel.className='coalition-name-inline';nameLabel.textContent='Nome';
    const input=document.createElement('input');input.type='text';input.maxLength=48;input.value=names[i];input.setAttribute('aria-label',`Nome coalizione ${i===0?'A':'B'}`);
    nameLabel.append(input);group.append(nameLabel);
    const presets=document.createElement('div');presets.className='coalition-presets';
    for(const [label,members] of [['Centrodestra',['FdI','Lega','FI','NM']],['Centrosinistra',['PD','M5S','AVS','IV','+E']],['Svuota',[]]]){
      const b=document.createElement('button');b.type='button';b.className='coalition-preset';b.textContent=label;
      b.addEventListener('click',()=>{drafts[i]=new Set(members.filter(p=>PARTY_NAMES.includes(p)));refreshDraft();});presets.append(b);
    }
    group.append(presets);
    const list=document.createElement('div');list.className='coalition-checklist';
    const boxes=new Map();
    PARTY_NAMES.forEach(party=>{
      const label=document.createElement('label');label.className='coalition-check';
      const box=document.createElement('input');box.type='checkbox';box.checked=drafts[i].has(party);boxes.set(party,box);
      box.addEventListener('change',()=>{if(box.checked)drafts[i].add(party);else drafts[i].delete(party);refreshDraft();});
      const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=colorOf(party);
      const text=document.createElement('span');text.textContent=party;label.append(box,swatch,text);list.append(label);
    });
    group.append(list);
    const status=document.createElement('p');status.className='coalition-status';group.append(status);
    custom.append(group);groupWidgets.push({boxes,status,input});
  }
  addGroup(0);addGroup(1);
  const extraGroup=document.createElement('section');extraGroup.className='coalition-group comparison-extras';
  const extraTitle=document.createElement('strong');extraTitle.textContent='Partiti da mostrare insieme alle coalizioni';
  const extraNote=document.createElement('p');extraNote.className='coalition-note';
  extraNote.textContent='Esempio: Coalizione A + Coalizione B + FN + Azione. Ogni partito aggiunto ha una barra indipendente.';
  extraGroup.append(extraTitle,extraNote);
  const extraList=document.createElement('div');extraList.className='coalition-checklist';
  const extraBoxes=new Map();
  PARTY_NAMES.forEach(party=>{
    const label=document.createElement('label');label.className='coalition-check';
    const check=document.createElement('input');check.type='checkbox';check.checked=extraDraft.has(party);
    check.setAttribute('aria-label',`Mostra anche ${party}`);extraBoxes.set(party,check);
    check.addEventListener('change',()=>{if(check.checked)extraDraft.add(party);else extraDraft.delete(party);refreshDraft();});
    const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=colorOf(party);
    const text=document.createElement('span');text.textContent=party;
    label.append(check,swatch,text);extraList.append(label);
  });
  extraGroup.append(extraList);custom.append(extraGroup);
  const warning=document.createElement('p');warning.className='coalition-overlap-note';custom.append(warning);
  panel.append(custom);
  const reported=document.createElement('div');reported.className='coalition-reported';
  const scenarioLabel=document.createElement('label');scenarioLabel.className='coalition-name-inline';scenarioLabel.textContent='Scenario di rilevazione';
  const scenarioSelect=document.createElement('select');scenarioSelect.setAttribute('aria-label','Scenario di coalizione pubblicato');
  const scenarios=[...new Set(state.coalitionPolls.map(r=>r.scenario))].sort((a,b)=>a.localeCompare(b,'it'));
  if(!scenarios.length){const o=document.createElement('option');o.value='';o.textContent='Nessuno scenario disponibile';scenarioSelect.append(o);}
  else scenarios.forEach(sc=>{const o=document.createElement('option');o.value=sc;o.textContent=sc;o.selected=(sc===state.coalitionScenario);scenarioSelect.append(o);});
  scenarioLabel.append(scenarioSelect);reported.append(scenarioLabel);
  const reportNote=document.createElement('p');reportNote.className='coalition-note';reportNote.textContent='Gli scenari Wikipedia non sono confrontabili tra loro: le rilevazioni dirette vengono mostrate per scenario, senza combinarle con simulazioni.';
  reported.append(reportNote);panel.append(reported);
  const footer=document.createElement('div');footer.className='coalition-actions';
  const clear=document.createElement('button');clear.type='button';clear.className='coalition-secondary';clear.textContent='Mostra partiti singoli';
  clear.addEventListener('click',()=>{state.coalitionMode=false;state.reportedMode=false;details.open=false;render();});
  const apply=document.createElement('button');apply.type='button';apply.className='coalition-toggle';apply.textContent='Applica confronto';
  apply.addEventListener('click',()=>{
    if(modeSelect.value==='reported'){
      if(!scenarioSelect.value)return;state.coalitionScenario=scenarioSelect.value;state.reportedMode=true;state.coalitionMode=false;
    }else{
      if(drafts[0].size<2||(drafts[1].size!==0&&drafts[1].size<2))return;
      state.coalitionMembers=new Set(drafts[0]);state.coalitionBMembers=new Set(drafts[1]);state.comparisonExtras=new Set(extraDraft);
      state.coalitionName=groupWidgets[0].input.value.replace(/[<>]/g,'').trim().slice(0,48)||'Coalizione A';
      state.coalitionBName=groupWidgets[1].input.value.replace(/[<>]/g,'').trim().slice(0,48)||'Coalizione B';
      state.coalitionMode=true;state.reportedMode=false;
    }
    details.open=false;render();
  });
  footer.append(clear,apply);panel.append(footer);details.append(panel);
  function refreshDraft(){
    groupWidgets.forEach(({boxes,status},i)=>{
      boxes.forEach((box,party)=>box.checked=drafts[i].has(party));
      status.textContent=drafts[i].size?`${drafts[i].size} partiti: ${PARTY_NAMES.filter(p=>drafts[i].has(p)).join(' + ')}`:'Nessuna selezione (coalizione facoltativa per B).';
    });
    const overlap=[...drafts[0]].filter(p=>drafts[1].has(p));
    const duplicates=[...extraDraft].filter(p=>drafts[0].has(p)||drafts[1].has(p));
    const warnings=[];
    if(overlap.length)warnings.push(`${overlap.join(', ')} presente in entrambe le coalizioni: non sono blocchi disgiunti.`);
    if(duplicates.length)warnings.push(`${duplicates.join(', ')} mostrato anche singolarmente: è già compreso in una coalizione.`);
    warning.textContent=warnings.join(' ');

    apply.disabled=modeSelect.value==='reported'?!scenarioSelect.value:!(drafts[0].size>=2&&(drafts[1].size===0||drafts[1].size>=2));
  }
  function refreshMode(){const r=modeSelect.value==='reported';custom.hidden=r;reported.hidden=!r;refreshDraft();}
  modeSelect.addEventListener('change',refreshMode);scenarioSelect.addEventListener('change',refreshDraft);
  refreshMode();return details;
}

let lastRender=null;

function render(){
  const [title, desc]=tabMetadata[state.tab];$('chart-title').textContent=title;$('chart-description').textContent=desc;
  $('chart-tools').innerHTML='';
  const controls=$('historical-date-controls');if(controls)controls.hidden=state.tab==='super';
  const supportsCoalition=['trend','ci','super'].includes(state.tab);
  const insight=$('chart-insight'); insight.hidden=state.tab!=='cv';
  const superCaption=$('super-caption');superCaption.hidden=state.tab!=='super';
  if(state.tab==='cv'){
    insight.innerHTML=state.cvView==='house'
      ? '<strong>Come leggere gli house effects:</strong> rosso = un istituto rileva sistematicamente il partito più in alto degli altri, blu = più in basso, controllando per la settimana. Non misura un errore rispetto al voto «vero».'
      : '<strong>Come leggere il CV:</strong> più è alto, meno concordano in proporzione gli istituti su quel partito. Può riflettere differenze metodologiche, rumore o cambiamenti nel periodo: non dimostra da solo maggiori movimenti di elettori né equivale a un intervallo di confidenza.';
  }
  if(state.tab==='trend'){
    const sel=document.createElement('select');sel.setAttribute('aria-label','Scala della serie storica');
    for(const [value,label] of [['share','Scala: percentuale'],['index','Scala: indice base 100']]){
      const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value===state.scale;sel.append(option);
    }
    sel.addEventListener('change',e=>{state.scale=e.target.value;render();});$('chart-tools').append(sel);
  }
  if(state.tab==='cv'){
    const view=document.createElement('select');view.setAttribute('aria-label','Analisi della variabilità tra istituti');
    for(const [value,label] of [['cv','Dispersione: CV settimanale'],['house','House effects · OLS']]) {
      const o=document.createElement('option');o.value=value;o.textContent=label;o.selected=state.cvView===value;view.append(o);
    }
    view.addEventListener('change',e=>{state.cvView=e.target.value;render();});$('chart-tools').append(view);
    if(state.cvView==='house'){
      const v=document.createElement('select');v.setAttribute('aria-label','Vista degli house effects');
      for(const [value,label] of [['ranking','Classifica per istituto'],['matrix','Matrice istituti × partiti']]) {
        const o=document.createElement('option');o.value=value;o.textContent=label;o.selected=state.houseView===value;v.append(o);
      }
      v.addEventListener('change',e=>{state.houseView=e.target.value;render();});$('chart-tools').append(v);
      if(state.houseView==='ranking'){
        const p=document.createElement('select');p.setAttribute('aria-label','Partito per gli house effects');
        PARTY_NAMES.forEach(party=>{const o=document.createElement('option');o.value=party;o.textContent=`Partito: ${party}`;o.selected=party===state.houseParty;p.append(o);});
        p.addEventListener('change',e=>{state.houseParty=e.target.value;render();});$('chart-tools').append(p);
      }
    }
  }
  if(state.tab==='box'){
    const sel=document.createElement('select');sel.setAttribute('aria-label','Partito per boxplot');
    PARTY_NAMES.forEach(p=>{const option=document.createElement('option');option.value=p;option.textContent=`Partito: ${p}`;option.selected=p===state.boxParty;sel.append(option);});
    sel.addEventListener('change', e=>{state.boxParty=e.target.value;render();});$('chart-tools').append(sel);
  }
  if(state.tab==='corr'){
    const sel=document.createElement('select');sel.setAttribute('aria-label','Tipo di correlazione');
    for(const [value,label] of [['changes','Correlazione: variazioni settimanali'],['levels','Correlazione: livelli']]) {
      const opt=document.createElement('option');opt.value=value;opt.textContent=label;opt.selected=state.corrMode===value;sel.append(opt);
    }
    sel.addEventListener('change',e=>{state.corrMode=e.target.value;render();});$('chart-tools').append(sel);
  }
  if(state.tab==='super'){
    const titleControl=document.createElement('label');titleControl.className='custom-title-control';
    const titleText=document.createElement('span');titleText.textContent='Titolo grafico';
    const titleInput=document.createElement('input');titleInput.type='text';titleInput.maxLength=110;
    titleInput.placeholder='Ultima supermedia';titleInput.value=state.customChartTitle;
    titleInput.setAttribute('aria-label','Titolo personalizzato del grafico e del PNG');
    titleInput.addEventListener('input',()=>{
      state.customChartTitle=titleInput.value.slice(0,110);
      const currentTitle=state.customChartTitle.trim() || (lastRender?.observedOnly?'Ultime rilevazioni — coalizioni Wikipedia':tabMetadata.super[0]);
      $('chart-title').textContent=currentTitle;
      if(lastRender)lastRender.title=currentTitle;
    });
    titleControl.append(titleText,titleInput);$('chart-tools').append(titleControl);
    const historicalToggle=document.createElement('label');historicalToggle.className='history-switch';
    const box=document.createElement('input');box.type='checkbox';box.checked=state.showHistorical;
    box.setAttribute('aria-label','Mostra confronto con un anno prima');
    box.addEventListener('change',()=>{state.showHistorical=box.checked;render();});
    historicalToggle.append(box,document.createTextNode('Barra di un anno prima'));
    $('chart-tools').append(historicalToggle);
  }
  if(supportsCoalition){
    $('chart-tools').append(buildCoalitionMenu());
  }
  const rows=filtered();
  const chartData=supportsCoalition?displayedRows(rows):rows;
  const superRows=reportedActive()?reportedRows(state.coalitionPolls):state.polls;
  const res=state.tab==='trend'?renderTrend(chartData):state.tab==='ci'?renderCI(chartData):state.tab==='super'?renderSupermedia(superRows):state.tab==='cv'?(state.cvView==='house'?renderHouseEffects(rows):renderCV(rows)):state.tab==='box'?renderBox(rows):renderCorrelations(rows);
  $('chart-summary').textContent=res.description;
  const gapBox=$('coalition-gap');
  const wantsGap=state.tab==='super' && coalitionActive() && secondCoalitionActive();
  gapBox.hidden=!wantsGap;
  if(wantsGap && !res.gap)gapBox.textContent='Gap A–B non disponibile: almeno una coalizione non ha una LOWESS recente su sondaggi completi, oppure le date non sono confrontabili. Le barre dei partiti singoli restano disponibili.';
  if(res.gap){
    const v=res.gap.value;
    gapBox.textContent=`Gap ${res.gap.labelA} − ${res.gap.labelB}: ${v>0?'+':''}${v.toFixed(2)} punti percentuali (differenza tra ultime stime LOWESS; non probabilità di vittoria).`;
  }
  const caption=$('super-caption');
  if(res.observedOnly){
    $('chart-title').textContent=state.customChartTitle.trim()||'Ultime rilevazioni — coalizioni Wikipedia';
    $('chart-description').textContent='Quote storiche pubblicate nello scenario scelto; nessuna LOWESS stimata per mancanza di dati recenti sufficienti.';
  }
  if(state.tab==='super')caption.innerHTML=res.observedOnly
      ? '<strong>Rilevazione storica:</strong> queste barre mostrano le ultime quote effettivamente pubblicate nello scenario, non una LOWESS né una supermedia. Consulta la data nella descrizione.'
      : `<strong>Barra piena:</strong> ultima supermedia LOWESS disponibile.${state.showHistorical? ' <strong>Barra chiara, sfalsata a destra:</strong> valore della stessa LOWESS circa un anno prima.':' Confronto storico disattivato.'} Le percentuali sono riportate sopra le barre.`;

  $('empty-state').hidden=res.traces.length>0;
  const wrap=document.querySelector('.plot-wrap');
  const superWide=state.tab==='super'&&chartParties().length>(window.matchMedia('(max-width:680px)').matches?4:8);
  wrap.classList.toggle('corr-scroll',state.tab==='corr'||(state.tab==='cv'&&state.cvView==='house'&&state.houseView==='matrix')||superWide);
  if(state.tab==='corr'||(state.tab==='cv'&&state.cvView==='house'&&state.houseView==='matrix')) {
    // Large matrices stay legible on phones via internal horizontal scrolling.
    wrap.style.setProperty('--corr-min-width',`${Math.max(610,selectedParties().length*58+165)}px`);
  } else if(superWide){
    wrap.style.setProperty('--corr-min-width',`${Math.max(660,chartParties().length*86)}px`);
  } else wrap.style.removeProperty('--corr-min-width');
  const mobile=window.matchMedia('(max-width:680px)').matches;
  const layout = {...res.layout};
  if(mobile && !(state.tab==='corr'||(state.tab==='cv'&&state.cvView==='house'&&state.houseView==='matrix'))) {
    layout.margin={...layout.margin,l:47,r:18,t:state.tab==='super'?28:108,b:state.tab==='box'?145:98};
    layout.legend={...layout.legend,font:{size:10},y:1.07};
    layout.height=state.tab==='cv'&&state.cvView==='house'?Math.max(515,res.layout.height):515;
    if(state.tab==='cv'&&state.cvView==='house')layout.margin.l=112;
  }
  if(mobile && (state.tab==='corr'||(state.tab==='cv'&&state.cvView==='house'&&state.houseView==='matrix'))) {
    layout.height=state.tab==='corr'?Math.max(460,120+selectedParties().length*49):res.layout.height;
    layout.margin={...layout.margin,l:state.tab==='corr'?65:150,r:83,b:88};
  }
  // Plotly.react retains an old explicit layout.height when subsequent layouts omit it.
  // Always provide the new height, especially after switching from tall OLS rankings
  // back to CV, trends, confidence intervals or boxplots.
  layout.height = layout.height || (mobile ? 515 : 460);
  layout.autosize = true;
  $('chart').style.height=`${layout.height}px`;
  const chartTitle=state.tab==='super' ? (state.customChartTitle.trim()||(res.observedOnly?'Ultime rilevazioni — coalizioni Wikipedia':title)) : title;
  $('chart-title').textContent=chartTitle;
  lastRender={traces:res.traces,layout,title:chartTitle,desc,observedOnly:!!res.observedOnly};
  if(typeof Plotly!=='undefined')Plotly.react('chart',res.traces,withChartSignature(layout),config);
  else $('empty-state').textContent='Impossibile caricare Plotly. Controlla la connessione a Internet e riprova.';
}


// Prepare a separate high-resolution figure to guarantee that exported PNGs
// contain the chart's on-page heading, the chosen method and the GitHub credit.
function escapeMarkup(value) {
  return String(value).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
}
function exportHeading() {
  if(state.tab==='super') return lastRender?.observedOnly?'Ultima rilevazione disponibile · NON è una LOWESS':state.showHistorical?'Ultima LOWESS disponibile · confronto storico su circa un anno':'Ultima LOWESS disponibile · confronto storico disattivato';
  if(state.tab==='corr') return state.corrMode==='changes'
    ? 'Pearson r · variazioni settimanali delle curve LOWESS'
    : 'Pearson r · livelli delle curve LOWESS';
  if(state.tab==='trend') return state.scale==='index'
    ? 'Medie settimanali · LOWESS · indice base 100'
    : 'Medie settimanali · LOWESS · percentuali';
  if(state.tab==='box') return `Distribuzione dei sondaggi per istituto · ${state.boxParty}`;
  if(state.tab==='cv')return state.cvView==='house' ? (state.houseView==='ranking'?`OLS con effetti fissi settimanali · ${state.houseParty}`:'OLS con effetti fissi settimanali · matrice per partito') : 'Coefficiente di variazione settimanale per partito';
  return tabMetadata[state.tab][1];
}
function liveVisibleTraces() {
  const live=$('chart')._fullData || [];
  return lastRender.traces.filter((trace,i)=>{
    const flag=live[i]?.visible ?? trace.visible;
    return flag!==false && flag!=='legendonly';
  }).map(t=>JSON.parse(JSON.stringify(t)));
}
function exportSeriesLabels(traces) {
  if(reportedActive() && ['trend','ci','super'].includes(state.tab))return ['Centro-sinistra (rilevato)','Centrodestra (rilevato)'];
  if(coalitionActive() && ['trend','ci','super'].includes(state.tab))return chartParties().map(partyLabel);
  if(!['trend','ci','cv','super'].includes(state.tab) || (state.tab==='cv'&&state.cvView==='house'))return [];
  if(state.tab==='super')return chartParties().map(partyLabel);
  const present=new Set(traces.map(t=>t.legendgroup).filter(Boolean));
  return chartParties().filter(p=>present.has(p)).map(partyLabel);
}
function exportTracesForPng() {
  const traces=liveVisibleTraces();
  // For ordinary series, a single legend item per selected party: LOWESS
  // (or CV). Raw poll dots and CI whiskers do not duplicate labels.
  if(['trend','ci'].includes(state.tab)){
    const labels=exportSeriesLabels(traces);
    for(const t of traces){
      t.name=partyLabel(t.legendgroup);
      t.showlegend=t.mode==='lines';
      t.legendrank=Math.max(1,labels.indexOf(partyLabel(t.legendgroup))+1);
    }
  }
  if(state.tab==='super'){
    for(const t of traces){ t.showlegend=false; }
  }
  return traces;
}
function exportLayoutForPng(traces=lastRender.traces) {
  const l=JSON.parse(JSON.stringify(lastRender.layout));
  l.width=1600;
  l.height=state.tab==='corr' ? Math.max(780,205+selectedParties().length*58) : (state.tab==='cv'&&state.cvView==='house' ? Math.max(800,lastRender.layout.height+140) : 850);
  const labels=exportSeriesLabels(traces);
  const sole=labels.length===1&&['trend','ci','super'].includes(state.tab);
  const title=sole && !(state.tab==='super'&&state.customChartTitle.trim())?`${lastRender.title} – ${labels[0]}`:lastRender.title;
  const needsLegend=['trend','ci','cv'].includes(state.tab) && !(state.tab==='cv'&&state.cvView==='house');
  const legendRows=needsLegend?Math.max(1,Math.ceil(labels.length/9)):1;
  const top=state.tab==='super'?121:(needsLegend?205+Math.max(0,legendRows-1)*26:160);
  l.margin={...l.margin,l:state.tab==='corr'?135:(state.tab==='cv'&&state.cvView==='house'?200:85),r:state.tab==='corr'?150:65,t:top,b:state.tab==='box'?175:112};
  if(state.tab==='corr'||(state.tab==='cv'&&state.cvView==='house'&&state.houseView==='matrix')) {
    l.xaxis.tickfont={size:15,color:'#354963'};
    l.yaxis.tickfont={size:15,color:'#354963'};
  }
  // Never preserve legend visibility from old Plotly interactions.
  l.showlegend=needsLegend;
  l.legend={...l.legend,orientation:'h',x:0,y:1.035,yanchor:'bottom',font:{size:15,color:'#334155'},tracegroupgap:0};
  l.annotations=[...(l.annotations||[]),
    {xref:'paper',yref:'paper',x:0,y:1,xanchor:'left',yanchor:'bottom',yshift:top-37,showarrow:false,
      font:{family:'Arial,sans-serif',size:28,color:'#1c2740'},text:`<b>${escapeMarkup(title)}</b>`},
    {xref:'paper',yref:'paper',x:0,y:1,xanchor:'left',yanchor:'bottom',yshift:top-71,showarrow:false,
      font:{family:'Arial,sans-serif',size:17,color:'#6e7f9a'},text:escapeMarkup(exportHeading())},
    {xref:'paper',yref:'paper',x:0,y:1,xanchor:'left',yanchor:'bottom',yshift:top-99,showarrow:false,
      font:{family:'Arial,sans-serif',size:14,color:'#94a1b1'},
      text:`${state.tab==='super' ? 'Sezione indipendente dal filtro temporale · LOWESS: '+Math.round(state.span*100)+'%' : 'Periodo: '+escapeMarkup(state.from)+' — '+escapeMarkup(state.to)+' · LOWESS: '+Math.round(state.span*100)+'%'}`}
  ];
  if(state.tab==='super'){
    if(!state.showHistorical || lastRender?.observedOnly) return withChartSignature(l);
    l.annotations.push(
      {xref:'paper',yref:'paper',x:0,y:0,xanchor:'left',yanchor:'top',yshift:-44,showarrow:false,
       font:{family:'Arial,sans-serif',size:13,color:'#6e7f9a'},text:'Barra piena: ultima LOWESS · barra chiara a destra: LOWESS circa un anno prima'}
    );
  }
  return withChartSignature(l);
}
async function exportChartPng() {
  if(typeof Plotly==='undefined' || !lastRender || !lastRender.traces.length) return;
  const button=$('export-chart');
  const original=button.textContent;
  button.disabled=true;button.textContent='Preparazione PNG…';
  const tmp=document.createElement('div');
  const traces=exportTracesForPng();
  if(!traces.length){button.disabled=false;button.textContent=original;return;}
  const layout=exportLayoutForPng(traces);
  tmp.style.cssText=`position:fixed;left:-100000px;top:0;width:${layout.width}px;height:${layout.height}px;pointer-events:none`;
  document.body.appendChild(tmp);
  try {
    await Plotly.newPlot(tmp,traces,layout,{displayModeBar:false,staticPlot:true,responsive:false});
    await Plotly.downloadImage(tmp,{format:'png',width:layout.width,height:layout.height,scale:2,
      filename:`opinionpolls-italia-${state.tab}`});
  } catch(err) {
    console.error('Errore esportazione PNG',err);
    window.alert('Impossibile esportare il PNG. Riprova tra qualche istante.');
  } finally {
    Plotly.purge(tmp);tmp.remove();button.disabled=false;button.textContent=original;
  }
}

function updatePartyFilters(){
  $('party-filters').innerHTML='';
  for(const party of PARTY_NAMES){
    const selected=state.selected.has(party);
    const b=document.createElement('button');b.type='button';b.className='party-pill'+(selected?' active':'');b.style.setProperty('--party',colorOf(party));
    b.setAttribute('aria-pressed',String(selected));b.innerHTML=`<span class="point" aria-hidden="true"></span>${party}`;
    b.addEventListener('click',()=>{
      if(selected && state.selected.size===1)return;
      selected?state.selected.delete(party):state.selected.add(party);
      updatePartyFilters();render();
    });$('party-filters').append(b);
  }
}

function setup(){
  const uniqueDates=state.polls.map(p=>p.date).sort();
  const earliest=uniqueDates[0], latest=uniqueDates[uniqueDates.length-1];
  state.from=earliest;state.to=latest;
  $('date-from').min=earliest;$('date-from').max=latest;$('date-from').value=earliest;
  $('date-to').min=earliest;$('date-to').max=latest;$('date-to').value=latest;
  $('date-from').addEventListener('change',e=>{state.from=e.target.value||earliest;if(state.from>state.to){state.to=state.from;$('date-to').value=state.to;}render();});
  $('date-to').addEventListener('change',e=>{state.to=e.target.value||latest;if(state.to<state.from){state.from=state.to;$('date-from').value=state.from;}render();});
  $('lowess-span').addEventListener('input',e=>{state.span=Number(e.target.value)/100;$('span-label').textContent=`${e.target.value}%`;render();});
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    state.tab=tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(b=>{b.classList.toggle('active',b===tab);b.setAttribute('aria-selected',String(b===tab));});
    render();
  }));
  $('reset-filters').addEventListener('click',()=>{
    state.from=earliest;state.to=latest;state.span=.30;state.scale='share';state.corrMode='changes';state.cvView='cv';state.houseView='ranking';state.houseParty='FdI';state.selected=new Set(DEFAULT_PARTIES.filter(p=>PARTY_NAMES.includes(p)));state.coalitionMode=false;state.reportedMode=false;state.coalitionName='Coalizione personalizzata';state.coalitionMembers=new Set(['FdI','Lega','FI'].filter(p=>PARTY_NAMES.includes(p)));state.coalitionBMembers=new Set(['PD','M5S','AVS'].filter(p=>PARTY_NAMES.includes(p)));state.showHistorical=true;state.comparisonExtras=new Set();state.customChartTitle=''; 
    $('date-from').value=earliest;$('date-to').value=latest;$('lowess-span').value=30;$('span-label').textContent='30%';updatePartyFilters();render();
  });
  $('export-chart').addEventListener('click', exportChartPng);
  $('metric-polls').textContent=numFmt(state.polls.length);
  $('metric-firms').textContent=numFmt(new Set(state.polls.map(p=>p.firm)).size);
  $('metric-date').textContent=fmtDate(latest);
  $('metric-update').textContent=state.updated?fmtDate(state.updated.slice(0,10)):'—';
  $('sync-state').textContent=`Archivio · aggiornato ${state.updated ? fmtDate(state.updated.slice(0,10)) : '—'}`;
  updatePartyFilters();render();
}

async function init(){
  try{
    const response=await fetch('data/polls.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    state.polls=(data.polls||[]).filter(p=>/^20\d\d-\d\d-\d\d$/.test(p.date)&&p.firm);
    state.coalitionPolls=(data.coalition_polls||[]).filter(p=>/^20\d\d-\d\d-\d\d$/.test(p.date)&&p.firm&&p.scenario&&isValue(p.CSX)&&isValue(p.CDX));
    state.coalitionScenario=state.coalitionPolls[0]?.scenario||'';
    if(!state.polls.length)throw new Error('Archivio vuoto');
    const present = (data.parties || []).filter(p => typeof p==='string' && state.polls.some(r=>isValue(r[p])));
    PARTY_NAMES = present.length ? present : [...new Set(state.polls.flatMap(r=>Object.keys(r).filter(p=>!['date','firm','n'].includes(p))))];
    state.selected = new Set(DEFAULT_PARTIES.filter(p=>PARTY_NAMES.includes(p)));
    if(!state.selected.size)state.selected=new Set(PARTY_NAMES.slice(0,Math.min(6,PARTY_NAMES.length)));
    state.coalitionMembers = new Set(['FdI','Lega','FI'].filter(p=>PARTY_NAMES.includes(p)));
    state.coalitionBMembers = new Set(['PD','M5S','AVS'].filter(p=>PARTY_NAMES.includes(p)));
    if(state.coalitionMembers.size<2)state.coalitionMembers=new Set(PARTY_NAMES.slice(0,Math.min(3,PARTY_NAMES.length)));
    state.boxParty = state.selected.values().next().value;
    state.updated=data.updated_utc||'';
    setup();
  }catch(err){$('sync-state').textContent='Archivio non disponibile';$('chart-title').textContent='Errore durante il caricamento';$('chart-description').textContent=`Impossibile recuperare i dati: ${err.message}. Avvia il sito da un server web (non file://).`;}
}
init();
