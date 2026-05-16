// Answer engine — turns a parsed SearchFilter + current state into a single
// concrete answer card. Replaces the old "dim the globe" filter UX with
// something that reads like a real mission-control answer:
//
//   "1 active fire in Catalonia, 78% confidence, reported by BELTO-IR2
//    4m ago — frame 412 KB triaged from 6.2 MB raw."
//
// Each answer carries a short headline, a longer detail, and citations the
// user can click to jump into the per-satellite Analyze page.

import {
  computeBandwidth,
  computeKPI,
  type FleetAlert,
  type Satellite
} from './fleet';
import type { SearchFilter } from './nlsearch';

export interface AnswerCitation {
  kind: 'alert' | 'sat';
  satId: string;
  label: string;       // primary line
  detail: string;      // secondary line
  severity?: FleetAlert['severity'];
  timestampMs?: number;
}

export type AnswerTone = 'ok' | 'warn' | 'critical' | 'info';

export interface Answer {
  headline: string;        // one sentence — the actual answer
  detail?: string;         // supporting context
  tone: AnswerTone;
  citations: AnswerCitation[];
  metric?: { label: string; value: string; sub?: string };
}

function fmtAge(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return `${s.toFixed(0)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b.toFixed(0)} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function ruleHumanSingular(rule: string): string {
  const r = rule.toLowerCase();
  if (r.includes('fire')) return 'active fire';
  if (r.includes('water') || r.includes('flood')) return 'water event';
  if (r.includes('cloud')) return 'cloud pass';
  if (r.includes('anomaly')) return 'anomaly';
  if (r.includes('developed')) return 'developed region';
  if (r.includes('natural')) return 'natural-cover frame';
  return 'event';
}

function ruleHumanPlural(rule: string): string {
  const r = rule.toLowerCase();
  if (r.includes('fire')) return 'active fires';
  if (r.includes('water') || r.includes('flood')) return 'water events';
  if (r.includes('cloud')) return 'cloud passes';
  if (r.includes('anomaly')) return 'anomalies';
  if (r.includes('developed')) return 'developed-region frames';
  if (r.includes('natural')) return 'natural-cover frames';
  return 'events';
}

function pickConfidenceScore(a: FleetAlert): number | undefined {
  const r = a.rule.toLowerCase();
  if (r.includes('fire')) return a.scoresFire;
  if (r.includes('water') || r.includes('flood')) return a.scoresWater;
  if (r.includes('anomaly')) return a.scoresAnomaly;
  return undefined;
}

function inferPlaceFromQuery(filter: SearchFilter): string | null {
  // Filter's "human" string often contains "in Spain" / "in California"
  const m = filter.human.match(/in ([A-Z][a-zA-Z ]+)$/);
  return m ? m[1].trim() : null;
}

// Detect intent — does the query look like it's about bandwidth/cost?
function isBandwidthQuery(q: string): boolean {
  const lc = q.toLowerCase();
  return /bandwidth|saved|savings|throughput|downlink|payload|cost|gigabyte|megabyte|tb|gb|mb/.test(lc);
}

function isHealthQuery(q: string): boolean {
  const lc = q.toLowerCase();
  return /healthy|nominal|status|fleet health|how (is|are)/.test(lc);
}

export function answerForFilter(
  filter: SearchFilter,
  fleet: Satellite[],
  alerts: FleetAlert[]
): Answer {
  // Bandwidth intent
  if (isBandwidthQuery(filter.query)) {
    const bw = computeBandwidth(alerts);
    const compressionPct = Math.round(bw.compressionRatio * 100);
    return {
      headline: `${fmtBytes(bw.bytesSaved)} of bandwidth saved today.`,
      detail:
        `The fleet processed ${bw.framesProcessed} frame${bw.framesProcessed === 1 ? '' : 's'} on-orbit, ` +
        `downlinking ${bw.framesDownlinked} payload${bw.framesDownlinked === 1 ? '' : 's'} (${fmtBytes(bw.totalPayloadBytes)}) ` +
        `and discarding ${bw.framesDiscarded} that didn't earn downlink time. ` +
        `That's a ${compressionPct}% reduction vs. dumb downlink.`,
      tone: 'ok',
      metric: { label: 'BANDWIDTH SAVED', value: fmtBytes(bw.bytesSaved), sub: `${compressionPct}% of raw` },
      citations: []
    };
  }

  // Health intent
  if (isHealthQuery(filter.query)) {
    const kpi = computeKPI(fleet, alerts);
    const tone: AnswerTone = kpi.lost > 0 ? 'critical' : kpi.acquiring > 0 ? 'warn' : 'ok';
    const headline =
      kpi.lost > 0
        ? `${kpi.lost} satellite${kpi.lost === 1 ? '' : 's'} reported LOST — needs ground intervention.`
        : kpi.acquiring > 0
          ? `${kpi.nominal}/${kpi.total} nominal — ${kpi.acquiring} acquiring.`
          : `All ${kpi.total} satellites nominal.`;
    const flagged = fleet
      .filter(s => s.status !== 'NOMINAL')
      .sort(a => (a.status === 'LOST' ? -1 : 1))
      .slice(0, 6);
    return {
      headline,
      detail:
        `Average battery ${Math.round(kpi.avgBattery * 100)}%, total uplink ${kpi.totalUplinkGbps.toFixed(2)} Gbps. ` +
        (flagged.length ? `Flagged below.` : ''),
      tone,
      citations: flagged.map(s => ({
        kind: 'sat',
        satId: s.id,
        label: `${s.id} — ${s.status}`,
        detail: `${s.role} · batt ${Math.round(s.battery * 100)}% · ${s.lat.toFixed(1)}°, ${s.lon.toFixed(1)}°`
      }))
    };
  }

  const matchedAlerts = alerts.filter(a => filter.matchAlert(a));
  const matchedSats = fleet.filter(s => filter.matchSat(s, alerts));
  const place = inferPlaceFromQuery(filter);

  // Sort alerts: CRITICAL > HIGH > WARNING > INFO, then newest first
  const sevOrder: Record<FleetAlert['severity'], number> = {
    CRITICAL: 0, HIGH: 1, WARNING: 2, INFO: 3
  };
  matchedAlerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.timestampMs - a.timestampMs);

  // Determine the rule label (if all matched alerts share a class)
  const ruleSample = matchedAlerts[0]?.rule || '';
  const ruleSingular = ruleHumanSingular(ruleSample);
  const rulePlural = ruleHumanPlural(ruleSample);

  if (matchedAlerts.length === 0 && matchedSats.length === 0) {
    return {
      headline: `No matches for "${filter.query}".`,
      detail:
        `Either nothing has been reported yet, or the fleet hasn't had a tasking window over that area. ` +
        `Try a broader query, or open a satellite → Analyze a frame to push data into the stream.`,
      tone: 'info',
      citations: []
    };
  }

  // Single alert — narrate it directly
  if (matchedAlerts.length === 1) {
    const a = matchedAlerts[0];
    const compressionPct = a.rawBytes && a.payloadBytes
      ? Math.round((1 - a.payloadBytes / a.rawBytes) * 100)
      : null;
    const where = place ? ` in ${place}` : '';
    const confScore = pickConfidenceScore(a);
    const conf = confScore != null ? ` (${Math.round(confScore * 100)}% conf)` : '';
    const bwLine = a.rawBytes && a.payloadBytes
      ? ` — ${fmtBytes(a.payloadBytes)} payload triaged from ${fmtBytes(a.rawBytes)} raw (${compressionPct}% saved)`
      : '';
    return {
      headline: `1 ${ruleSingular}${where}${conf}.`,
      detail: `Reported by ${a.satId} ${fmtAge(Date.now() - a.timestampMs)}${bwLine}.`,
      tone: a.severity === 'CRITICAL' ? 'critical' : a.severity === 'HIGH' ? 'warn' : 'info',
      citations: [{
        kind: 'alert',
        satId: a.satId,
        label: `${a.satId} — ${a.rule}`,
        detail: `${a.lat.toFixed(1)}°, ${a.lon.toFixed(1)}° · ${fmtAge(Date.now() - a.timestampMs)}`,
        severity: a.severity,
        timestampMs: a.timestampMs
      }]
    };
  }

  // Multiple alerts
  if (matchedAlerts.length > 1) {
    const crit = matchedAlerts.filter(a => a.severity === 'CRITICAL').length;
    const high = matchedAlerts.filter(a => a.severity === 'HIGH').length;
    const where = place ? ` in ${place}` : '';
    let headline: string;
    let tone: AnswerTone;
    if (crit > 0) {
      headline = `${crit} critical, ${matchedAlerts.length - crit} other ${rulePlural}${where}.`;
      tone = 'critical';
    } else if (high > 0) {
      headline = `${matchedAlerts.length} ${rulePlural}${where} — ${high} flagged HIGH.`;
      tone = 'warn';
    } else {
      headline = `${matchedAlerts.length} ${rulePlural}${where}.`;
      tone = 'info';
    }
    return {
      headline,
      detail: matchedSats.length > 0
        ? `Reported by ${new Set(matchedAlerts.map(a => a.satId)).size} satellite${new Set(matchedAlerts.map(a => a.satId)).size === 1 ? '' : 's'}. Most recent ${fmtAge(Date.now() - matchedAlerts[0].timestampMs)}.`
        : undefined,
      tone,
      citations: matchedAlerts.slice(0, 8).map(a => ({
        kind: 'alert',
        satId: a.satId,
        label: `${a.satId} — ${a.rule}`,
        detail: `${a.lat.toFixed(1)}°, ${a.lon.toFixed(1)}° · ${fmtAge(Date.now() - a.timestampMs)}`,
        severity: a.severity,
        timestampMs: a.timestampMs
      }))
    };
  }

  // No alerts, but sats matched (e.g. "infrared sats", "BELTO-1A")
  const where = place ? ` over ${place}` : '';
  return {
    headline: `${matchedSats.length} satellite${matchedSats.length === 1 ? '' : 's'} match${matchedSats.length === 1 ? 'es' : ''}${where}.`,
    detail: `No active events from these — open one to task or inspect.`,
    tone: 'info',
    citations: matchedSats.slice(0, 8).map(s => ({
      kind: 'sat',
      satId: s.id,
      label: `${s.id} — ${s.role}`,
      detail: `${s.status} · batt ${Math.round(s.battery * 100)}% · ${s.lat.toFixed(1)}°, ${s.lon.toFixed(1)}°`
    }))
  };
}
