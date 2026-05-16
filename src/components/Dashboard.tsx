// Fleet operations dashboard — starting page.
//
// Split layout: globe takes the left ~62%, OpsPanel takes the right side.
// An operator opens the app and immediately sees: any alerts? all sats OK?
// Without clicking anything. Everything is one click away from Analyze.
//
// Floating over the globe:
//   - top-left  : CONSOLE button (opens deep-dive drawer for rules, bandwidth detail)
//   - top-center: AskFleet (answer-engine NL query)
//   - bottom-left: BandwidthHero (live value-prop metric)
//   - bottom-right: hint

import { useEffect, useMemo, useRef, useState } from 'react';
import FleetGlobe from './FleetGlobe';
import AskFleet from './AskFleet';
import OpsPanel from './OpsPanel';
import BandwidthHero from './BandwidthHero';
import MenuDrawer from './MenuDrawer';
import {
  getFleet,
  fleetAlerts,
  seedDemoAlerts
} from '../lib/fleet';
import type { SearchFilter } from '../lib/nlsearch';

interface Props {
  onOpenSatellite: (id: string) => void;
  onOpenFleet: () => void;
}

export default function Dashboard({ onOpenSatellite, onOpenFleet }: Props) {
  const fleet = useMemo(() => getFleet(), []);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SearchFilter | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { seedDemoAlerts(fleet); }, [fleet]);

  // ResizeObserver bound to the *globe column*, not the page.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setDims({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute filterSatIds set for OpsPanel highlighting
  const filterSatIds = useMemo(() => {
    if (!filter) return null;
    const list = fleetAlerts.list();
    const ids = new Set<string>();
    for (const s of fleet) if (filter.matchSat(s, list)) ids.add(s.id);
    for (const a of list) if (filter.matchAlert(a)) ids.add(a.satId);
    return ids;
  }, [filter, fleet]);

  const hoveredSat = useMemo(
    () => fleet.find(s => s.id === hoveredId) || null,
    [fleet, hoveredId]
  );

  return (
    <div className="relative w-full h-full bg-[radial-gradient(circle_at_center,#080812,#000000)] overflow-hidden flex">
      {/* Globe column */}
      <div ref={wrapRef} className="relative flex-1 min-w-0 h-full">
        <FleetGlobe
          selectedSatId={null}
          hoveredSatId={hoveredId}
          onSelectSat={onOpenSatellite}
          onHoverSat={setHoveredId}
          searchFilter={filter}
          width={dims.w}
          height={dims.h}
        />

        {/* Top-left CONSOLE */}
        <div className="absolute top-4 left-4 z-10">
          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/15 rounded-full px-3 py-2 hover:bg-black/80 transition"
            aria-label="Open mission console"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="w-4 h-[1.5px] bg-white/80" />
              <span className="w-4 h-[1.5px] bg-white/80" />
              <span className="w-4 h-[1.5px] bg-white/80" />
            </span>
            <span className="text-[11px] tracking-widest text-white/80">CONSOLE</span>
          </button>
        </div>

        {/* AskFleet — top-center */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[640px] max-w-[calc(100%-2rem)] flex flex-col items-stretch">
          <AskFleet filter={filter} onApply={setFilter} onSelectSat={onOpenSatellite} />
        </div>

        {/* BandwidthHero — bottom-left */}
        <div className="absolute bottom-4 left-4 z-10">
          <BandwidthHero />
        </div>

        {/* Bottom-right hint */}
        <div className="absolute bottom-4 right-4 z-10 text-[10px] tracking-[0.18em] text-white/30 bg-black/30 backdrop-blur-md rounded-full px-3 py-1.5">
          CLICK A SATELLITE TO ANALYZE
        </div>

        {/* Hover tooltip */}
        {hoveredSat && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-black/75 backdrop-blur-md border border-white/15 rounded-lg px-3 py-2 text-[11px] flex items-center gap-3">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: hoveredSat.status === 'LOST' ? '#ff3b3b' :
                              hoveredSat.status === 'ACQUIRING' ? '#ffb000' :
                              '#7ee787',
                  boxShadow: '0 0 6px currentColor'
                }}
              />
              <span className="text-white/90 font-semibold tracking-wider">{hoveredSat.id}</span>
              <span className="text-white/40">{hoveredSat.role}</span>
              <span className="text-white/55 tabular-nums">{hoveredSat.lat.toFixed(1)}°, {hoveredSat.lon.toFixed(1)}°</span>
              <span className="text-white/40">·</span>
              <span className="text-white/50 tabular-nums">batt {Math.round(hoveredSat.battery * 100)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Right operations sidebar */}
      <aside className="hidden lg:flex w-[400px] xl:w-[440px] shrink-0 h-full">
        <OpsPanel
          onSelectSat={onOpenSatellite}
          highlightSatId={hoveredId}
          filterSatIds={filterSatIds}
        />
      </aside>

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenSatellite={onOpenSatellite}
        onOpenFleet={() => { setMenuOpen(false); onOpenFleet(); }}
      />
    </div>
  );
}
