// Bandwidth hero — the value-prop headline.
//
// Pinned bottom-left as a clean floating panel. Communicates the single
// most important thing about this product: how much bandwidth the fleet
// is saving by doing on-orbit triage instead of dumb downlink. Numbers
// animate as new alerts arrive.

import { useEffect, useMemo, useState } from 'react';
import {
  fleetAlerts,
  computeBandwidth,
  computeKPI,
  getFleet,
  type FleetAlert
} from '../lib/fleet';

function fmtBytes(b: number): { v: string; u: string } {
  if (b < 1024) return { v: b.toFixed(0), u: 'B' };
  if (b < 1024 * 1024) return { v: (b / 1024).toFixed(1), u: 'KB' };
  if (b < 1024 * 1024 * 1024) return { v: (b / (1024 * 1024)).toFixed(1), u: 'MB' };
  if (b < 1024 ** 4) return { v: (b / (1024 ** 3)).toFixed(2), u: 'GB' };
  return { v: (b / (1024 ** 4)).toFixed(2), u: 'TB' };
}

export default function BandwidthHero() {
  const fleet = useMemo(() => getFleet(), []);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);

  useEffect(() => fleetAlerts.subscribe(setAlerts), []);

  const bw = useMemo(() => computeBandwidth(alerts), [alerts]);
  const kpi = useMemo(() => computeKPI(fleet, alerts), [fleet, alerts]);

  const saved = fmtBytes(bw.bytesSaved);
  const raw = fmtBytes(bw.totalRawBytes);
  const compressionPct = Math.round(bw.compressionRatio * 100);

  return (
    <div className="bg-black/65 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-4 shadow-2xl w-[420px] max-w-[92vw]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.22em] text-white/45">ON-ORBIT TRIAGE</div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7ee787] animate-pulse" />
          <span className="text-[10px] tracking-widest text-[#7ee787]">LIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Bytes saved — the headline */}
        <div>
          <div className="text-[10px] tracking-widest text-white/40 mb-0.5">BANDWIDTH SAVED</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[34px] leading-none font-bold tabular-nums text-[#7ee787]">{saved.v}</span>
            <span className="text-[14px] text-[#7ee787]/80">{saved.u}</span>
          </div>
          <div className="text-[10px] text-white/45 mt-1 tabular-nums">
            of {raw.v} {raw.u} raw · <span className="text-[#7ee787]">{compressionPct}%</span> avoided
          </div>
        </div>

        {/* Frames triaged */}
        <div>
          <div className="text-[10px] tracking-widest text-white/40 mb-0.5">FRAMES TRIAGED</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[34px] leading-none font-bold tabular-nums text-white">{bw.framesProcessed}</span>
            <span className="text-[11px] text-white/45">on-orbit</span>
          </div>
          <div className="text-[10px] text-white/45 mt-1 tabular-nums">
            <span className="text-[#5fb3ff]">{bw.framesDownlinked}</span> downlinked ·{' '}
            <span className="text-white/55">{bw.framesDiscarded}</span> discarded
          </div>
        </div>
      </div>

      {/* Fleet ribbon */}
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-4 text-[11px]">
        <span>
          <span className="text-white/35 tracking-widest mr-1">FLEET</span>
          <span className="text-[#7ee787] tabular-nums">{kpi.nominal}</span>
          <span className="text-white/30 tabular-nums">/{kpi.total}</span>
        </span>
        <span className="w-px h-3 bg-white/10" />
        <span>
          <span className="text-white/35 tracking-widest mr-1">BATT</span>
          <span className="text-[#5fb3ff] tabular-nums">{Math.round(kpi.avgBattery * 100)}%</span>
        </span>
        <span className="w-px h-3 bg-white/10" />
        <span>
          <span className="text-white/35 tracking-widest mr-1">UPLINK</span>
          <span className="text-amber tabular-nums">{kpi.totalUplinkGbps.toFixed(2)}</span>
          <span className="text-white/35"> Gbps</span>
        </span>
        {kpi.lost > 0 && (
          <>
            <span className="w-px h-3 bg-white/10" />
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff3b3b] animate-pulse" />
              <span className="text-[#ff5454] tracking-widest tabular-nums">{kpi.lost} LOST</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
