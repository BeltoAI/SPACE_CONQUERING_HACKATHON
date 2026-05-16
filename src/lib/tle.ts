// Celestrak live-orbit loader.
//
// Maps a handful of BELTO callsigns onto real on-orbit satellites by fetching
// their current mean orbital elements from Celestrak's public GP endpoint:
//
//   https://celestrak.org/NORAD/elements/gp.php?CATNR=<id>&FORMAT=json
//
// The returned JSON contains MEAN_MOTION / INCLINATION / RA_OF_ASC_NODE /
// MEAN_ANOMALY — exactly the four numbers BELTO's orbit model already uses.
// We derive altitudeKm from MEAN_MOTION via Kepler's third law and patch the
// existing Satellite.orbit objects in place, so the rest of the dashboard
// (propagator, globe, telemetry) keeps working unchanged.
//
// Public sources, free, no auth required.
//
// To verify in the browser console at runtime:
//   const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json');
//   console.log(await r.json());

import type { Satellite } from './fleet';
import { log } from './logs';

/** Earth gravitational parameter (km^3 / s^2). */
const MU_EARTH = 398600.4418;
/** Earth equatorial radius (km). */
const R_EARTH = 6378.137;

/** Shape of a single object in Celestrak's GP JSON response. */
interface CelestrakGP {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;          // revolutions per day
  ECCENTRICITY: number;
  INCLINATION: number;          // degrees
  RA_OF_ASC_NODE: number;       // degrees
  ARG_OF_PERICENTER: number;    // degrees
  MEAN_ANOMALY: number;         // degrees
}

/**
 * Mapping from BELTO callsign → real NORAD catalogue ID.
 *
 * Hand-picked for instant recognizability so judges immediately understand
 * the dashboard is showing real on-orbit traffic:
 *
 *   COOPER  → ISS (everyone knows it)
 *   BRAND   → Hubble Space Telescope
 *   MURPH   → NOAA-20 (polar weather)
 *   KIRK    → Sentinel-2A (Copernicus optical Earth observation)
 *   LEIA    → Landsat-9 (USGS / NASA optical)
 *   TARS    → Aqua (NASA EOS, MODIS infrared)
 *   HAL-9000 → Terra (NASA EOS, MODIS thermal)
 *   ENDURANCE → GOES-18 (GEO weather, real one)
 *
 * Note: only OPTICAL / INFRARED / WEATHER birds get real overlays — SAR and
 * COMMS birds keep their synthetic orbits because their NORAD IDs are less
 * audience-friendly.
 */
const LIVE_MAP: Record<string, { catnr: number; description: string }> = {
  COOPER:    { catnr: 25544, description: 'ISS (ZARYA)' },
  BRAND:     { catnr: 20580, description: 'Hubble Space Telescope' },
  MURPH:     { catnr: 43013, description: 'NOAA-20 (polar weather)' },
  KIRK:      { catnr: 40697, description: 'Sentinel-2A' },
  LEIA:      { catnr: 49260, description: 'Landsat-9' },
  TARS:      { catnr: 27424, description: 'Aqua (EOS PM-1)' },
  'HAL-9000':{ catnr: 25994, description: 'Terra (EOS AM-1)' },
  ENDURANCE: { catnr: 51850, description: 'GOES-18 (GEO weather)' }
};

/** Derive semi-major axis from mean motion. */
function semiMajorAxisKm(meanMotionRevPerDay: number): number {
  const n = (meanMotionRevPerDay * 2 * Math.PI) / 86400; // rad/sec
  return Math.cbrt(MU_EARTH / (n * n));
}

/** Convert one Celestrak GP record into BELTO's orbit shape. */
function gpToOrbit(gp: CelestrakGP): {
  altitudeKm: number;
  inclinationDeg: number;
  raanDeg: number;
  phaseDeg: number;
  periodMin: number;
} {
  const periodMin = 1440 / gp.MEAN_MOTION;
  const aKm = semiMajorAxisKm(gp.MEAN_MOTION);
  const altitudeKm = Math.max(150, aKm - R_EARTH);
  // Use mean anomaly + arg of pericenter as the initial phase along the
  // orbit ring — close enough for a visual demo and consistent with the
  // existing propagator's phaseDeg semantics.
  const phaseDeg = (gp.MEAN_ANOMALY + gp.ARG_OF_PERICENTER) % 360;
  return {
    altitudeKm,
    inclinationDeg: gp.INCLINATION,
    raanDeg: gp.RA_OF_ASC_NODE,
    phaseDeg,
    periodMin
  };
}

/** Fetch one Celestrak object by NORAD ID. */
async function fetchCelestrak(catnr: number): Promise<CelestrakGP | null> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=json`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const data: CelestrakGP[] = await r.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0];
  } catch {
    return null;
  }
}

/** Status of a live-orbit overlay attempt. */
export interface LiveOrbitResult {
  belto: string;
  realName: string;
  noradId: number;
  altitudeKm: number;
  periodMin: number;
  inclinationDeg: number;
}

/**
 * Fetch live orbital elements from Celestrak and patch the corresponding
 * BELTO satellites in-place. Returns the list of successful overlays.
 *
 * Safe to call once on app start. If the network fails the dashboard simply
 * falls back to its built-in synthetic constellation — no error is thrown.
 */
export async function applyLiveOrbits(fleet: Satellite[]): Promise<LiveOrbitResult[]> {
  log.emit('fetching live orbital elements from Celestrak…', 'info');

  const entries = Object.entries(LIVE_MAP);
  const results = await Promise.all(
    entries.map(async ([beltoId, { catnr, description }]) => {
      const gp = await fetchCelestrak(catnr);
      if (!gp) return null;
      const sat = fleet.find(s => s.id === beltoId);
      if (!sat) return null;
      const orbit = gpToOrbit(gp);
      sat.orbit = orbit;
      sat.noradId = catnr;
      // Re-snap altitude (telemetry altKm tracks orbit.altitudeKm in tickFleet).
      sat.altKm = orbit.altitudeKm;
      return {
        belto: beltoId,
        realName: description,
        noradId: catnr,
        altitudeKm: orbit.altitudeKm,
        periodMin: orbit.periodMin,
        inclinationDeg: orbit.inclinationDeg
      } satisfies LiveOrbitResult;
    })
  );

  const ok = results.filter((r): r is LiveOrbitResult => r !== null);

  if (ok.length === 0) {
    log.emit('Celestrak unreachable — using built-in synthetic constellation', 'warn');
  } else {
    log.emit(`Celestrak: ${ok.length}/${entries.length} live overlays applied`, 'ok');
    for (const r of ok) {
      log.emit(
        `  ${r.belto} → ${r.realName} · NORAD ${r.noradId} · alt ${r.altitudeKm.toFixed(0)} km · ${r.periodMin.toFixed(1)} min`,
        'info'
      );
    }
  }

  return ok;
}

/** Exposed so the Rules tab + Fleet page can render a credibility footer. */
export const LIVE_DATA_SOURCES = {
  orbits: {
    label: 'Celestrak GP (Group Parameter) feed',
    url: 'https://celestrak.org/NORAD/elements/',
    description:
      'Public catalogue of current mean orbital elements for ~25 000 tracked objects. Refreshed every few hours by US Space Force inputs.'
  },
  imagery: {
    label: 'NASA GIBS · NOAA STAR · NASA EONET',
    url: 'https://gibs.earthdata.nasa.gov / https://www.star.nesdis.noaa.gov',
    description:
      'Live Earth imagery (MODIS Terra, GOES-19/18) and live natural-event feed (wildfires, volcanoes, severe storms). Free, no auth, refreshed on the same cadence the real satellites downlink.'
  }
} as const;
