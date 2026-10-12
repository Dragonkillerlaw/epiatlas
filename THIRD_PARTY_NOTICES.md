# Third-party notices

## GeoSentinel

- Source: https://github.com/acuestamd/project-geosentinel
- Commit: `030835bade947a935cb23274f58a685db73ecf30`
- Copyright (c) 2026 Armando Cuesta
- License: MIT, full text in `licenses/GeoSentinel-MIT.txt`.
- Vendored files: `vendor/geosentinel/collectors.py`, `scanner_v2.py`, `signal_quality.py`, `signal_store.py`.
- Local patch in `signal_quality.py`: require token separators and bound the `declared/certified ... free` regex, fixing catastrophic backtracking on actual WHO text. Other vendored files are unmodified.
- EpiAtlas wraps these modules for source field adaptation and persistent report history. It does not inherit claims of validated severity or official endorsement.

## PulseMap

- Source: https://github.com/DareDev256/pulsemap
- Commit: `868fa68298128afe3c8e350885ca1f41cb1986c9`
- Copyright (c) 2026 James Olusoga (DareDev256)
- License: MIT, full text in `licenses/PulseMap-MIT.txt`.
- `web/core.mjs`: marker-size expression adapted from `src/components/PulseMap.tsx`; histogram concept adapted from `src/components/TimelineSlider.tsx`.
- Map and timeline UI are rewritten for Leaflet, local assets, two-sided date filtering and direct report linkage. Disease-only deduplication and keyword-based severity are not reused.

## Map and build dependencies

- Leaflet 1.9.4 — BSD-2-Clause; license retained in installed distribution and copied to `dist/licenses/`.
- Leaflet.markercluster 1.5.3 — MIT; marker clustering and spiderfying, notice in `licenses/LeafletMarkerCluster-MIT.txt`.
- topojson-client 3.1.0 — ISC; used at build time.
- world-atlas 2.0.2 — ISC packaging; derived from Natural Earth public-domain geography, https://www.naturalearthdata.com/about/terms-of-use/ . Borders do not imply endorsement.

## Reports

WHO and PAHO report text, excerpts and data remain subject to their own terms. The repository contains short source excerpts for evidence navigation, with links and attribution. MIT licenses on software do not confer ownership or unrestricted rights to third-party news content.
