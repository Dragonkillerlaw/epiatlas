export const DISEASE_ZH = { 'cholera':'霍乱', 'dengue':'登革热', 'ebola':'埃博拉', 'mpox':'猴痘', 'measles':'麻疹', 'marburg':'马尔堡病', 'nipah':'尼帕病毒', 'plague':'鼠疫', 'polio':'脊髓灰质炎', 'yellow fever':'黄热病', 'lassa':'拉沙热', 'malaria':'疟疾', 'chikungunya':'基孔肯雅热', 'oropouche':'奥罗普切热', 'avian influenza':'禽流感', 'h5n1':'禽流感 H5N1', 'mers':'中东呼吸综合征', 'covid-19':'新冠', 'meningitis':'脑膜炎', 'diphtheria':'白喉', 'hepatitis':'肝炎', 'rift valley fever':'裂谷热' };
export const diseaseName = d => DISEASE_ZH[d?.toLowerCase()] || d || '未分类';
Object.assign(DISEASE_ZH, {'unknown illness':'不明病因疾病','anthrax':'炭疽','covid':'新冠','crimean-congo':'克里米亚–刚果出血热','diarrhea':'腹泻症候群','fever':'发热症候群','h5n2':'禽流感 H5N2','h5n5':'禽流感 H5N5','h9n2':'禽流感 H9N2','hantavirus':'汉坦病毒','hepatitis e':'戊型肝炎','leptospirosis':'钩端螺旋体病','rabies':'狂犬病','sars':'SARS','sudan virus':'苏丹型埃博拉','typhoid':'伤寒','west nile':'西尼罗热','zika':'寨卡','avian flu':'禽流感','lassa fever':'拉沙热'});
export const sourceName = s => ({who:'WHO',paho:'PAHO',news:'新闻媒体'}[s] || s);
export const dateText = s => s ? s.slice(0,10) : '日期未知';
export const colors = {unknown:'#879cad',low:'#5bd9bd',moderate:'#e8c46b',high:'#f2966b',critical:'#ed708c'};
export const severityLabels = {unknown:'信息不足',low:'较低',moderate:'中等',high:'较高',critical:'高'};
export const hasCount = n => Number.isFinite(n) && n >= 0;

// Adapted from PulseMap/PulseMap.tsx (MIT): bounded logarithmic marker size.
// Unknown is distinct from a reported zero; see licenses/PulseMap-MIT.txt.
export function markerSize(cases) {
  return hasCount(cases) ? Math.max(16, Math.min(48, 10 + Math.log10(cases + 1) * 8)) : 14;
}

// Exploratory reported-burden score. It is NOT a calibrated public-health risk.
// No inferred CFR: reports need compatible case definitions and time windows.
export function severity(report) {
  if (report.status !== 'active' || (!hasCount(report.cases) && !hasCount(report.deaths)))
    return {level:'unknown',score:null,reason:'没有可用于分级的当前事件人数摘录'};
  const c = hasCount(report.cases) ? Math.min(45, Math.log10(report.cases + 1) * 11.25) : 0;
  const d = hasCount(report.deaths) ? Math.min(55, Math.log10(report.deaths + 1) * 18.33) : 0;
  const score = Math.round(c + d);
  return {level:score>=75?'critical':score>=50?'high':score>=25?'moderate':'low',score,
    reason:`病例分 ${Math.round(c)}/45 + 死亡分 ${Math.round(d)}/55；来自同一报告。缺失项不加分，分级可能偏低。`};
}

export function safeUrl(url) {
  try { const u=new URL(url); return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password ? u.href : null; } catch { return null; }
}

export function filterReports(reports, filters) {
  const q=(filters.query||'').trim().toLowerCase();
  return reports.filter(r=> {
    const day=r.publishedAt?.slice(0,10);
    if ((filters.start||filters.end) && (!day || (filters.start&&day<filters.start) || (filters.end&&day>filters.end))) return false;
    if (filters.source&&r.source!==filters.source) return false;
    if (filters.disease&&r.disease!==filters.disease) return false;
    if (filters.scope==='review'&&r.triage!=='review') return false;
    if (filters.severity&&severity(r).level!==filters.severity) return false;
    return !q || [r.title,r.summary,r.disease,diseaseName(r.disease),r.location?.name,r.location?.country].join(' ').toLowerCase().includes(q);
  });
}

export function groupEvents(reports) {
  // Candidate grouping only, not identity verification. No cross-country merge.
  const buckets=new Map();
  const sorted=[...reports].sort((a,b)=>(a.publishedAt||'').localeCompare(b.publishedAt||''));
  for (const r of sorted) {
    const loc=r.location;
    const base=loc ? `${r.disease}|${loc.iso}|${loc.name}` : `unmapped|${r.id}`;
    let events=buckets.get(base)||[];
    let event=events.at(-1);
    const ts=Date.parse(r.publishedAt);
    if (!event || !Number.isFinite(ts) || !Number.isFinite(event.lastTs) || ts-event.lastTs>45*864e5) {
      event={id:`${base}|${r.id}`,location:loc,disease:r.disease,reports:[],lastTs:ts}; events.push(event);
    }
    event.reports.unshift(r); event.lastTs=ts; event.latest=r;
    // Use the latest report WITH a count, never add repeated cumulative totals.
    if (hasCount(r.cases)||hasCount(r.deaths)) event.countReport=r;
    event.severity=severity(event.countReport||r);
    // A later closure or ambiguous status supersedes earlier numerical severity.
    if (r.status!=='active') event.severity=severity(r);
    buckets.set(base,events);
  }
  return [...buckets.values()].flat().sort((a,b)=>(b.latest.publishedAt||'').localeCompare(a.latest.publishedAt||''));
}

// PulseMap's timeline histogram concept, adapted for an inclusive two-date range.
export function histogram(reports, min, max, bins=40) {
  const counts=Array(bins).fill(0), span=Math.max(1,max-min);
  for(const r of reports) {const t=Date.parse(r.publishedAt);if(Number.isFinite(t)&&t>=min&&t<=max) counts[Math.min(bins-1,Math.floor((t-min)/span*bins))]++;}
  return counts;
}
