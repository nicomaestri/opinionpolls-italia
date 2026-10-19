'use strict';

const DEFAULT_PARTIES = ['FdI', 'PD', 'M5S', 'Lega', 'FI', 'AVS'];
let PARTY_NAMES = [...DEFAULT_PARTIES];
const COLORS = {FdI:'#436ad9', PD:'#d34f60', M5S:'#ce9c24', Lega:'#349a74', FI:'#5e9cc9', AVS:'#9873c8', A:'#be754a', IV:'#8c62b1', '+E':'#e58a5a', NM:'#657f97', ScN:'#488a8c', PLD:'#b86c8d', FN:'#5d526f', DSP:'#8b8d39', Others:'#85909c'};
const EXTRA_COLORS = ['#3b8f83','#b97463','#789bc4','#bd698c','#8e82ac','#b09342'];
function colorOf(party) {
  if(COLORS[party]) return COLORS[party];
  let hash=0;for(const ch of party)hash=((hash*33)+ch.codePointAt(0))>>>0;
  return EXTRA_COLORS[hash%EXTRA_COLORS.length];
}
const state = {polls:[], selected:new Set(DEFAULT_PARTIES), tab:'trend', span:0.30, from:'', to:'', boxParty:'FdI', scale:'share', corrMode:'changes'};
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
  const signature = {
    xref:'paper',yref:'paper',x:0,y:0,
    xanchor:'left',yanchor:'bottom',yshift:18-bottomMargin,
    showarrow:false,align:'left',
    text:`<a href="${GITHUB_URL}" target="_blank">${BRAND_LABEL}</a>`,
    font:{family:'DM Sans,Arial,sans-serif',size:11,color:'#64748b'}
  };
  return {...layout,annotations:[...(layout.annotations||[]),signature]};
}

function renderTrend(rows) {
  const traces=[]; let total=0;
  for(const party of selectedParties()) {
    const agg=weeklyStats(rows,party);if(!agg.length) continue;
    total+=agg.length;
    const levels=state.scale==='index' ? agg.map(v=>100*v.mean/agg[0].mean) : agg.map(v=>v.mean);
    traces.push({x:agg.map(v=>v.date),y:levels,name:`${party} · media sett.`,type:'scatter',mode:'lines+markers',line:{color:colorOf(party),width:1},marker:{color:colorOf(party),size:5},opacity:.36,legendgroup:party,hovertemplate:`${party} · %{x}<br>Media: %{y:.2f}%<extra></extra>`});
    if(agg.length>=3)traces.push({x:agg.map(v=>v.date),y:lowess(agg.map((v,i)=>({date:v.date,y:levels[i]})),state.span),name:`${party} · LOWESS`,type:'scatter',mode:'lines',line:{color:colorOf(party),width:3.3},legendgroup:party,hovertemplate:`${party} · LOWESS<br>%{x}: %{y:.2f}%<extra></extra>`});
  }
  const layout=layoutBase();
  if(state.scale==='index'){layout.yaxis={...axes,title:'Indice (prima settimana = 100)',ticksuffix:'',rangemode:'normal'};}
  return {traces,layout,description:`${total} medie partito-settimana. Ogni istituto conta una volta per settimana.${state.scale==='index'?' Indice = 100 alla prima settimana del periodo selezionato.':''}`};
}

function renderCI(rows) {
  const traces=[];let count=0,without=0;
  for(const party of selectedParties()) {
    const usable=rows.filter(v=>isValue(v[party]));
    without+=usable.filter(v=>!v.n).length;
    const p=usable.filter(v=>v.n && v.n>=100);
    if(!p.length)continue;
    count+=p.length;
    const halfwidths=p.map(v=>1.96*100*Math.sqrt((v[party]/100)*(1-v[party]/100)/v.n));
    traces.push({type:'scatter',mode:'markers',x:p.map(v=>v.date),y:p.map(v=>v[party]),name:`${party} · sondaggi`,legendgroup:party,marker:{size:6,color:colorOf(party),opacity:.55},error_y:{type:'data',array:halfwidths,visible:true,color:colorOf(party)+'66',thickness:.7,width:1.7},customdata:p.map((v,i)=>[v.firm,v.n,halfwidths[i],Math.max(0,v[party]-halfwidths[i]),Math.min(100,v[party]+halfwidths[i])]),hovertemplate:`${party} · %{x}<br>Istituto: %{customdata[0]}<br>Stima: %{y:.1f}%<br>Campione: %{customdata[1]}<br>IC 95%: [%{customdata[3]:.2f}%, %{customdata[4]:.2f}%]<extra>IC teorico</extra>`});
    const agg=weeklyStats(rows,party);
    if(agg.length>=3)traces.push({type:'scatter',mode:'lines',x:agg.map(v=>v.date),y:lowess(agg.map(v=>({date:v.date,y:v.mean})),state.span),name:`${party} · LOWESS`,legendgroup:party,line:{color:colorOf(party),width:2.7},hovertemplate:`LOWESS ${party}: %{y:.2f}%<extra></extra>`});
  }
  return {traces,layout:layoutBase(),description:`${numFmt(count)} osservazioni con numerosità nota. ${numFmt(without)} misure senza n escluse dagli IC (non dalle altre analisi).`};
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
  cv:['Quanto differiscono gli istituti?','CV settimanale tra istituti per ciascun partito, con almeno tre istituti nella settimana.'],
  box:['Distribuzione storica per istituto','Boxplot dei sondaggi per istituto nel periodo selezionato. Scegli il partito da confrontare.'],
  corr:['Correlazioni tra partiti','Matrice di Pearson delle curve LOWESS: confronta livelli oppure variazioni settimanali.']
};

let lastRender=null;

function render(){
  const [title, desc]=tabMetadata[state.tab];$('chart-title').textContent=title;$('chart-description').textContent=desc;
  $('chart-tools').innerHTML='';
  if(state.tab==='trend'){
    const sel=document.createElement('select');sel.setAttribute('aria-label','Scala della serie storica');
    for(const [value,label] of [['share','Scala: percentuale'],['index','Scala: indice base 100']]){
      const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value===state.scale;sel.append(option);
    }
    sel.addEventListener('change',e=>{state.scale=e.target.value;render();});$('chart-tools').append(sel);
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
  const rows=filtered();
  const res=state.tab==='trend'?renderTrend(rows):state.tab==='ci'?renderCI(rows):state.tab==='cv'?renderCV(rows):state.tab==='box'?renderBox(rows):renderCorrelations(rows);
  $('chart-summary').textContent=res.description;
  $('empty-state').hidden=res.traces.length>0;
  const wrap=document.querySelector('.plot-wrap');
  wrap.classList.toggle('corr-scroll',state.tab==='corr');
  if(state.tab==='corr') {
    // A full 15-party matrix stays legible on phones via internal horizontal scrolling.
    wrap.style.setProperty('--corr-min-width',`${Math.max(610,selectedParties().length*58+165)}px`);
  } else wrap.style.removeProperty('--corr-min-width');
  const mobile=window.matchMedia('(max-width:680px)').matches;
  const layout = {...res.layout};
  if(mobile && state.tab!=='corr') {
    layout.margin={...layout.margin,l:47,r:18,t:108,b:state.tab==='box'?145:98};
    layout.legend={...layout.legend,font:{size:10},y:1.07};
    layout.height=515;
  }
  if(mobile && state.tab==='corr') {
    layout.height=Math.max(460,120+selectedParties().length*49);
    layout.margin={...layout.margin,l:65,r:83,b:88};
  }
  lastRender={traces:res.traces,layout, title, desc};
  if(typeof Plotly!=='undefined')Plotly.react('chart',res.traces,withChartSignature(layout),config);
  else $('empty-state').textContent='Impossibile caricare Plotly. Controlla la connessione a Internet e riprova.';
}


// Prepare a separate high-resolution figure to guarantee that exported PNGs
// contain the chart's on-page heading, the chosen method and the GitHub credit.
function escapeMarkup(value) {
  return String(value).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
}
function exportHeading() {
  if(state.tab==='corr') return state.corrMode==='changes'
    ? 'Pearson r · variazioni settimanali delle curve LOWESS'
    : 'Pearson r · livelli delle curve LOWESS';
  if(state.tab==='trend') return state.scale==='index'
    ? 'Medie settimanali · LOWESS · indice base 100'
    : 'Medie settimanali · LOWESS · percentuali';
  if(state.tab==='box') return `Distribuzione dei sondaggi per istituto · ${state.boxParty}`;
  return tabMetadata[state.tab][1];
}
function exportLayoutForPng() {
  const l=JSON.parse(JSON.stringify(lastRender.layout));
  // The export must be independent of the screen width or scroll position.
  l.width=1600;
  l.height=state.tab==='corr' ? Math.max(780,205+selectedParties().length*58) : 820;
  l.margin={...l.margin,l:state.tab==='corr'?135:85,r:state.tab==='corr'?150:65,t:145,b:state.tab==='box'?175:112};
  if(state.tab==='corr') {
    l.xaxis.tickfont={size:15,color:'#354963'};
    l.yaxis.tickfont={size:15,color:'#354963'};
  }
  l.annotations=[...(l.annotations||[]),
    {xref:'paper',yref:'paper',x:0,y:1,xanchor:'left',yanchor:'bottom',yshift:78,showarrow:false,
      font:{family:'Arial,sans-serif',size:28,color:'#1c2740'},text:`<b>${escapeMarkup(lastRender.title)}</b>`},
    {xref:'paper',yref:'paper',x:0,y:1,xanchor:'left',yanchor:'bottom',yshift:45,showarrow:false,
      font:{family:'Arial,sans-serif',size:17,color:'#6e7f9a'},text:escapeMarkup(exportHeading())},
    {xref:'paper',yref:'paper',x:0,y:1,xanchor:'left',yanchor:'bottom',yshift:20,showarrow:false,
      font:{family:'Arial,sans-serif',size:14,color:'#94a1b1'},
      text:`Periodo: ${escapeMarkup(state.from)} — ${escapeMarkup(state.to)} · LOWESS: ${Math.round(state.span*100)}%`}
  ];
  return withChartSignature(l);
}
async function exportChartPng() {
  if(typeof Plotly==='undefined' || !lastRender || !lastRender.traces.length) return;
  const button=$('export-chart');
  const original=button.textContent;
  button.disabled=true;button.textContent='Preparazione PNG…';
  const tmp=document.createElement('div');
  const layout=exportLayoutForPng();
  tmp.style.cssText=`position:fixed;left:-100000px;top:0;width:${layout.width}px;height:${layout.height}px;pointer-events:none`;
  document.body.appendChild(tmp);
  try {
    await Plotly.newPlot(tmp,lastRender.traces,layout,{displayModeBar:false,staticPlot:true,responsive:false});
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
    state.from=earliest;state.to=latest;state.span=.30;state.scale='share';state.corrMode='changes';state.selected=new Set(DEFAULT_PARTIES.filter(p=>PARTY_NAMES.includes(p))); 
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
    if(!state.polls.length)throw new Error('Archivio vuoto');
    const present = (data.parties || []).filter(p => typeof p==='string' && state.polls.some(r=>isValue(r[p])));
    PARTY_NAMES = present.length ? present : [...new Set(state.polls.flatMap(r=>Object.keys(r).filter(p=>!['date','firm','n'].includes(p))))];
    state.selected = new Set(DEFAULT_PARTIES.filter(p=>PARTY_NAMES.includes(p)));
    if(!state.selected.size)state.selected=new Set(PARTY_NAMES.slice(0,Math.min(6,PARTY_NAMES.length)));
    state.boxParty = state.selected.values().next().value;
    state.updated=data.updated_utc||'';
    setup();
  }catch(err){$('sync-state').textContent='Archivio non disponibile';$('chart-title').textContent='Errore durante il caricamento';$('chart-description').textContent=`Impossibile recuperare i dati: ${err.message}. Avvia il sito da un server web (non file://).`;}
}
init();
