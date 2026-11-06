#!/usr/bin/env python3
"""Safely apply RFDS national-aircraft + silhouette changes to Careerscrolly/index.html.

Run from the project root after copying the ZIP's api/ and vercel.json.
A backup with suffix .before-rfds-national.html is kept locally.
"""
from pathlib import Path
import sys

path=Path(sys.argv[1] if len(sys.argv)>1 else 'index.html')
if not path.is_file(): sys.exit(f'Missing {path}')
s=path.read_text(encoding='utf-8')
if 'RFDS_NATIONAL_FIX_V3' in s:
    sys.exit('Already contains RFDS_NATIONAL_FIX_V3; no modifications made')

def change(old,new,desc,optional=False):
    global s
    count=s.count(old)
    if count==0 and optional:
        print(f'skipped {desc} (already removed)')
        return
    if count!=1:
        sys.exit(f'Cannot safely patch {desc}: expected 1 source occurrence, found {count}. No modifications made.')
    s=s.replace(old,new,1)

change('var RFDS_FLIGHT_API_URL = \'/api/flights\';',
       "// RFDS_NATIONAL_FIX_V3 — national ADS-B feed for RFDS-only aircraft.\nvar RFDS_FLIGHT_API_URL = '/api/flights';",
       'integration identifier')

start=s.find('function flightAwareAircraftUrl(flight) {')
end=s.find('function showCustomLiveMap() {',start)
if start>=0 and end>start:
    s=s[:start]+s[end:]
else:
    # Keep existing showCustomLiveMap when v2 has already removed helpers.
    if 'function showCustomLiveMap() {' not in s:
        sys.exit('Could not find custom live map function; no modifications made')

change('''      '<a class="live-flight-aware-link" href="' + escapeHtml(flightAwareAircraftUrl(flight)) + '" target="_blank" rel="noopener">View full flight on FlightAware ↗</a>' +''',
       '''      '<p class="rfds-live-data-credit">Position data: adsb.lol · ODbL 1.0. Destination not supplied by ADS-B.</p>' +''',
       'remove FlightAware flight link',optional=True)

change('''  if (activeFlights.length) renderLiveMapOverlay();
  else showCustomLiveMap();''',
       '''  renderLiveMapOverlay();''', 'live map modal')
change('Checking FlightAware for currently airborne RFDS PC-12 and PC-24 aircraft…',
       'Checking live ADS-B positions for RFDS aircraft…','live map loading copy',optional=True)
change('''  activeFlights = (flights || []).filter(function(f) {
    var type = String((f && f.type) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return type === 'PC12' || type === 'PC24';
  });''',
       '''  // Backend controls approved aircraft; King Air must not be filtered out.
  activeFlights = (flights || []).filter(function(f) {
    return f && Array.isArray(f.coord) && f.coord.length === 2 &&
      Number.isFinite(Number(f.coord[0])) && Number.isFinite(Number(f.coord[1])) &&
      Number.isFinite(Number(f.timestamp)) &&
      Date.now() / 1000 - Number(f.timestamp) <= 180;
  });''', 'remove PC12/PC24-only filter')

# Top-down icons. Nose points north; existing heading rotation applies unchanged.
shape_helper = r'''
function rfdsAircraftShape(f) {
  var value = String((f && f.family) || '') + ' ' + String((f && f.type) || '') + ' ' + String((f && f.modelName) || '');
  var v = value.toUpperCase();
  if (v.includes('PC-24') || v.includes('PC24')) return 'PC24';
  if (v.includes('KING AIR') || v.includes('BE20') || v.includes('B200') || v.includes('B350') || v.includes('BE30')) return 'KINGAIR';
  if (v.includes('PC-12') || v.includes('PC12')) return 'PC12';
  return 'UNKNOWN';
}
function createAircraftSvgElement(tag, className, attributes) {
  var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (className) element.setAttribute('class', className);
  Object.keys(attributes || {}).forEach(function(name) { element.setAttribute(name, attributes[name]); });
  return element;
}
function renderAircraftShape(parent, flight) {
  var family = rfdsAircraftShape(flight);
  var outlines = {
    PC12: 'M 0,-11.5 C 1.7,-11 1.9,-7 1.9,-3.5 L 9.2,-1.7 L 9.2,0.1 L 2.0,0.3 L 1.6,7.6 L 5,9.0 L 5,10.3 L 0,9.3 L -5,10.3 L -5,9.0 L -1.6,7.6 L -2.0,0.3 L -9.2,0.1 L -9.2,-1.7 L -1.9,-3.5 C -1.9,-7 -1.7,-11 0,-11.5 Z',
    PC24: 'M 0,-12 C 1.7,-11.5 2.0,-7.5 2.1,-4.8 L 10.4,2.8 L 10.0,4.2 L 2.2,1.5 L 1.4,7.5 L 5.5,9.1 L 5.5,10.3 L 0,9.4 L -5.5,10.3 L -5.5,9.1 L -1.4,7.5 L -2.2,1.5 L -10.0,4.2 L -10.4,2.8 L -2.1,-4.8 C -2.0,-7.5 -1.7,-11.5 0,-12 Z',
    KINGAIR: 'M 0,-11.9 C 1.5,-11.2 1.9,-7.0 2,-4.3 L 10.1,-1.1 L 10.1,0.8 L 2.2,0.6 L 1.6,7.6 L 5.7,9.0 L 5.7,10.3 L 0,9.5 L -5.7,10.3 L -5.7,9.0 L -1.6,7.6 L -2.2,0.6 L -10.1,0.8 L -10.1,-1.1 L -2,-4.3 C -1.9,-7.0 -1.5,-11.2 0,-11.9 Z',
    UNKNOWN: 'M 0,-10 L 2,-3 L 9,1 L 9,3 L 2,1 L 1,8 L 4,10 L 4,11 L 0,10 L -4,11 L -4,10 L -1,8 L -2,1 L -9,3 L -9,1 L -2,-3 Z'
  };
  parent.appendChild(createAircraftSvgElement('path','aircraft-icon aircraft-icon-' + family.toLowerCase(),{d:outlines[family]}));
  if (family === 'PC12') {
    // Single nose propeller (distinct from the two wing-mounted props on a King Air).
    parent.appendChild(createAircraftSvgElement('line','aircraft-silhouette-detail', {x1:-4.0,y1:-11.8,x2:4.0,y2:-11.8}));
  } else if (family === 'PC24') {
    // Two aft-mounted turbofan nacelles.
    [-3.35,3.35].forEach(function(x){
      parent.appendChild(createAircraftSvgElement('ellipse','aircraft-engine-nacelle',{cx:x,cy:6.2,rx:1.15,ry:3.2}));
    });
  } else if (family === 'KINGAIR') {
    // Twin wing-mounted turboprop nacelles and prop discs.
    [-5.8,5.8].forEach(function(x){
      parent.appendChild(createAircraftSvgElement('ellipse','aircraft-engine-nacelle',{cx:x,cy:-1.1,rx:1.3,ry:3.1}));
      parent.appendChild(createAircraftSvgElement('line','aircraft-silhouette-detail',{x1:x-2.55,y1:-4.1,x2:x+2.55,y2:-4.1}));
    });
  }
}
'''
change('function updateLiveRadar(flights) {',shape_helper+'\nfunction updateLiveRadar(flights) {','add SVG helpers')

a=s.find('    // Dynamic Icon Selection')
b=s.find('    g.appendChild(planeG);',a)
if a<0 or b<a: sys.exit('Aircraft drawing block has changed; no modifications made')
s=s[:a]+'''    renderAircraftShape(planeG, f);
''' + s[b:]

change('''  document.getElementById('hudRoute').textContent = (flight.origin || 'Base') + ' → ' + (flight.dest || 'En Route');''',
       '''  document.getElementById('hudRoute').textContent = (flight.origin === '—' && flight.dest === '—') ? 'Route unavailable' : (flight.origin || '—') + ' → ' + (flight.dest || '—');''',
       'avoid invented route')
change(''''<p class="live-map-empty">The live RFDS feed is connected, but no PC-12 or PC-24 aircraft are currently being returned as airborne.</p>''',
       '''<p class="live-map-empty">No approved RFDS aircraft are currently reporting fresh airborne ADS-B positions. Coverage can be limited in remote Australia.</p>''',
       'all-type zero-result text',optional=True)
change('''        showFlightAwareFallback();
        if (liveMapDetails) {
          liveMapDetails.innerHTML = '<p class="live-map-empty"><strong>FlightAware live map</strong><br>The custom RFDS aircraft overlay could not reach the Vercel /api/flights endpoint. The page has fallen back to the live FlightAware map.</p>';
        }''',
       '''        renderLiveMapOverlay();
        if (liveMapDetails) {
          liveMapDetails.innerHTML = '<p class="live-map-empty"><strong>ADS-B data unavailable.</strong> No simulated aircraft are shown.</p>';
        }''',
       'remove FlightAware fallback')
change('''          if (!activeFlights.length && liveMapDetails) {''',
       '''          if (data.partial && liveMapStatusText) liveMapStatusText.textContent = activeFlights.length + ' flights · partial coverage';
          if (!activeFlights.length && liveMapDetails) {''',
       'partial-feed indicator')
change('setInterval(fetchFlights, 15000);','setInterval(fetchFlights, 60000);','refresh rate')
change('''frame-src 'self' https://www.flightaware.com;''',"frame-src 'self';",'CSP removes FlightAware',optional=True)
change('''<!-- RFDS Live Flight Map — current PC-12 / PC-24 data supplied by the external RFDS flight API -->''',
       '''<!-- RFDS Live Flight Map — live positions from approved national RFDS fleet -->''', 'HTML comment',optional=True)
change('''<span class="live-map-toolbar-sub">PC-12 &amp; PC-24 aircraft currently airborne</span>''',
       '''<span class="live-map-toolbar-sub">PC-12 · PC-24 · King Air aircraft reporting airborne</span>''',
       'national aircraft description',optional=True)
change('// Live Flight Data Engine (FlightAware)', '// Live Flight Data Engine (adsb.lol ODbL 1.0)', 'engine comment',optional=True)

# No active call to FlightAware remains. The inert iframe can be removed outright.
change('''        <iframe class="live-map-fallback" id="flightAwareFallbackFrame" title="RFDS live FlightAware map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>\n''',
       '', 'delete inert FlightAware iframe',optional=True)
change('''  if (flightAwareFallbackFrame) flightAwareFallbackFrame.removeAttribute('src');''',
       '  // Custom map only: no third-party tracking iframe.',
       'old iframe reference',optional=True)

# The old showFlightAwareFallback can remain defined but has no call path.
# Remove its function body so it cannot accidentally be triggered by future code.
start=s.find('function showFlightAwareFallback() {')
end=s.find('function showCustomLiveMap() {',start)
if start>=0 and end>start:
    s=s[:start] + s[end:]

change('''#rfds-app .aircraft-pulse {''',
       '''#rfds-app .aircraft-engine-nacelle {
  fill: #ffffff;
  stroke: var(--rfds-navy);
  stroke-width: 0.9;
  pointer-events: none;
}
#rfds-app .aircraft-silhouette-detail {
  stroke: var(--rfds-navy);
  stroke-width: 1.05;
  stroke-linecap: round;
  pointer-events: none;
}
#rfds-app .rfds-live-data-credit {
  opacity: 0.72;
  font-size: 11px;
  margin-top: 12px;
}
#rfds-app .aircraft-pulse {''',
       'aircraft silhouette styles')

# Wire the same API into local `npm start` for development; Vercel uses api/flights.js.
server=path.parent/'server.js'
server_new=None
if server.exists():
    server_src=server.read_text(encoding='utf-8')
    api_hook="// API endpoint: submit an Expression of Interest (EOI)"
    if "app.get('/api/flights'" not in server_src:
        if server_src.count(api_hook)!=1:
            sys.exit('Cannot locate server.js EOI endpoint for flight route; no modifications made')
        server_new=server_src.replace(api_hook,
            "// RFDS national flight positions (local Express server).\napp.get('/api/flights', require('./api/flights'));\n\n"+api_hook,1)
    else:
        print('server.js already has a flight route')

backup=path.with_name(path.name+'.before-rfds-national.html')
if backup.exists(): sys.exit(f'Backup exists already: {backup}; no modifications made.')
backup.write_text(path.read_text(encoding='utf-8'),encoding='utf-8')
if server_new is not None:
    server_backup=server.with_name(server.name+'.before-rfds-national.js')
    if server_backup.exists():
        sys.exit(f'Backup exists already: {server_backup}; no modifications made')
    server_backup.write_text(server.read_text(encoding='utf-8'),encoding='utf-8')
    server.write_text(server_new,encoding='utf-8')
    print('UPDATED',server,'BACKUP',server_backup)
path.write_text(s,encoding='utf-8')
print('UPDATED',path,'BACKUP',backup)
