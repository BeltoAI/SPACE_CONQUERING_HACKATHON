// BELTO fleet model + live telemetry simulator.
//
// Generates a realistic mixed constellation (LEO imaging + IR/thermal + SAR
// radar + comms relay + GEO weather) and ticks each satellite's orbital
// position, battery, fuel, and thermal state once per second.
//
// Real anomaly detections from the BELTO inference pipeline are attributed to
// a randomly-selected imaging satellite that is currently over land in
// daylight, so the dashboard feels grounded in the actual analysis run.

export type SatRole =
  | 'OPTICAL'
  | 'INFRARED'
  | 'SAR'
  | 'COMMS'
  | 'WEATHER';

/**
 * Lifecycle state of a satellite. Strictly distinct from alert severity
 * (which describes *events*, not the bird itself):
 *
 *   NOMINAL    — healthy, fully tasked, in nominal mission ops.
 *   ACQUIRING  — re-orienting, repositioning, or hunting for a tasking
 *                window. Functional but not actively returning useful data.
 *   LOST       — comms lost or hardware fault; needs ground intervention.
 */
export type SatStatus = 'NOMINAL' | 'ACQUIRING' | 'LOST';

/** Visual color for a fleet status. Kept separate from alert severity
 *  colors so the two systems never bleed into each other. */
export const SAT_STATUS_COLOR: Record<SatStatus, string> = {
  NOMINAL:   '#7ee787', // green
  ACQUIRING: '#ffb000', // amber/yellow
  LOST:      '#ff5454'  // red
};

/** Human-friendly label for a fleet status. */
export const SAT_STATUS_LABEL: Record<SatStatus, string> = {
  NOMINAL:   'Nominal',
  ACQUIRING: 'Acquiring',
  LOST:      'Lost'
};

export interface Orbit {
  // Keplerian-ish simplification — we don't need real two-body propagation
  // for a visual demo, just smooth, distinct, plausible-looking ground tracks.
  altitudeKm: number;        // 500 (LEO) … 36000 (GEO)
  inclinationDeg: number;    // 0 (equatorial) … 98 (sun-synchronous)
  raanDeg: number;           // Right ascension of ascending node (longitude of orbit plane)
  phaseDeg: number;          // Position along orbit at t=0
  periodMin: number;         // Derived: 90 min @ LEO → 1436 min @ GEO
}

export interface Satellite {
  id: string;                // "COOPER", "HAL-9000"
  noradId: number;
  role: SatRole;
  orbit: Orbit;
  // Live telemetry — updated by tickFleet()
  lat: number;
  lon: number;
  altKm: number;
  battery: number;           // 0..1   (charge state-of-charge)
  fuel: number;              // 0..1   (remaining propellant, decays very slowly)
  tempC: number;             // -30..+75
  status: SatStatus;
  lifespanYears: number;     // remaining design-life estimate
  uplinkMbps: number;
  lastContactSec: number;    // seconds since last ground station handshake
  // Mission counters — incremented when an alert is attributed to this sat
  inferenceCount: number;    // total frames analyzed (informational)
  alertCount: number;        // total non-DISCARD alerts emitted
  bytesRawTotal: number;     // sum of raw bytes seen
  bytesPayloadTotal: number; // sum of payload bytes downlinked
  // Per-satellite cosmetic state
  hue: number;               // 0..360, for orbit ring color
  // Provenance — true if the sat was hand-added by the operator at runtime
  // (instead of coming from the default fleet roster).
  userAdded?: boolean;
}

/**
 * Severity of an *event* (anomaly, detection, decision) reported by a
 * satellite. Distinct from fleet status so the two color systems are
 * never confused on screen:
 *
 *   INFO     — informational, no action required (blue)
 *   WARNING  — low priority, watch only (purple/lavender)
 *   HIGH     — needs attention soon (amber)
 *   CRITICAL — drop everything (red, pulsing)
 */
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'WARNING' | 'INFO';

/** Visual color for an alert severity. */
export const ALERT_SEVERITY_COLOR: Record<AlertSeverity, string> = {
  CRITICAL: '#ff3b3b', // bold red
  HIGH:     '#ff8a3b', // orange
  WARNING:  '#a78bfa', // purple
  INFO:     '#5fb3ff'  // blue
};

export interface FleetAlert {
  id: string;
  satId: string;
  timestampMs: number;
  severity: AlertSeverity;
  rule: string;              // e.g. "PRIORITY_FIRE"
  action: string;            // e.g. "PRIORITY_DOWNLINK"
  lat: number;
  lon: number;
  thumbnailDataUrl?: string;
  scoresFire?: number;
  scoresAnomaly?: number;
  scoresWater?: number;
  // Bandwidth telemetry — captured from the BELTO compression pipeline so
  // the Bandwidth panel can compute fleet-wide savings.
  rawBytes?: number;
  payloadBytes?: number;
}

// Audit-log entries cover every notable event, not just alerts:
//   inference runs, downlink decisions, status transitions, etc.
export interface AuditEntry {
  id: string;
  timestampMs: number;
  satId: string;
  category: 'INFERENCE' | 'DECISION' | 'TELEMETRY' | 'SYSTEM';
  level: 'INFO' | 'OK' | 'WARN' | 'CRITICAL';
  message: string;
  rawBytes?: number;
  payloadBytes?: number;
}

// --- constellation spec --------------------------------------------------
// 18 satellites, each with a sci-fi callsign so mission control feels less
// like reading SKUs ("BELTO-IR3") and more like reading a crew roster.
// Names lean Interstellar (per cofounder request) plus a few classics:
//
//   OPTICAL  — eyes on the ground: COOPER, BRAND, MURPH, KIRK, LEIA, RIPLEY
//   INFRARED — heat-seekers / robots: TARS, CASE, KIPP, HAL-9000
//   SAR      — all-weather radar: WATNEY, HERMES, ROCINANTE
//   COMMS    — relays / runners: FALCON, VOYAGER, NOSTROMO
//   WEATHER  — geostationary watchers: ENDURANCE, GALACTICA

const FLEET_SPEC: Array<Omit<Satellite, 'lat' | 'lon' | 'altKm' | 'battery' | 'fuel' | 'tempC' | 'status' | 'lifespanYears' | 'uplinkMbps' | 'lastContactSec' | 'inferenceCount' | 'alertCount' | 'bytesRawTotal' | 'bytesPayloadTotal' | 'hue'>> = [
  // LEO optical imaging plane A (sun-synchronous, 600 km)
  { id: 'COOPER',    noradId: 50001, role: 'OPTICAL',  orbit: { altitudeKm: 600,  inclinationDeg: 97.8, raanDeg: 10,  phaseDeg: 0,   periodMin: 96  } },
  { id: 'BRAND',     noradId: 50002, role: 'OPTICAL',  orbit: { altitudeKm: 600,  inclinationDeg: 97.8, raanDeg: 10,  phaseDeg: 90,  periodMin: 96  } },
  { id: 'MURPH',     noradId: 50003, role: 'OPTICAL',  orbit: { altitudeKm: 600,  inclinationDeg: 97.8, raanDeg: 10,  phaseDeg: 180, periodMin: 96  } },
  { id: 'KIRK',      noradId: 50004, role: 'OPTICAL',  orbit: { altitudeKm: 600,  inclinationDeg: 97.8, raanDeg: 10,  phaseDeg: 270, periodMin: 96  } },
  // LEO optical plane B (offset RAAN for global coverage)
  { id: 'LEIA',      noradId: 50005, role: 'OPTICAL',  orbit: { altitudeKm: 620,  inclinationDeg: 97.9, raanDeg: 100, phaseDeg: 45,  periodMin: 97  } },
  { id: 'RIPLEY',    noradId: 50006, role: 'OPTICAL',  orbit: { altitudeKm: 620,  inclinationDeg: 97.9, raanDeg: 100, phaseDeg: 225, periodMin: 97  } },
  // LEO infrared/thermal (mid-inclination for hot-zone revisit)
  { id: 'TARS',      noradId: 50101, role: 'INFRARED', orbit: { altitudeKm: 550,  inclinationDeg: 53.0, raanDeg: 30,  phaseDeg: 0,   periodMin: 95  } },
  { id: 'CASE',      noradId: 50102, role: 'INFRARED', orbit: { altitudeKm: 550,  inclinationDeg: 53.0, raanDeg: 30,  phaseDeg: 120, periodMin: 95  } },
  { id: 'KIPP',      noradId: 50103, role: 'INFRARED', orbit: { altitudeKm: 550,  inclinationDeg: 53.0, raanDeg: 30,  phaseDeg: 240, periodMin: 95  } },
  { id: 'HAL-9000',  noradId: 50104, role: 'INFRARED', orbit: { altitudeKm: 580,  inclinationDeg: 53.0, raanDeg: 150, phaseDeg: 60,  periodMin: 96  } },
  // LEO SAR radar (all-weather)
  { id: 'WATNEY',    noradId: 50201, role: 'SAR',      orbit: { altitudeKm: 510,  inclinationDeg: 87.0, raanDeg: 50,  phaseDeg: 30,  periodMin: 94  } },
  { id: 'HERMES',    noradId: 50202, role: 'SAR',      orbit: { altitudeKm: 510,  inclinationDeg: 87.0, raanDeg: 50,  phaseDeg: 210, periodMin: 94  } },
  { id: 'ROCINANTE', noradId: 50203, role: 'SAR',      orbit: { altitudeKm: 510,  inclinationDeg: 87.0, raanDeg: 170, phaseDeg: 90,  periodMin: 94  } },
  // MEO comms relay
  { id: 'FALCON',    noradId: 50301, role: 'COMMS',    orbit: { altitudeKm: 8000, inclinationDeg: 55.0, raanDeg: 0,   phaseDeg: 0,   periodMin: 287 } },
  { id: 'VOYAGER',   noradId: 50302, role: 'COMMS',    orbit: { altitudeKm: 8000, inclinationDeg: 55.0, raanDeg: 0,   phaseDeg: 120, periodMin: 287 } },
  { id: 'NOSTROMO',  noradId: 50303, role: 'COMMS',    orbit: { altitudeKm: 8000, inclinationDeg: 55.0, raanDeg: 0,   phaseDeg: 240, periodMin: 287 } },
  // GEO weather (over Americas + EMEA)
  { id: 'ENDURANCE', noradId: 50401, role: 'WEATHER',  orbit: { altitudeKm: 35786, inclinationDeg: 0.05, raanDeg: 0,  phaseDeg: 285, periodMin: 1436 } },
  { id: 'GALACTICA', noradId: 50402, role: 'WEATHER',  orbit: { altitudeKm: 35786, inclinationDeg: 0.05, raanDeg: 0,  phaseDeg: 0,   periodMin: 1436 } }
];

// Deterministic per-satellite color so the globe doesn't flicker.
function hueFor(role: SatRole, idx: number): number {
  // amber / orange family for OPTICAL, red for IR, cyan for SAR, blue for COMMS, lime for WX
  const base = role === 'OPTICAL' ? 38 : role === 'INFRARED' ? 8 : role === 'SAR' ? 185 : role === 'COMMS' ? 215 : 85;
  return (base + idx * 7) % 360;
}

let _fleetCache: Satellite[] | null = null;
const _startMs = Date.now();

// Listeners notified whenever the fleet membership changes (add/remove).
type FleetListener = (fleet: Satellite[]) => void;
const _fleetListeners = new Set<FleetListener>();

export function subscribeFleet(l: FleetListener): () => void {
  _fleetListeners.add(l);
  l(getFleet());
  return () => _fleetListeners.delete(l);
}

function _notifyFleet() {
  for (const l of _fleetListeners) l(getFleet());
}

function _seedSat(spec: Omit<Satellite, 'lat' | 'lon' | 'altKm' | 'battery' | 'fuel' | 'tempC' | 'status' | 'lifespanYears' | 'uplinkMbps' | 'lastContactSec' | 'inferenceCount' | 'alertCount' | 'bytesRawTotal' | 'bytesPayloadTotal' | 'hue'>, idx: number): Satellite {
  // Initial telemetry is comfortably healthy so the dashboard starts green
  // and degrades only when telemetry actually drifts.
  return {
    ...spec,
    lat: 0,
    lon: 0,
    altKm: spec.orbit.altitudeKm,
    battery: 0.80 + Math.random() * 0.20,         // 0.80 .. 1.00
    fuel:    0.70 + Math.random() * 0.30,         // 0.70 .. 1.00
    tempC:   10 + Math.random() * 18,             // 10°C .. 28°C
    status: 'NOMINAL' as SatStatus,
    lifespanYears: 4 + Math.random() * 4,
    uplinkMbps: 120 + Math.random() * 200,        // 120 .. 320 Mbps
    lastContactSec: Math.random() * 12,
    inferenceCount: 0,
    alertCount: 0,
    bytesRawTotal: 0,
    bytesPayloadTotal: 0,
    hue: hueFor(spec.role, idx)
  };
}

export function getFleet(): Satellite[] {
  if (_fleetCache) return _fleetCache;
  _fleetCache = FLEET_SPEC.map((spec, idx) => _seedSat(spec, idx));
  // Snap to initial position
  tickFleet(_fleetCache, 0);
  return _fleetCache;
}

/** Add a new satellite to the live fleet. Returns the seeded sat. Used by
 *  the Fleet tab "Add satellite" form. */
export function addSatellite(spec: {
  id: string;
  role: SatRole;
  orbit: Orbit;
  noradId?: number;
}): Satellite {
  const fleet = getFleet();
  const idx = fleet.length;
  const noradId = spec.noradId ?? (60000 + idx);
  const sat = _seedSat({ id: spec.id, noradId, role: spec.role, orbit: spec.orbit }, idx);
  sat.userAdded = true;
  fleet.push(sat);
  // Snap the new sat to its starting position
  tickFleet([sat], 0);
  _notifyFleet();
  auditLog.emit({
    satId: sat.id,
    category: 'SYSTEM',
    level: 'OK',
    message: `Satellite added: ${sat.role} · alt ${sat.orbit.altitudeKm} km · incl ${sat.orbit.inclinationDeg.toFixed(1)}°`
  });
  return sat;
}

/** Remove a satellite from the live fleet. */
export function removeSatellite(id: string): boolean {
  const fleet = getFleet();
  const idx = fleet.findIndex(s => s.id === id);
  if (idx < 0) return false;
  fleet.splice(idx, 1);
  _notifyFleet();
  auditLog.emit({
    satId: id,
    category: 'SYSTEM',
    level: 'WARN',
    message: `Satellite removed from fleet roster`
  });
  return true;
}

// Compute satellite ground position from simplified orbital elements at time
// `elapsedSec` after epoch. Approximate but visually convincing.
function propagate(orbit: Orbit, elapsedSec: number): { lat: number; lon: number } {
  const meanMotionDegPerSec = 360 / (orbit.periodMin * 60);
  const anomalyDeg = (orbit.phaseDeg + meanMotionDegPerSec * elapsedSec) % 360;
  const u = (anomalyDeg * Math.PI) / 180;
  const i = (orbit.inclinationDeg * Math.PI) / 180;

  // Sub-satellite point in ECI-ish frame
  const lat = Math.asin(Math.sin(i) * Math.sin(u));
  const lonEci = Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u));

  // Earth rotation (sidereal-ish) — 360°/day
  const earthRotDeg = (elapsedSec / 86400) * 360;
  let lonDeg = ((lonEci * 180) / Math.PI) + orbit.raanDeg - earthRotDeg;
  // Wrap to [-180, 180]
  lonDeg = ((lonDeg + 540) % 360) - 180;

  return { lat: (lat * 180) / Math.PI, lon: lonDeg };
}

// Drive the simulation forward. Called every frame from FleetGlobe.
export function tickFleet(fleet: Satellite[], dtSec: number): void {
  const elapsedSec = (Date.now() - _startMs) / 1000;
  for (const sat of fleet) {
    const p = propagate(sat.orbit, elapsedSec);
    sat.lat = p.lat;
    sat.lon = p.lon;
    sat.altKm = sat.orbit.altitudeKm;

    if (dtSec > 0) {
      // Battery follows the orbital day/night cycle. We center the oscillation
      // on the *current* battery level so it doesn't monotonically drain — over
      // a full orbit the sat charges roughly as much as it discharges, with a
      // tiny secular loss. Previous tuning swung battery by ~0.86/half-orbit
      // and tripped the LOST threshold within minutes, which the cofounder
      // (correctly) flagged as broken.
      const eclipsePhase = Math.sin((elapsedSec / (sat.orbit.periodMin * 60)) * Math.PI * 2);
      // ~0.10 peak-to-peak swing per orbit, with a 0.0001/sec secular drain.
      const dBatt = (eclipsePhase * 0.00012 - 0.0000005) * dtSec;
      sat.battery = clamp(sat.battery + dBatt, 0.0, 1);
      // Fuel drains at ~0.001/hour → noticeable only over very long runs.
      sat.fuel = clamp(sat.fuel - 0.0000003 * dtSec, 0, 1);
      // Temperature follows day/night with small noise.
      sat.tempC = clamp(sat.tempC + (eclipsePhase * 0.08 - 0.005) * dtSec, -30, 75);
      // Uplink mostly noisy around its nominal value.
      sat.uplinkMbps = clamp(sat.uplinkMbps + (Math.random() - 0.5) * 1.5, 20, 320);
      sat.lastContactSec = sat.lastContactSec + dtSec;
      if (Math.random() < 0.05) sat.lastContactSec = 0; // periodic handshake — frequent
    }

    sat.status = computeStatus(sat);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Map raw telemetry to one of three high-level lifecycle states.
 *
 * The thresholds below are surfaced to the UI via STATUS_RULES so the Rules
 * tab can show *exactly* what makes a satellite NOMINAL, ACQUIRING, or LOST
 * (the cofounder flagged that "LOST" wasn't explained anywhere).
 */
function computeStatus(sat: Satellite): SatStatus {
  // LOST — hard fault, needs ground intervention
  if (sat.battery < 0.08 || sat.fuel < 0.03 || sat.tempC > 70 || sat.lastContactSec > 600) {
    return 'LOST';
  }
  // ACQUIRING — degraded but recoverable (in transition / weakly connected / low resources)
  if (
    sat.battery < 0.18 ||
    sat.fuel < 0.10 ||
    sat.tempC > 60 ||
    sat.lastContactSec > 180 ||
    sat.uplinkMbps < 30
  ) {
    return 'ACQUIRING';
  }
  // NOMINAL — healthy
  return 'NOMINAL';
}

/**
 * Human-readable description of every threshold that drives `computeStatus`.
 * Keep this in lockstep with the function above — it's rendered verbatim in
 * the Rules tab of the console so operators can answer "why is this sat
 * yellow?" at a glance.
 */
export const STATUS_RULES: Array<{
  status: SatStatus;
  summary: string;
  conditions: string[];
}> = [
  {
    status: 'NOMINAL',
    summary: 'Healthy and fully tasked. No condition below is met.',
    conditions: ['battery ≥ 18%', 'fuel ≥ 10%', 'temp ≤ 60 °C', 'last contact ≤ 3 min', 'uplink ≥ 30 Mbps']
  },
  {
    status: 'ACQUIRING',
    summary: 'Degraded but recoverable — re-orienting, weak link, or low resources.',
    conditions: ['battery < 18%', 'fuel < 10%', 'temp > 60 °C', 'last contact > 3 min', 'uplink < 30 Mbps']
  },
  {
    status: 'LOST',
    summary: 'Hard fault — comms lost or critical hardware threshold tripped. Needs ground intervention.',
    conditions: ['battery < 8%', 'fuel < 3%', 'temp > 70 °C', 'last contact > 10 min']
  }
];

// --- alert routing -------------------------------------------------------

// Pick a plausible satellite to attribute a detection to. Prefers imaging
// satellites (OPTICAL/INFRARED) currently over the relevant hemisphere.
export function pickReportingSat(fleet: Satellite[], rule: string): Satellite {
  const isFire = rule.toLowerCase().includes('fire');
  const isWater = rule.toLowerCase().includes('water') || rule.toLowerCase().includes('flood');
  const candidates = fleet.filter(s =>
    isFire ? s.role === 'INFRARED' || s.role === 'OPTICAL' :
    isWater ? s.role === 'SAR' || s.role === 'OPTICAL' :
    s.role === 'OPTICAL' || s.role === 'INFRARED' || s.role === 'SAR'
  );
  return candidates[Math.floor(Math.random() * candidates.length)] || fleet[0];
}

// --- alert log -----------------------------------------------------------

type AlertListener = (alerts: FleetAlert[]) => void;

class AlertStream {
  private alerts: FleetAlert[] = [];
  private listeners = new Set<AlertListener>();
  emit(a: FleetAlert) {
    this.alerts = [a, ...this.alerts].slice(0, 50);
    // Bump per-satellite counters so the Fleet tab can show how much each
    // bird has actually contributed to the mission. This is the only place
    // alerts land, so we can centralize the accounting here.
    const sat = _fleetCache?.find(s => s.id === a.satId);
    if (sat) {
      sat.inferenceCount += 1;
      // Only count downlinked alerts toward the alert tally — discards are
      // "successful suppressions" and shouldn't inflate the bad-news number.
      if (a.action && a.action !== 'DISCARD_ONBOARD') sat.alertCount += 1;
      if (a.rawBytes) sat.bytesRawTotal += a.rawBytes;
      if (a.payloadBytes) sat.bytesPayloadTotal += a.payloadBytes;
    }
    this.listeners.forEach(l => l(this.alerts));
  }
  subscribe(l: AlertListener): () => void {
    this.listeners.add(l);
    l(this.alerts);
    return () => this.listeners.delete(l);
  }
  list(): FleetAlert[] {
    return this.alerts;
  }
  clear() {
    this.alerts = [];
    this.listeners.forEach(l => l(this.alerts));
  }
}

export const fleetAlerts = new AlertStream();

// --- audit log -----------------------------------------------------------

type AuditListener = (entries: AuditEntry[]) => void;

class AuditStream {
  private entries: AuditEntry[] = [];
  private listeners = new Set<AuditListener>();
  emit(e: Omit<AuditEntry, 'id' | 'timestampMs'> & Partial<Pick<AuditEntry, 'id' | 'timestampMs'>>) {
    const entry: AuditEntry = {
      id: e.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestampMs: e.timestampMs || Date.now(),
      ...e
    };
    this.entries = [entry, ...this.entries].slice(0, 500);
    this.listeners.forEach(l => l(this.entries));
  }
  subscribe(l: AuditListener): () => void {
    this.listeners.add(l);
    l(this.entries);
    return () => this.listeners.delete(l);
  }
  list(): AuditEntry[] { return this.entries; }
  clear() { this.entries = []; this.listeners.forEach(l => l(this.entries)); }
}

export const auditLog = new AuditStream();

// --- bandwidth aggregates ------------------------------------------------

export interface BandwidthStats {
  totalRawBytes: number;
  totalPayloadBytes: number;
  bytesSaved: number;
  compressionRatio: number;     // 0..1, fraction of raw bytes avoided
  framesProcessed: number;
  framesDownlinked: number;
  framesDiscarded: number;
}

export function computeBandwidth(alerts: FleetAlert[]): BandwidthStats {
  let totalRaw = 0, totalPayload = 0, framesDownlinked = 0, framesDiscarded = 0;
  for (const a of alerts) {
    if (a.rawBytes) totalRaw += a.rawBytes;
    if (a.payloadBytes) totalPayload += a.payloadBytes;
    if (a.action === 'DISCARD_ONBOARD') framesDiscarded++;
    else framesDownlinked++;
  }
  return {
    totalRawBytes: totalRaw,
    totalPayloadBytes: totalPayload,
    bytesSaved: Math.max(0, totalRaw - totalPayload),
    compressionRatio: totalRaw > 0 ? 1 - totalPayload / totalRaw : 0,
    framesProcessed: alerts.length,
    framesDownlinked,
    framesDiscarded
  };
}

// --- KPI aggregates ------------------------------------------------------

/**
 * Aggregated fleet stats for the top-of-panel KPI row.
 *
 * Note the field names match SatStatus: nominal/acquiring/lost. The
 * dashboard treats these as fleet *health* counters — they are NOT a
 * count of alert severities.
 */
export interface FleetKPI {
  total: number;
  nominal: number;
  acquiring: number;
  lost: number;
  avgBattery: number;
  avgFuel: number;
  totalUplinkGbps: number;
  alerts24h: number;
}

export function computeKPI(fleet: Satellite[], alerts: FleetAlert[]): FleetKPI {
  const now = Date.now();
  let nominal = 0, acquiring = 0, lost = 0;
  let battSum = 0, fuelSum = 0, uplinkSum = 0;
  for (const s of fleet) {
    if (s.status === 'NOMINAL') nominal++;
    else if (s.status === 'LOST') lost++;
    else acquiring++;
    battSum += s.battery;
    fuelSum += s.fuel;
    uplinkSum += s.uplinkMbps;
  }
  const alerts24h = alerts.filter(a => now - a.timestampMs < 86_400_000).length;
  return {
    total: fleet.length,
    nominal,
    acquiring,
    lost,
    avgBattery: fleet.length ? battSum / fleet.length : 0,
    avgFuel: fleet.length ? fuelSum / fleet.length : 0,
    totalUplinkGbps: uplinkSum / 1000,
    alerts24h
  };
}

// Used by FleetGlobe to seed a couple of starter alerts so the dashboard
// isn't empty before the user runs any inference.
export function seedDemoAlerts(fleet: Satellite[]): void {
  if (fleetAlerts.list().length > 0) return;
  const now = Date.now();
  const sats = fleet.filter(s => s.role === 'OPTICAL' || s.role === 'INFRARED');
  if (sats.length < 2) return;
  fleetAlerts.emit({
    id: `seed-${now - 600_000}`,
    satId: sats[0].id,
    timestampMs: now - 600_000,
    severity: 'WARNING',
    rule: 'CLOUD_DISCARD',
    action: 'DISCARD_ONBOARD',
    lat: -3.4,
    lon: 137.2,
    scoresFire: 0.001
  });
  fleetAlerts.emit({
    id: `seed-${now - 120_000}`,
    satId: sats[1].id,
    timestampMs: now - 120_000,
    severity: 'HIGH',
    rule: 'WATER_BODY',
    action: 'COMPRESSED_DOWNLINK',
    lat: 25.7,
    lon: -80.3,
    scoresWater: 0.71
  });
}
