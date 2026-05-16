// Live mission-control alert feed shown at the bottom of the dashboard.
// New alerts slide in from the top; CRITICAL items pulse.

import { useEffect, useState } from 'react';
import { fleetAlerts, type FleetAlert } from '../lib/fleet';

interface Props {
  onSelectAlert: (a: FleetAlert) => void;
  selectedAlertId: string | null;
}

function fmtAge(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return `${s.toFixed(0)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s ago`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
}

function sevColor(s: FleetAlert['severity']): string {
  return s === 'CRITICAL' ? '#ff3b3b' : s === 'HIGH' ? '#ffb000' : s === 'WARNING' ? '#a78bfa' : '#5fb3ff';
}

export default function AlertTicker({ onSelectAlert, selectedAlertId }: Props) {
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [, force] = useState(0);

  useEffect(() => fleetAlerts.subscribe(setAlerts), []);
  useEffect(() => {
    const i = window.setInterval(() => force(t => (t + 1) % 1_000_000), 1000);
    return () => window.clearInterval(i);
  }, []);

  return (
    <div className="border-t border-white/5 bg-black/30 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-xs tracking-[0.2em] text-white/50">MISSION CONTROL · LIVE FEED</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded border tracking-wider"
            style={{
              color: alerts.length > 0 ? '#ffb000' : '#7ee787',
              borderColor: alerts.length > 0 ? '#ffb000' : '#7ee787',
              background: alerts.length > 0 ? '#ffb00014' : '#7ee78714'
            }}
          >
            {alerts.length} ACTIVE
          </span>
        </div>
        <button
          className="text-[10px] tracking-wider text-white/40 hover:text-white/80 transition"
          onClick={() => fleetAlerts.clear()}
        >
          CLEAR
        </button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[180px]">
        {alerts.length === 0 && (
          <div className="px-4 py-6 text-xs text-white/30">No alerts. Fleet operating nominally.</div>
        )}
        {alerts.map(a => {
          const isSelected = a.id === selectedAlertId;
          const isCritical = a.severity === 'CRITICAL';
          const age = Date.now() - a.timestampMs;
          return (
            <button
              key={a.id}
              onClick={() => onSelectAlert(a)}
              className={`w-full text-left grid grid-cols-12 gap-3 px-4 py-2 border-b border-white/5 hover:bg-white/[0.03] transition ${isSelected ? 'bg-white/[0.04]' : ''}`}
            >
              <div className="col-span-1 flex items-center">
                <span
                  className={`w-2 h-2 rounded-full ${isCritical ? 'animate-pulse' : ''}`}
                  style={{
                    background: sevColor(a.severity),
                    boxShadow: `0 0 8px ${sevColor(a.severity)}`
                  }}
                />
              </div>
              <div className="col-span-2 text-xs font-semibold tabular-nums" style={{ color: sevColor(a.severity) }}>
                {a.severity}
              </div>
              <div className="col-span-2 text-xs text-white/80">{a.satId}</div>
              <div className="col-span-3 text-xs text-white/60">{a.rule}</div>
              <div className="col-span-2 text-xs text-white/40 tabular-nums">
                {a.lat.toFixed(1)}°, {a.lon.toFixed(1)}°
              </div>
              <div className="col-span-2 text-xs text-white/40 text-right tabular-nums">{fmtAge(age)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
