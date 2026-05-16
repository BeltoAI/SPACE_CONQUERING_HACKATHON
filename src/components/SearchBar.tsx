// Floating natural-language search bar.
//
// Submits a query to the local parser (lib/nlsearch). On match, the parent
// applies the resulting filter to the globe + alert ticker, and (if a place
// was detected) re-centers the camera. No backend required.

import { useEffect, useRef, useState } from 'react';
import { parseQuery, type SearchFilter } from '../lib/nlsearch';

interface Props {
  filter: SearchFilter | null;
  onApply: (f: SearchFilter | null) => void;
}

const SUGGESTIONS = [
  'fires in Spain',
  'critical satellites',
  'water events today',
  'infrared sats over Africa',
  'BELTO-IR1'
];

export default function SearchBar({ filter, onApply }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Sync text input with externally-applied filter (e.g. from suggestion click)
    if (filter && filter.query !== text) setText(filter.query);
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

  return (
    <div className="relative w-full max-w-[560px]">
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
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder='Ask the fleet · e.g. "fires in Spain"'
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

      {filter && (
        <div className="absolute left-4 top-full mt-1 text-[11px] text-amber/80 tracking-wide">
          Filter: {filter.human}
        </div>
      )}

      {open && !filter && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 overflow-hidden shadow-2xl">
          <div className="px-4 py-2 text-[10px] tracking-[0.18em] text-white/35">TRY</div>
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
    </div>
  );
}
