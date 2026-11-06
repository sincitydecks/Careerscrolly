/**
 * RFDS live-map adapter for Careerscrolly (Vercel serverless /api/flights).
 * Source: adsb.lol's live ADS-B API, ODbL-1.0.
 * Data is only observed aircraft positions, never a verified mission manifest.
 *
 * Default: 67 aircraft with directly observed FD-series history in supplied
 * CSV (6 November 2026). 26 candidate aircraft remain in rfds-fleet.json
 * but are excluded unless RFDS_INCLUDE_CANDIDATES=1 is set. Check their
 * operational status before enabling them on a public RFDS site.
 *
 * CONTACT adsb.lol for approved production usage and request limits.
 */
'use strict';
const fleet = require('./rfds-fleet.json');
const PROVIDER = 'https://api.adsb.lol';
const INCLUDE_CANDIDATES = process.env.RFDS_INCLUDE_CANDIDATES === '1';
const MAX_SEEN_POS_SEC = 120;
const MAX_UPSTREAM_SNAPSHOT_AGE_SEC = 150;
const BATCH_SIZE = 40;
const BATCH_SPACING_MS = 1100;
const AU = {minLon: 108, maxLon: 156, minLat: -45, maxLat: -9};

function clean(x) { return String(x == null ? '' : x).trim().toUpperCase(); }
function number(x) {
  if (x == null || x === '' || x === 'ground') return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}
const byHex = new Map();
const byReg = new Map();
for (const entry of fleet) {
  const hex = clean(entry.hex);
  const reg = clean(entry.registration);
  if (!/^[0-9A-F]{6}$/.test(hex) || !/^VH-[A-Z0-9]{3}$/.test(reg)) {
    throw new Error(`Invalid ICAO24/registration: ${hex} ${reg}`);
  }
  if (byHex.has(hex) || byReg.has(reg)) throw new Error(`Duplicate aircraft: ${hex} ${reg}`);
  byHex.set(hex, entry); byReg.set(reg, entry);
}
function approvedEntries() {
  return fleet.filter(e => e.verifiedRecentFD || INCLUDE_CANDIDATES);
}
function normalizeAircraft(raw, timestamp, enabledHexes) {
  if (!raw || typeof raw !== 'object') return null;
  const hex = clean(raw.hex);
  if (!enabledHexes.has(hex)) return null;
  const entry = byHex.get(hex);
  if (!entry) return null;
  const apiRegRaw = clean(raw.r || raw.registration || raw.reg);
  const apiReg = /^VH[A-Z0-9]{3}$/.test(apiRegRaw.replace(/[-\s]/g,''))
    ? 'VH-' + apiRegRaw.replace(/[-\s]/g,'').slice(2) : apiRegRaw;
  // If the ADS-B database explicitly assigns this ICAO address to some
  // DIFFERENT registration, do not display it under the RFDS name.
  if (apiReg && apiReg !== entry.registration) return null;
  const lat = number(raw.lat), lon = number(raw.lon);
  if (lat === null || lon === null || lat < AU.minLat || lat > AU.maxLat || lon < AU.minLon || lon > AU.maxLon) return null;
  const age = number(raw.seen_pos);
  if (age === null || age < 0 || age > MAX_SEEN_POS_SEC) return null;
  if (clean(raw.alt_baro) === 'GROUND') return null;
  const altitude = number(raw.alt_baro) ?? number(raw.alt_geom);
  const gs = number(raw.gs);
  if (altitude === null || altitude < 100 || gs === null || gs < 40) return null;
  const hdg = number(raw.track) ?? number(raw.true_heading) ?? number(raw.mag_heading);
  const positionTime = timestamp - age;
  const callsign = clean(raw.flight);
  return {
    id:entry.registration,
    ident:entry.registration,
    registration:entry.registration,
    hex,
    callsign,
    type:entry.type,
    family:entry.family,
    modelName:entry.modelName,
    section:entry.section,
    alt:Math.round(altitude), speed:Math.round(gs),
    heading: hdg === null ? 0 : Math.round((hdg + 360) % 360),
    coord:[lon,lat],
    origin:'—', dest:'—', originName:'', destName:'',
    timestamp:Math.floor(positionTime),
    evidenceStatus:entry.status
  };
}
function snapshotSeconds(payload, nowSeconds) {
  const raw = number(payload.now);
  if (raw === null) return nowSeconds;
  return raw > 1e11 ? raw / 1000 : raw;
}
async function fetchBatch(hexes) {
  // The ADSBexchange-v2 compatible endpoint accepts comma-separated hex IDs.
  const url = `${PROVIDER}/v2/hex/${hexes.join(',')}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9500);
  try {
    const response = await fetch(url, {signal:controller.signal, headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error(`ADS-B upstream HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.ac)) throw new Error('Invalid ADS-B response');
    return payload;
  } finally { clearTimeout(timeout); }
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve,ms)); }
async function collectFlights(entries = approvedEntries()) {
  const enabledHexes = new Set(entries.map(e => clean(e.hex)));
  const hexes = [...enabledHexes];
  const batches=[];
  for (let i=0;i<hexes.length;i+=BATCH_SIZE) batches.push(hexes.slice(i,i+BATCH_SIZE));
  const matched=new Map();
  const errors=[];
  let okBatches=0;
  for (let i=0;i<batches.length;i++) {
    if (i) await sleep(BATCH_SPACING_MS);
    try {
      const payload=await fetchBatch(batches[i]);
      const now=Date.now()/1000;
      const timestamp=snapshotSeconds(payload,now);
      if (timestamp > now + 30 || now-timestamp > MAX_UPSTREAM_SNAPSHOT_AGE_SEC) {
        throw new Error('ADS-B snapshot is stale or in the future');
      }
      okBatches++;
      for (const raw of payload.ac) {
        const flight=normalizeAircraft(raw,timestamp,enabledHexes);
        if (flight && (!matched.has(flight.id) || matched.get(flight.id).timestamp < flight.timestamp)) {
          matched.set(flight.id,flight);
        }
      }
    } catch (error) {
      errors.push(`Batch ${i+1}: ${error.message || String(error)}`);
    }
  }
  if (!okBatches) throw new Error(errors.join('; ') || 'ADS-B data unavailable');
  return {flights:[...matched.values()].sort((a,b)=>a.ident.localeCompare(b.ident)),
    partial:errors.length>0, errors, indexed:entries.length, batches:batches.length};
}
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).json({success:false,error:'Method not allowed'});
  }
  try {
    const {flights,partial,errors,indexed,batches}=await collectFlights();
    const sectionsIndexed={};
    for (const e of approvedEntries()) sectionsIndexed[e.section]=(sectionsIndexed[e.section]||0)+1;
    const sectionsAirborne={};
    for (const f of flights) sectionsAirborne[f.section]=(sectionsAirborne[f.section]||0)+1;
    // Shared Vercel cache, not a per-browser/visitor upstream request.
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({success:true,source:'adsb.lol',license:'ODbL-1.0',
      count:flights.length, fleetRegistrationsIndexed:indexed,
      candidateRegistrations: fleet.length-indexed, sectionsIndexed, sectionsAirborne, upstreamBatches:batches,
      partial, warnings:partial?errors:[], timestamp:Date.now(), flights});
  } catch (error) {
    console.error('RFDS live ADS-B feed failure', error);
    res.setHeader('Cache-Control','no-store');
    return res.status(502).json({success:false,source:'adsb.lol',count:0,
      timestamp:Date.now(),flights:[],error:'ADS-B positions currently unavailable'});
  }
}
module.exports=handler;
module.exports._test={normalizeAircraft,approvedEntries,collectFlights,byHex};
