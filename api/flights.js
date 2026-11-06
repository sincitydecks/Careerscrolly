/**
 * Careerscrolly RFDS aircraft map — adsb.lol public ADS-B API
 * GET /api/flights
 *
 * All aircraft must match a registration in the supplied RFDS callsign index
 * (or a separately verified ICAO24 hex). Callsigns NEVER qualify by themselves.
 * This is a historical index and must be reconciled against the current fleet.
 * Data: adsb.lol (ODbL-1.0); arrange production access with the provider.
 */
const index = require('./rfds-aircraft-index.json');

const PROVIDER = 'https://api.adsb.lol';
const BATCH_SIZE = 40;
const MAX_SEEN_POSITION_SEC = 75;
const MAX_SNAPSHOT_AGE_SEC = 90;
const AU = { minLon:108, maxLon:156, minLat:-45, maxLat:-9 };

const byRegistration = new Map();
const byHex = new Map();
for (const e of index) {
  const reg = String(e.registration || '').trim().toUpperCase();
  if (!/^VH-[A-Z0-9]{3}$/.test(reg)) throw new Error(`Invalid fleet registration ${reg}`);
  if (byRegistration.has(reg)) throw new Error(`Duplicate fleet registration ${reg}`);
  const value = {...e, registration:reg, callsigns:new Set((e.callsigns || []).map(s=>String(s).trim().toUpperCase()))};
  byRegistration.set(reg, value);
  if (e.hex) {
    const hex = String(e.hex).trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(hex) || byHex.has(hex)) throw new Error(`Invalid/repeated hex ${hex}`);
    value.hex = hex;
    byHex.set(hex,value);
  }
}

function numeric(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function normReg(x){return String(x||'').trim().toUpperCase().replace(/\s+/g,'');}
function normalizeAircraft(rec, snapshotSeconds) {
  if (!rec || typeof rec !== 'object') return null;
  const hex = String(rec.hex||'').toUpperCase().trim();
  const reg = normReg(rec.r || rec.registration || rec.reg);
  const fromReg = byRegistration.get(reg);
  const fromHex = byHex.get(hex);
  if (fromReg && fromHex && fromReg.registration !== fromHex.registration) return null;
  const entry = fromReg || fromHex;
  if (!entry) return null;
  // If an ICAO24 address has been independently verified, require agreement.
  if (entry.hex && hex !== entry.hex) return null;

  const lon = numeric(rec.lon), lat = numeric(rec.lat);
  if (lon === null || lat === null || lon < AU.minLon || lon > AU.maxLon || lat < AU.minLat || lat > AU.maxLat) return null;
  const seenPos = numeric(rec.seen_pos), seen = numeric(rec.seen);
  if (seenPos === null || seenPos < 0 || seenPos > MAX_SEEN_POSITION_SEC ||
      (seen !== null && (seen < 0 || seen > MAX_SEEN_POSITION_SEC))) return null;
  if (String(rec.alt_baro || '').toLowerCase() === 'ground') return null;
  const alt = numeric(rec.alt_baro) ?? numeric(rec.alt_geom);
  const gs = numeric(rec.gs);
  if (alt === null || alt < 150 || gs === null || gs < 45) return null;

  const call = String(rec.flight || '').trim().toUpperCase();
  const advertisedType = String(rec.t || '').trim().toUpperCase();
  const typ = /^(PC12|PC24|BE20|B200|B350|BE30)$/.test(advertisedType) ? advertisedType : entry.type;
  const modelName = entry.family === 'PC-12' ? 'Pilatus PC-12' :
                    entry.family === 'PC-24' ? 'Pilatus PC-24' : 'Beechcraft King Air';
  const heading = numeric(rec.track) ?? numeric(rec.true_heading) ?? numeric(rec.mag_heading);
  return {
    id:entry.registration, ident:entry.registration, registration:entry.registration,
    hex:hex || entry.hex || null, callsign:call,
    callsignInIndex:entry.callsigns.has(call),
    type:typ, modelName, section:entry.section,
    alt:Math.round(alt), speed:Math.round(gs),
    heading: heading === null ? 0 : Math.round((heading+360)%360),
    coord:[lon,lat], origin:'—', dest:'—', originName:'', destName:'',
    timestamp:Math.floor(snapshotSeconds-seenPos)
  };
}
async function fetchBatch(registrations){
  const url = `${PROVIDER}/v2/reg/${registrations.join(',')}`;
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),9000);
  try {
    const response = await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error(`ADS-B provider error HTTP ${response.status}`);
    const obj = await response.json();
    if (!obj || !Array.isArray(obj.ac)) throw new Error('Unexpected ADS-B API response');
    return obj;
  } finally { clearTimeout(timeout); }
}
async function fetchFlights(){
  const regs = [...byRegistration.keys()];
  const chunks = [];
  for(let i=0;i<regs.length;i+=BATCH_SIZE) chunks.push(regs.slice(i,i+BATCH_SIZE));
  // 73 registrations currently mean two requests per cache miss, not 140 callsign lookups.
  const results = await Promise.all(chunks.map(fetchBatch));
  const seen=new Map();
  let latest=0;
  for (const payload of results) {
    const raw = numeric(payload.now);
    const snap=raw === null ? Date.now()/1000 : raw>1e11 ? raw/1000 : raw;
    if (snap > Date.now()/1000 + 15 || Date.now()/1000-snap > MAX_SNAPSHOT_AGE_SEC)
      throw new Error('ADS-B snapshot is out of date');
    latest=Math.max(latest,snap);
    for(const ac of payload.ac){
      const flight=normalizeAircraft(ac,snap);
      if (flight && (!seen.has(flight.id) || seen.get(flight.id).timestamp < flight.timestamp)) seen.set(flight.id,flight);
    }
  }
  return [...seen.values()].sort((a,b)=>a.ident.localeCompare(b.ident));
}
async function handler(req,res){
  if(req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json({success:false,error:'Method not allowed'});}
  try{
    const flights=await fetchFlights();
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60, must-revalidate');
    return res.status(200).json({success:true,source:'adsb.lol',license:'ODbL-1.0',
      count:flights.length,fleetRegistrationsIndexed:byRegistration.size,timestamp:Date.now(),flights});
  }catch(err){
    console.error('RFDS ADS-B feed error',err);
    res.setHeader('Cache-Control','no-store');
    return res.status(502).json({success:false,source:'adsb.lol',count:0,timestamp:Date.now(),flights:[],
      error:'ADS-B flight positions unavailable'});
  }
}
module.exports=handler;
module.exports._test={normalizeAircraft,byRegistration,byHex,fetchFlights};
