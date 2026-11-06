# Careerscrolly — RFDS national callsign integration (6 November 2026)

Target: https://careerscrolly.vercel.app/  
Repository examined: `sincitydecks/Careerscrolly`

## What your CSV contains
- **140 unique tracker callsigns**, representing **73 unique registered aircraft**, across four operating groups.
- Central Operations: 24 registrations / 70 callsigns.
- Queensland: 22 registrations / 22 callsigns.
- Western Operations: 15 registrations / 15 callsigns.
- South Eastern: 12 registrations / 33 callsigns.
- No duplicate registrations with contradictory operating sections or aircraft families.
- The file contains **no ICAO24 hex codes**. The previously identified `VH-FXW → 7C1CA2` has been included as a provisional cross-reference requiring production reconciliation.

The source CSV is an **index of associations**, not proof of the currently active RFDS fleet. Entries require verification against the current RFDS fleet register. A callsign may be shared across registrations over time.

## What this patch changes
- Adds `api/rfds-aircraft-index.json` with the 73 registrations, sections, families, and associated historical callsigns. Reuses `api/flights.js` for Vercel.
- Requests up to **40 registrations per adsb.lol API call**, so normally **2 server-side requests per 60-second cache fill**. This requires the provider's comma-separated registration search to work, and must be validated live before deployment.
- Accepts a flight only if its registration is in the index (or if it matches a separately verified ICAO24 hex); **callsign alone is NEVER accepted**.
- Handles King Air, PC-12 and PC-24. Adds callsign to the existing overlay details; keeps your SVG markers, UX, CSS, scrollytelling and HUD.
- Requires fresh position, Australia coordinates, positive altitude and groundspeed. Does not invent departure/destination or missions.
- No FlightAware requests or fallback iframe executed by patched JavaScript.
- Uses CDN caching to reduce provider traffic. See docs for key and licence policies: https://www.adsb.lol/request and https://api.adsb.lol/docs.

## Apply in local Careerscrolly repo
1. Make a branch or backup.
2. Copy `api/flights.js`, `api/rfds-aircraft-index.json`, `vercel.json` and `apply_index_patch.py` to their matching paths (create `api/` as needed).
3. Run `python3 apply_index_patch.py index.html` in repository root. It is deliberately strict, and makes an HTML backup locally.
4. Run `node tests/flights.test.js` (copy `tests/` first). Do not commit the `.before-adsb.html` backup.
5. Deploy the branch to Vercel and check `GET /api/flights` returns JSON with `source: 'adsb.lol'`; it may legitimately contain `flights: []`.
6. Compare actual live RFDS sightings against the official map. Confirm API licensing/production terms and the current fleet register before publicly displaying this tracking data.

## Important limitations
- No live ADS-B endpoint was reachable from the artifact-building container, so **the 2-query multi-registration lookup is supported by compatible API descriptions but has NOT been independently tested against adsb.lol live responses**. The bundle includes unit tests with simulated upstream responses.
- Production keys and rates are best-effort and can change. Contact the provider; do not quietly operate a national site against an unapproved upstream dependency.
- Most ICAO24 hex addresses remain unknown. For higher reliability, obtain the aircraft's official mode-S hex from RFDS operations/aircraft register and then use the batched `/v2/icao/` endpoint instead of registration queries.
- RFDS aircraft may disappear over remote areas due to receiver coverage gaps.
- The index contains unknown recency, so it might include aircraft no longer in the fleet. Disable/deactivate outdated registrations before deployment.
- If the Vercel project points to another GitHub repository or branch, this patch will not deploy automatically.

## Verification
Run `node tests/flights.test.js` to test the server-side filter. This is **not** a live integration or coverage test.
