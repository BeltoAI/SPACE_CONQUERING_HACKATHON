# BELTO — Space Conquering Hackathon

**The satellite already knows what to send home.**

A browser-deployed mission-control dashboard for an 18-satellite Earth-observation
constellation. Real ONNX scene classification runs in the tab, alerts flow into a
live ops panel, and a natural-language search bar answers fleet-wide questions —
no backend, no cloud, no GPU required.

Built for the [lablab.ai TechEx hackathon — Track 4 (Space Conquering)](https://lablab.ai/),
May 2026.

---

## What it does

Production EO satellites today downlink almost everything they capture and sort it on
the ground. BELTO demonstrates the inverse: on-orbit scene classification, rule-based
triage, and adaptive compression — so only mission-relevant frames consume bandwidth.

The dashboard simulates a fleet of 18 satellites named after sci-fi spacecraft and
crews (COOPER, TARS, HAL-9000, NOSTROMO, ROCINANTE, GALACTICA, ...). Each satellite
is a runtime entity with status, battery, uplink, and a per-payload role (optical /
infrared / SAR / comms / weather). Real ML inference on any uploaded or streamed
tile produces alerts that are routed to the fleet ops panel, severity-tagged, and
attached to the satellite that "captured" them — complete with the edge-detected
thumbnail that triggered the rule.

## The dashboard at a glance

```
┌─────────────────────────────────────────────────────────────────────┐
│  ASK FLEET (NL search)                              ⌘K   CONSOLE ▾  │  top bar
├──────────────────────────────────────────────────┬──────────────────┤
│                                                  │  FLEET STATUS    │
│                                                  │  18 / 0 / 0 / X  │  KPI ribbon
│                                                  │                  │
│              🌍  3D FLEET GLOBE                  │  FLEET (18)      │  fleet list
│         (satellites + alert pins)                │  • COOPER  ...   │  per-row alert ct
│                                                  │  • TARS    ...   │
│                                                  │  • HAL-9000...   │
│                                                  │                  │
│  ┌──────────────────────────────┐                ├──────────────────┤
│  │ BANDWIDTH SAVED  4.2 GB      │                │  ACTIVE ALERTS   │
│  │ FRAMES TRIAGED   312         │                │  [thumb] COOPER  │  alert rows
│  │ FLEET 18/18 BATT 87% ...     │                │  [thumb] RIPLEY  │  with triggering
│  └──────────────────────────────┘                │  ...             │  picture
└──────────────────────────────────────────────────┴──────────────────┘
```

### Two color systems, kept strictly separate

| Domain | States | Colors |
|--------|--------|--------|
| **Fleet status** (a satellite's lifecycle) | NOMINAL / ACQUIRING / LOST | green / amber / red |
| **Alert severity** (an event's urgency)    | CRITICAL / HIGH / WARNING / INFO | bold red / orange / purple / blue |

The ops panel never bleeds one color system into the other. A green satellite can
still have a critical alert. A lost satellite has its own dedicated red.

### Ops panel sections (right rail)

1. **Fleet KPI ribbon** — live counts of nominal / acquiring / lost / active alerts,
   refreshed every 1.5 s. Counts are derived from the fleet array using a tick
   counter so that in-place mutations (battery drift, status transitions) are
   actually picked up by React.
2. **Fleet list** — one row per satellite with callsign, role, status, and an
   **ALERTS** column showing how many open events are pinned to that bird. Sorted
   worst-first (LOST before ACQUIRING before NOMINAL, then by active alert count).
   Click any row → open that satellite's Analyze page.
3. **Active alerts** — every open event, severity-sorted, with the actual
   edge-detected thumbnail from the inference pipeline. Click any row → open the
   originating satellite.

### Past alerts

The **Console** drawer (`⌘K` or the CONSOLE button) opens to four tabs:

- **HISTORY** — every alert ever emitted, severity-filterable. Each row shows the
  triggering frame thumbnail, bandwidth metadata (raw bytes → payload bytes), and
  the rule that fired.
- **LOG** — audit stream of every fleet event (taskings, downlinks, status
  transitions).
- **RULES** — the active rule engine table.
- **ABOUT** — provenance, model details, links.

### Ask Fleet (natural-language search)

The top bar is an NL search box. It parses queries client-side (no LLM call) and
answers them in a single card with citations:

- "any fires in California?" → counts matched alerts, picks the most-recent ones,
  shows confidence + raw→payload compression ratio
- "how much bandwidth did we save today?" → returns the bytes-saved metric with a
  breakdown of frames processed / downlinked / discarded
- "how is the fleet?" → nominal/acquiring/lost summary with a list of any flagged
  birds
- "show me TARS" or "is hal 9000 ok?" → callsign lookup against the live roster
  (whitespace- and hyphen-insensitive)

## On-orbit inference (still real)

| Component | What | Status |
|-----------|------|--------|
| **EuroSAT scene classifier** | ResNet-18 trained on Sentinel-2 imagery, 10 land-cover classes, ~98% test accuracy | Real ML, requires conversion step (below) |
| **Spectral pipeline** | HSV thresholds + Sobel edges + 2-pass connected components → traced polygon outlines | Always on |
| **Rule engine** | Routes scene class + spectral signals → priority + decision + downlink action | Always on |
| **Adaptive compression** | JPEG q=0.3 thumbnail for HIGH/CRITICAL · metadata-only for DISCARD | Always on |
| **Time-series anomaly** | Frame-to-frame ONNX embedding distance | Always on (video mode) |
| **Real-time data** | NOAA STAR CDN GOES-19 (5min refresh), NASA EONET, MODIS Terra GIBS | Always on |
| **Offline support** | Service worker caches model + app shell after first load | Always on |

Each inference run emits a `FleetAlert` carrying the triggering thumbnail, the rule
that fired, and the satellite it's attributed to. That alert flows into the ops
panel in real time.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. The app works immediately with the heuristic
classifier. To enable the **real ML scene classifier** (recommended):

```bash
pip install torch torchvision transformers safetensors huggingface_hub onnx
python scripts/convert-eurosat.py
```

That downloads `cm93/resnet18-eurosat` from HuggingFace, fine-tuned on Sentinel-2
imagery (98% test accuracy on land cover), and exports it as ONNX into
`public/models/`. After that, restart `npm run dev` and BELTO auto-detects the
model on boot.

## Build & deploy

```bash
npm run build
npm i -g vercel && vercel
```

Auto-detects Vite. The 7 MB anomaly-CNN deploys as a static asset. If you've
converted the EuroSAT model, that ~45 MB ONNX deploys too.

**Vercel free-tier note**: model files >100 MB are rejected. ResNet-18 fits
comfortably.

## Architecture

```
satellite tile  ─→  EuroSAT classifier (ResNet-18 ONNX, 224x224)
                       ↓
                    scene class + confidence
                       ↓
                ┌──────────────────────────┐
spectral pass ─→│       rule engine        │
(HSV+Sobel+CC) ─→│ scene-driven if conf>0.45│
anomaly CNN  ──→│ heuristic fallback       │
                └──────────────────────────┘
                       ↓
                  priority + decision + action
                       ↓
                  FleetAlert{ satId, rule, severity,
                              rawBytes, payloadBytes,
                              thumbnailDataUrl, ... }
                       ↓
                  AlertStream (pub-sub)
                       ↓
            ┌──────────┴──────────┐
            ↓                     ↓
       OpsPanel              BandwidthHero
       History tab           Answer engine
```

## Source layout

```
src/
  App.tsx                       app shell + inference wiring
  components/
    Dashboard.tsx               globe + ops + bandwidth hero
    FleetGlobe.tsx              three.js / react-globe.gl scene
    OpsPanel.tsx                right rail: KPI / fleet list / active alerts
    BandwidthHero.tsx           bottom-left value-prop card
    AskFleet.tsx                top-bar NL search
    AnswerCard.tsx              renders Answer with citations
    MenuDrawer.tsx              console drawer (History / Log / Rules / About)
    SatelliteAnalyze.tsx        per-sat detail page
  lib/
    fleet.ts                    fleet model + status + alert + bandwidth + KPI
    nlsearch.ts                 client-side NL parser → SearchFilter
    answer.ts                   SearchFilter → Answer (with citations)
    inference/                  ONNX wrappers, EuroSAT, anomaly CNN
```

## Sample sources

- 4 historical MODIS Terra tiles (Park Fire 2024, North Atlantic storm,
  Mediterranean, Sahara)
- Park Fire 6-day GIBS time-lapse (real consecutive daily satellite tiles)
- Latest GOES-19 single frame
- Latest EONET event → matching MODIS tile
- Image / video upload

## Live modes

- **GO LIVE — webcam sensor**: 1 Hz inference on your laptop camera. Includes V4L2
  fallback for Ubuntu.
- **STREAM GOES-19**: auto-refreshes the latest GOES-19 CONUS GeoColor tile every
  30 s. NOAA refreshes the source every 5 min — when the `last-modified` is
  unchanged, BELTO logs a skip and waits.

## Rule engine

Decisions in priority order:

| Rule | Trigger | Priority | Decision | Action |
|------|---------|----------|----------|--------|
| `PRIORITY_FIRE` | Hot pixel signature (lum>140, r>200, r-g>60, sat>0.55) | CRITICAL | PRIORITY_DOWNLINK | DOWNLINK NOW · alert fire response |
| `ANOMALY_REPORT` | Frame-to-frame embedding distance ≥ 0.50 | HIGH | COMPRESSED_DOWNLINK | flag for review |
| `WATER_BODY` | Classifier: River+SeaLake ≥ 0.60 | HIGH | COMPRESSED_DOWNLINK | notify hydro response |
| `DEVELOPED_AREA` | Classifier: Residential+Industrial+Highway ≥ 0.60 | WARNING | EVENT_DOWNLINK | catalog developed scene |
| `NATURAL_BASELINE` | Classifier: forest/vegetation/agriculture, low conf elsewhere | LOW | DISCARD_ONBOARD | routine baseline |
| `FLOOD_WATCH` | Heuristic water ≥ 0.45 (when classifier unavailable) | HIGH | COMPRESSED_DOWNLINK | notify hydro |
| `CLOUD_DISCARD` | Heuristic cloud ≥ 0.55 with no other signal | LOW | DISCARD_ONBOARD | cloud-occluded |
| `LOW_VALUE` | else | LOW | DISCARD_ONBOARD | no signal |
| `DEGRADED_NETWORK_OVERRIDE` | Toggle on, priority < CRITICAL | LOW | DISCARD_ONBOARD | suppressed |

## Fleet roster

| Callsign     | Role     | Origin                             |
|--------------|----------|------------------------------------|
| COOPER       | OPTICAL  | Interstellar                       |
| BRAND        | OPTICAL  | Interstellar                       |
| MURPH        | OPTICAL  | Interstellar                       |
| KIRK         | OPTICAL  | Star Trek                          |
| LEIA         | OPTICAL  | Star Wars                          |
| RIPLEY       | OPTICAL  | Alien                              |
| TARS         | INFRARED | Interstellar                       |
| CASE         | INFRARED | Interstellar                       |
| KIPP         | INFRARED | Interstellar                       |
| HAL-9000     | INFRARED | 2001: A Space Odyssey              |
| WATNEY       | SAR      | The Martian                        |
| HERMES       | SAR      | The Martian                        |
| ROCINANTE    | SAR      | The Expanse                        |
| FALCON       | COMMS    | Star Wars (Millennium Falcon)      |
| VOYAGER      | COMMS    | Star Trek                          |
| NOSTROMO     | COMMS    | Alien                              |
| ENDURANCE    | WEATHER  | Interstellar                       |
| GALACTICA    | WEATHER  | Battlestar Galactica               |

## Real-time data sources

- **NOAA STAR CDN** — `cdn.star.nesdis.noaa.gov` — latest GOES-19 (East) and
  GOES-18 (West) at stable URLs, no auth, CORS-enabled. CONUS sector refreshes
  every 5 min.
- **EONET v3** — Earth Observatory Natural Event Tracker
- **GIBS WMTS** — MODIS Terra TrueColor (samples + timelapse)

## Honest framing

- The **EuroSAT classifier is real ML** trained on 27 k labeled Sentinel-2 RGB
  tiles. Predictions and confidence scores reflect actual model output.
- The **spectral pipeline** (HSV + Sobel + connected components + traced contours)
  is the visual overlay layer. It's the same approach used in production cloud
  masking (NASA MOD35, ESA Sentinel-2 SCL).
- The **anomaly-detection CNN** has random-initialized weights (sandbox
  limitations). Its embedding still preserves enough distance structure for
  frame-to-frame change detection.
- The **fleet itself is simulated** — 18 satellites with realistic orbital
  positions, batteries, and uplink rates. The dashboard is the story we'd tell an
  operator on day one of running a real constellation.

## Offline

After the first online load, the service worker caches everything needed to run
the app offline:
- App shell (HTML, JS, CSS)
- ONNX runtime CDN files
- Both ONNX models (anomaly CNN + EuroSAT, if converted)
- Recently fetched satellite tiles

Webcam, samples, uploads, and inference all work fully offline. Live GOES
streaming gracefully falls back to last-cached tile.

## Versioning

v0.15.0 — fleet ops dashboard · severity/status color separation · sci-fi roster ·
alert thumbnails · NL ask-fleet · per-satellite analyze page · history tab
