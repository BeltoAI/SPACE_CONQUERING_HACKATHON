// OpsPanel — always-visible operations sidebar (right edge of the dashboard).
//
// Cofounder spec, May 2026:
//   1. Fleet status and alert severity are *two different concepts* with two
//      different color systems. Don't bleed them together.
//   2. Top KPI ribbon = fleet health counters (Nominal / Acquiring / Lost +
//      Active Alerts), and the counts must actually update as the fleet
//      ticks.
//   3. Fleet list shows one row per satellite with an explicit ALERTS column
//      so the operator knows which birds have open events.
//   4. Alerts list is its own section underneath — distinct, severity-coded.
//   5. Past alerts (history) lives in the CONSOLE drawer, not here.
//
// Click any row (sat or alert) → opens that satellite's Analyze page.

import { useEffect, useMemo, useState } from 'react';
import {
  fleetAlerts,
  getFleet,
  SAT_STATUS_COLOR,
  SAT_STATUS_LABEL,
  ALERT_SEVERITY_COLOR,
  type FleetAlert,
  type SatStatus,
  type AlertSeverity
} from '../lib/fleet';

interface Props {
  onSelectSat: (id: string) => void;
  highlightSatId?: string | null;
  filterSatIds?: Set<string> | null;
}

function fmtAge(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const SAT_STATUS_ORDER: Record<SatStatus, number> = {
  LOST: 0, ACQUIRING: 1, NOMINAL: 2
};
const ALERT_SEV_ORDER: Record<AlertSeverity, number> = {
  CRITICAL: 0, HIGH: 1, WARNING: 2, INFO: 3
};

export default function OpsPanel({ onSelectSat, highlightSatId, filterSatIds }: Props) {
  const fleet = useMemo(() => getFleet(), []);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  // tick is the live counter that forces recompute of fleet-derived
  // counters (status, alert-counts per sat) — the fleet array is mutated
  // in place by tickFleet, so React would otherwise miss the changes.
  const [tick, setTick] = useState(0);

  useEffect(() => fleetAlerts.subscribe(setAlerts), []);
  useEffect(() => {
    const i = window.setInterval(() => setTick(t => (t + 1) % 1_000_000), 1500);
    return () => window.clearInterval(i);
  }, []);

  // Active alerts: severity-sorted, newest first within severity.
  const visibleAlerts = useMemo(() => {
    const arr = [...alerts];
    arr.sort(
      (a, b) =>
        ALERT_SEV_ORDER[a.severity] - ALERT_SEV_ORDER[b.severity] ||
        b.timestampMs - a.timestampMs
    );
    return arr.slice(0, 12);
  }, [alerts]);

  // Alert count per satellite — drives the ALERTS column in the fleet list.
  const alertCountBySat = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alerts) m.set(a.satId, (m.get(a.satId) || 0) + 1);
    return m;
  }, [alerts]);

  // Fleet status counts (must depend on tick so they refresh as sats drift)
  const counts = useMemo(() => {
    const c: Record<SatStatus, number> = { NOMINAL: 0, ACQUIRING: 0, LOST: 0 };
    for (const s of fleet) c[s.status]++;
    return c;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, tick]);

  // Fleet list: sort worst-first.
  const sortedFleet = useMemo(() => {
    const arr = [...fleet];
    arr.sort(
      (a, b) =>
        SAT_STATUS_ORDER[a.status] - SAT_STATUS_ORDER[b.status] ||
        (alertCountBySat.get(b.id) || 0) - (alertCountBySat.get(a.id) || 0) ||
        a.id.localeCompare(b.id)
    );
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, tick, alertCountBySat]);

  const critAlerts = visibleAlerts.filter(a => a.severity === 'CRITICAL').length;
  const highAlerts = visibleAlerts.filter(a => a.severity === 'HIGH').length;

  return (
    <div className="flex flex-col h-full bg-black/55 backdrop-blur-md border-l border-white/10 text-white">
      {/* Header — fleet KPI ribbon (HEALTH only — alert counts live below) */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] tracking-[0.22em] text-white/45">FLEET STATUS</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7ee787] animate-pulse" />
            <span className="text-[10px] tracking-widest text-[#7ee787]">LIVE</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <KPIBox label="NOMINAL"   value={counts.NOMINAL}   color={SAT_STATUS_COLOR.NOMINAL} />
          <KPIBox label="ACQUIRING" value={counts.ACQUIRING} color={SAT_STATUS_COLOR.ACQUIRING} />
          <KPIBox label="LOST"      value={counts.LOST}      color={SAT_STATUS_COLOR.LOST}      pulse={counts.LOST > 0} />
          <KPIBox label="ALERTS"    value={alerts.length}    color="#5fb3ff" />
        </div>
      </div>

      {/* Fleet status table */}
      <div className="flex flex-col min-h-0 flex-1 basis-1/2">
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/[0.04] shrink-0">
          <div className="text-[10px] tracking-[0.22em] text-white/45">FLEET ({fleet.length})</div>
          <div className="text-[10px] tracking-widest text-white/40">CLICK \u2192 ANALYZE</div>
        </div>
        {/* Column headers */}
        <div className="grid grid-cols-[14px_1fr_56px_72px_44px] gap-2 px-4 py-1.5 text-[9px] tracking-[0.18em] text-white/35 border-b border-white/[0.04] shrink-0">
          <span />
          <span>CALLSIGN</span>
          <span>ROLE</span>
          <span>STATUS</span>
          <span className="text-right">ALERTS</span>
        </div>
        <div className="overflow-y-auto flex-1">
          {sortedFleet.map(s => {
            const isHighlight = highlightSatId === s.id;
            const isFiltered = filterSatIds ? filterSatIds.has(s.id) : false;
            const dim = filterSatIds && !isFiltered;
            const alertN = alertCountBySat.get(s.id) || 0;
            const statusColor = SAT_STATUS_COLOR[s.status];
            return (
              <button
                key={s.id}
                onClick={() => onSelectSat(s.id)}
                className={`w-full grid grid-cols-[14px_1fr_56px_72px_44px] gap-2 px-4 py-1.5 text-left items-center border-b border-white/[0.03] hover:bg-white/[0.06] transition ${
                  isHighlight ? 'bg-white/[0.08]' : isFiltered ? 'bg-white/[0.04]' : ''
                } ${dim ? 'opacity-45' : ''}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                <span className="text-[12px] text-white/95 font-semibold tracking-wide truncate">{s.id}</span>
                <span className="text-[10px] text-white/45">{s.role}</span>
                <span className="text-[9px] tracking-widest" style={{ color: statusColor }}>{SAT_STATUS_LABEL[s.status].toUpperCase()}</span>
                <span className="text-right tabular-nums">
                  {alertN > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full text-[10px] font-bold" style={{ background: '#5fb3ff22', color: '#5fb3ff', border: '1px solid #5fb3ff55' }}>
                      {alertN}
                    </span>
                  ) : (
                    <span className="text-white/20 text-[11px]">\u2014</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active alerts */}
      <div className="flex flex-col min-h-0 flex-1 basis-1/2 border-t border-white/[0.06]">
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/[0.04] shrink-0">
          <div className="text-[10px] tracking-[0.22em] text-white/45">ACTIVE ALERTS</div>
          <div className="text-[10px] tracking-widest text-white/40">
            {critAlerts > 0 && <span style={{ color: ALERT_SEVERITY_COLOR.CRITICAL }}>{critAlerts} CRIT </span>}
            {highAlerts > 0 && <span style={{ color: ALERT_SEVERITY_COLOR.HIGH }}>{highAlerts} HIGH </span>}
            <span className="text-white/35">{alerts.length} TOTAL</span>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {visibleAlerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-white/35">
              <div className="text-[#7ee787] text-[13px] mb-1">All clear</div>
              No active alerts across the fleet.
            </div>
          ) : (
            visibleAlerts.map(a => {
              const isHighlight = filterSatIds ? filterSatIds.has(a.satId) : false;
              const color = ALERT_SEVERITY_COLOR[a.severity];
              return (
                <button
                  key={a.id}
                  onClick={() => onSelectSat(a.satId)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left border-b border-white/[0.04] hover:bg-white/[0.06] transition ${
                    isHighlight ? 'bg-white/[0.04]' : ''
                  }`}
                >
                  {/* Edge-detected thumbnail (the frame that tripped the rule) */}
                  <div
                    className="w-[44px] h-[30px] rounded overflow-hidden border shrink-0"
                    style={{ borderColor: `${color}40`, background: `${color}10` }}
                  >
                    {a.thumbnailDataUrl ? (
                      <img src={a.thumbnailDataUrl} alt={a.rule} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center ${a.severity === 'CRITICAL' ? 'animate-pulse' : ''}`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="text-white/95 font-semibold tracking-wide">{a.satId}</span>
                      <span className="text-white/45 text-[11px]">{a.rule}</span>
                    </div>
                    <div className="text-[10px] text-white/40 tabular-nums">
                      {a.lat.toFixed(1)}\u00b0, {a.lon.toFixed(1)}\u00b0 \u00b7 {fmtAge(Date.now() - a.timestampMs)} ago
                    </div>
                  </div>
                  <span className="text-[9px] tracking-widest" style={{ color }}>
                    {a.severity}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function KPIBox({ label, value, color, pulse }: { label: string; value: number; color: string; pulse?: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-md py-1.5">
      <div className="text-[18px] font-bold tabular-nums leading-tight" style={{ color }}>
        {value}
        {pulse && value > 0 && (
          <span className="inline-block ml-1 w-1.5 h-1.5 rounded-full align-middle animate-pulse" style={{ background: color }} />
        )}
      </div>
      <div className="text-[9px] tracking-widest text-white/40 mt-0.5">{label}</div>
    </div>
  );
}

