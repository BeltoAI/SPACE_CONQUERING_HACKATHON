// Per-satellite full-page Analyze view.
//
// Top header strip: satellite identity + live mini-telemetry + back button.
// Below: the original BELTO 3-panel pipeline (input / log / output), scoped
// conceptually to the selected satellite. All inference goes through the
// same handlers from App.tsx — we just pass them through and attribute
// resulting alerts to the chosen satellite.

import { useEffect, useState } from 'react';
import InputPanel from './InputPanel';
import LogPanel from './LogPanel';
import OutputPanel from './OutputPanel';
import { getFleet, type Satellite } from '../lib/fleet';
import type { ProcessingResult } from '../lib/types';

interface Props {
  satId: string;
  onBack: () => void;
  busy: boolean;
  webcamActive: boolean;
  streamActive: boolean;
  webcamVideoRef: React.RefObject<HTMLVideoElement>;
  webcamPreviewCanvasRef: React.RefObject<HTMLCanvasElement>;
  liveTag: string | null;
  result: ProcessingResult | null;
  onWebcamToggle: () => void;
  onStreamToggle: () => void;
  onGoesOnce: () => void;
  onLiveTile: () => void;
  onSample: (id: string) => void;
  onTimelapse: () => void;
  onUploadImage: (url: string) => void;
  onUploadVideo: (url: string) => void;
}

function statusColor(s: Satellite['status']): string {
  return s === 'LOST' ? '#ff5454' : s === 'ACQUIRING' ? '#ffb000' : '#7ee787';
}

export default function SatelliteAnalyze(p: Props) {
  const [sat, setSat] = useState<Satellite | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const fleet = getFleet();
    setSat(fleet.find(s => s.id === p.satId) || null);
  }, [p.satId]);

  // Refresh telemetry line every second
  useEffect(() => {
    const i = window.setInterval(() => force(t => (t + 1) % 1_000_000), 1000);
    return () => window.clearInterval(i);
  }, []);

  if (!sat) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/40">
        Satellite not found.
        <button onClick={p.onBack} className="ml-3 underline">Back</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Satellite header strip */}
      <div className="flex items-center gap-5 px-5 py-3 border-b border-white/5 bg-black/30">
        <button
          onClick={p.onBack}
          className="flex items-center gap-2 text-[11px] tracking-widest text-white/55 hover:text-white px-3 py-1.5 rounded-md border border-white/10 hover:border-white/30 transition"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          FLEET
        </button>

        <div>
          <div className="text-[10px] tracking-[0.2em] text-white/40">SATELLITE</div>
          <div className="text-base font-semibold">{sat.id}</div>
        </div>

        <div
          className="text-[10px] tracking-[0.18em] px-2 py-1 rounded"
          style={{
            color: statusColor(sat.status),
            border: `1px solid ${statusColor(sat.status)}`,
            background: `${statusColor(sat.status)}14`
          }}
        >
          {sat.status}
        </div>

        <div className="flex-1 flex items-center gap-4 text-[11px] tracking-wide text-white/55 overflow-x-auto">
          <Telem label="ROLE" value={sat.role} />
          <Telem label="ALT" value={`${sat.altKm.toLocaleString()} km`} />
          <Telem label="POS" value={`${sat.lat.toFixed(1)}°, ${sat.lon.toFixed(1)}°`} />
          <Telem label="BATT" value={`${Math.round(sat.battery * 100)}%`} tone={sat.battery < 0.25 ? '#ff5454' : '#7ee787'} />
          <Telem label="FUEL" value={`${Math.round(sat.fuel * 100)}%`} tone={sat.fuel < 0.15 ? '#ff5454' : '#a78bfa'} />
          <Telem label="TEMP" value={`${sat.tempC.toFixed(0)}°C`} tone={sat.tempC > 55 ? '#ff5454' : '#5fb3ff'} />
          <Telem label="UPLINK" value={`${sat.uplinkMbps.toFixed(0)} Mbps`} />
          <Telem label="LIFESPAN" value={`${sat.lifespanYears.toFixed(1)} yr`} />
        </div>

        {p.liveTag && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-critical/60 bg-critical/10 text-critical text-[11px] font-semibold tracking-widest2 shadow-glowCritical">
            <span className="w-1.5 h-1.5 rounded-full bg-critical live-pulse" />
            {p.liveTag}
          </div>
        )}
      </div>

      {/* Original BELTO 3-panel pipeline */}
      <main className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0">
        <div className="col-span-3 min-h-0">
          <InputPanel
            busy={p.busy}
            webcamActive={p.webcamActive}
            streamActive={p.streamActive}
            webcamVideoRef={p.webcamVideoRef}
            webcamPreviewCanvasRef={p.webcamPreviewCanvasRef}
            onWebcamToggle={p.onWebcamToggle}
            onStreamToggle={p.onStreamToggle}
            onGoesOnce={p.onGoesOnce}
            onLiveTile={p.onLiveTile}
            onSample={p.onSample}
            onTimelapse={p.onTimelapse}
            onUploadImage={p.onUploadImage}
            onUploadVideo={p.onUploadVideo}
          />
        </div>
        <div className="col-span-4 min-h-0">
          <LogPanel />
        </div>
        <div className="col-span-5 min-h-0">
          <OutputPanel result={p.result} busy={p.busy} liveTag={p.liveTag} />
        </div>
      </main>
    </div>
  );
}

function Telem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-white/30 text-[10px] tracking-[0.18em]">{label}</span>
      <span className="tabular-nums" style={{ color: tone || 'rgba(255,255,255,0.85)' }}>{value}</span>
    </div>
  );
}
