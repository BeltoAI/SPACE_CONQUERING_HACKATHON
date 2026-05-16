// FleetOverview — full-screen mission roster page.
//
// Opened from the mission console (CONSOLE → FLEET OVERVIEW). This page is
// intentionally NOT a drawer tab — at 18+ satellites the per-sat cards need
// real horizontal space for the telemetry grid + orbit + counters columns.
//
// Everything here is driven by the live fleet singleton in lib/fleet.ts:
//   - subscribeFleet  → re-render on add/remove
//   - setInterval     → re-render every 1.5s for live telemetry
//   - addSatellite    → push a new sat (also reflected on the globe)
//   - removeSatellite → drop a sat from the fleet
//
// The "Add Satellite" form takes a callsign + role + orbit (altitude /
// inclination / RAAN / phase) and auto-derives the orbital period from
// Kepler's third law for a circular orbit. The new satellite immediately
// shows up on the world view because FleetGlobe also subscribes to fleet
// changes.

import { useEffect, useMemo, useState } from 'react';
import {
  subscribeFleet,
  addSatellite,
  removeSatellite,
  SAT_STATUS_COLOR,
  SAT_STATUS_LABEL,
  STATUS_RULES,
  fleetAlerts,
  type Satellite,
  type SatRole,
  type FleetAlert
} from '../lib/fleet';

interface Props {
  onBack: () => void;
  onOpenSatellite: (id: string) => void;
}

export default function FleetOverview({ onBack, onOpenSatellite }: Props) {
  const [fleet, setFleet] = useState<Satellite[]>([]);
  const [, setTick] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);

  useEffect(() => subscribeFleet(setFleet), []);
  useEffect(() => fleetAlerts.subscribe(setAlerts), []);

  // Re-render every 1.5s so telemetry numbers (which are mutated in place
  // inside the fleet array) repaint on screen.
  useEffect(() => {
    const i = window.setInterval(() => setTick(t => (t + 1) % 1_000_000), 1500);
    return () => window.clearInterval(i);
  }, []);

  // Roll-up KPI counters at the top.
  const kpi = useMemo(() => {
    let nominal = 0, acquiring = 0, lost = 0;
    let battSum = 0, fuelSum = 0;
    let infTotal = 0, alertTotal = 0;
    let rawSum = 0, paySum = 0;
    for (const s of fleet) {
      if (s.status === 'NOMINAL') nominal++;
      else if (s.status === 'LOST') lost++;
      else acquiring++;
      battSum += s.battery;
      fuelSum += s.fuel;
      infTotal += s.inferenceCount;
      alertTotal += s.alertCount;
      rawSum += s.bytesRawTotal;
      paySum += s.bytesPayloadTotal;
    }
    return {
      total: fleet.length,
      nominal,
      acquiring,
      lost,
      avgBattery: fleet.length ? battSum / fleet.length : 0,
      avgFuel: fleet.length ? fuelSum / fleet.length : 0,
      totalInferences: infTotal,
      totalAlerts: alertTotal,
      rawSum,
      paySum,
      saved: Math.max(0, rawSum - paySum)
    };
  }, [fleet]);

  return (
    <div className="h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top,#0c0c18,#000000_70%)] text-white">
      {/* --- Header ------------------------------------------------------- */}
      <div className="sticky top-0 z-20 bg-black/70 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[1280px] mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/70 hover:text-white transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[11px] tracking-[0.18em]">BACK</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-amber/15 border border-amber/40 flex items-center justify-center">
              <span className="text-amber font-bold text-[12px] tracking-widest2">B</span>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.18em] text-white/40">MISSION CONSOLE</div>
              <div className="text-base font-semibold tracking-wider text-white/95">FLEET OVERVIEW</div>
            </div>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setShowAdd(s => !s)}
            className="text-[11px] tracking-widest px-3 py-1.5 rounded-md border border-amber/40 text-amber bg-amber/10 hover:bg-amber/20 transition"
          >
            {showAdd ? 'CANCEL' : '+ ADD SATELLITE'}
          </button>
        </div>

        {/* KPI strip */}
        <div className="max-w-[1280px] mx-auto px-6 pb-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-[11px]">
          <Kpi label="TOTAL"      value={String(kpi.total)} />
          <Kpi label="NOMINAL"    value={String(kpi.nominal)}   color={SAT_STATUS_COLOR.NOMINAL} />
          <Kpi label="ACQUIRING"  value={String(kpi.acquiring)} color={SAT_STATUS_COLOR.ACQUIRING} />
          <Kpi label="LOST"       value={String(kpi.lost)}      color={SAT_STATUS_COLOR.LOST} />
          <Kpi label="INFERENCES" value={String(kpi.totalInferences)} />
          <Kpi label="DATA SAVED" value={formatBytes(kpi.saved)} />
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-6 py-6">
        {/* --- Add satellite form ---------------------------------------- */}
        {showAdd && (
          <AddSatelliteForm
            onCancel={() => setShowAdd(false)}
            onAdded={() => setShowAdd(false)}
          />
        )}

        {/* --- Status-rule legend ---------------------------------------- */}
        <details className="mb-5 border border-white/10 rounded-lg bg-white/[0.02]">
          <summary className="cursor-pointer px-4 py-3 text-[11px] tracking-[0.18em] text-white/55 hover:text-white">
            STATUS LEGEND — WHAT NOMINAL / ACQUIRING / LOST ACTUALLY MEAN
          </summary>
          <div className="px-4 pb-3 grid md:grid-cols-3 gap-3 text-[11px]">
            {STATUS_RULES.map(r => {
              const c = SAT_STATUS_COLOR[r.status];
              return (
                <div key={r.status} className="rounded-md border p-3" style={{ borderColor: `${c}33`, background: `${c}07` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}88` }} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded tracking-widest" style={{ color: c, border: `1px solid ${c}`, background: `${c}14` }}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-white/70 mb-1">{r.summary}</div>
                  <div className="text-white/45 text-[10px]">{r.conditions.join(' · ')}</div>
                </div>
              );
            })}
          </div>
        </details>

        {/* --- Sat cards -------------------------------------------------- */}
        {fleet.length === 0 && (
          <div className="px-5 py-8 text-xs text-white/30">No satellites in the fleet. Click <span className="text-amber">+ ADD SATELLITE</span> above to launch one.</div>
        )}

        <div className="grid gap-3">
          {fleet.map(sat => (
            <SatelliteCard
              key={sat.id}
              sat={sat}
              alerts={alerts}
              onOpen={() => onOpenSatellite(sat.id)}
              onRemove={() => {
                if (confirm(`Remove ${sat.id} from the fleet? It will disappear from the world view immediately.`)) {
                  removeSatellite(sat.id);
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- KPI tile ------------------------------------------------------------

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/40 px-3 py-2">
      <div className="text-[9px] tracking-[0.18em] text-white/40">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: color || '#ffffff' }}>{value}</div>
    </div>
  );
}

// --- Per-satellite detailed card -----------------------------------------

function SatelliteCard({
  sat, alerts, onOpen, onRemove
}: {
  sat: Satellite;
  alerts: FleetAlert[];
  onOpen: () => void;
  onRemove: () => void;
}) {
  const c = SAT_STATUS_COLOR[sat.status];
  const battPct = Math.round(sat.battery * 100);
  const fuelPct = Math.round(sat.fuel * 100);
  const saved = sat.bytesRawTotal > sat.bytesPayloadTotal
    ? sat.bytesRawTotal - sat.bytesPayloadTotal
    : 0;
  const lastContact = sat.lastContactSec < 60
    ? `${sat.lastContactSec.toFixed(0)}s ago`
    : `${Math.floor(sat.lastContactSec / 60)}m ${Math.floor(sat.lastContactSec % 60)}s ago`;

  // Most recent 3 alerts attributed to this sat — quick context for the operator.
  const recent = useMemo(
    () => alerts.filter(a => a.satId === sat.id).slice(0, 3),
    [alerts, sat.id]
  );

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition p-4">
      {/* header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 10px ${c}aa` }} />
        <button
          onClick={onOpen}
          className="text-base font-semibold text-white/95 tracking-wider hover:text-amber transition"
          title="Open Analyze page"
        >
          {sat.id}
        </button>
        <span className="text-[10px] px-2 py-0.5 rounded tracking-widest text-white/55 border border-white/15">
          {sat.role}
        </span>
        <span
          className="text-[10px] px-2 py-0.5 rounded tracking-widest"
          style={{ color: c, border: `1px solid ${c}`, background: `${c}14` }}
        >
          {SAT_STATUS_LABEL[sat.status].toUpperCase()}
        </span>
        <span className="text-[10px] text-white/35 tracking-widest tabular-nums">NORAD {sat.noradId}</span>
        {sat.userAdded && (
          <span className="text-[9px] text-amber/80 tracking-widest">USER-ADDED</span>
        )}
        <div className="flex-1" />
        <button
          onClick={onOpen}
          className="text-[10px] tracking-widest px-2.5 py-1 rounded text-white/55 hover:text-white border border-white/15 hover:border-white/30 transition"
        >
          ANALYZE →
        </button>
        <button
          onClick={onRemove}
          className="text-[10px] tracking-widest px-2.5 py-1 rounded text-white/40 hover:text-red-400 hover:bg-red-400/10 transition border border-transparent hover:border-red-400/30"
          title="Remove from fleet"
        >
          REMOVE
        </button>
      </div>

      {/* telemetry grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric label="BATTERY"      value={`${battPct}%`}                    bar={sat.battery} barColor={sat.battery > 0.3 ? '#7ee787' : '#ffb000'} />
        <Metric label="FUEL"         value={`${fuelPct}%`}                    bar={sat.fuel}    barColor={sat.fuel > 0.2 ? '#7ee787' : '#ffb000'} />
        <Metric label="TEMP"         value={`${sat.tempC.toFixed(1)}°C`} />
        <Metric label="UPLINK"       value={`${sat.uplinkMbps.toFixed(0)} Mbps`} />
        <Metric label="POSITION"     value={`${sat.lat.toFixed(2)}°, ${sat.lon.toFixed(2)}°`} />
        <Metric label="ALTITUDE"     value={`${sat.altKm.toFixed(0)} km`} />
        <Metric label="LAST CONTACT" value={lastContact} />
        <Metric label="LIFE LEFT"    value={`${sat.lifespanYears.toFixed(1)} yr`} />
      </div>

      {/* orbit + counters + recent alerts */}
      <div className="grid md:grid-cols-3 gap-4 pt-3 border-t border-white/5 text-[11px]">
        <div>
          <div className="text-[10px] tracking-[0.18em] text-white/35 mb-1">ORBIT</div>
          <div className="text-white/70 tabular-nums leading-relaxed">
            alt {sat.orbit.altitudeKm} km · incl {sat.orbit.inclinationDeg.toFixed(1)}°<br />
            RAAN {sat.orbit.raanDeg.toFixed(0)}° · phase {sat.orbit.phaseDeg.toFixed(0)}°<br />
            period {sat.orbit.periodMin} min
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.18em] text-white/35 mb-1">MISSION COUNTERS</div>
          <div className="text-white/70 tabular-nums leading-relaxed">
            {sat.inferenceCount} inferences · {sat.alertCount} alerts<br />
            raw {formatBytes(sat.bytesRawTotal)}<br />
            payload {formatBytes(sat.bytesPayloadTotal)} ({formatBytes(saved)} saved)
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.18em] text-white/35 mb-1">RECENT ALERTS</div>
          {recent.length === 0 ? (
            <div className="text-white/35 italic">none yet</div>
          ) : (
            <ul className="text-white/70 leading-relaxed">
              {recent.map(a => (
                <li key={a.id} className="truncate">
                  <span className="text-white/35 tabular-nums">{new Date(a.timestampMs).toLocaleTimeString()}</span>
                  {' '}<span className="text-white/85">{a.rule}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, bar, barColor }: { label: string; value: string; bar?: number; barColor?: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-[0.18em] text-white/30 mb-0.5">{label}</div>
      <div className="text-[12px] text-white/90 tabular-nums">{value}</div>
      {typeof bar === 'number' && (
        <div className="h-[3px] mt-1 rounded bg-white/5 overflow-hidden">
          <div className="h-full rounded" style={{ width: `${Math.round(bar * 100)}%`, background: barColor || '#7ee787' }} />
        </div>
      )}
    </div>
  );
}

// --- Add-satellite form --------------------------------------------------

function AddSatelliteForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: () => void }) {
  const [id, setId] = useState('');
  const [role, setRole] = useState<SatRole>('OPTICAL');
  const [altKm, setAltKm] = useState(600);
  const [inclDeg, setInclDeg] = useState(97.8);
  const [raanDeg, setRaanDeg] = useState(0);
  const [phaseDeg, setPhaseDeg] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Kepler's third law for a circular orbit at altitude `altKm`.
  //   T = 2π √(r³/μ),  μ_earth = 398600.4418 km³/s²,  r = R_earth + altKm
  const periodMin = useMemo(() => {
    const r = 6378.137 + altKm;
    const mu = 398600.4418;
    const periodSec = 2 * Math.PI * Math.sqrt((r * r * r) / mu);
    return Math.max(1, Math.round(periodSec / 60));
  }, [altKm]);

  const submit = () => {
    const trimmed = id.trim().toUpperCase();
    if (!trimmed) { setError('Callsign required'); return; }
    if (trimmed.length > 20) { setError('Callsign too long (max 20 chars)'); return; }
    if (altKm < 160 || altKm > 40000) { setError('Altitude must be 160–40000 km'); return; }
    if (inclDeg < 0 || inclDeg > 180) { setError('Inclination must be 0–180°'); return; }
    try {
      addSatellite({
        id: trimmed,
        role,
        orbit: {
          altitudeKm: altKm,
          inclinationDeg: inclDeg,
          raanDeg: ((raanDeg % 360) + 360) % 360,
          phaseDeg: ((phaseDeg % 360) + 360) % 360,
          periodMin
        }
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add satellite');
    }
  };

  return (
    <div className="mb-5 p-5 rounded-lg border border-amber/30 bg-amber/[0.04]">
      <div className="text-[10px] tracking-[0.18em] text-amber mb-3">NEW SATELLITE — LAUNCH PARAMETERS</div>
      <div className="grid md:grid-cols-3 gap-3 mb-3">
        <Field label="CALLSIGN" hint="any short identifier — e.g. SPOCK, GROOT, R2D2">
          <input type="text" value={id} onChange={e => setId(e.target.value)} placeholder="e.g. SPOCK" className={inputCls + " tracking-wider"} />
        </Field>
        <Field label="ROLE">
          <select value={role} onChange={e => setRole(e.target.value as SatRole)} className={inputCls + " tracking-wider"}>
            <option value="OPTICAL">OPTICAL — visible imaging</option>
            <option value="INFRARED">INFRARED — heat / thermal</option>
            <option value="SAR">SAR — radar (all-weather)</option>
            <option value="COMMS">COMMS — relay</option>
            <option value="WEATHER">WEATHER — geostationary</option>
          </select>
        </Field>
        <Field label="ALTITUDE (KM)" hint="LEO 500–800 · MEO 8000 · GEO 35786">
          <input type="number" min={160} max={40000} value={altKm} onChange={e => setAltKm(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="INCLINATION (DEG)" hint="0 equatorial · 53 mid · 87 polar SAR · 98 sun-sync">
          <input type="number" min={0} max={180} step={0.1} value={inclDeg} onChange={e => setInclDeg(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="RAAN (DEG)" hint="longitude of orbit plane (0–360)">
          <input type="number" min={0} max={360} step={1} value={raanDeg} onChange={e => setRaanDeg(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="PHASE (DEG)" hint="position along orbit at t=0">
          <input type="number" min={0} max={360} step={1} value={phaseDeg} onChange={e => setPhaseDeg(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>
      <div className="text-[10px] text-white/45 mb-3">
        Derived period: <span className="tabular-nums text-white/80">{periodMin} min</span>
        {' '}— from Kepler's third law for a circular orbit at {altKm} km.
      </div>
      {error && <div className="text-[11px] text-red-400 mb-2">{error}</div>}
      <div className="flex gap-2">
        <button onClick={submit} className="text-[11px] tracking-widest px-3 py-1.5 rounded-md bg-amber/20 border border-amber/50 text-amber hover:bg-amber/30 transition">
          LAUNCH
        </button>
        <button onClick={onCancel} className="text-[11px] tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-white/55 hover:text-white hover:bg-white/[0.05] transition">
          CANCEL
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[12px] text-white tabular-nums focus:border-amber/60 outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] tracking-[0.18em] text-white/40">{label}</span>
      {children}
      {hint && <span className="text-[9px] text-white/30">{hint}</span>}
    </label>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
