// Detail card shown on the right side of the dashboard when a satellite
// is selected on the globe (or by default the most-recently-alerting sat).

import type { Satellite } from '../lib/fleet';

interface Props {
  sat: Satellite | null;
  recentAlertCount: number;
  highlightedByAlert: boolean;
}

function statusColor(s: Satellite['status']): string {
  return s === 'CRITICAL' ? '#ff5454' : s === 'DEGRADED' ? '#ffb000' : s === 'STANDBY' ? '#a78bfa' : '#7ee787';
}

function roleBadge(role: Satellite['role']): string {
  return role === 'OPTICAL' ? 'OPTICAL · TRUECOLOR' :
         role === 'INFRARED' ? 'IR · 3.7μm THERMAL' :
         role === 'SAR' ? 'SAR · X-BAND RADAR' :
         role === 'COMMS' ? 'COMMS · Ka-BAND RELAY' :
         'WEATHER · GEO IMAGER';
}

function bar(pct: number, color: string) {
  return (
    <div className="w-full h-1.5 bg-white/[0.06] rounded">
      <div
        className="h-full rounded transition-all duration-500"
        style={{ width: `${Math.round(pct * 100)}%`, background: color }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/40 tracking-wider">{label}</span>
      <span className="text-white/90 tabular-nums">{value}</span>
    </div>
  );
}

export default function SatelliteCard({ sat, recentAlertCount, highlightedByAlert }: Props) {
  if (!sat) {
    return (
      <div className="rounded-md border border-white/5 bg-white/[0.02] p-4 text-sm text-white/40">
        Select a satellite on the globe to view live telemetry.
      </div>
    );
  }
  const flash = highlightedByAlert ? 'ring-2 ring-[#ff5454]/70 shadow-[0_0_30px_rgba(255,84,84,0.35)]' : '';
  return (
    <div
      className={`rounded-md border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 flex flex-col gap-3 transition-all duration-300 ${flash}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-white/40 tracking-[0.18em]">SATELLITE</div>
          <div className="text-lg font-semibold">{sat.id}</div>
          <div className="text-[11px] text-white/50 tracking-wider mt-0.5">{roleBadge(sat.role)}</div>
        </div>
        <div className="flex flex-col items-end">
          <div
            className="text-[10px] tracking-[0.2em] px-2 py-1 rounded"
            style={{
              color: statusColor(sat.status),
              border: `1px solid ${statusColor(sat.status)}`,
              background: `${statusColor(sat.status)}14`
            }}
          >
            {sat.status}
          </div>
          <div className="text-[10px] text-white/30 mt-1">NORAD {sat.noradId}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-1">
        <Telem label="LAT" value={`${sat.lat.toFixed(2)}°`} />
        <Telem label="LON" value={`${sat.lon.toFixed(2)}°`} />
        <Telem label="ALT" value={`${sat.altKm.toLocaleString()} km`} />
        <Telem label="INCL" value={`${sat.orbit.inclinationDeg.toFixed(1)}°`} />
      </div>

      <div className="flex flex-col gap-2 mt-1">
        <div>
          <div className="flex justify-between text-[11px] text-white/50">
            <span>BATTERY</span>
            <span className="tabular-nums">{Math.round(sat.battery * 100)}%</span>
          </div>
          {bar(sat.battery, sat.battery < 0.25 ? '#ff5454' : sat.battery < 0.5 ? '#ffb000' : '#7ee787')}
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-white/50">
            <span>FUEL · ΔV</span>
            <span className="tabular-nums">{Math.round(sat.fuel * 100)}%</span>
          </div>
          {bar(sat.fuel, sat.fuel < 0.15 ? '#ff5454' : sat.fuel < 0.35 ? '#ffb000' : '#a78bfa')}
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-white/50">
            <span>TEMP</span>
            <span className="tabular-nums">{sat.tempC.toFixed(1)}°C</span>
          </div>
          {bar(Math.min(1, Math.max(0, (sat.tempC + 30) / 95)), sat.tempC > 55 ? '#ff5454' : '#5fb3ff')}
        </div>
      </div>

      <div className="border-t border-white/5 pt-2 flex flex-col gap-1">
        <Row label="UPLINK" value={`${sat.uplinkMbps.toFixed(0)} Mbps`} />
        <Row label="LAST CONTACT" value={`${sat.lastContactSec.toFixed(0)}s ago`} />
        <Row label="LIFESPAN EST" value={`${sat.lifespanYears.toFixed(1)} yr remaining`} />
        <Row label="RECENT ALERTS" value={`${recentAlertCount}`} />
      </div>
    </div>
  );
}

function Telem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/[0.03] border border-white/5 px-2 py-1.5">
      <div className="text-[10px] tracking-[0.18em] text-white/40">{label}</div>
      <div className="text-sm tabular-nums">{value}</div>
    </div>
  );
}
