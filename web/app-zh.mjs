import { diseaseName, sourceName, dateText, colors, severityLabels, markerSize, severity, safeUrl, filterReports, groupEvents, histogram, hasCount } from './core.mjs';

const $=id=>document.getElementById(id);
const state={data:null,filtered:[],events:[],selected:null,limit:35,filters:{query:'',disease:'',source:'',scope:'all',severity:'',start:'',end:''}};
const count=n=>hasCount(n)?n.toLocaleString('zh-CN'):'未知';
const e=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
function link(url,text,cls='article-link') {const safe=safeUrl(url);const el=e(safe?'a':'span',cls,text);if(safe){el.href=safe;el.target='_blank';el.rel='noopener noreferrer';}return el;}
let map,markerLayer,markers=new Map(),minTime=0,maxTime=0;

function initMap(countries) {
  map=L.map('map',{zoomControl:false,minZoom:1,maxZoom:7,worldCopyJump:false,maxBounds:[[-84,-220],[84,220]],maxBoundsViscosity:.7});
  map.fitBounds([[-55,-155],[73,170]],{padding:[20,30]});
  L.control.zoom({position:'bottomright'}).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Leaflet · Natural Earth');
  const graticule=[];
  for(let lng=-180;lng<=180;lng+=30)graticule.push(L.polyline([[-80,lng],[80,lng]],{color:'#233642',weight:.5,opacity:.5,interactive:false}));
  for(let lat=-60;lat<=60;lat+=30)graticule.push(L.polyline([[lat,-180],[lat,180]],{color:'#233642',weight:.5,opacity:.5,interactive:false}));
  L.layerGroup(graticule).addTo(map);
  L.geoJSON(countries,{style:{color:'#33505e',weight:.6,fillColor:'#192e3a',fillOpacity:1},onEachFeature:(feature,layer)=>{layer.bindTooltip(feature.properties.name,{sticky:true,className:'map-tooltip'});}}).addTo(map);
  markerLayer=L.markerClusterGroup({maxClusterRadius:35,showCoverageOnHover:false,spiderfyOnMaxZoom:true,
    iconCreateFunction:cluster=>L.divIcon({html:`<span>${cluster.getChildCount()}</span>`,className:'event-cluster',iconSize:[34,34]})}).addTo(map);
  $('fit-world').onclick=()=>map.fitBounds([[-55,-155],[73,170]],{padding:[20,30]});
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
    const marker=L.marker([ev.location.lat,ev.location.lng],{icon:L.divIcon({html:icon,className:`atlas-marker ${ev.latest.triage==='context'?'context':''}`,iconSize:[size,size],iconAnchor:[size/2-dx,size/2-dy]}),keyboard:true,title:`${diseaseName(ev.disease)} · ${ev.location.name} · ${ev.reports.length} 份报告`});
    const tip=e('div');tip.append(e('strong','',`${diseaseName(ev.disease)} · ${ev.location.name}`),e('p','',`${ev.reports.length} 份关联报告 · 病例 ${count(ev.countReport?.cases)}`),e('p','',ev.latest.summary.slice(0,150)+'…'),e('p','',`${sourceName(ev.latest.source)} · ${dateText(ev.latest.publishedAt)} · 点击查看原文`));
    marker.bindTooltip(tip,{className:'map-tooltip',direction:'top',offset:[dx,dy-size/2]});
    marker.on('click',()=>showEvent(ev.id));marker.addTo(markerLayer);markers.set(ev.id,marker);
  }
  $('map-empty').hidden=located.length>0;
}

function newsCard(r) {
  const card=e('article','news-card');
  const meta=e('div','news-meta');meta.append(e('span','source-tag',sourceName(r.source)),e('time','',dateText(r.publishedAt)));
  const title=e('button','news-title',r.title);title.onclick=()=>{const ev=state.events.find(ev=>ev.reports.some(x=>x.id===r.id));if(ev)showEvent(ev.id,true);};
  const bottom=e('div','card-bottom');bottom.append(e('span','place-label',`◎ ${r.location?.name||'地点待核实'} · ${diseaseName(r.disease)}`),link(r.url,'原文 ↗'));
  card.append(meta,title,e('p','news-summary',r.summary),bottom);return card;
}

function renderFeed() {
  $('feed').replaceChildren();$('feed-count').textContent=state.filtered.length;
  if(!state.filtered.length){$('feed').append(e('p','empty','没有符合筛选条件的报告。\n请尝试扩大时间范围或重置筛选。'));return;}
  for(const r of state.filtered.slice(0,state.limit))$('feed').append(newsCard(r));
  if(state.filtered.length>state.limit){const more=e('button','load-more',`加载更多（还有 ${state.filtered.length-state.limit} 份）`);more.onclick=()=>{state.limit+=35;renderFeed();};$('feed').append(more);}
}

function showEvent(id,fly=false) {
  const ev=state.events.find(x=>x.id===id);if(!ev)return;
  state.selected=id;$('feed-view').hidden=true;$('detail-view').hidden=false;
  const top=e('div','detail-top');const back=e('button','','← 返回新闻列表');back.onclick=closeDetail;top.append(back,e('span','','EVIDENCE DETAIL'));
  const body=e('div','detail-scroll');body.append(e('div','eyebrow','候选事件 · 自动提取待核查'),e('h2','',diseaseName(ev.disease)),e('div','detail-place',`◎ ${ev.location?.name||'地点待核实'}${ev.location?.country&&ev.location.country!==ev.location.name?' / '+ev.location.country:''}`));
  const sev=e('span','severity-tag',`严重性 ${severityLabels[ev.severity.level]}${ev.severity.score!==null?' · '+ev.severity.score+'/100':''}`);sev.style.setProperty('--sev',colors[ev.severity.level]);body.append(sev);
  const metrics=e('div','metrics');for(const [label,n] of [['报告病例',ev.countReport?.cases],['报告死亡',ev.countReport?.deaths]]){const metric=e('div');metric.append(e('strong','',count(n)),e('span','',label));metrics.append(metric);}body.append(metrics);
  body.append(e('p','detail-note',ev.countReport?`人数来源：${sourceName(ev.countReport.source)}，${dateText(ev.countReport.publishedAt)}。同一报告的摘录数值，未累加。`:'所选报告没有可明确归属的病例或死亡数。'));
  body.append(e('p','detail-note',ev.severity.reason));
  if(ev.location)body.append(e('p','detail-note',ev.location.name===ev.location.country||['DRC','UK'].includes(ev.location.name)?'定位精度：国家／地区代表位置，并非具体暴发地址。':'定位：根据来源文字匹配；同地标记可在放大后展开以避免遮挡。'));
  if(ev.countReport?.countEvidence){body.append(e('h3','','人数证据摘录'),e('div','evidence-box',ev.countReport.countEvidence));}
  body.append(e('h3','',`关联新闻与通报 · ${ev.reports.length}`));
  for(const r of ev.reports){
    const article=e('article','detail-article');const meta=e('div','news-meta');meta.append(e('span','source-tag',sourceName(r.source)),e('time','',dateText(r.publishedAt)));
    article.append(meta,e('h4','',r.title),e('p','',r.summary));
    const details=e('details');details.append(e('summary','','查看提取依据与时间'),e('p','',`采集时间：${r.retrievedAt}；日期口径：${r.dateBasis}。事件文字状态：${r.status}。${r.rationale.join('；')}`));article.append(details,link(r.url,'阅读来源原文 ↗'));
    body.append(article);
  }
  $('detail-view').replaceChildren(top,body);
  for(const [key,m]of markers)m.getElement()?.classList.toggle('selected',key===id);
  if(fly&&ev.location&&map)map.flyTo([ev.location.lat,ev.location.lng],Math.max(map.getZoom(),3),{duration:.6});
  if(window.innerWidth<900)$('detail-view').scrollIntoView({behavior:'smooth',block:'start'});
}

function closeDetail(){state.selected=null;$('detail-view').hidden=true;$('feed-view').hidden=false;for(const m of markers.values())m.getElement()?.classList.remove('selected');}
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
  $('date-note').textContent=`按来源发布日期（UTC）筛选，不等同于发病日期。${unknown?' 日期未知 '+unknown+' 份，限定日期时不纳入。':''}`;
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
    const res=await fetch('./data/reports.json');if(!res.ok)throw new Error(`报告文件 HTTP ${res.status}`);state.data=await res.json();
    if(!Array.isArray(state.data.reports))throw new Error('报告格式不正确');
    state.data.reports.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    const times=state.data.reports.map(r=>Date.parse(r.publishedAt)).filter(Number.isFinite);minTime=times.length?Math.min(...times):Date.now();maxTime=times.length?Math.max(...times):Date.now();
    for(const disease of [...new Set(state.data.reports.map(r=>r.disease))].sort()){const option=e('option','',`${diseaseName(disease)}${diseaseName(disease)!==disease?' / '+disease:''}`);option.value=disease;$('disease').append(option);}
    for(const source of [...new Set(state.data.reports.map(r=>r.source))]){const option=e('option','',sourceName(source));option.value=source;$('source').append(option);}
    const health=state.data.sources||[];
    for(const s of health){const row=e('div','health-row');const ok=s.status==='ok';row.append(e('span','',sourceName(s.id)),e('span',`health-state ${ok?'':'failed'}`,ok?'● 已采集':s.status==='partial'?'◐ 部分可用':'○ 暂不可用'));row.title=(s.errors||[]).join('; ');$('health').append(row);}
    const last=state.data.lastSuccessAt;const days=last?Math.floor((Date.now()-Date.parse(last))/864e5):Infinity;
    $('snapshot-label').textContent=last?`数据快照 · ${days>1?days+' 天前采集':dateText(last)}`:'尚无成功采集';
    $('last-update').textContent=`最近采集 ${last?last.slice(0,16).replace('T',' ')+' UTC':'未知'} · 非实时病例监测`;
    bindControls();
    try{const geo=await fetch('./data/countries.geojson');if(!geo.ok)throw new Error();initMap(await geo.json());}catch{$('map').append(e('p','empty','地图资源暂不可用；仍可浏览右侧报告。'));}
    update();
  }catch(error){$('snapshot-label').textContent='数据加载失败';$('feed').replaceChildren(e('p','empty',`${error.message}。请先运行采集和构建，再通过本地服务器打开。`));}
}
boot();

