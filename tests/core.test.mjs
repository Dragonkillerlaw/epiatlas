import test from 'node:test';
import assert from 'node:assert/strict';
import {groupEvents,filterReports,severity,safeUrl,markerSize,histogram} from '../web/core.mjs';
const loc={iso:'BR',name:'Brazil',country:'Brazil',lat:-14,lng:-51};
const report=(id,day,extra={})=>({id,title:'Dengue',disease:'dengue',location:loc,publishedAt:day+'T12:00:00Z',source:'who',status:'active',triage:'review',cases:null,deaths:null,...extra});
test('cumulative updates are not added and countries remain separate',()=>{
 const events=groupEvents([report('a','2026-01-01',{cases:100}),report('b','2026-01-10',{cases:120}),report('c','2026-01-11',{location:{...loc,iso:'PE',name:'Peru'}})]);
 assert.equal(events.length,2);assert.equal(events.find(e=>e.location.iso==='BR').countReport.cases,120);
});
test('long gaps and different cities are different candidate events',()=>{
 assert.equal(groupEvents([report('a','2026-01-01'),report('b','2026-04-01'),report('c','2026-04-02',{location:{...loc,name:'Rio'}})]).length,3);
});
test('date filter is inclusive and missing date is not replaced with retrieval date',()=>{
 const reports=[report('a','2026-01-01'),report('b','2026-01-31'),report('c','2026-02-01'),report('d','2026-02-01',{publishedAt:null})];
 assert.deepEqual(filterReports(reports,{start:'2026-01-01',end:'2026-01-31'}).map(r=>r.id),['a','b']);
 assert.equal(filterReports(reports,{}).length,4);
});
test('selected interval cannot leak future report counts',()=>{
 const rows=[report('a','2026-01-01',{cases:100}),report('b','2026-02-01',{cases:500})];
 assert.equal(groupEvents(filterReports(rows,{end:'2026-01-31'}))[0].countReport.cases,100);
});
test('unknown and zero counts are distinct; closure clears old severity',()=>{
 assert.equal(severity(report('a','2026-01-01')).level,'unknown');
 assert.equal(severity(report('a','2026-01-01',{cases:0,deaths:0})).score,0);
 assert.notEqual(markerSize(null),markerSize(0));
 const ev=groupEvents([report('a','2026-01-01',{cases:1e5}),report('b','2026-01-05',{status:'resolved'})])[0];
 assert.equal(ev.severity.level,'unknown');
});
test('malicious article URLs and embedded credentials are rejected',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,abc','https://user:pass@example.com'])assert.equal(safeUrl(url),null);
 assert.equal(safeUrl('https://www.who.int/test'),'https://www.who.int/test');
});
test('Chinese search and source filters also control event input',()=>{
 const rows=[report('a','2026-01-01'),report('b','2026-01-01',{source:'paho',disease:'cholera'})];
 assert.deepEqual(filterReports(rows,{query:'霍乱',source:'paho'}).map(r=>r.id),['b']);
});
test('timeline handles a single publication date and ignores unknown dates',()=>{
 const d=Date.parse('2026-01-01T12:00:00Z');
 assert.equal(histogram([report('a','2026-01-01'),report('b','2026-01-01',{publishedAt:null})],d,d).reduce((a,b)=>a+b),1);
});
