import type {
  GPSPoint,
  WorkerInMessage,
  WorkerOutMessage,
  StatsData,
  Cluster,
  AnomalyPoint,
} from '../../shared/types';

interface VehicleState {
  lastPoint: GPSPoint | null;
  stationaryStart: number | null;
  lastMoveTime: number | null;
  trail: GPSPoint[];
}

const MAX_POINTS = 20000;
const ALL_POINTS: GPSPoint[] = [];
const VEHICLE_STATES = new Map<string, VehicleState>();
const STATIONARY_THRESHOLD_KMH = 3;
const ANOMALY_DURATION_MS = 5 * 60 * 1000;
const STATS_INTERVAL_MS = 1000;

function computeSpeedHistogram(
  points: GPSPoint[],
): Array<{ bin: number; count: number }> {
  if (points.length === 0) return [];
  const bins = new Array(12).fill(0);
  const maxSpeed = 120;
  const binSize = maxSpeed / bins.length;
  for (const p of points) {
    const binIdx = Math.min(bins.length - 1, Math.floor(p.speed / binSize));
    bins[binIdx]++;
  }
  return bins.map((count, i) => ({ bin: i * binSize, count }));
}

function computeHeatmap(
  points: GPSPoint[],
): Array<{ lat: number; lng: number; intensity: number }> {
  if (points.length === 0) return [];
  const grid = new Map<string, { lat: number; lng: number; count: number }>();
  const precision = 3;
  for (const p of points) {
    const key = `${p.lat.toFixed(precision)}_${p.lng.toFixed(precision)}`;
    const cell = grid.get(key);
    if (cell) {
      cell.count++;
    } else {
      grid.set(key, { lat: p.lat, lng: p.lng, count: 1 });
    }
  }
  const arr = Array.from(grid.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);
  if (arr.length === 0) return [];
  const maxCount = arr[0].count;
  return arr.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    intensity: Math.sqrt(c.count / maxCount),
  }));
}

function dbscanClustering(points: GPSPoint[]): Cluster[] {
  if (points.length < 3) return [];
  const recent = points.slice(-3000);
  const epsilon = 0.002;
  const minPts = 5;
  const clusters: Cluster[] = [];
  const visited = new Set<number>();
  const visitedVehiclesInCluster = new Map<string, Set<string>>();

  function getNeighbors(idx: number): number[] {
    const neighbors: number[] = [];
    const p = recent[idx];
    for (let j = 0; j < recent.length; j++) {
      if (j === idx) continue;
      const q = recent[j];
      const dLat = p.lat - q.lat;
      const dLng = p.lng - q.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < epsilon) {
        neighbors.push(j);
      }
    }
    return neighbors;
  }

  for (let i = 0; i < recent.length; i++) {
    if (visited.has(i)) continue;
    const neighbors = getNeighbors(i);
    if (neighbors.length >= minPts) {
      const clusterPoints: number[] = [i];
      const vehicleIds = new Set<string>();
      vehicleIds.add(recent[i].vehicleId);
      let j = 0;
      while (j < clusterPoints.length) {
        const pointIdx = clusterPoints[j];
        if (!visited.has(pointIdx)) {
          visited.add(pointIdx);
          const pointNeighbors = getNeighbors(pointIdx);
          if (pointNeighbors.length >= minPts) {
            for (const n of pointNeighbors) {
              if (!clusterPoints.includes(n)) {
                clusterPoints.push(n);
                vehicleIds.add(recent[n].vehicleId);
              }
            }
          }
        }
        j++;
      }
      if (clusterPoints.length >= minPts) {
        let sumLat = 0,
          sumLng = 0;
        for (const idx of clusterPoints) {
          sumLat += recent[idx].lat;
          sumLng += recent[idx].lng;
        }
        const cId = `cluster-${clusters.length}`;
        visitedVehiclesInCluster.set(cId, vehicleIds);
        clusters.push({
          id: cId,
          centerLat: sumLat / clusterPoints.length,
          centerLng: sumLng / clusterPoints.length,
          pointCount: clusterPoints.length,
          vehicleIds: Array.from(vehicleIds),
        });
      }
    }
  }
  return clusters.sort((a, b) => b.pointCount - a.pointCount).slice(0, 10);
}

function detectAnomalies(points: GPSPoint[]): AnomalyPoint[] {
  const anomalies: AnomalyPoint[] = [];
  const now = Date.now();

  for (const p of points) {
    let state = VEHICLE_STATES.get(p.vehicleId);
    if (!state) {
      state = {
        lastPoint: null,
        stationaryStart: null,
        lastMoveTime: null,
        trail: [],
      };
      VEHICLE_STATES.set(p.vehicleId, state);
    }

    state.trail.push(p);
    if (state.trail.length > 50) state.trail.shift();

    if (p.speed < STATIONARY_THRESHOLD_KMH) {
      if (!state.stationaryStart) {
        state.stationaryStart = p.timestamp;
      }
      const duration = p.timestamp - state.stationaryStart;
      if (duration >= ANOMALY_DURATION_MS) {
        let sumLat = 0,
          sumLng = 0,
          sumSpeed = 0;
        for (const tp of state.trail) {
          sumLat += tp.lat;
          sumLng += tp.lng;
          sumSpeed += tp.speed;
        }
        const n = state.trail.length;
        const anomalyId = `${p.vehicleId}-${state.stationaryStart}`;
        const existing = anomalies.find((a) => a.id === anomalyId);
        if (!existing) {
          anomalies.push({
            id: anomalyId,
            vehicleId: p.vehicleId,
            type: p.type,
            lat: sumLat / n,
            lng: sumLng / n,
            startTime: state.stationaryStart,
            endTime: p.timestamp,
            durationMinutes: duration / 60000,
            avgSpeed: sumSpeed / n,
          });
        } else {
          existing.endTime = p.timestamp;
          existing.durationMinutes = duration / 60000;
        }
      }
    } else {
      state.stationaryStart = null;
    }
    state.lastPoint = p;
  }
  return anomalies.sort((a, b) => b.durationMinutes - a.durationMinutes).slice(0, 30);
}

function computeStats(): StatsData {
  const activeVehicles = VEHICLE_STATES.size;
  return {
    speedHistogram: computeSpeedHistogram(ALL_POINTS.slice(-5000)),
    heatmapGrid: computeHeatmap(ALL_POINTS.slice(-10000)),
    totalPoints: ALL_POINTS.length,
    activeVehicles,
  };
}

let lastStatsTime = 0;
let initialized = false;

self.onmessage = function (e: MessageEvent<WorkerInMessage>) {
  const msg = e.data;

  switch (msg.type) {
    case 'ADD_POINTS': {
      if (msg.points && msg.points.length > 0) {
        for (const p of msg.points) {
          ALL_POINTS.push(p);
        }
        if (ALL_POINTS.length > MAX_POINTS) {
          ALL_POINTS.splice(0, ALL_POINTS.length - MAX_POINTS);
        }
      }
      const now = Date.now();
      const shouldCompute = !initialized || now - lastStatsTime >= STATS_INTERVAL_MS;
      if (shouldCompute && ALL_POINTS.length > 0) {
        initialized = true;
        lastStatsTime = now;
        try {
          const stats = computeStats();
          self.postMessage({
            type: 'STATS_UPDATE',
            data: stats,
          } as WorkerOutMessage);

          const clusters = dbscanClustering(ALL_POINTS);
          self.postMessage({
            type: 'CLUSTERS_UPDATE',
            data: clusters,
          } as WorkerOutMessage);

          const anomalies = detectAnomalies(msg.points || []);
          if (anomalies.length > 0) {
            self.postMessage({
              type: 'ANOMALIES_UPDATE',
              data: anomalies,
            } as WorkerOutMessage);
          }
        } catch (err) {
          console.error('Worker compute error:', err);
        }
      } else if (!initialized && ALL_POINTS.length === 0) {
        self.postMessage({
          type: 'STATS_UPDATE',
          data: {
            speedHistogram: [],
            heatmapGrid: [],
            totalPoints: 0,
            activeVehicles: 0,
          },
        } as WorkerOutMessage);
      }
      break;
    }
    case 'RESET': {
      ALL_POINTS.length = 0;
      VEHICLE_STATES.clear();
      initialized = false;
      lastStatsTime = 0;
      break;
    }
  }
};

self.postMessage({
  type: 'STATS_UPDATE',
  data: {
    speedHistogram: [],
    heatmapGrid: [],
    totalPoints: 0,
    activeVehicles: 0,
  },
} as WorkerOutMessage);
