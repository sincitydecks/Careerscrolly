'use strict';
const assert=require('node:assert/strict');
const handler=require('../api/flights');
const {normalizeAircraft,approvedEntries,collectFlights,byHex}=handler._test;
const fleet=require('../api/rfds-fleet.json');
const enabled=approvedEntries();
const allowed=new Set(enabled.map(e=>e.hex));
const now=Date.now()/1000;
assert.equal(fleet.length,93,'93 candidates imported from provided CSV');
assert.equal(enabled.length,67,'only directly observed FD history enabled by default');
assert.equal(new Set(fleet.map(e=>e.hex)).size,93,'unique addresses');
assert.deepEqual([...new Set(enabled.map(e=>e.section))].sort(),
 ['Central Operations','Queensland Section','South Eastern Section','Western Operations'].sort());

const sample=(entry,overrides={})=>({hex:entry.hex.toLowerCase(),r:entry.registration,lat:-25.35,lon:133.7,alt_baro:18000,gs:210,track:87,seen_pos:9,flight:'FD750  ', ...overrides});
for(const family of ['PC-12','PC-24','King Air']) {
 const e=enabled.find(v=>v.family===family);
 assert.ok(e, 'enabled sample for '+family);
 const f=normalizeAircraft(sample(e), now,allowed);
 assert.ok(f, family+' should appear');
 assert.equal(f.family,family);
 assert.equal(f.type,e.type);
 assert.equal(f.ident,e.registration);
}
const q=enabled.find(v=>v.section==='Queensland Section');
const se=enabled.find(v=>v.section==='South Eastern Section');
const wa=enabled.find(v=>v.section==='Western Operations');
const sa=enabled.find(v=>v.section==='Central Operations');
for(const e of [q,se,wa,sa]) assert.ok(normalizeAircraft(sample(e),now,allowed));
assert.equal(normalizeAircraft(sample(q,{alt_baro:'ground'}),now,allowed),null);
assert.equal(normalizeAircraft(sample(q,{seen_pos:180}),now,allowed),null);
assert.equal(normalizeAircraft(sample(q,{r:'VH-XXX'}),now,allowed),null);
assert.equal(normalizeAircraft(sample(q,{lat:51.5}),now,allowed),null);
assert.equal(normalizeAircraft(sample(q,{gs:0}),now,allowed),null);
assert.equal(normalizeAircraft(sample({...q,hex:'ABCDEF'}),now,allowed),null);
const candidate=fleet.find(e=>!e.verifiedRecentFD);
assert.equal(normalizeAircraft(sample(candidate),now,allowed),null,'candidate does not display by default');

const requests=[];
global.fetch=async url=>{
  requests.push(url);
  const hexes=url.split('/').pop().split(',').map(x=>x.toUpperCase());
  return {ok:true,json:async()=>({now:Date.now(),ac:hexes.map(hex=>{
    const entry=byHex.get(hex);
    return sample(entry);
  })})};
};
(async()=>{
  const result=await collectFlights();
  assert.equal(result.flights.length,67);
  assert.equal(result.partial,false);
  assert.equal(requests.length,2,'67 IDs should use two multi-hex requests');
  assert.ok(requests.every(x=>x.includes('/v2/hex/')));
  assert.ok(result.flights.some(f=>f.section==='Queensland Section' && f.family==='King Air'));
  assert.ok(result.flights.some(f=>f.section==='South Eastern Section' && f.family==='King Air'));
  assert.ok(result.flights.some(f=>f.section==='Central Operations'));
  assert.ok(result.flights.some(f=>f.section==='Western Operations'));

  const originals=global.fetch;
  global.fetch=async url=> {
    if (url.includes(q.hex)) throw new Error('simulated provider outage');
    return originals(url);
  };
  const partial=await collectFlights();
  assert.equal(partial.partial,true);
  assert.ok(partial.flights.length>0);
  console.log('PASS: imported fleet, four sections, 3 shapes, strict identity, airborne/staleness, batched requests, partial failures');
})().catch(e=>{console.error(e); process.exitCode=1});
