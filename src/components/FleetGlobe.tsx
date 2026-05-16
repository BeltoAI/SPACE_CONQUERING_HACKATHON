// 3D globe that visualizes the BELTO satellite fleet in real time.
//
// Visual rules of thumb (kept minimal so the dashboard reads at a glance):
//   - Earth uses the night-side texture + warm amber atmosphere glow.
//   - Each satellite is a clearly visible 3D mesh with a persistent ID label.
//   - Orbits are drawn as continuous 3D ellipses around Earth at the correct
//     altitude / inclination / RAAN — not flat surface pulses. This fixes the
//     earlier "orbits going through the planet" bug: we attach LineLoops
//     directly to the underlying THREE.Scene (so they sit in inertial space
//     relative to Earth and visibly arc above/around the globe).
//   - Anomaly markers pulse at detection coordinates. CRITICAL severity adds
//     an animated laser arc to the nearest comms relay (Starlink-mesh vibe).
//   - Search filter (from NL query): non-matching satellites are dimmed.

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import {
  getFleet,
  subscribeFleet,
  tickFleet,
  fleetAlerts,
  type Satellite,
  type FleetAlert
} from '../lib/fleet';
import type { SearchFilter } from '../lib/nlsearch';

interface Props {
  selectedSatId: string | null;
  hoveredSatId: string | null;
  onSelectSat: (id: string) => void;
  onHoverSat: (id: string | null) => void;
  searchFilter: SearchFilter | null;
  width: number;
  height: number;
}

interface SatPoint {
  sat: Satellite;
  lat: number;
  lng: number;
  alt: number;
  dim: boolean; // dimmed by search filter
}

// react-globe.gl uses GLOBE_RADIUS = 100 internally for the Earth sphere.
const GLOBE_R = 100;

// Map km altitude → globe-radii multiplier above surface, with gentle log
// compression so LEO (≈600 km) and GEO (≈36000 km) both stay on-screen.
function altToGlobe(altKm: number): number {
  return Math.min(1.4, Math.log10(1 + altKm / 200) * 0.55);
}

function roleColor(sat: Satellite): string {
  if (sat.status === 'LOST') return '#ff3b3b';
  if (sat.status === 'ACQUIRING') return '#ffb000';
  return `hsl(${sat.hue}, 85%, 62%)`;
}

export default function FleetGlobe({
  selectedSatId,
  hoveredSatId,
  onSelectSat,
  onHoverSat,
  searchFilter,
  width,
  height
}: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  // Subscribe to fleet membership so operator-added satellites show up here
  // too — the alternative (useMemo(getFleet, [])) snapshots the array at
  // mount-time and *react-globe.gl* would never diff in the new entries.
  const [fleet, setFleet] = useState<Satellite[]>(() => getFleet());
  const [, forceTick] = useState(0);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const lastTickRef = useRef<number>(performance.now());
  const orbitGroupRef = useRef<THREE.Group | null>(null);

  // Subscribe to alerts
  useEffect(() => fleetAlerts.subscribe(setAlerts), []);

  // Subscribe to fleet changes. The subscription emits a fresh array snapshot
  // every time addSatellite / removeSatellite runs, which triggers re-renders
  // *and* re-runs the orbit-line effect below (which depends on `fleet`).
  useEffect(() => subscribeFleet(snap => setFleet([...snap])), []);

  // Animation loop — tick fleet propagation & re-render
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const dtSec = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      // Speed up the simulation 90× so motion is visible during a demo
      tickFleet(fleet, dtSec * 90);
      forceTick(t => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fleet]);

  // Add real 3D orbit lines directly to the scene (so they stay in inertial
  // space and arc around Earth instead of flattening to its surface).
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const scene = globe.scene();
    const group = new THREE.Group();
    const seen = new Set<string>();
    for (const sat of fleet) {
      const planeKey = `${sat.orbit.inclinationDeg.toFixed(1)}-${sat.orbit.raanDeg.toFixed(1)}-${sat.orbit.altitudeKm}`;
      if (seen.has(planeKey)) continue;
      seen.add(planeKey);

      const radius = GLOBE_R * (1 + altToGlobe(sat.orbit.altitudeKm));
      const segments = 128;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const color = new THREE.Color(`hsl(${sat.hue}, 75%, 58%)`);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 });
      const line = new THREE.LineLoop(geo, mat);
      // Tilt by inclination around X, then rotate orbit plane by RAAN around Y
      line.rotation.x = THREE.MathUtils.degToRad(sat.orbit.inclinationDeg);
      line.rotation.y = THREE.MathUtils.degToRad(sat.orbit.raanDeg);
      group.add(line);
    }
    scene.add(group);
    orbitGroupRef.current = group;
    return () => {
      scene.remove(group);
      group.traverse(o => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
    };
  }, [fleet]);

  // Initial pose + gentle auto-rotate
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: 18, lng: -30, altitude: 2.6 }, 0);
    const controls = g.controls() as unknown as { autoRotate: boolean; autoRotateSpeed: number };
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
  }, []);

  // Pan camera when selection changes
  useEffect(() => {
    const id = selectedSatId || hoveredSatId;
    if (!id) return;
    const sat = fleet.find(s => s.id === id);
    if (!sat || !globeRef.current) return;
    if (selectedSatId) {
      globeRef.current.pointOfView({ lat: sat.lat, lng: sat.lon, altitude: 1.8 }, 1200);
    }
  }, [selectedSatId, hoveredSatId, fleet]);

  // Apply search filter — dim non-matching sats
  const matchSet = useMemo(() => {
    if (!searchFilter) return null;
    const ids = new Set<string>();
    for (const sat of fleet) {
      if (searchFilter.matchSat(sat, alerts)) ids.add(sat.id);
    }
    return ids;
  }, [searchFilter, fleet, alerts]);

  // When a filter is applied with a place focus, fly the camera there.
  useEffect(() => {
    if (!searchFilter?.focus || !globeRef.current) return;
    const { lat, lon, zoom } = searchFilter.focus;
    globeRef.current.pointOfView({ lat, lng: lon, altitude: zoom }, 1500);
    // Reduce auto-rotate so the focus is held
    const controls = globeRef.current.controls() as unknown as { autoRotate: boolean };
    controls.autoRotate = false;
    return () => {
      const c = globeRef.current?.controls() as unknown as { autoRotate: boolean } | undefined;
      if (c) c.autoRotate = true;
    };
  }, [searchFilter]);

  const points: SatPoint[] = fleet.map(sat => ({
    sat,
    lat: sat.lat,
    lng: sat.lon,
    alt: altToGlobe(sat.altKm),
    dim: matchSet !== null && !matchSet.has(sat.id)
  }));

  // Inter-sat laser arcs only when an alert is fresh (last 30s)
  const arcs = useMemo(() => {
    const relays = fleet.filter(s => s.role === 'COMMS');
    if (relays.length === 0) return [];
    const now = Date.now();
    return alerts
      .filter(a => now - a.timestampMs < 30_000 && (a.severity === 'CRITICAL' || a.severity === 'HIGH'))
      .slice(0, 3)
      .map(a => {
        const sender = fleet.find(s => s.id === a.satId);
        if (!sender) return null;
        let best = relays[0], bestD = Infinity;
        for (const r of relays) {
          const d = haversine(sender.lat, sender.lon, r.lat, r.lon);
          if (d < bestD) { bestD = d; best = r; }
        }
        const color = a.severity === 'CRITICAL' ? ['#ff2b2b', '#ffffff'] : ['#ffb000', '#fff5d0'];
        return {
          startLat: sender.lat, startLng: sender.lon,
          endLat: best.lat, endLng: best.lon,
          color
        };
      })
      .filter(Boolean) as { startLat: number; startLng: number; endLat: number; endLng: number; color: string[] }[];
  }, [alerts, fleet]);

  // Anomaly markers.
  //   - Without a filter: only show fresh (last 30s) pulses to avoid clutter.
  //   - With a filter   : persistently show ALL matching alerts so the user
  //                       sees concrete locations on the globe.
  //   - When a place was matched (filter.focus), also drop a centered crosshair
  //     so the focus region is unmistakable.
  const anomalyMarkers = useMemo(() => {
    const now = Date.now();
    const markers: {
      lat: number; lng: number; color: string; persistent: boolean; kind: 'alert' | 'focus';
    }[] = [];
    if (searchFilter) {
      for (const a of alerts) {
        if (!searchFilter.matchAlert(a)) continue;
        markers.push({
          lat: a.lat,
          lng: a.lon,
          color: a.severity === 'CRITICAL' ? '#ff2b2b' : a.severity === 'HIGH' ? '#ffb000' : '#5fb3ff',
          persistent: true,
          kind: 'alert'
        });
      }
      if (searchFilter.focus) {
        markers.push({
          lat: searchFilter.focus.lat,
          lng: searchFilter.focus.lon,
          color: '#ffd066',
          persistent: true,
          kind: 'focus'
        });
      }
    } else {
      for (const a of alerts) {
        if (now - a.timestampMs >= 30_000) continue;
        markers.push({
          lat: a.lat,
          lng: a.lon,
          color: a.severity === 'CRITICAL' ? '#ff2b2b' : a.severity === 'HIGH' ? '#ffb000' : '#5fb3ff',
          persistent: false,
          kind: 'alert'
        });
      }
    }
    return markers;
  }, [alerts, searchFilter]);

  // Build a bigger, more legible satellite mesh + permanent ID sprite label.
  // Sprites always face the camera so labels stay readable.
  function buildSatObject(point: SatPoint): THREE.Object3D {
    const group = new THREE.Group();
    const baseColor = roleColor(point.sat);
    const color = new THREE.Color(baseColor);
    const isSelected = point.sat.id === selectedSatId;
    const isHovered = point.sat.id === hoveredSatId;
    const dimmed = point.dim;

    // Body: chunky octahedron
    const bodyMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: dimmed ? 0.25 : 1
    });
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), bodyMat);
    group.add(body);

    // Glow halo
    const haloMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: dimmed ? 0.06 : (isSelected || isHovered ? 0.45 : 0.22)
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 16), haloMat);
    group.add(halo);

    // Solar panels
    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x1f3b8a,
      transparent: true,
      opacity: dimmed ? 0.2 : 0.9
    });
    const panelGeo = new THREE.BoxGeometry(3.4, 0.08, 1.0);
    const p1 = new THREE.Mesh(panelGeo, panelMat);
    p1.position.x = 2.4;
    group.add(p1);
    const p2 = new THREE.Mesh(panelGeo, panelMat);
    p2.position.x = -2.4;
    group.add(p2);

    // Always-visible label sprite
    const labelSprite = makeLabelSprite(point.sat.id, baseColor, dimmed, isSelected || isHovered);
    labelSprite.position.set(0, 5.0, 0);
    group.add(labelSprite);

    if (isSelected) group.scale.set(1.6, 1.6, 1.6);
    else if (isHovered) group.scale.set(1.25, 1.25, 1.25);

    return group;
  }

  return (
    <div style={{ width, height, position: 'relative' }}>
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        showAtmosphere
        atmosphereColor="#ffaa44"
        atmosphereAltitude={0.22}
        customLayerData={points}
        customThreeObject={(d: object) => buildSatObject(d as SatPoint)}
        customThreeObjectUpdate={(obj: THREE.Object3D, d: object) => {
          const p = d as SatPoint;
          const g = globeRef.current;
          if (!g) return;
          const coords = g.getCoords(p.lat, p.lng, p.alt);
          obj.position.set(coords.x, coords.y, coords.z);
          obj.lookAt(0, 0, 0);
          obj.rotateX(Math.PI / 2);
        }}
        htmlElementsData={anomalyMarkers}
        htmlAltitude={0.01}
        htmlElement={(d: object) => {
          const r = d as { color: string; persistent: boolean; kind: 'alert' | 'focus' };
          const el = document.createElement('div');
          el.style.transform = 'translate(-50%, -50%)';
          el.style.pointerEvents = 'none';
          if (r.kind === 'focus') {
            el.style.width = '64px';
            el.style.height = '64px';
            el.innerHTML = `
              <div style="position:relative;width:64px;height:64px">
                <div style="position:absolute;inset:0;border-radius:50%;border:2px dashed ${r.color};opacity:0.55"></div>
                <div style="position:absolute;inset:24px;border-radius:50%;background:${r.color};box-shadow:0 0 10px ${r.color}"></div>
              </div>`;
          } else if (r.persistent) {
            el.style.width = '22px';
            el.style.height = '22px';
            el.innerHTML = `
              <div style="position:relative;width:22px;height:22px">
                <div style="position:absolute;inset:2px;border-radius:50%;background:${r.color};box-shadow:0 0 14px ${r.color};opacity:0.95"></div>
                <div style="position:absolute;inset:0;border-radius:50%;border:1px solid ${r.color};opacity:0.6"></div>
                <div style="position:absolute;inset:8px;border-radius:50%;background:#fff"></div>
              </div>`;
          } else {
            el.style.width = '22px';
            el.style.height = '22px';
            el.innerHTML = `
              <div style="position:relative;width:22px;height:22px">
                <div style="position:absolute;inset:0;border-radius:50%;background:${r.color};box-shadow:0 0 18px ${r.color};animation:beltoPulse 1.6s ease-out infinite"></div>
                <div style="position:absolute;inset:7px;border-radius:50%;background:#fff"></div>
              </div>`;
          }
          return el;
        }}
        arcsData={arcs}
        arcColor={(d: object) => (d as { color: string[] }).color}
        arcAltitude={0.22}
        arcDashLength={0.4}
        arcDashGap={0.15}
        arcDashAnimateTime={1500}
        arcStroke={0.55}
        onCustomLayerClick={(d: object) => {
          const p = d as SatPoint;
          onSelectSat(p.sat.id);
        }}
        onCustomLayerHover={(d: object | null) => {
          onHoverSat(d ? (d as SatPoint).sat.id : null);
        }}
      />
      <style>{`
        @keyframes beltoPulse {
          0%   { transform: scale(0.6); opacity: 0.95; }
          80%  { transform: scale(2.6); opacity: 0;  }
          100% { transform: scale(2.6); opacity: 0;  }
        }
      `}</style>
    </div>
  );
}

// Generate a small canvas → THREE.Sprite for a sat label. Cheap (one per sat,
// regenerated only on color/dim/active-state change because customThreeObject
// is re-invoked).
function makeLabelSprite(text: string, color: string, dimmed: boolean, active: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const dpr = 2;
  const fontSize = 56;
  const cw = 512;
  const ch = 128;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Pill background — higher contrast so labels read against globe & space
  const padX = 22;
  const metrics = ctx.measureText(text);
  const w = Math.min(cw - 8, metrics.width + padX * 2);
  const h = 78;
  const x = cw / 2 - w / 2;
  const y = ch / 2 - h / 2;
  ctx.fillStyle = `rgba(0,0,0,${dimmed ? 0.45 : 0.78})`;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  // Border ring for legibility
  ctx.strokeStyle = dimmed ? 'rgba(255,255,255,0.10)' : (active ? 'rgba(255,255,255,0.55)' : `${color}88`);
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 16);
  ctx.stroke();

  // Subtle glow behind text on active for premium feel
  if (active && !dimmed) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.55)' : (active ? '#ffffff' : color);
  ctx.fillText(text, cw / 2, ch / 2 + 2);
  ctx.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  // Sprite world-units: wider & taller so they're legible from default cam dist
  sprite.scale.set(20, 5, 1);
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
