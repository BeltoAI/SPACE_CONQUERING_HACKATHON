#!/usr/bin/env bash
# Push BELTO Space Conquering Hackathon repo to GitHub.
#
# Run from the project root:
#   bash scripts/push-to-github.sh
#
# Prereqs:
#   - git installed
#   - GitHub auth configured (gh auth login, or SSH key, or HTTPS token)

set -euo pipefail

REMOTE_URL="https://github.com/BeltoAI/SPACE_CONQUERING_HACKATHON.git"
BRANCH="main"

# Clean stale lockfile (Cowork sandbox quirk) if present and writable
if [ -f .git/index.lock ]; then
  rm -f .git/index.lock || true
fi

if [ ! -d .git ]; then
  git init -b "$BRANCH"
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -m "BELTO fleet ops dashboard — v0.16.0

- Two-color separation: fleet status (NOMINAL/ACQUIRING/LOST) vs alert
  severity (CRITICAL/HIGH/WARNING/INFO).
- Fixed stale-count bug in OpsPanel via tick-based recomputation.
- 18 sci-fi callsigns (COOPER, TARS, HAL-9000, NOSTROMO, ...).
- Per-satellite alert count column; alert rows show triggering thumbnail.
- Replaced Bandwidth drawer tab with History (past alerts).
- NL Ask Fleet with roster-aware callsign matching.

v0.16.0 additions:
- Tuned telemetry simulator so LOST is rare (was firing on half the
  fleet because eclipse drift was way too aggressive).
- Added STATUS_RULES + surfaced lifecycle thresholds in Rules tab so
  NOMINAL/ACQUIRING/LOST are documented in the UI, not just in code.
- Per-satellite inference / alert / bytesRaw / bytesPayload counters
  that increment on every emitted alert.
- New standalone full-screen Fleet Overview page (console → FLEET
  OVERVIEW) with KPI strip, status legend, per-sat detail cards,
  status badges, telemetry grid, orbit + counters, recent alerts.
- Add / remove satellite with explicit orbit (altitude, inclination,
  RAAN, phase). Period auto-derived from Kepler's third law.
- FleetGlobe now subscribes to fleet pub-sub so newly added sats
  appear on the 3D world view immediately."
fi

git branch -M "$BRANCH"

if git remote get-url origin > /dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

git push -u origin "$BRANCH"

echo
echo "Pushed to $REMOTE_URL"
echo "Now connect this repo to Vercel: https://vercel.com/new"
