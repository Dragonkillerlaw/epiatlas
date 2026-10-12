import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { feature } from 'topojson-client';
await mkdir('dist/vendor', { recursive: true });
await cp('web', 'dist', { recursive: true });
await cp('data', 'dist/data', { recursive: true });
await cp('node_modules/leaflet/dist', 'dist/vendor/leaflet', { recursive: true });
await cp('node_modules/leaflet.markercluster/dist', 'dist/vendor/markercluster', { recursive: true });
const topology = JSON.parse(await readFile('node_modules/world-atlas/countries-110m.json', 'utf8'));
const countries=feature(topology, topology.objects.countries);
// Unwrap dateline-crossing rings for Leaflet; avoid spurious trans-world edges.
for(const f of countries.features){
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  const output=[];
  for(const polygon of polygons){
    const fixed=polygon.map(ring=>{
      let previous=ring[0][0];
      return ring.map(([lng,lat])=>{while(lng-previous>180)lng-=360;while(lng-previous< -180)lng+=360;previous=lng;return [lng,lat];});
    });
    output.push(fixed);
    const xs=fixed[0].map(p=>p[0]);
    if(Math.max(...xs)>180)output.push(fixed.map(r=>r.map(([x,y])=>[x-360,y])));
    if(Math.min(...xs)< -180)output.push(fixed.map(r=>r.map(([x,y])=>[x+360,y])));
  }
  f.geometry={type:'MultiPolygon',coordinates:output};
}
await writeFile('dist/data/countries.geojson', JSON.stringify(countries));
await cp('licenses', 'dist/licenses', { recursive: true });
console.log('Built EpiAtlas → dist/ (all map assets local; no API key required)');
