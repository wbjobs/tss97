import { useEffect, useRef, useCallback } from 'react';
import { useTrackingStore } from '../store/tracking';
import type { GPSPoint, WSMessage, StatsData, HeatmapCell, SpeedBin } from '../../shared/types';

const MAIN_HISTOGRAM = new Array(12).fill(0);
const MAIN_HEATMAP = new Map<
  string,
  { lat: number; lng: number; count: number; lastSeen: number }
>();
let MAIN_WINDOW_START = Date.now();

function computeStatsMainThread(points: GPSPoint[]): StatsData {
  const HISTOGRAM_BINS = 12;
  const MAX_SPEED = 120;
  const BIN_SIZE = MAX_SPEED / HISTOGRAM_BINS;
  const HEAT_PRECISION = 3;
  const HEAT_WINDOW_MS = 5 * 60 * 1000;

  const now = Date.now();

  if (now - MAIN_WINDOW_START > 60_000) {
    for (let i = 0; i < MAIN_HISTOGRAM.length; i++) {
      MAIN_HISTOGRAM[i] = Math.floor(MAIN_HISTOGRAM[i] * 0.5);
    }
    MAIN_WINDOW_START = now;
  }

  const vehicleIds = new Set<string>();

  for (const p of points) {
    vehicleIds.add(p.vehicleId);
    const binIdx = Math.min(HISTOGRAM_BINS - 1, Math.floor(p.speed / BIN_SIZE));
    MAIN_HISTOGRAM[binIdx]++;

    const key = `${p.lat.toFixed(HEAT_PRECISION)}_${p.lng.toFixed(HEAT_PRECISION)}`;
    const cell = MAIN_HEATMAP.get(key);
    if (cell) {
      cell.count++;
      cell.lastSeen = now;
    } else {
      MAIN_HEATMAP.set(key, {
        lat: parseFloat(p.lat.toFixed(HEAT_PRECISION)),
        lng: parseFloat(p.lng.toFixed(HEAT_PRECISION)),
        count: 1,
        lastSeen: now,
      });
    }
  }

  const cutoff = now - HEAT_WINDOW_MS;
  for (const [key, cell] of MAIN_HEATMAP) {
    if (cell.lastSeen < cutoff) {
      const ageFactor = Math.max(0, 1 - (cutoff - cell.lastSeen) / HEAT_WINDOW_MS);
      cell.count = Math.floor(cell.count * ageFactor);
      if (cell.count <= 0) MAIN_HEATMAP.delete(key);
    }
  }

  const histogram: SpeedBin[] = MAIN_HISTOGRAM.map((count, i) => ({
    bin: i * BIN_SIZE,
    count,
  }));

  const arr = Array.from(MAIN_HEATMAP.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);
  const maxCount = arr.length > 0 ? Math.max(1, arr[0].count) : 1;
  const heatmap: HeatmapCell[] = arr.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    intensity: Math.sqrt(c.count / maxCount),
  }));

  return {
    speedHistogram: histogram,
    heatmapGrid: heatmap,
    totalPoints: points.length,
    activeVehicles: vehicleIds.size,
  };
}

export function useTrackingWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const fpsFrameRef = useRef<number>(0);
  const fpsCountRef = useRef<number>(0);
  const fpsLastRef = useRef<number>(Date.now());
  const mainThreadPointsRef = useRef<GPSPoint[]>([]);
  const lastMainStatsTime = useRef<number>(0);
  const workerReadyRef = useRef<boolean>(false);

  const addPoints = useTrackingStore((s) => s.addPoints);
  const setConnected = useTrackingStore((s) => s.setConnected);
  const setThroughput = useTrackingStore((s) => s.setThroughput);
  const setStats = useTrackingStore((s) => s.setStats);
  const setClusters = useTrackingStore((s) => s.setClusters);
  const setAnomalies = useTrackingStore((s) => s.setAnomalies);
  const setFps = useTrackingStore((s) => s.setFps);

  const initWorker = useCallback(() => {
    if (workerRef.current) return;
    try {
      const worker = new Worker(
        new URL('../workers/tracking.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        workerReadyRef.current = true;
        if (msg.type === 'STATS_UPDATE') {
          setStats(msg.data);
        } else if (msg.type === 'CLUSTERS_UPDATE') {
          setClusters(msg.data);
        } else if (msg.type === 'ANOMALIES_UPDATE') {
          setAnomalies(msg.data);
        }
      };
      worker.onerror = (err) => {
        console.warn('Worker error (using main thread fallback):', err);
      };
      workerRef.current = worker;
    } catch (err) {
      console.warn('Worker init failed, using main thread fallback:', err);
    }
  }, [setStats, setClusters, setAnomalies]);

  const tickFPS = useCallback(() => {
    fpsCountRef.current++;
    const now = Date.now();
    if (now - fpsLastRef.current >= 1000) {
      setFps(fpsCountRef.current);
      fpsCountRef.current = 0;
      fpsLastRef.current = now;
    }
    fpsFrameRef.current = requestAnimationFrame(tickFPS);
  }, [setFps]);

  const connect = useCallback(() => {
    initWorker();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'gps_batch' && Array.isArray(msg.data)) {
          const points = msg.data as GPSPoint[];
          addPoints(points);

          mainThreadPointsRef.current.push(...points);
          if (mainThreadPointsRef.current.length > 5000) {
            mainThreadPointsRef.current.splice(0, mainThreadPointsRef.current.length - 5000);
          }

          const now = Date.now();
          if (!workerReadyRef.current && now - lastMainStatsTime.current >= 1000) {
            lastMainStatsTime.current = now;
            const stats = computeStatsMainThread(mainThreadPointsRef.current);
            setStats(stats);
          }

          if (workerRef.current) {
            try {
              workerRef.current.postMessage({
                type: 'ADD_POINTS',
                points,
              });
            } catch (_) {
              // ignore worker errors, main thread fallback is active
            }
          }
        } else if (msg.type === 'status') {
          const status = msg.data as { connected: number; throughput: number };
          setThroughput(status.throughput);
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (e) => {
      console.warn('WS warning:', e);
    };

    wsRef.current = ws;
  }, [initWorker, addPoints, setConnected, setThroughput, setStats]);

  useEffect(() => {
    connect();
    tickFPS();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (workerRef.current) workerRef.current.terminate();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      cancelAnimationFrame(fpsFrameRef.current);
    };
  }, [connect, tickFPS]);
}
