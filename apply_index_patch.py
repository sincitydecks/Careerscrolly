#!/usr/bin/env python3
"""Apply *only* the live flight-map changes to Careerscrolly/main index.html.

Designed for the repository structure inspected on 6 November 2026.
Refuses to run if key code blocks differ. Creates a .before-adsb.html backup.
"""
from pathlib import Path
import sys

file = Path(sys.argv[1] if len(sys.argv) > 1 else 'index.html')
if not file.exists():
    sys.exit(f'Cannot find {file}. Run in the Careerscrolly repository root.')
s = file.read_text(encoding='utf-8')
if 'RFDS_ADSB_INTEGRATION_V2' in s:
    sys.exit('ADS-B integration already applied. No changes made.')


def replace_once(old, new, name):
    global s
    hits = s.count(old)
    if hits != 1:
        sys.exit(f'Cannot safely patch {name}: expected exactly one matching block, found {hits}. No files changed.')
    s = s.replace(old, new, 1)

replace_once(
    '// LIVE FLIGHT MAP control — same-origin Vercel Serverless Function.',
    '// RFDS_ADSB_INTEGRATION_V2 — ADS-B data through same-origin Vercel /api/flights.',
    'integration marker',
)

start = s.find('function flightAwareAircraftUrl(flight) {')
end = s.find('function showCustomLiveMap() {', start)
if start < 0 or end < 0 or end < start:
    sys.exit('Cannot locate old FlightAware-only helper block; no files changed.')
s = s[:start] + s[end:]

replace_once(
    '''      '<a class="live-flight-aware-link" href="' + escapeHtml(flightAwareAircraftUrl(flight)) + '" target="_blank" rel="noopener">View full flight on FlightAware ↗</a>' +''',
    '''      '<p style="font-size:11px;opacity:.7;margin-top:12px">Position data: adsb.lol · ODbL 1.0. Route is not supplied by this feed.</p>' +''',
    'FlightAware link',
)

replace_once(
    '''  if (activeFlights.length) renderLiveMapOverlay();
  else showCustomLiveMap();''',
    '''  renderLiveMapOverlay();''',
    'modal opening',
)
replace_once(
    "Checking FlightAware for currently airborne RFDS PC-12 and PC-24 aircraft…",
    "Checking live ADS-B positions for registered RFDS aircraft…",
    'modal loading copy',
)
replace_once(
    '''  activeFlights = (flights || []).filter(function(f) {
    var type = String((f && f.type) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return type === 'PC12' || type === 'PC24';
  });''',
    '''  // The API enforces the verified RFDS fleet; do not exclude King Air aircraft here.
  activeFlights = (flights || []).filter(function(f) {
    return f && Array.isArray(f.coord) && f.coord.length === 2 &&
      Number.isFinite(Number(f.coord[0])) && Number.isFinite(Number(f.coord[1]));
  });''',
    'all-type aircraft filter',
)
replace_once(
    "document.getElementById('hudRoute').textContent = (flight.origin || 'Base') + ' → ' + (flight.dest || 'En Route');",
    "document.getElementById('hudRoute').textContent = (flight.origin === '—' && flight.dest === '—') ? 'Route unavailable' : (flight.origin || '—') + ' → ' + (flight.dest || '—');",
    'HUD route text',
)
replace_once(
    "'<p class=\"live-map-empty\">The live RFDS feed is connected, but no PC-12 or PC-24 aircraft are currently being returned as airborne.</p>'",
    "'<p class=\"live-map-empty\">No registered RFDS aircraft are currently reporting fresh airborne positions. Ground receiver coverage may be limited in remote areas.</p>'",
    'zero aircraft text',
)
replace_once(
    '''        showFlightAwareFallback();
        if (liveMapDetails) {
          liveMapDetails.innerHTML = '<p class="live-map-empty"><strong>FlightAware live map</strong><br>The custom RFDS aircraft overlay could not reach the Vercel /api/flights endpoint. The page has fallen back to the live FlightAware map.</p>';
        }''',
    '''        renderLiveMapOverlay();
        if (liveMapDetails) {
          liveMapDetails.innerHTML = '<p class="live-map-empty"><strong>Live positions unavailable</strong><br>The free ADS-B service could not be reached. No simulated flights are shown.</p>';
        }''',
    'failure handling',
)
replace_once(
    "escapeHtml(flight.modelName || flight.type || 'Pilatus aircraft') + '</div>' +",
    "escapeHtml(flight.modelName || flight.type || 'RFDS aircraft') + (flight.callsign ? ' · ' + escapeHtml(flight.callsign) : '') + '</div>' +",
    'overlay callsign information',
)
replace_once('setInterval(fetchFlights, 15000);', 'setInterval(fetchFlights, 60000);', 'refresh interval')
replace_once('frame-src \'self\' https://www.flightaware.com;', "frame-src 'self';", 'CSP')
replace_once('// Live Flight Data Engine (FlightAware)', '// Live Flight Data Engine (adsb.lol ODbL-1.0)', 'engine label')

backup = file.with_name(file.name + '.before-adsb.html')
if backup.exists():
    sys.exit(f'Backup {backup} already exists. Remove/rename it if you intend to re-patch.')
backup.write_text(file.read_text(encoding='utf-8'), encoding='utf-8')
file.write_text(s, encoding='utf-8')
print('Patched', file, 'successfully. Backup:', backup)
