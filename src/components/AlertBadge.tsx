// Compact alert badge — single dot on the dashboard that expands on hover or
// click into a slim event feed. Replaces the previous bulky full-width
// ticker so the globe stays the focal point.

import { useEffect, useRef, useState } from 'react';
import { fleetAlerts, type FleetAlert } from '../lib/fleet';
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
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function AlertBadge({ filter, onSelectSat }: Props) {
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => fleetAlerts.subscribe(setAlerts), []);
  useEffect(() => {
    const i = window.setInterval(() => force(t => (t + 1) % 1_000_000), 1000);
    return () => window.clearInterval(i);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const visible = filter ? alerts.filter(a => filter.matchAlert(a)) : alerts;
  const critical = visible.filter(a => a.severity === 'CRITICAL').length;
  const high = visible.filter(a => a.severity === 'HIGH').length;
  const pulse = critical > 0;
  const tone = critical > 0 ? '#ff3b3b' : high > 0 ? '#ffb000' : '#7ee787';

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/15 rounded-full px-3 py-2 hover:bg-black/80 transition"
      >
        <span
          className={`w-2 h-2 rounded-full ${pulse ? 'animate-pulse' : ''}`}
          style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
        />
        <span className="text-[11px] tracking-widest text-white/80">
          {visible.length} ALERT{visible.length === 1 ? '' : 'S'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[420px] max-h-[420px] overflow-y-auto rounded-xl bg-black/85 backdrop-blur-md border border-white/10 shadow-2xl">
          <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] tracking-[0.2em] text-white/50">LIVE FEED</span>
            <button
              onClick={() => fleetAlerts.clear()}
              className="text-[10px] tracking-widest text-white/40 hover:text-white/80"
            >
              CLEAR
            </button>
          </div>
          {visible.length === 0 && (
            <div className="px-4 py-6 text-xs text-white/30">No matching alerts.</div>
          )}
          {visible.map(a => (
            <button
              key={a.id}
              onClick={() => { onSelectSat(a.satId); setOpen(false); }}
              className="w-full text-left grid grid-cols-12 gap-2 px-4 py-2 border-b border-white/5 hover:bg-white/[0.04] transition"
            >
              <div className="col-span-1 flex items-center">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${a.severity === 'CRITICAL' ? 'animate-pulse' : ''}`}
                  style={{ background: sevColor(a.severity), boxShadow: `0 0 6px ${sevColor(a.severity)}` }}
                />
              </div>
              <div className="col-span-3 text-[11px] font-semibold" style={{ color: sevColor(a.severity) }}>
                {a.severity}
              </div>
              <div className="col-span-3 text-[11px] text-white/85">{a.satId}</div>
              <div className="col-span-3 text-[11px] text-white/55">{a.rule}</div>
              <div className="col-span-2 text-[11px] text-white/35 text-right tabular-nums">
                {fmtAge(Date.now() - a.timestampMs)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
