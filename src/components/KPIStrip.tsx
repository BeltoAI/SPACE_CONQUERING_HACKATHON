// Mission-control style top KPI strip for the fleet dashboard.

import type { FleetKPI } from '../lib/fleet';

interface Props {
  kpi: FleetKPI;
}

function bar(pct: number, color: string) {
  return (
    <div className="w-full h-1.5 bg-white/5 rounded">
      <div
        className="h-full rounded transition-all duration-700"
        style={{ width: `${Math.round(pct * 100)}%`, background: color }}
      />
    </div>
  );
}

export default function KPIStrip({ kpi }: Props) {
  const opsPct = kpi.total > 0 ? kpi.nominal / kpi.total : 0;
  return (
    <div className="grid grid-cols-6 gap-3 px-4 py-3 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
      <Card label="FLEET STATUS" value={`${kpi.nominal}/${kpi.total}`} sub="NOMINAL" tone="ok">
        {bar(opsPct, '#7ee787')}
      </Card>
      <Card label="DEGRADED" value={`${kpi.degraded}`} sub="ATTENTION" tone={kpi.degraded > 0 ? 'warn' : 'mute'}>
        {bar(kpi.total ? kpi.degraded / kpi.total : 0, '#ffb000')}
      </Card>
      <Card label="CRITICAL" value={`${kpi.critical}`} sub="ANOMALY" tone={kpi.critical > 0 ? 'critical' : 'mute'}>
        {bar(kpi.total ? kpi.critical / kpi.total : 0, '#ff3b3b')}
      </Card>
      <Card label="AVG BATTERY" value={`${Math.round(kpi.avgBattery * 100)}%`} sub="FLEET WIDE" tone="info">
        {bar(kpi.avgBattery, '#5fb3ff')}
      </Card>
      <Card label="AVG FUEL" value={`${Math.round(kpi.avgFuel * 100)}%`} sub="ΔV REMAINING" tone="info">
        {bar(kpi.avgFuel, '#a78bfa')}
      </Card>
      <Card label="UPLINK" value={`${kpi.totalUplinkGbps.toFixed(2)} Gbps`} sub={`${kpi.alerts24h} alerts/24h`} tone="info">
        {bar(Math.min(1, kpi.totalUplinkGbps / 5), '#f59e0b')}
      </Card>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone,
  children
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'ok' | 'warn' | 'critical' | 'info' | 'mute';
  children?: React.ReactNode;
}) {
  const valColor =
    tone === 'critical' ? 'text-[#ff5454]' :
    tone === 'warn' ? 'text-[#ffb000]' :
    tone === 'ok' ? 'text-[#7ee787]' :
    tone === 'info' ? 'text-white' :
    'text-white/60';
  return (
    <div className="rounded-md bg-white/[0.02] border border-white/5 px-3 py-2 flex flex-col gap-1.5">
      <div className="text-[10px] tracking-[0.18em] text-white/40">{label}</div>
      <div className={`text-xl font-semibold ${valColor} tabular-nums`}>{value}</div>
      <div className="text-[10px] tracking-wider text-white/35">{sub}</div>
      {children}
    </div>
  );
}
