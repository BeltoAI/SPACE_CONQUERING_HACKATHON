// Hamburger slide-out drawer — deep-dive history & reference.
//
// Live fleet status + active alerts live in the always-visible OpsPanel
// on the right, and the BandwidthHero floats over the globe. So this
// drawer is specifically for things the operator drills into occasionally:
//
//   FLEET (link) — opens the FULL-SCREEN Fleet Overview page (separate
//                  from the drawer, because at 18+ satellites the per-sat
//                  cards need real horizontal space).
//   HISTORY      — every alert the fleet has ever raised (filterable by sev)
//   AUDIT LOG    — chronological audit trail of every inference / decision
//   RULES        — reference for what each onboard decision rule does, AND
//                  what the NOMINAL / ACQUIRING / LOST thresholds actually are
//
// Designed as an overlay so it never crowds the globe.

import { useEffect, useMemo, useState } from 'react';
import {
  fleetAlerts,
  auditLog,
  ALERT_SEVERITY_COLOR,
  SAT_STATUS_COLOR,
  STATUS_RULES,
  type AuditEntry,
  type FleetAlert,
  type AlertSeverity
} from '../lib/fleet';

type Tab = 'history' | 'log' | 'rules';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSatellite: (id: string) => void;
  onOpenFleet: () => void;
}

export default function MenuDrawer({ open, onClose, onOpenSatellite, onOpenFleet }: Props) {
  const [tab, setTab] = useState<Tab>('history');

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'} bg-black/55 backdrop-blur-sm`}
        onClick={onClose}
      />
      {/* drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-[640px] max-w-[92vw] flex flex-col bg-[#0a0a0f]/95 backdrop-blur-xl border-r border-white/10 shadow-2xl transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-amber/15 border border-amber/40 flex items-center justify-center">
              <span className="text-amber font-bold text-[11px] tracking-widest2">B</span>
            </div>
            <div className="text-sm tracking-[0.18em] text-white/85">MISSION CONSOLE</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] transition"
            aria-label="Close menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Big "FLEET" link — clicking opens a full-screen page, not a tab.
            Cofounder ask: "i want it to be an entierly separate page." */}
        <button
          onClick={onOpenFleet}
          className="mx-5 my-3 flex items-center justify-between px-4 py-3 rounded-lg bg-amber/10 hover:bg-amber/20 border border-amber/40 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-amber/20 border border-amber/40 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#ffb000" strokeWidth="1.5" />
                <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke="#ffb000" strokeWidth="1.2" />
                <circle cx="12" cy="12" r="1.6" fill="#ffb000" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold tracking-wider text-amber">FLEET OVERVIEW</div>
              <div className="text-[10px] tracking-[0.18em] text-amber/60">FULL ROSTER · TELEMETRY · ADD / REMOVE SATELLITES</div>
            </div>
          </div>
          <span className="text-amber text-sm">→</span>
        </button>

        <div className="flex items-center gap-1 px-5 py-2 border-b border-white/5">
          {([
            ['history', 'Alert History'],
            ['log', 'Audit Log'],
            ['rules', 'Rules']
          ] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`text-[11px] tracking-widest2 px-3 py-1.5 rounded-md transition ${tab === k ? 'bg-amber/15 text-amber border border-amber/30' : 'text-white/55 hover:text-white border border-transparent'}`}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'history' && <HistoryTab onOpenSatellite={(id) => { onClose(); onOpenSatellite(id); }} />}
          {tab === 'log' && <LogTab />}
          {tab === 'rules' && <RulesTab />}
        </div>
      </aside>
    </>
  );
}

// --- Log tab -------------------------------------------------------------

function LogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => auditLog.subscribe(setEntries), []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 sticky top-0 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="text-[10px] tracking-[0.18em] text-white/35">
          {entries.length} ENTRIES · MOST RECENT FIRST
        </div>
        <button onClick={() => auditLog.clear()} className="text-[10px] tracking-widest text-white/40 hover:text-white/80">CLEAR</button>
      </div>
      {entries.length === 0 && (
        <div className="px-5 py-8 text-xs text-white/30">
          No audit entries yet. Run an analysis on a satellite to populate the log.
        </div>
      )}
      {entries.map(e => {
        const c = e.level === 'CRITICAL' ? '#ff5454' : e.level === 'WARN' ? '#ffb000' : e.level === 'OK' ? '#7ee787' : '#5fb3ff';
        return (
          <div key={e.id} className="grid grid-cols-12 gap-2 px-5 py-1.5 text-[11px] border-b border-white/[0.03] items-baseline">
            <div className="col-span-2 tabular-nums text-white/35">{new Date(e.timestampMs).toLocaleTimeString()}</div>
            <div className="col-span-2 font-semibold tracking-widest" style={{ color: c }}>{e.level}</div>
            <div className="col-span-2 text-white/55">{e.satId}</div>
            <div className="col-span-6 text-white/80">{e.message}</div>
          </div>
        );
      })}
    </div>
  );
}

// --- History tab ---------------------------------------------------------
// All alerts the fleet has ever raised (FleetAlert stream caps at 50, which
// is plenty for the demo). Filter by severity, click a row to open the
// triggering satellite. When an alert has a thumbnailDataUrl, we render
// the cropped frame inline — that's the "picture that triggered the alert".

function HistoryTab({ onOpenSatellite }: { onOpenSatellite: (id: string) => void }) {
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [filter, setFilter] = useState<AlertSeverity | 'ALL'>('ALL');
  useEffect(() => fleetAlerts.subscribe(setAlerts), []);

  const filtered = useMemo(
    () => (filter === 'ALL' ? alerts : alerts.filter(a => a.severity === filter)),
    [alerts, filter]
  );

  const counts = useMemo(() => {
    const c: Record<AlertSeverity, number> = { CRITICAL: 0, HIGH: 0, WARNING: 0, INFO: 0 };
    for (const a of alerts) c[a.severity]++;
    return c;
  }, [alerts]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 sticky top-0 bg-[#0a0a0f]/95 backdrop-blur z-10">
        <div className="text-[10px] tracking-[0.18em] text-white/35">
          {filtered.length}/{alerts.length} EVENT{filtered.length === 1 ? '' : 'S'}
        </div>
        <div className="flex items-center gap-1">
          {(['ALL', 'CRITICAL', 'HIGH', 'WARNING', 'INFO'] as const).map(k => {
            const color = k === 'ALL' ? '#ffffff' : ALERT_SEVERITY_COLOR[k as AlertSeverity];
            const n = k === 'ALL' ? alerts.length : counts[k as AlertSeverity];
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`text-[10px] tracking-widest px-2 py-1 rounded-md transition border ${
                  filter === k ? 'border-white/30 text-white' : 'border-transparent text-white/45 hover:text-white/80'
                }`}
                style={filter === k ? { color, borderColor: `${color}55`, background: `${color}11` } : undefined}
              >
                {k} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="px-5 py-8 text-xs text-white/30">
          No alerts {filter === 'ALL' ? 'yet' : `at ${filter} severity`}. Run an analysis on any satellite to generate one.
        </div>
      )}

      {filtered.map(a => {
        const c = ALERT_SEVERITY_COLOR[a.severity];
        return (
          <button
            key={a.id}
            onClick={() => onOpenSatellite(a.satId)}
            className="w-full grid grid-cols-[88px_1fr] gap-4 px-5 py-3 text-left border-b border-white/5 hover:bg-white/[0.04] transition items-start"
          >
            {/* Triggering thumbnail (or severity tile if none) */}
            <div className="w-[88px] h-[60px] rounded-md overflow-hidden border" style={{ borderColor: `${c}40`, background: `${c}10` }}>
              {a.thumbnailDataUrl ? (
                <img src={a.thumbnailDataUrl} alt={a.rule} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[9px] tracking-widest" style={{ color: c }}>
                  {a.severity}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded tracking-widest" style={{ color: c, border: `1px solid ${c}`, background: `${c}14` }}>
                  {a.severity}
                </span>
                <span className="text-sm font-semibold text-white/95 tracking-wide">{a.satId}</span>
                <span className="text-[11px] text-white/45">{a.rule}</span>
              </div>
              <div className="text-[11px] text-white/55 tabular-nums">
                {a.lat.toFixed(2)}°, {a.lon.toFixed(2)}° · {new Date(a.timestampMs).toLocaleString()}
              </div>
              {a.payloadBytes && a.rawBytes && (
                <div className="text-[10px] text-white/40 mt-0.5 tabular-nums">
                  Triaged: {formatBytes(a.payloadBytes)} payload from {formatBytes(a.rawBytes)} raw
                  ({Math.round((1 - a.payloadBytes / a.rawBytes) * 100)}% saved)
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// --- Rules tab -----------------------------------------------------------

const RULES = [
  { name: 'PRIORITY_FIRE',     severity: 'CRITICAL', trigger: 'fire score ≥ 0.025',                action: 'PRIORITY_DOWNLINK (full frame + thumbnail)' },
  { name: 'ANOMALY_REPORT',    severity: 'HIGH',     trigger: 'CNN anomaly ≥ 0.50',                action: 'COMPRESSED_DOWNLINK (thumbnail)' },
  { name: 'WATER_BODY',        severity: 'HIGH',     trigger: 'water score ≥ 0.55 OR scene=water', action: 'COMPRESSED_DOWNLINK (thumbnail + metadata)' },
  { name: 'DEVELOPED_AREA',    severity: 'WARNING',  trigger: 'developed area scene ≥ 0.60',       action: 'EVENT_DOWNLINK (metadata only)' },
  { name: 'NATURAL_BASELINE',  severity: 'LOW',      trigger: 'vegetation / forest baseline',      action: 'DISCARD_ONBOARD' },
  { name: 'CLOUD_DISCARD',     severity: 'LOW',      trigger: 'cloud cover ≥ 0.45 and no fire',    action: 'DISCARD_ONBOARD' },
  { name: 'LOW_VALUE',         severity: 'LOW',      trigger: 'no class above threshold',          action: 'DISCARD_ONBOARD' },
  { name: 'EDGE_ANOMALY',      severity: 'HIGH',     trigger: 'webcam anomaly ≥ 0.35',             action: 'COMPRESSED_DOWNLINK' },
  { name: 'EDGE_ACTIVE',       severity: 'LOW',      trigger: 'webcam activity ≥ 0.20',            action: 'EVENT_DOWNLINK' },
  { name: 'EDGE_IDLE',         severity: 'LOW',      trigger: 'webcam idle',                       action: 'DISCARD_ONBOARD' }
];

function RulesTab() {
  return (
    <div className="flex flex-col">
      {/* --- Lifecycle status rules -------------------------------------- */}
      {/* These are the thresholds that drive the green/amber/red dots on the
          OpsPanel and Globe. The cofounder asked why LOST wasn't documented
          anywhere — this is where it lives. */}
      <div className="px-5 py-3 text-[11px] tracking-[0.18em] text-white/45 border-b border-white/5">
        FLEET LIFECYCLE STATUS — DERIVED FROM TELEMETRY
      </div>
      {STATUS_RULES.map(r => {
        const c = SAT_STATUS_COLOR[r.status];
        return (
          <div key={r.status} className="px-5 py-3 border-b border-white/5">
            <div className="flex items-center gap-3 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}88` }} />
              <span className="text-[10px] px-2 py-0.5 rounded tracking-widest" style={{ color: c, border: `1px solid ${c}`, background: `${c}14` }}>
                {r.status}
              </span>
              <span className="text-xs text-white/70">{r.summary}</span>
            </div>
            <div className="text-[11px] text-white/55 pl-5">
              {r.conditions.join(' · ')}
            </div>
          </div>
        );
      })}

      {/* --- Inference rule engine --------------------------------------- */}
      <div className="px-5 py-3 mt-2 text-[11px] tracking-[0.18em] text-white/45 border-b border-t border-white/5">
        ONBOARD DECISION RULES — EVALUATED ON EVERY FRAME
      </div>
      {RULES.map(r => {
        const c = r.severity === 'CRITICAL' ? '#ff5454' : r.severity === 'HIGH' ? '#ffb000' : r.severity === 'WARNING' ? '#a78bfa' : '#7ee787';
        return (
          <div key={r.name} className="px-5 py-3 border-b border-white/5">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[10px] px-2 py-0.5 rounded tracking-widest" style={{ color: c, border: `1px solid ${c}`, background: `${c}14` }}>
                {r.severity}
              </span>
              <span className="text-sm font-semibold text-white/90 tracking-wider">{r.name}</span>
            </div>
            <div className="grid grid-cols-12 gap-3 text-[11px]">
              <div className="col-span-5">
                <div className="text-white/35 tracking-[0.18em] text-[10px]">TRIGGER</div>
                <div className="text-white/75">{r.trigger}</div>
              </div>
              <div className="col-span-7">
                <div className="text-white/35 tracking-[0.18em] text-[10px]">ACTION</div>
                <div className="text-white/75">{r.action}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// (FleetTab + AddSatelliteForm + SatelliteCard moved to FleetOverview.tsx,
//  which is now a full-screen page rather than a 640px drawer tab.)
