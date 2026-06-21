import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useTrackingStore } from '../store/tracking';
import type { GPSPoint, Cluster, AnomalyPoint } from '../../shared/types';
import 'leaflet/dist/leaflet.css';

const SHANGHAI_CENTER: [number, number] = [31.2304, 121.4737];

function getVehicleColor(type: 'taxi' | 'ship', speed: number): string {
  if (type === 'ship') return '#38bdf8';
  if (speed > 60) return '#ef4444';
  if (speed > 40) return '#f59e0b';
  if (speed > 20) return '#10b981';
  return '#00f5d4';
}

function rgbaFromHex(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function TrackMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pulsePhaseRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);

  const {
    vehicleTrails,
    stats,
    clusters,
    anomalies,
    filterType,
    selectedVehicleId,
    selectVehicle,
  } = useTrackingStore();

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: SHANGHAI_CENTER,
      zoom: 12,
      minZoom: 10,
      maxZoom: 16,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);

    const canvasPane = map.createPane('canvasPane');
    canvasPane.style.zIndex = '450';
    canvasPane.style.pointerEvents = 'none';

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'auto';
    canvasPane.appendChild(canvas);
    canvasRef.current = canvas;

    const resizeCanvas = () => {
      if (!canvasRef.current) return;
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      canvasRef.current.width = size.x * dpr;
      canvasRef.current.height = size.y * dpr;
      canvasRef.current.style.width = `${size.x}px`;
      canvasRef.current.style.height = `${size.y}px`;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeCanvas();
    map.on('resize', resizeCanvas);
    mapInstanceRef.current = map;

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off('resize', resizeCanvas);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getStepByZoom = (zoom: number): number => {
      if (zoom < 11) return 8;
      if (zoom < 12) return 5;
      if (zoom < 13) return 3;
      if (zoom < 14) return 2;
      return 1;
    };

    const simplifyPoints = (pts: GPSPoint[], step: number): GPSPoint[] => {
      if (step <= 1 || pts.length < 5) return pts;
      const result: GPSPoint[] = [];
      for (let i = 0; i < pts.length; i += step) {
        result.push(pts[i]);
      }
      const last = pts[pts.length - 1];
      if (result[result.length - 1] !== last) result.push(last);
      return result;
    };

    const render = (t: number) => {
      const canvasEl = canvasRef.current;
      const mapInst = mapInstanceRef.current;
      if (!canvasEl || !mapInst) return;
      const context = canvasEl.getContext('2d');
      if (!context) return;

      const size = mapInst.getSize();
      context.clearRect(0, 0, size.x, size.y);

      const bounds = mapInst.getBounds();
      const minLat = bounds.getSouth();
      const maxLat = bounds.getNorth();
      const minLng = bounds.getWest();
      const maxLng = bounds.getEast();

      const isVisible = (lat: number, lng: number, pad = 0.005): boolean =>
        lat >= minLat - pad && lat <= maxLat + pad &&
        lng >= minLng - pad && lng <= maxLng + pad;

      const project = (lat: number, lng: number): { x: number; y: number } => {
        const p = mapInst.latLngToContainerPoint([lat, lng]);
        return { x: p.x, y: p.y };
      };

      const zoom = mapInst.getZoom();
      const step = getStepByZoom(zoom);
      pulsePhaseRef.current += 0.04;
      const pulse = (Math.sin(pulsePhaseRef.current) + 1) * 0.5;

      const trails: Array<{
        id: string;
        type: 'taxi' | 'ship';
        points: GPSPoint[];
      }> = [];
      vehicleTrails.forEach((trail, id) => {
        const first = trail[0];
        if (!first) return;
        if (filterType !== 'all' && first.type !== filterType) return;
        if (trail.length < 2) return;
        trails.push({ id, type: first.type, points: trail });
      });

      if (stats?.heatmapGrid && stats.heatmapGrid.length > 0) {
        for (const h of stats.heatmapGrid) {
          if (!isVisible(h.lat, h.lng, 0.01)) continue;
          const { x, y } = project(h.lat, h.lng);
          const r = 30;
          const grad = context.createRadialGradient(x, y, 0, x, y, r);
          const alpha = h.intensity * 0.28;
          grad.addColorStop(0, `rgba(255,107,53,${alpha})`);
          grad.addColorStop(0.4, `rgba(245,158,11,${alpha * 0.6})`);
          grad.addColorStop(1, 'rgba(0,245,212,0)');
          context.fillStyle = grad;
          context.beginPath();
          context.arc(x, y, r, 0, Math.PI * 2);
          context.fill();
        }
      }

      for (const trail of trails) {
        const simplified = simplifyPoints(trail.points, step);
        const len = simplified.length;
        if (len < 2) continue;

        const faded = selectedVehicleId && selectedVehicleId !== trail.id;
        const baseAlpha = faded ? 0.15 : 0.75;

        context.lineWidth = 2;
        context.lineCap = 'round';
        context.lineJoin = 'round';

        let start = project(simplified[0].lat, simplified[0].lng);
        for (let i = 1; i < len; i++) {
          const cur = simplified[i];
          const end = project(cur.lat, cur.lng);
          const color = getVehicleColor(trail.type, cur.speed);
          context.strokeStyle = rgbaFromHex(color, baseAlpha);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
          start = end;
        }
      }

      if (clusters && clusters.length > 0) {
        for (const c of clusters) {
          if (!isVisible(c.centerLat, c.centerLng, 0.005)) continue;
          const { x, y } = project(c.centerLat, c.centerLng);
          const r = 15 + Math.min(30, c.pointCount / 5);

          context.strokeStyle = 'rgba(0,245,212,0.9)';
          context.lineWidth = 2;
          context.setLineDash([4, 3]);
          context.beginPath();
          context.arc(x, y, r, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);

          context.fillStyle = 'rgba(0,245,212,0.12)';
          context.beginPath();
          context.arc(x, y, r, 0, Math.PI * 2);
          context.fill();

          context.fillStyle = '#00f5d4';
          context.font = 'bold 10px JetBrains Mono, monospace';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(`${c.vehicleIds.length}车`, x, y);
        }
      }

      if (anomalies && anomalies.length > 0) {
        for (const a of anomalies) {
          if (!isVisible(a.lat, a.lng, 0.003)) continue;
          const { x, y } = project(a.lat, a.lng);
          const pulseR = 14 + pulse * 6;

          context.strokeStyle = 'rgba(255,107,53,0.8)';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(x, y, pulseR, 0, Math.PI * 2);
          context.stroke();

          context.fillStyle = 'rgba(255,107,53,0.2)';
          context.beginPath();
          context.arc(x, y, 14, 0, Math.PI * 2);
          context.fill();

          context.font = '14px sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText('⚠', x, y);
        }
      }

      const markerData: (GPSPoint & { x: number; y: number })[] = [];
      vehicleTrails.forEach((trail) => {
        const last = trail[trail.length - 1];
        if (!last) return;
        if (filterType !== 'all' && last.type !== filterType) return;
        if (!isVisible(last.lat, last.lng, 0.003)) return;
        const { x, y } = project(last.lat, last.lng);
        markerData.push({ ...last, x, y });
      });

      for (const d of markerData) {
        const faded = selectedVehicleId && selectedVehicleId !== d.vehicleId;
        const markerAlpha = faded ? 0.3 : 1;
        const color = getVehicleColor(d.type, d.speed);
        const pulseR = 6 + pulse * 5;

        context.strokeStyle = rgbaFromHex(color, markerAlpha * 0.6);
        context.lineWidth = 2;
        context.beginPath();
        context.arc(d.x, d.y, pulseR, 0, Math.PI * 2);
        context.stroke();

        context.fillStyle = rgbaFromHex(color, markerAlpha);
        context.strokeStyle = 'rgba(10,14,26,0.9)';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(d.x, d.y, 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        context.font = '12px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.globalAlpha = markerAlpha;
        context.fillText(d.type === 'taxi' ? '🚕' : '🚢', d.x, d.y + 1);
        context.globalAlpha = 1;
      }

      lastRenderTimeRef.current = t;
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    const hitTest = (clientX: number, clientY) => {
      const mapInst = mapInstanceRef.current;
      if (!mapInst) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const markerCandidates: { d: GPSPoint & { x: number; y: number }; dist: number }[] = [];
      vehicleTrails.forEach((trail) => {
        const last = trail[trail.length - 1];
        if (!last) return;
        if (filterType !== 'all' && last.type !== filterType) return;
        const p = mapInst.latLngToContainerPoint([last.lat, last.lng]);
        const dx = p.x - x;
        const dy = p.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 14) markerCandidates.push({ d: last, dist });
      });
      markerCandidates.sort((a, b) => a.dist - b.dist);
      return markerCandidates[0]?.d || null;
    };

    const clickHandler = (e: MouseEvent) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) {
        selectVehicle(selectedVehicleId === hit.vehicleId ? null : hit.vehicleId);
      }
    };
    canvas.addEventListener('click', clickHandler);

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('click', clickHandler);
    };
  }, [vehicleTrails, stats, clusters, anomalies, filterType, selectedVehicleId, selectVehicle]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full bg-[#0a0e1a]"
    />
  );
}
