import { colors, markerSize, safeUrl, filterReports, groupEvents, histogram, hasCount } from './core.mjs';

const $=id=>document.getElementById(id);
const state={data:null,filtered:[],events:[],selected:null,limit:35,filters:{query:'',disease:'',source:'',scope:'all',severity:'',start:'',end:''}};
const diseaseName=d=>d||'Unclassified';
const sourceName=s=>({who:'WHO',paho:'PAHO',news:'News media'}[s]||s);
const dateText=s=>s?s.slice(0,10):'Date unknown';
const severityLabels={unknown:'Insufficient data',low:'Low',moderate:'Moderate',high:'High',critical:'Critical'};
const count=n=>hasCount(n)?n.toLocaleString('en-US'):'Unknown';
const e=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
function link(url,text,cls='article-link') {const safe=safeUrl(url);const el=e(safe?'a':'span',cls,text);if(safe){el.href=safe;el.target='_blank';el.rel='noopener noreferrer';}return el;}
let map,markerLayer,markers=new Map(),minTime=0,maxTime=0;
function setFiltersOpen(open,focus=false){
  if(open)closeDetail();
  $('filters-panel').hidden=!open;
  $('workspace').classList.toggle('sidebar-closed',!open);
  $('open-filters').setAttribute('aria-expanded',String(open));
  $('open-filters').textContent=open?'☰ Hide filters':'☰ Show filters';
  $('header-filters').setAttribute('aria-expanded',String(open));
  $('header-filters').textContent=open?'☰ Hide filters':'☰ Filters';
  if(map)requestAnimationFrame(()=>map.invalidateSize());
  if(focus)(open?$('search'):$('open-filters')).focus();
}
$('open-filters').addEventListener('click',()=>setFiltersOpen($('filters-panel').hidden,true));
$('header-filters').addEventListener('click',()=>setFiltersOpen($('filters-panel').hidden,true));
$('close-filters').addEventListener('click',()=>setFiltersOpen(false,true));
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||$('method-dialog').open)return;if(!$('filters-panel').hidden)setFiltersOpen(false,true);else if(!$('event-panel').hidden)closeDetail();});

function initMap(countries) {
  map=L.map('map',{zoomControl:false,minZoom:1,maxZoom:7,worldCopyJump:false,maxBounds:[[-84,-220],[84,220]],maxBoundsViscosity:.7});
  map.fitBounds([[-55,-155],[73,170]],{padding:[20,30]});
  L.control.zoom({position:'topright'}).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Leaflet · Natural Earth');
  const graticule=[];
  for(let lng=-180;lng<=180;lng+=30)graticule.push(L.polyline([[-80,lng],[80,lng]],{color:'#233642',weight:.5,opacity:.5,interactive:false}));
  for(let lat=-60;lat<=60;lat+=30)graticule.push(L.polyline([[lat,-180],[lat,180]],{color:'#233642',weight:.5,opacity:.5,interactive:false}));
  L.layerGroup(graticule).addTo(map);
  L.geoJSON(countries,{style:{color:'#33505e',weight:.6,fillColor:'#192e3a',fillOpacity:1},onEachFeature:(feature,layer)=>{layer.bindTooltip(feature.properties.name,{sticky:true,className:'map-tooltip'});}}).addTo(map);
  markerLayer=L.markerClusterGroup({maxClusterRadius:35,showCoverageOnHover:false,spiderfyOnMaxZoom:true,
    iconCreateFunction:cluster=>L.divIcon({html:`<span>${cluster.getChildCount()}</span>`,className:'event-cluster',iconSize:[34,34]})}).addTo(map);
  $('fit-world').onclick=()=>{closeDetail();map.fitBounds([[-55,-155],[73,170]],{padding:[20,30]});};
  map.on('click',()=>closeDetail());
  new ResizeObserver(()=>map.invalidateSize()).observe($('map'));
}

function renderMap() {
  if(!map)return;
  markerLayer.clearLayers();markers.clear();
  const located=state.events.filter(ev=>ev.location);
  for(const ev of located) {
    const dx=0,dy=0; // MarkerCluster handles overlap with zoom and spiderfy.
    const size=markerSize(ev.countReport?.cases),color=colors[ev.severity.level];
    const icon=e('div','marker-ring');icon.style.setProperty('--marker',color);
    const marker=L.marker([ev.location.lat,ev.location.lng],{icon:L.divIcon({html:icon,className:`atlas-marker ${ev.latest.triage==='context'?'context':''}`,iconSize:[size,size],iconAnchor:[size/2-dx,size/2-dy]}),keyboard:true,title:`${diseaseName(ev.disease)} · ${ev.location.name} · ${ev.reports.length} reports`});
    const tip=e('div');tip.append(e('strong','',`${diseaseName(ev.disease)} · ${ev.location.name}`),e('p','',`${ev.reports.length} linked reports · Cases: ${count(ev.countReport?.cases)}`),e('p','',ev.latest.summary.slice(0,150)+'…'),e('p','',`${sourceName(ev.latest.source)} · ${dateText(ev.latest.publishedAt)} · Select for sources`));
    marker.bindTooltip(tip,{className:'map-tooltip',direction:'top',offset:[dx,dy-size/2]});
    marker.on('click',event=>{L.DomEvent.stopPropagation(event.originalEvent);showEvent(ev.id);});marker.addTo(markerLayer);markers.set(ev.id,marker);
  }
  $('map-empty').hidden=located.length>0;
}

function newsCard(r) {
  const card=e('article','news-card');
  const meta=e('div','news-meta');meta.append(e('span','source-tag',sourceName(r.source)),e('time','',dateText(r.publishedAt)));
  const title=e('button','news-title',r.title);title.onclick=()=>{const ev=state.events.find(ev=>ev.reports.some(x=>x.id===r.id));if(ev)showEvent(ev.id,true);};
  const bottom=e('div','card-bottom');bottom.append(e('span','place-label',`◎ ${r.location?.name||'Location unverified'} · ${diseaseName(r.disease)}`),link(r.url,'Original source ↗'));
  card.append(meta,title,e('p','news-summary',r.summary),bottom);return card;
}

function renderFeed() {
  $('feed').replaceChildren();$('feed-count').textContent=state.filtered.length;
  if(!state.filtered.length){$('feed').append(e('p','empty','No reports match these filters.\nTry a wider date range or reset filters.'));return;}
  for(const r of state.filtered.slice(0,state.limit))$('feed').append(newsCard(r));
  if(state.filtered.length>state.limit){const more=e('button','load-more',`Load more (${state.filtered.length-state.limit} remaining)`);more.onclick=()=>{state.limit+=35;renderFeed();};$('feed').append(more);}
}

function showEvent(id,fly=false) {
  const ev=state.events.find(x=>x.id===id);if(!ev)return;
  if(!$('filters-panel').hidden)setFiltersOpen(false);
  state.selected=id;$('event-panel').hidden=false;$('detail-view').hidden=false;
  const top=e('div','detail-top');const back=e('button','','× Close details');back.onclick=closeDetail;top.append(back,e('span','','EVIDENCE DETAIL'));
  const body=e('div','detail-scroll');body.append(e('div','eyebrow','Possible event · Automated extraction needs review'),e('h2','',diseaseName(ev.disease)),e('div','detail-place',`◎ ${ev.location?.name||'Location unverified'}${ev.location?.country&&ev.location.country!==ev.location.name?' / '+ev.location.country:''}`));
  const sev=e('span','severity-tag',`Severity: ${severityLabels[ev.severity.level]}${ev.severity.score!==null?' · '+ev.severity.score+'/100':''}`);sev.style.setProperty('--sev',colors[ev.severity.level]);body.append(sev);
  const metrics=e('div','metrics');for(const [label,n] of [['Reported cases',ev.countReport?.cases],['Reported deaths',ev.countReport?.deaths]]){const metric=e('div');metric.append(e('strong','',count(n)),e('span','',label));metrics.append(metric);}body.append(metrics);
  body.append(e('p','detail-note',ev.countReport?`Numbers from: ${sourceName(ev.countReport.source)}, ${dateText(ev.countReport.publishedAt)}. Values are from one report and have not been added together.`:'No case or death count can be clearly attributed to these reports.'));
  const scored=ev.severity.score!==null;
  body.append(e('p','detail-note',scored?'This experimental score uses cases and deaths from the same report. Missing values count as zero, so the score may be too low.':'There are not enough current, attributable numbers to assign a severity level.'));
  if(ev.location)body.append(e('p','detail-note',ev.location.name===ev.location.country||['DRC','UK'].includes(ev.location.name)?'Location accuracy: country or region representative point, not an outbreak address.':'Location matched from source text. Zoom in to separate nearby points.'));
  if(ev.countReport?.countEvidence){body.append(e('h3','','Count evidence excerpt'),e('div','evidence-box',ev.countReport.countEvidence));}
  body.append(e('h3','',`Related reports · ${ev.reports.length}`));
  for(const r of ev.reports){
    const article=e('article','detail-article');const meta=e('div','news-meta');meta.append(e('span','source-tag',sourceName(r.source)),e('time','',dateText(r.publishedAt)));
    article.append(meta,e('h4','',r.title),e('p','',r.summary));
    const details=e('details');details.append(e('summary','','View extraction evidence and dates'),e('p','',`Collected: ${r.retrievedAt}; Date basis: ${r.dateBasis}; Event status: ${r.status}; ${r.rationale.join('; ')}`));article.append(details,link(r.url,'Read original source ↗'));
    body.append(article);
  }
  $('detail-view').replaceChildren(top,body);
  for(const [key,m]of markers)m.getElement()?.classList.toggle('selected',key===id);
  if(fly&&ev.location&&map)map.flyTo([ev.location.lat,ev.location.lng],Math.max(map.getZoom(),3),{duration:.6});
  if(fly)$('workspace').scrollIntoView({behavior:'smooth',block:'start'});
  if(window.innerWidth<760)$('detail-view').scrollIntoView({behavior:'smooth',block:'start'});
}

function closeDetail(){state.selected=null;$('detail-view').hidden=true;$('event-panel').hidden=true;for(const m of markers.values())m.getElement()?.classList.remove('selected');}
function update(){
  state.filtered=filterReports(state.data.reports,state.filters);state.events=groupEvents(state.filtered);
  $('stat-reports').textContent=state.filtered.length;$('stat-events').textContent=state.events.length;
  $('stat-countries').textContent=new Set(state.filtered.flatMap(r=>r.location?[r.location.iso]:[])).size;
  $('stat-unmapped').textContent=state.filtered.filter(r=>!r.location).length;
  renderMap();renderFeed();renderTimeline();
  if(state.selected&&state.events.some(ev=>ev.id===state.selected))showEvent(state.selected);else closeDetail();
}

function renderTimeline(){
  const bars=histogram(state.data.reports,minTime,maxTime),highest=Math.max(1,...bars);$('histogram').replaceChildren();
  bars.forEach((n,i)=>{const day=new Date(minTime+(maxTime-minTime)*i/bars.length).toISOString().slice(0,10);const on=(!state.filters.start||day>=state.filters.start)&&(!state.filters.end||day<=state.filters.end);const bar=e('i',on?'in-range':'');bar.style.height=`${Math.max(2,n/highest*100)}%`;$('histogram').append(bar);});
  $('date-start').value=state.filters.start;$('date-end').value=state.filters.end;
  const pct=date=>Math.max(0,Math.min(1000,Math.round((Date.parse(date)-minTime)/Math.max(1,maxTime-minTime)*1000)));
  $('range-start').value=state.filters.start?pct(state.filters.start):0;$('range-end').value=state.filters.end?pct(state.filters.end):1000;
  const unknown=state.data.reports.filter(r=>!r.publishedAt).length;
  $('date-note').textContent=`Filter by publication date (UTC), not symptom onset.${unknown?' '+unknown+' reports have unknown dates and are excluded when dates are selected.':''}`;
}
function presetActive(days){document.querySelectorAll('[data-days]').forEach(b=>b.classList.toggle('active',b.dataset.days===String(days)));}

function bindControls(){
  for(const name of ['search','disease','source','scope','severity'])$(name).addEventListener(name==='search'?'input':'change',()=>{state.filters[name==='search'?'query':name]=$(name).value;state.limit=35;update();});
  for(const key of ['start','end'])$(`date-${key}`).addEventListener('change',()=>{const other=key==='start'?'end':'start';state.filters[key]=$(`date-${key}`).value;if(state.filters.start&&state.filters.end&&state.filters.start>state.filters.end)state.filters[other]=state.filters[key];presetActive('');update();});
  for(const key of ['start','end'])$(`range-${key}`).addEventListener('input',()=>{const day=new Date(minTime+(maxTime-minTime)*Number($(`range-${key}`).value)/1000).toISOString().slice(0,10);state.filters[key]=day;const other=key==='start'?'end':'start';if(state.filters.start&&state.filters.end&&state.filters.start>state.filters.end)state.filters[other]=day;presetActive('');update();});
  document.querySelectorAll('[data-days]').forEach(button=>button.onclick=()=>{const days=button.dataset.days;if(days==='all'){state.filters.start='';state.filters.end='';}else{const end=new Date();state.filters.end=end.toISOString().slice(0,10);state.filters.start=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate())-(Number(days)-1)*864e5).toISOString().slice(0,10);}presetActive(days);update();});
  $('clear-dates').onclick=()=>{state.filters.start='';state.filters.end='';presetActive('all');update();};
  $('reset').onclick=()=>{Object.assign(state.filters,{query:'',disease:'',source:'',scope:'all',severity:'',start:'',end:''});for(const id of ['search','disease','source','severity'])$(id).value='';$('scope').value='all';state.limit=35;presetActive('all');update();};
  $('method-button').onclick=()=>$('method-dialog').showModal();$('close-method').onclick=()=>$('method-dialog').close();
  $('export').onclick=()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),filters:state.filters,reports:state.filtered},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=e('a');a.href=url;a.download='epiatlas-reports.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}

async function boot(){
  try {
    const res=await fetch('./data/reports.json');if(!res.ok)throw new Error(`Report file HTTP ${res.status}`);state.data=await res.json();
    if(!Array.isArray(state.data.reports))throw new Error('Invalid report format');
    state.data.reports.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    const times=state.data.reports.map(r=>Date.parse(r.publishedAt)).filter(Number.isFinite);minTime=times.length?Math.min(...times):Date.now();maxTime=times.length?Math.max(...times):Date.now();
    for(const disease of [...new Set(state.data.reports.map(r=>r.disease))].sort()){const option=e('option','',`${diseaseName(disease)}${diseaseName(disease)!==disease?' / '+disease:''}`);option.value=disease;$('disease').append(option);}
    for(const source of [...new Set(state.data.reports.map(r=>r.source))]){const option=e('option','',sourceName(source));option.value=source;$('source').append(option);}
    const health=state.data.sources||[];
    for(const s of health){const row=e('div','health-row');const ok=s.status==='ok';row.append(e('span','',sourceName(s.id)),e('span',`health-state ${ok?'':'failed'}`,ok?'● Collected':s.status==='partial'?'◐ Partial':'○ Unavailable'));row.title=(s.errors||[]).join('; ');$('health').append(row);}
    const last=state.data.lastSuccessAt;const days=last?Math.floor((Date.now()-Date.parse(last))/864e5):Infinity;
    $('snapshot-label').textContent=last?`Data snapshot · ${days>1?days+' days ago':dateText(last)}`:'No successful collection yet';
    $('last-update').textContent=`Last collection: ${last?last.slice(0,16).replace('T',' ')+' UTC':'Unknown'} · Not real-time case surveillance`;
    bindControls();
    try{const geo=await fetch('./data/countries.geojson');if(!geo.ok)throw new Error();initMap(await geo.json());}catch{$('map').append(e('p','empty','Map unavailable. Reports remain available on the right.'));}
    update();
  }catch(error){$('snapshot-label').textContent='Could not load data';$('feed').replaceChildren(e('p','empty',`${error.message}. Please refresh the data build and serve this page over HTTP.`));}
}
boot();

