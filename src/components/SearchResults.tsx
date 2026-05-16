// Floating results card that appears below the search bar when a filter is
// active. Solves the previous problem where filtering for "water" just dimmed
// the globe with no explanation of what matched.
//
// Shows three concrete things:
//   1. A header line: "3 matches in Spain" (or similar)
//   2. A list of matching alerts (sat id, rule, location, time)
//   3. A list of matching satellites currently relevant
// If nothing matches, shows a clear empty state with an actionable hint.

import { useEffect, useMemo, useState } from 'react';
import {
  getFleet,
  fleetAlerts,
  type FleetAlert,
  type Satellite
} from '../lib/fleet';
import type { SearchFilter } from '../lib/nlsearch';

interface Props {
  filter: SearchFilter | null;
  onSelectSat: (id: string) => void;
}

function sevColor(s: FleetAlert['severity']): string {
  return s === 'CRITICAL' ? '#ff3b3b' : s === 'HIGH' ? '#ffb000' : s === 'WARNING' ? '#a78bfa' : '#5fb3ff';
}

function fmtAge(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return `${s.toFixed(0)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SearchResults({ filter, onSelectSat }: Props) {
  const fleet = useMemo(() => getFleet(), []);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [, force] = useState(0);

  useEffect(() => fleetAlerts.subscribe(setAlerts), []);
  useEffect(() => {
    const i = window.setInterval(() => force(t => (t + 1) % 1_000_000), 5000);
    return () => window.clearInterval(i);
  }, []);

  if (!filter) return null;

  const matchedAlerts = alerts.filter(a => filter.matchAlert(a));
  const matchedSats: Satellite[] = fleet.filter(s => filter.matchSat(s, alerts));

  const critical = matchedAlerts.filter(a => a.severity === 'CRITICAL').length;
  const high = matchedAlerts.filter(a => a.severity === 'HIGH').length;

  const empty = matchedAlerts.length === 0 && matchedSats.length === 0;

  return (
    <div className="w-[560px] max-w-[92vw] rounded-xl bg-black/85 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
      {/* Summary header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[10px] tracking-[0.2em] text-white/40">SEARCH RESULTS</div>
          <div className="text-sm text-white/90">{filter.human}</div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {critical > 0 && (
            <span className="px-2 py-0.5 rounded tracking-widest"
              style={{ color: '#ff5454', border: '1px solid #ff5454', background: '#ff545414' }}>
              {critical} CRITICAL
            </span>
          )}
          {high > 0 && (
            <span className="px-2 py-0.5 rounded tracking-widest"
              style={{ color: '#ffb000', border: '1px solid #ffb000', background: '#ffb00014' }}>
              {high} HIGH
            </span>
          )}
          <span className="px-2 py-0.5 rounded tracking-widest text-white/55 border border-white/15 bg-white/[0.03]">
            {matchedAlerts.length} EVENT{matchedAlerts.length === 1 ? '' : 'S'}
          </span>
          <span className="px-2 py-0.5 rounded tracking-widest text-white/55 border border-white/15 bg-white/[0.03]">
            {matchedSats.length} SAT{matchedSats.length === 1 ? '' : 'S'}
          </span>
        </div>
      </div>

      {empty && (
        <div className="px-4 py-5 text-[12px] text-white/55 leading-relaxed">
          <div className="text-white/75 mb-1">No matches for this query.</div>
          <div className="text-white/45">
            Try broadening the query (e.g. drop the place name), or analyze a frame on a satellite
            so the fleet has something to report. Open a satellite → Analyze → run a sample.
          </div>
        </div>
      )}

      {!empty && (
        <div className="max-h-[360px] overflow-y-auto">
          {matchedAlerts.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-[10px] tracking-[0.18em] text-white/35 border-b border-white/[0.04] bg-white/[0.015]">
                EVENTS
              </div>
              {matchedAlerts.map(a => (
                <button
                  key={a.id}
                  onClick={() => onSelectSat(a.satId)}
                  className="w-full grid grid-cols-12 gap-2 px-4 py-2 text-left border-b border-white/[0.04] hover:bg-white/[0.05] transition items-center"
                >
                  <div className="col-span-1 flex items-center">
                    <span className={`w-1.5 h-1.5 rounded-full ${a.severity === 'CRITICAL' ? 'animate-pulse' : ''}`}
                      style={{ background: sevColor(a.severity), boxShadow: `0 0 6px ${sevColor(a.severity)}` }} />
                  </div>
                  <div className="col-span-2 text-[11px] font-semibold tracking-wider"
                    style={{ color: sevColor(a.severity) }}>
                    {a.severity}
                  </div>
                  <div className="col-span-3 text-[11px] text-white/85">{a.satId}</div>
                  <div className="col-span-3 text-[11px] text-white/55">{a.rule}</div>
                  <div className="col-span-2 text-[11px] text-white/40 tabular-nums text-right">
                    {a.lat.toFixed(1)}°, {a.lon.toFixed(1)}°
                  </div>
                  <div className="col-span-1 text-[11px] text-white/35 tabular-nums text-right">
                    {fmtAge(Date.now() - a.timestampMs)}
                  </div>
                </button>
              ))}
            </>
          )}

          {matchedSats.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-[10px] tracking-[0.18em] text-white/35 border-b border-white/[0.04] bg-white/[0.015]">
                SATELLITES
              </div>
              {matchedSats.slice(0, 12).map(sat => {
                const c = sat.status === 'CRITICAL' ? '#ff5454' :
                          sat.status === 'DEGRADED' ? '#ffb000' :
                          `hsl(${sat.hue}, 85%, 62%)`;
                return (
                  <button
                    key={sat.id}
                    onClick={() => onSelectSat(sat.id)}
                    className="w-full grid grid-cols-12 gap-2 px-4 py-2 text-left border-b border-white/[0.04] hover:bg-white/[0.05] transition items-center"
                  >
                    <div className="col-span-1 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full"
                        style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                    </div>
                    <div className="col-span-3 text-[11px] font-semibold text-white/90">{sat.id}</div>
                    <div className="col-span-2 text-[11px] text-white/55">{sat.role}</div>
                    <div className="col-span-2 text-[11px] tabular-nums"
                      style={{ color: sat.battery < 0.25 ? '#ff5454' : '#7ee787' }}>
                      batt {Math.round(sat.battery * 100)}%
                    </div>
                    <div className="col-span-4 text-[11px] text-white/40 tabular-nums text-right">
                      {sat.lat.toFixed(1)}°, {sat.lon.toFixed(1)}°
                    </div>
                  </button>
                );
              })}
              {matchedSats.length > 12 && (
                <div className="px-4 py-2 text-[10px] text-white/35">
                  + {matchedSats.length - 12} more
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
