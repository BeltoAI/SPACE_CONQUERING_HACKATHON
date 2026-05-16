// Local natural-language query parser for the BELTO dashboard.
//
// No LLM / API key required — patterns are extracted from a single sentence
// and combined into a SearchFilter that the FleetGlobe + alert ticker use to
// dim non-matching satellites and highlight matching alerts.
//
// Example queries (all work without internet):
//   "fires in Spain"
//   "show critical satellites"
//   "water alerts last hour"
//   "infrared sats over Africa"
//   "BELTO-1A"
//   "anything in California"

import { getFleet, type Satellite, type FleetAlert, type SatRole } from './fleet';

export interface SearchFilter {
  query: string;
  human: string;             // human-readable interpretation, e.g. "fires in Spain"
  matchSat: (sat: Satellite, alerts: FleetAlert[]) => boolean;
  matchAlert: (a: FleetAlert) => boolean;
  // Optional camera focus point if a place was identified.
  focus?: { lat: number; lon: number; zoom: number };
}

// --- gazetteer -----------------------------------------------------------
// Tiny built-in places list with bounding boxes (lat0, lon0, lat1, lon1).

interface Place {
  name: string;          // canonical
  aliases: string[];     // matched case-insensitively
  bbox: [number, number, number, number];
  center: [number, number];
  zoom: number;          // recommended camera altitude
}

const PLACES: Place[] = [
  { name: 'Spain', aliases: ['spain', 'españa'], bbox: [36, -9.3, 43.8, 3.3], center: [40.2, -3.7], zoom: 1.6 },
  { name: 'Portugal', aliases: ['portugal'], bbox: [36.9, -9.5, 42.2, -6.2], center: [39.5, -8], zoom: 1.6 },
  { name: 'France', aliases: ['france'], bbox: [42.3, -4.8, 51, 8.2], center: [46.8, 2.3], zoom: 1.6 },
  { name: 'Germany', aliases: ['germany', 'deutschland'], bbox: [47.3, 5.9, 55, 15], center: [51, 10.4], zoom: 1.6 },
  { name: 'Italy', aliases: ['italy', 'italia'], bbox: [36.6, 6.6, 47.1, 18.5], center: [41.9, 12.5], zoom: 1.6 },
  { name: 'United Kingdom', aliases: ['uk', 'united kingdom', 'britain', 'england', 'scotland', 'wales'], bbox: [49.9, -8.6, 58.7, 1.8], center: [54.5, -3], zoom: 1.6 },
  { name: 'Greece', aliases: ['greece'], bbox: [34.8, 19.4, 41.7, 28.2], center: [39, 22.6], zoom: 1.6 },
  { name: 'Turkey', aliases: ['turkey', 'türkiye'], bbox: [36, 26, 42.1, 44.8], center: [39, 35], zoom: 1.6 },
  { name: 'United States', aliases: ['us', 'usa', 'united states', 'america', 'states'], bbox: [24.5, -125, 49.4, -66.9], center: [39.8, -98.6], zoom: 1.7 },
  { name: 'California', aliases: ['california'], bbox: [32.5, -124.5, 42, -114.1], center: [36.8, -119.4], zoom: 1.4 },
  { name: 'Florida', aliases: ['florida'], bbox: [24.5, -87.6, 31, -80], center: [27.7, -83.5], zoom: 1.5 },
  { name: 'Texas', aliases: ['texas'], bbox: [25.8, -106.6, 36.5, -93.5], center: [31.2, -100.2], zoom: 1.5 },
  { name: 'Canada', aliases: ['canada'], bbox: [41.7, -141, 73, -52.6], center: [56.1, -106.3], zoom: 1.9 },
  { name: 'Mexico', aliases: ['mexico', 'méxico'], bbox: [14.5, -118.5, 32.7, -86.7], center: [23.6, -102.5], zoom: 1.7 },
  { name: 'Brazil', aliases: ['brazil', 'brasil'], bbox: [-33.7, -73.9, 5.3, -34.8], center: [-14.2, -51.9], zoom: 1.7 },
  { name: 'Africa', aliases: ['africa'], bbox: [-34.8, -17.6, 37.3, 51.4], center: [3.6, 17], zoom: 1.9 },
  { name: 'Australia', aliases: ['australia'], bbox: [-43.6, 113, -10.7, 153.6], center: [-25.3, 134], zoom: 1.8 },
  { name: 'Asia', aliases: ['asia'], bbox: [-10, 26, 81, 180], center: [34, 100], zoom: 2.1 },
  { name: 'Europe', aliases: ['europe'], bbox: [35, -25, 71, 45], center: [54, 15], zoom: 1.8 },
  { name: 'Indonesia', aliases: ['indonesia'], bbox: [-11, 95, 6, 141], center: [-2.5, 118], zoom: 1.7 },
  { name: 'India', aliases: ['india'], bbox: [6.8, 68, 35.7, 97.4], center: [20.6, 78.9], zoom: 1.7 },
  { name: 'Japan', aliases: ['japan'], bbox: [24, 122.9, 45.5, 145.8], center: [36.2, 138.3], zoom: 1.6 },
  { name: 'China', aliases: ['china'], bbox: [18, 73.5, 53.6, 134.8], center: [35.9, 104.2], zoom: 1.9 },
  { name: 'Russia', aliases: ['russia'], bbox: [41.2, 19.6, 82, 180], center: [61.5, 105.3], zoom: 2.1 },
  { name: 'Middle East', aliases: ['middle east'], bbox: [12, 32, 39, 63], center: [29, 47], zoom: 1.7 }
];

// --- keyword maps --------------------------------------------------------

const RULE_KEYWORDS: Record<string, string[]> = {
  fire:    ['fire', 'fires', 'wildfire', 'wildfires', 'blaze', 'blazes'],
  water:   ['water', 'flood', 'flooding', 'floods'],
  cloud:   ['cloud', 'clouds', 'cloudy', 'overcast'],
  anomaly: ['anomaly', 'anomalies', 'unusual'],
  develop: ['city', 'urban', 'developed', 'built-up', 'cities'],
  natural: ['forest', 'vegetation', 'natural']
};

const ROLE_KEYWORDS: Record<SatRole, string[]> = {
  OPTICAL:  ['optical', 'visible', 'truecolor', 'true-color', 'camera', 'imaging'],
  INFRARED: ['infrared', 'ir', 'thermal', 'heat'],
  SAR:      ['sar', 'radar', 'all-weather', 'all weather'],
  COMMS:    ['comms', 'comm', 'relay', 'ka-band', 'communications'],
  WEATHER:  ['weather', 'wx', 'goes', 'meteorology', 'meteorological']
};

// Maps free-text keywords → SatStatus values.
// (Aligned with the May 2026 fleet-status model: NOMINAL / ACQUIRING / LOST.)
const STATUS_KEYWORDS: Record<string, string[]> = {
  LOST:      ['lost', 'critical', 'failing', 'failed', 'red', 'down'],
  ACQUIRING: ['acquiring', 'degraded', 'attention', 'amber', 'yellow', 'standby', 'idle'],
  NOMINAL:   ['nominal', 'healthy', 'ok', 'green']
};

const TIME_KEYWORDS: { rxs: RegExp[]; windowMs: number; label: string }[] = [
  { rxs: [/last hour/i, /past hour/i], windowMs: 3_600_000, label: 'past hour' },
  { rxs: [/last \d+ ?h/i, /past \d+ ?h/i], windowMs: 0, label: 'recent' }, // refined below
  { rxs: [/today/i],                       windowMs: 86_400_000, label: 'today' },
  { rxs: [/last (\d+) ?min/i],             windowMs: 0, label: 'recent' }
];

// --- main parser ---------------------------------------------------------

export function parseQuery(rawQuery: string): SearchFilter | null {
  const q = rawQuery.trim();
  if (!q) return null;
  const lc = q.toLowerCase();

  // Find place
  let place: Place | null = null;
  for (const p of PLACES) {
    if (p.aliases.some(a => containsWord(lc, a))) {
      place = p;
      break;
    }
  }

  // Find rule class
  let rule: keyof typeof RULE_KEYWORDS | null = null;
  for (const [k, kws] of Object.entries(RULE_KEYWORDS)) {
    if (kws.some(w => containsWord(lc, w))) { rule = k as keyof typeof RULE_KEYWORDS; break; }
  }

  // Find role
  let role: SatRole | null = null;
  for (const [r, kws] of Object.entries(ROLE_KEYWORDS) as [SatRole, string[]][]) {
    if (kws.some(w => containsWord(lc, w))) { role = r; break; }
  }

  // Find status
  let status: string | null = null;
  for (const [s, kws] of Object.entries(STATUS_KEYWORDS)) {
    if (kws.some(w => containsWord(lc, w))) { status = s; break; }
  }

  // Find time window
  let windowMs: number | null = null;
  for (const t of TIME_KEYWORDS) {
    for (const rx of t.rxs) {
      if (rx.test(lc)) {
        windowMs = t.windowMs;
        const numMatch = lc.match(/last (\d+) ?h/) || lc.match(/past (\d+) ?h/) || lc.match(/last (\d+) ?min/);
        if (numMatch) {
          const n = parseInt(numMatch[1], 10);
          windowMs = lc.includes('min') ? n * 60_000 : n * 3_600_000;
        }
        break;
      }
    }
    if (windowMs !== null) break;
  }

  // Find sat callsign (e.g. COOPER, TARS, HAL-9000). We match against the
  // known fleet so "cooper" or "Hal 9000" both resolve to a real id.
  const satId = matchSatCallsign(q);

  // If nothing matched, treat as a fuzzy text filter
  if (!place && !rule && !role && !status && !satId && windowMs === null) {
    return {
      query: q,
      human: `matching "${q}"`,
      matchSat: sat => sat.id.toLowerCase().includes(lc),
      matchAlert: a => a.satId.toLowerCase().includes(lc) || a.rule.toLowerCase().includes(lc)
    };
  }

  // Build human description
  const bits: string[] = [];
  if (status) bits.push(status.toLowerCase());
  if (role) bits.push(role.toLowerCase());
  if (satId) bits.push(satId);
  if (rule) bits.push(rule === 'fire' ? 'fires' : rule === 'water' ? 'water events' : rule === 'cloud' ? 'cloud passes' : rule === 'anomaly' ? 'anomalies' : `${rule} events`);
  if (place) bits.push(`in ${place.name}`);
  if (windowMs) bits.push(`(${windowMs / 60_000}m)`);
  const human = bits.join(' ') || `"${q}"`;

  return {
    query: q,
    human,
    focus: place ? { lat: place.center[0], lon: place.center[1], zoom: place.zoom } : undefined,
    matchAlert(a) {
      if (status) { /* status only filters sats, not alerts */ }
      if (rule && !alertMatchesRule(a, rule)) return false;
      if (place && !bboxContains(place.bbox, a.lat, a.lon)) return false;
      if (windowMs !== null && Date.now() - a.timestampMs > windowMs) return false;
      if (satId && a.satId !== satId) return false;
      return true;
    },
    matchSat(sat, alerts) {
      if (satId && sat.id !== satId) return false;
      if (role && sat.role !== role) return false;
      if (status && sat.status !== status) return false;
      if (place && !bboxContains(place.bbox, sat.lat, sat.lon)) {
        // Sat may be elsewhere but still relevant if it has a matching alert in the place
        const hasMatch = alerts.some(a => a.satId === sat.id && bboxContains(place!.bbox, a.lat, a.lon));
        if (!hasMatch) return false;
      }
      if (rule) {
        // A sat is "matching" if it has ever reported this class
        const hasMatch = alerts.some(a => a.satId === sat.id && alertMatchesRule(a, rule!));
        if (!hasMatch) return false;
      }
      return true;
    }
  };
}

function bboxContains(bbox: [number, number, number, number], lat: number, lon: number): boolean {
  const [lat0, lon0, lat1, lon1] = bbox;
  return lat >= lat0 && lat <= lat1 && lon >= lon0 && lon <= lon1;
}

function alertMatchesRule(a: FleetAlert, rule: string): boolean {
  const r = a.rule.toLowerCase();
  if (rule === 'fire') return r.includes('fire');
  if (rule === 'water') return r.includes('water') || r.includes('flood');
  if (rule === 'cloud') return r.includes('cloud');
  if (rule === 'anomaly') return r.includes('anomaly') || r.includes('edge_anomaly');
  if (rule === 'develop') return r.includes('developed');
  if (rule === 'natural') return r.includes('natural');
  return true;
}

// Try to find a satellite callsign in the query by matching against the
// actual fleet roster. Handles "Cooper", "COOPER", "hal 9000", "hal-9000".
function matchSatCallsign(q: string): string | null {
  const lc = q.toLowerCase();
  const stripped = lc.replace(/[\s-]+/g, '');
  for (const sat of getFleet()) {
    const id = sat.id.toLowerCase();
    const idStripped = id.replace(/[\s-]+/g, '');
    // Require word-boundary match so "leia" doesn't false-positive on a
    // longer word, but allow space/hyphen normalization for HAL-9000.
    if (containsWord(lc, id) || containsWord(stripped, idStripped)) return sat.id;
  }
  return null;
}

function containsWord(haystack: string, needle: string): boolean {
  if (needle.includes(' ')) return haystack.includes(needle);
  // word boundary match — avoids "us" matching inside "discuss"
  const rx = new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
  return rx.test(haystack);
}
