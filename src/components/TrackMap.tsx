import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { useTrackingStore } from '../store/tracking';
import type { GPSPoint, Cluster, AnomalyPoint, SimilarTrajectoryResult } from '../../shared/types';
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

const COMPARE_COLORS = [
  '#ff6b35',
  '#00f5d4',
  '#f59e0b',
  '#a855f7',
  '#22c55e',
  '#3b82f6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
];

export default function TrackMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pulsePhaseRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const {
    vehicleTrails,
    stats,
    clusters,
    anomalies,
    filterType,
    selectedVehicleId,
    selectVehicle,
    isSearchMode,
    queryPoints,
    similarResults,
    showComparison,
  } = useTrackingStore();

  const performSearch = useCallback(async (queryPts: GPSPoint[]) => {
    const { setIsSearching, setSimilarResults, setShowComparison } = useTrackingStore.getState();
    setIsSearching(true);
    try {
      const res = await fetch('/api/trajectory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryPoints: queryPts,
          topK: 10,
          vehicleType: 'all',
        }),
      });
      const data = await res.json();
      if (data.results) {
        setSimilarResults(data.results);
        setShowComparison(true);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

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

    const drawTrail = (
      context: CanvasRenderingContext2D,
      points: GPSPoint[],
      color: string,
      alpha: number,
      width: number,
      step: number,
      project: (lat: number, lng: number) => { x: number; y: number },
      useSpeedColor = false,
      type: 'taxi' | 'ship' = 'taxi',
    ) => {
      const simplified = simplifyPoints(points, step);
      const len = simplified.length;
      if (len < 2) return;

      context.lineWidth = width;
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (useSpeedColor) {
        let start = project(simplified[0].lat, simplified[0].lng);
        for (let i = 1; i < len; i++) {
          const cur = simplified[i];
          const end = project(cur.lat, cur.lng);
          const c = getVehicleColor(type, cur.speed);
          context.strokeStyle = rgbaFromHex(c, alpha);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
          start = end;
        }
      } else {
        context.strokeStyle = rgbaFromHex(color, alpha);
        context.beginPath();
        const first = project(simplified[0].lat, simplified[0].lng);
        context.moveTo(first.x, first.y);
        for (let i = 1; i < len; i++) {
          const p = project(simplified[i].lat, simplified[i].lng);
          context.lineTo(p.x, p.y);
        }
        context.stroke();
      }
    };

    const render = () => {
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

      const inCompareMode = showComparison && similarResults.length > 0;

      if (!inCompareMode && stats?.heatmapGrid && stats.heatmapGrid.length > 0) {
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

      if (inCompareMode) {
        similarResults.forEach((result: SimilarTrajectoryResult, idx: number) => {
          const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
          const pts = result.points.filter(
            (p) => isVisible(p.lat, p.lng, 0.005),
          );
          drawTrail(context, pts, color, 0.85, 2.5, Math.max(1, Math.floor(step / 2)), project);
        });
      } else {
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

        for (const trail of trails) {
          const faded = selectedVehicleId && selectedVehicleId !== trail.id;
          const baseAlpha = faded ? 0.15 : 0.75;
          const visiblePts = trail.points.filter(
            (p) => isVisible(p.lat, p.lng, 0.005),
          );
          if (visiblePts.length < 2) continue;
          drawTrail(
            context,
            visiblePts,
            '',
            baseAlpha,
            2,
            step,
            project,
            true,
            trail.type,
          );
        }
      }

      if (queryPoints.length > 1 && isSearchMode) {
        const visPts = queryPoints.filter((p) => isVisible(p.lat, p.lng, 0.005));
        drawTrail(context, visPts, '#ff6b35', 1, 3.5, 1, project);
        if (visPts.length > 0) {
          const first = project(visPts[0].lat, visPts[0].lng);
          context.fillStyle = '#22c55e';
          context.beginPath();
          context.arc(first.x, first.y, 6, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = '#fff';
          context.lineWidth = 2;
          context.stroke();

          const last = project(visPts[visPts.length - 1].lat, visPts[visPts.length - 1].lng);
          context.fillStyle = '#ef4444';
          context.beginPath();
          context.arc(last.x, last.y, 6, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = '#fff';
          context.lineWidth = 2;
          context.stroke();
        }
      }

      if (clusters && clusters.length > 0 && !inCompareMode) {
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

      if (anomalies && anomalies.length > 0 && !inCompareMode) {
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

      if (!inCompareMode) {
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
      } else {
        similarResults.forEach((result: SimilarTrajectoryResult, idx: number) => {
          const pts = result.points;
          if (pts.length === 0) return;
          const last = pts[pts.length - 1];
          if (!isVisible(last.lat, last.lng, 0.003)) return;
          const { x, y } = project(last.lat, last.lng);
          const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
          const pulseR = 7 + pulse * 4;

          context.strokeStyle = rgbaFromHex(color, 0.7);
          context.lineWidth = 2;
          context.beginPath();
          context.arc(x, y, pulseR, 0, Math.PI * 2);
          context.stroke();

          context.fillStyle = color;
          context.strokeStyle = 'rgba(10,14,26,0.9)';
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(x, y, 6, 0, Math.PI * 2);
          context.fill();
          context.stroke();

          context.fillStyle = '#fff';
          context.font = 'bold 10px JetBrains Mono, monospace';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(`${idx + 1}`, x, y);
        });
      }

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
      if (isSearchMode) {
        let targetVehicle = hit?.vehicleId;
        if (!targetVehicle) {
          const mapInst = mapInstanceRef.current;
          if (mapInst) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            let minDist = Infinity;
            vehicleTrails.forEach((trail, vid) => {
              const last = trail[trail.length - 1];
              if (!last) return;
              if (filterType !== 'all' && last.type !== filterType) return;
              const p = mapInst.latLngToContainerPoint([last.lat, last.lng]);
              const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                targetVehicle = vid;
              }
            });
          }
        }
        if (targetVehicle) {
          const trail = vehicleTrails.get(targetVehicle);
          if (trail && trail.length > 5) {
            useTrackingStore.getState().setQueryPoints(trail.slice());
            performSearch(trail.slice());
          }
        }
      } else if (hit) {
        selectVehicle(selectedVehicleId === hit.vehicleId ? null : hit.vehicleId);
      }
    };
    canvas.addEventListener('click', clickHandler);

    if (canvas) {
      canvas.style.cursor = isSearchMode ? 'crosshair' : 'pointer';
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('click', clickHandler);
    };
  }, [
    vehicleTrails,
    stats,
    clusters,
    anomalies,
    filterType,
    selectedVehicleId,
    selectVehicle,
    isSearchMode,
    queryPoints,
    similarResults,
    showComparison,
    performSearch,
  ]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full bg-[#0a0e1a] relative"
    >
      {isSearchMode && (
        <div className="absolute top-3 left-3 z-[1000] px-3 py-2 bg-[#ff6b35]/20 border border-[#ff6b35]/50 rounded text-xs font-mono text-[#ff6b35] backdrop-blur-sm">
          🔍 轨迹搜索模式：点击车辆以选择查询轨迹
        </div>
      )}
    </div>
  );
}
