const assert=require('node:assert/strict');
const app=require('../api/flights.js');
const {normalizeAircraft,byRegistration}=app._test;
assert.equal(byRegistration.size,73);
assert.deepEqual([...new Set([...byRegistration.values()].map(x=>x.section))].sort(),['QLD','SA/NT','SE','WA']);
const snap=Date.now()/1000;
const air=(over={})=>({hex:'7c1ca2',r:'VH-FXW',flight:'FD527 ', lat:-33.9,lon:138.5,alt_baro:12000,gs:160,track:97,seen:1,seen_pos:2,...over});
assert.equal(normalizeAircraft(air(),snap).ident,'VH-FXW');
assert.equal(normalizeAircraft(air(),snap).callsignInIndex,true);
assert.equal(normalizeAircraft(air({flight:'NOTININDEX'}),snap).callsignInIndex,false);
assert.equal(normalizeAircraft(air({hex:'7fffff',r:'VH-FXW'}),snap),null,'known ICAO24 must agree');
assert.equal(normalizeAircraft(air({hex:'7c1ca2',r:'VH-OWD'}),snap),null,'hex/reg conflict');
assert.equal(normalizeAircraft(air({hex:'7fffff',r:'VH-ABZ',flight:'FD527'}),snap),null,'callsign alone NOT sufficient');
assert.equal(normalizeAircraft(air({alt_baro:'ground'}),snap),null);
assert.equal(normalizeAircraft(air({seen_pos:300}),snap),null);
assert.equal(normalizeAircraft(air({lat:-60}),snap),null);
const ka=normalizeAircraft(air({hex:'7FFFFF',r:'VH-FDA',flight:'FD401',t:'BE20'}),snap);
assert.equal(ka.type,'BE20');
assert.equal(ka.section,'QLD');
assert.equal(ka.modelName,'Beechcraft King Air');
const old=global.fetch;const calls=[];
(async()=>{
  global.fetch=async(url)=>{
    calls.push(url);const registrations=decodeURIComponent(url.split('/v2/reg/')[1]).split(',');
    return {ok:true,json:async()=>({now:Date.now(),ac:registrations.includes('VH-FXW')?[air(),air({hex:'7fffff',r:'VH-ABZ',flight:'FD527'})]:[]})};
  };
  function response(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(o){this.result=o;return this;}};}
  let res=response();await app({method:'GET'},res);
  assert.equal(res.code,200);assert.equal(calls.length,2);assert.equal(res.result.count,1);
  assert.equal(res.result.flights[0].ident,'VH-FXW');
  assert.equal(res.result.flights[0].callsign,'FD527');
  assert.match(calls.join(','),/\/v2\/reg\//);
  global.fetch=async()=>{throw Error('offline')};res=response();await app({method:'GET'},res);
  assert.equal(res.code,502);assert.deepEqual(res.result.flights,[]);
  console.log('PASS: 73 registrations, 4 sections, King Air, ID matching, real-data safeguards and 2 API batches');
})().catch(err=>{console.error(err);process.exitCode=1}).finally(()=>global.fetch=old);
