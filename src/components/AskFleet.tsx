// AskFleet — replaces the old SearchBar + SearchResults pair.
//
// Why this exists: the previous search just dimmed the globe and called it a
// filter, which left the user staring at a slightly darker map. AskFleet
// treats the input as a question and renders a one-line narrated answer,
// with citations the user can click straight into the per-satellite Analyze
// page. Reads like a real mission-ops assistant.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fleetAlerts,
  getFleet,
  type FleetAlert
} from '../lib/fleet';
import { parseQuery, type SearchFilter } from '../lib/nlsearch';
import { answerForFilter, type Answer, type AnswerTone } from '../lib/answer';

interface Props {
  filter: SearchFilter | null;
  onApply: (f: SearchFilter | null) => void;
  onSelectSat: (id: string) => void;
}

const SUGGESTIONS = [
  'any fires in Spain?',
  'is the fleet healthy?',
  'bandwidth saved today',
  'critical satellites',
  'water events in California'
];

function toneColor(t: AnswerTone): string {
  return t === 'critical' ? '#ff5454' :
         t === 'warn'     ? '#ffb000' :
         t === 'ok'       ? '#7ee787' :
                            '#5fb3ff';
}

function toneBg(t: AnswerTone): string {
  return `${toneColor(t)}14`; // ~8% alpha
}

function sevColor(s: FleetAlert['severity']): string {
  return s === 'CRITICAL' ? '#ff5454' : s === 'HIGH' ? '#ffb000' : s === 'WARNING' ? '#a78bfa' : '#5fb3ff';
}

export default function AskFleet({ filter, onApply, onSelectSat }: Props) {
  const fleet = useMemo(() => getFleet(), []);
  const [text, setText] = useState(filter?.query ?? '');
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [, force] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => fleetAlerts.subscribe(setAlerts), []);
  // Refresh "Xm ago" labels
  useEffect(() => {
    const i = window.setInterval(() => force(t => (t + 1) % 1_000_000), 5000);
    return () => window.clearInterval(i);
  }, []);

  useEffect(() => {
    if (filter && filter.query !== text) setText(filter.query);
    if (!filter && text) setText('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function submit(value: string) {
    const f = parseQuery(value);
    onApply(f);
    setOpen(false);
  }

  function clear() {
    setText('');
    onApply(null);
    inputRef.current?.focus();
  }

  const answer: Answer | null = useMemo(
    () => (filter ? answerForFilter(filter, fleet, alerts) : null),
    [filter, fleet, alerts]
  );

  return (
    <div className="relative w-full max-w-[640px] flex flex-col items-stretch gap-2">
      {/* Input pill */}
      <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/15 rounded-full px-4 py-2 shadow-[0_0_30px_rgba(0,0,0,0.7)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white/40">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit(text);
            if (e.key === 'Escape') clear();
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          placeholder='Ask the fleet · e.g. "any fires in Spain?"'
          className="flex-1 bg-transparent text-white/90 placeholder-white/30 text-sm focus:outline-none"
        />
        {filter && (
          <button
            onClick={clear}
            className="text-[10px] tracking-widest text-white/40 hover:text-white/80 transition"
          >
            CLEAR
          </button>
        )}
      </div>

      {/* Suggestions */}
      {open && !filter && (
        <div className="rounded-xl bg-black/85 backdrop-blur-md border border-white/10 overflow-hidden shadow-2xl">
          <div className="px-4 py-2 text-[10px] tracking-[0.18em] text-white/35">TRY ASKING</div>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onMouseDown={e => { e.preventDefault(); submit(s); setText(s); }}
              className="block w-full text-left px-4 py-2 text-sm text-white/75 hover:bg-white/[0.06] transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Answer card */}
      {answer && (
        <div
          className="rounded-2xl bg-black/85 backdrop-blur-md border shadow-2xl overflow-hidden"
          style={{ borderColor: `${toneColor(answer.tone)}55` }}
        >
          {/* Headline strip */}
          <div className="px-4 py-3 flex items-start gap-3" style={{ background: toneBg(answer.tone) }}>
            <span
              className={`mt-1 w-2 h-2 rounded-full ${answer.tone === 'critical' ? 'animate-pulse' : ''}`}
              style={{ background: toneColor(answer.tone), boxShadow: `0 0 8px ${toneColor(answer.tone)}` }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.2em] text-white/40 mb-0.5">ANSWER</div>
              <div className="text-[14px] font-semibold text-white leading-snug">{answer.headline}</div>
              {answer.detail && (
                <div className="text-[12px] text-white/60 mt-1 leading-relaxed">{answer.detail}</div>
              )}
            </div>
            {answer.metric && (
              <div className="text-right shrink-0 pl-3 border-l border-white/10">
                <div className="text-[9px] tracking-[0.2em] text-white/40">{answer.metric.label}</div>
                <div className="text-[20px] font-bold tabular-nums" style={{ color: toneColor(answer.tone) }}>
                  {answer.metric.value}
                </div>
                {answer.metric.sub && (
                  <div className="text-[10px] text-white/40 tabular-nums">{answer.metric.sub}</div>
                )}
              </div>
            )}
          </div>

          {/* Citations */}
          {answer.citations.length > 0 && (
            <div className="max-h-[280px] overflow-y-auto">
              <div className="px-4 py-1.5 text-[10px] tracking-[0.18em] text-white/35 border-b border-white/[0.04]">
                {answer.citations.length} CITATION{answer.citations.length === 1 ? '' : 'S'}
              </div>
              {answer.citations.map((c, i) => {
                const color = c.severity ? sevColor(c.severity) : '#5fb3ff';
                return (
                  <button
                    key={`${c.satId}-${i}`}
                    onClick={() => onSelectSat(c.satId)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left border-b border-white/[0.04] hover:bg-white/[0.05] transition"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-white/90 truncate">{c.label}</div>
                      <div className="text-[10px] text-white/45 truncate">{c.detail}</div>
                    </div>
                    <span className="text-[10px] tracking-widest text-white/35 group-hover:text-white/70">VIEW →</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
