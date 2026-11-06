# Careerscrolly — National RFDS live flight map fix

**Site:** https://careerscrolly.vercel.app/  
**Repository inspected:** https://github.com/sincitydecks/Careerscrolly (`main`, 6 November 2026)  
**Input:** `rfds_callsigns_2026-11-06.zip` provided by the user. Contains fleet details, **not live flight positions**.

## Root cause: why WA and SA/NT appear but QLD and South Eastern don't

The existing `index.html` contains this restrictive filter:

```js
return type === 'PC12' || type === 'PC24';
```

In the new CSV, **all 40 Queensland and South Eastern aircraft are King Airs**, whereas every listed SA/NT and WA aircraft is a PC-12 or PC-24. Any QLD/South Eastern flights returned by the feed are discarded by this filter. The inspected repo is also missing its `api/flights.js` endpoint, despite the frontend fetching `/api/flights`.

The supplied file has **93 candidate registrations, with 93 ICAO24 hex codes**: Central Operations 30, WA 23, QLD 26, South Eastern 14. Of those, **67** have directly observed recent FD-series tracker history (21 Central, 14 WA, 22 QLD, 10 South Eastern). **26** need confirmation before being assumed RFDS-active.

## What this patch changes

- Adds `api/rfds-fleet.json` with all 93 supplied registration/ICAO24 mappings and model information.
- Adds `api/flights.js`, a Vercel serverless adapter to `https://api.adsb.lol/v2/hex/<comma-separated ICAO24s>`; callsigns alone never prove aircraft identity.
- Defaults to the **67 better-supported aircraft**; avoids presenting the remaining 26 as independently verified. If RFDS validates them, `RFDS_INCLUDE_CANDIDATES=1` in Vercel enables all 93 candidates. Do not enable unverified candidate aircraft merely to increase the number of dots.
- Returns an existing-compatible `{success, count, flights:[...]}` JSON response with extra `sectionsIndexed`, `sectionsAirborne`, `partial` and warnings fields for diagnostics.
- Removes PC12/PC24-only frontend filtering; supports PC-12, PC-24 and King Air (BE20/B350).
- Adds distinct, heading-rotated **SVG top-down silhouettes** with an identifiable single nose propeller, twin aft jets, or twin wing turboprops. Uses the existing main map and full-screen cloned map.
- Removes the FlightAware iframe and its fallback code. Replaces misleading route data with `Route unavailable` (ADS-B doesn't give departure/arrival airports).
- Preserves scrollytelling, animations, page structure, EOI handling, and map artwork.
- Refreshes every 60 seconds, with a short Vercel shared cache and position-age checks; serialises multi-hex requests to reduce burst rate-limiting risk.

## Install into your **existing** Careerscrolly repo

From your working copy of `sincitydecks/Careerscrolly`:

1. **Back up/commit the existing project first.** Expand this ZIP elsewhere.
2. Copy `api/flights.js` and `api/rfds-fleet.json` into your repo's `api/` directory (create it if needed).
3. Replace `vercel.json` with the one in this ZIP. It retains the existing EOI route and adds `/api/flights` **ahead of** the catch-all rewrite.
4. Run this patcher in the repository root:

   ```bash
   python3 /path/to/this-zip/apply_to_careerscrolly.py index.html
   ```

   It also adds `/api/flights` to `server.js` for local Express development if that file exists. Backups are written to `index.html.before-rfds-national.html` and `server.js.before-rfds-national.js` (do **not** commit these backups).

5. Test from the expanded ZIP directory: `node tests/flights.test.js` and `python3 tests/patcher.test.py`. These use simulated provider data.
6. In the Careerscrolly repository, run `npm run build`. Confirm the generated `public/index.html` includes `RFDS_NATIONAL_FIX_V3`.
7. Commit **only** `index.html`, `server.js` if updated, `vercel.json`, `api/flights.js`, and `api/rfds-fleet.json`. Push to the branch from which Vercel deploys Careerscrolly, preferably via a preview deployment first.
8. Open `https://careerscrolly.vercel.app/api/flights` after deployment. It should return JSON with `fleetRegistrationsIndexed: 67` (or 93 if intentionally enabled), `sectionsIndexed` covering all four sections, and live `sectionsAirborne` observations when available.
9. Open the site: aircraft should use the new silhouettes. If the page still shows generic planes, the **HTML patch or deployment** hasn't reached this site. If it includes QLD/SE in `sectionsIndexed` but not `sectionsAirborne`, inspect data freshness, provider responses and coverage.

## What the API result means

- `sectionsIndexed`: aircraft configured for live lookups in each section, not aircraft currently flying.
- `sectionsAirborne`: aircraft that returned fresh airborne locations and matched the approved ICAO24 list at the time of the query.
- `partial`: one or more upstream API batches failed; other batches may still provide valid flights.
- `flights`: currently **observed airborne positions**, not proof of an active RFDS aeromedical mission.

The provider response may legitimately contain zero aircraft. That does **not** mean RFDS has stopped flying; reception is limited, particularly in remote areas and at low altitude.

## Data, licence, and operational cautions

- **Provider access:** adsb.lol offers a free API under ODbL 1.0 and explicitly asks production applications to contact the operator. Request approval/access limits for a public RFDS site before rollout: https://www.adsb.lol/docs/open-data/api . Do not assume unrestricted free production polling.
- **No live provider verification:** external network responses could not be validated in this development environment. Local API tests are mocked; do a live endpoint smoke test and side-by-side comparison with a trusted flight feed.
- **Aircraft identification:** ICAO24/registration can identify an airframe if the mapping is correct. A callsign is not permanently attached to an airframe; the CSV's `FD###` associations are historical. Verify the registrations against current RFDS fleet control.
- **Mission identity:** ADS-B does not prove that a publicly observed RFDS-owned aircraft is performing an RFDS medical mission. Label it "RFDS aircraft reporting airborne" unless RFDS supplies approved mission status.
- **Coverage:** ground receiver networks may miss remote, oceanic, low-altitude, or privacy-filtered aircraft. No coverage guarantee.
- **Verification:** 26 entries in the CSV are tagged no recent FD history, non-FD history only, or old search snapshot. These are excluded by default and should be reviewed before enabling.
- **Security/privacy:** confirm RFDS approval for publicly displaying precise near-real-time aeromedical aircraft positions; consider a short delay/opt-outs if required.

## Files

- `api/flights.js` — serverless API adapter and filtering
- `api/rfds-fleet.json` — original 93 candidate mappings, with evidence status
- `vercel.json` — Vercel routing
- `apply_to_careerscrolly.py` — guarded frontend and optional server patch
- `tests/flights.test.js` — synthetic data/API test
- `tests/patcher.test.py` — guarded patcher smoke test
- `preview/aircraft-silhouettes.svg`, `.png` — illustrative top-view vectors
- `source/rfds_nationwide_callsigns.csv` — original input table (unchanged)
