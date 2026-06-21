import type {
  GPSPoint,
  WorkerInMessage,
  WorkerOutMessage,
  StatsData,
  Cluster,
  AnomalyPoint,
  HeatmapCell,
} from '../../shared/types';

interface VehicleState {
  lastPoint: GPSPoint | null;
  stationaryStart: number | null;
  candidateStart: number | null;
  lastMoveTime: number | null;
  stationaryAnchorLat: number | null;
  stationaryAnchorLng: number | null;
  trail: GPSPoint[];
}

const MAX_POINTS = 20000;
const ALL_POINTS: GPSPoint[] = [];
const VEHICLE_STATES = new Map<string, VehicleState>();

const STATIONARY_SPEED_KMH = 3;
const MOVE_THRESHOLD_KMH = 15;
const CANDIDATE_BUFFER_MS = 2 * 60 * 1000;
const ANOMALY_DURATION_MS = 5 * 60 * 1000;
const SPACE_DRIFT_DEG = 0.001;

const STATS_INTERVAL_MS = 1000;
const HEATMAP_PRECISION = 3;

const HEATMAP_GRID = new Map<
  string,
  { lat: number; lng: number; count: number; lastSeen: number }
>();
const HEATMAP_WINDOW_MS = 5 * 60 * 1000;

const SPEED_HISTOGRAM_BINS = 12;
const SPEED_HISTOGRAM = new Array(SPEED_HISTOGRAM_BINS).fill(0);
const SPEED_HISTOGRAM_TOTAL = { count: 0, windowStart: Date.now() };

function updateHeatmapIncremental(points: GPSPoint[]) {
  const now = Date.now();
  for (const p of points) {
    const key = `${p.lat.toFixed(HEATMAP_PRECISION)}_${p.lng.toFixed(HEATMAP_PRECISION)}`;
    const cell = HEATMAP_GRID.get(key);
    if (cell) {
      cell.count++;
      cell.lastSeen = now;
    } else {
      HEATMAP_GRID.set(key, {
        lat: parseFloat(p.lat.toFixed(HEATMAP_PRECISION)),
        lng: parseFloat(p.lng.toFixed(HEATMAP_PRECISION)),
        count: 1,
        lastSeen: now,
      });
    }
  }

  const cutoff = now - HEATMAP_WINDOW_MS;
  for (const [key, cell] of HEATMAP_GRID) {
    if (cell.lastSeen < cutoff) {
      const ageFactor = Math.max(0, 1 - (cutoff - cell.lastSeen) / HEATMAP_WINDOW_MS);
      cell.count = Math.floor(cell.count * ageFactor);
      if (cell.count <= 0) HEATMAP_GRID.delete(key);
    }
  }
}

function getHeatmapSnapshot(): HeatmapCell[] {
  if (HEATMAP_GRID.size === 0) return [];
  const arr = Array.from(HEATMAP_GRID.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);
  if (arr.length === 0) return [];
  const maxCount = Math.max(1, arr[0].count);
  return arr.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    intensity: Math.sqrt(c.count / maxCount),
  }));
}

function updateSpeedHistogramIncremental(points: GPSPoint[]) {
  const maxSpeed = 120;
  const binSize = maxSpeed / SPEED_HISTOGRAM_BINS;
  const now = Date.now();

  if (now - SPEED_HISTOGRAM_TOTAL.windowStart > 60_000) {
    for (let i = 0; i < SPEED_HISTOGRAM.length; i++) {
      SPEED_HISTOGRAM[i] = Math.floor(SPEED_HISTOGRAM[i] * 0.5);
    }
    SPEED_HISTOGRAM_TOTAL.windowStart = now;
  }

  for (const p of points) {
    const binIdx = Math.min(
      SPEED_HISTOGRAM_BINS - 1,
      Math.floor(p.speed / binSize),
    );
    SPEED_HISTOGRAM[binIdx]++;
    SPEED_HISTOGRAM_TOTAL.count++;
  }
}

function getSpeedHistogramSnapshot() {
  const maxSpeed = 120;
  const binSize = maxSpeed / SPEED_HISTOGRAM_BINS;
  return SPEED_HISTOGRAM.map((count, i) => ({
    bin: i * binSize,
    count,
  }));
}

function dbscanClustering(points: GPSPoint[]): Cluster[] {
  if (points.length < 3) return [];
  const recent = points.slice(-2000);
  const epsilon = 0.002;
  const minPts = 5;
  const clusters: Cluster[] = [];
  const visited = new Set<number>();

  function getNeighbors(idx: number): number[] {
    const neighbors: number[] = [];
    const p = recent[idx];
    for (let j = 0; j < recent.length; j++) {
      if (j === idx) continue;
      const q = recent[j];
      const dLat = p.lat - q.lat;
      const dLng = p.lng - q.lng;
      const distSq = dLat * dLat + dLng * dLng;
      if (distSq < epsilon * epsilon) neighbors.push(j);
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
        let sumLat = 0, sumLng = 0;
        for (const idx of clusterPoints) {
          sumLat += recent[idx].lat;
          sumLng += recent[idx].lng;
        }
        clusters.push({
          id: `cluster-${clusters.length}`,
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

  for (const p of points) {
    let state = VEHICLE_STATES.get(p.vehicleId);
    if (!state) {
      state = {
        lastPoint: null,
        stationaryStart: null,
        candidateStart: null,
        lastMoveTime: null,
        stationaryAnchorLat: null,
        stationaryAnchorLng: null,
        trail: [],
      };
      VEHICLE_STATES.set(p.vehicleId, state);
    }

    state.trail.push(p);
    if (state.trail.length > 120) state.trail.shift();

    const now = p.timestamp;

    if (p.speed < STATIONARY_SPEED_KMH) {
      if (state.stationaryAnchorLat === null || state.stationaryAnchorLng === null) {
        state.stationaryAnchorLat = p.lat;
        state.stationaryAnchorLng = p.lng;
      }
      const driftLat = Math.abs(p.lat - state.stationaryAnchorLat);
      const driftLng = Math.abs(p.lng - state.stationaryAnchorLng);
      const driftTooLarge = driftLat > SPACE_DRIFT_DEG || driftLng > SPACE_DRIFT_DEG;

      if (driftTooLarge) {
        state.candidateStart = null;
        state.stationaryStart = null;
        state.stationaryAnchorLat = p.lat;
        state.stationaryAnchorLng = p.lng;
        continue;
      }

      if (!state.candidateStart) {
        state.candidateStart = now;
      }

      const candidateDuration = now - state.candidateStart;

      if (candidateDuration >= CANDIDATE_BUFFER_MS) {
        if (!state.stationaryStart) state.stationaryStart = state.candidateStart;

        const stationaryDuration = now - state.stationaryStart;
        if (stationaryDuration >= ANOMALY_DURATION_MS && state.trail.length > 0) {
          let sumLat = 0, sumLng = 0, sumSpeed = 0;
          for (const tp of state.trail) {
            sumLat += tp.lat;
            sumLng += tp.lng;
            sumSpeed += tp.speed;
          }
          const n = state.trail.length;
          const anomalyId = `${p.vehicleId}-${state.stationaryStart}`;
          const existing = anomalies.find((a) => a.id === anomalyId);
          const payload = {
            id: anomalyId,
            vehicleId: p.vehicleId,
            type: p.type,
            lat: sumLat / n,
            lng: sumLng / n,
            startTime: state.stationaryStart,
            endTime: now,
            durationMinutes: stationaryDuration / 60000,
            avgSpeed: sumSpeed / n,
          };
          if (!existing) anomalies.push(payload);
          else Object.assign(existing, payload);
        }
      }
    } else if (p.speed >= MOVE_THRESHOLD_KMH) {
      state.candidateStart = null;
      state.stationaryStart = null;
      state.stationaryAnchorLat = null;
      state.stationaryAnchorLng = null;
      state.lastMoveTime = now;
    } else {
      state.lastMoveTime = now;
    }

    state.lastPoint = p;
  }
  return anomalies.sort((a, b) => b.durationMinutes - a.durationMinutes).slice(0, 30);
}

function computeStats(): StatsData {
  return {
    speedHistogram: getSpeedHistogramSnapshot(),
    heatmapGrid: getHeatmapSnapshot(),
    totalPoints: ALL_POINTS.length,
    activeVehicles: VEHICLE_STATES.size,
  };
}

let lastStatsTime = 0;
let initialized = false;

self.onmessage = function (e: MessageEvent<WorkerInMessage>) {
  const msg = e.data;

  switch (msg.type) {
    case 'ADD_POINTS': {
      const incoming = msg.points || [];
      if (incoming.length > 0) {
        for (const p of incoming) ALL_POINTS.push(p);
        if (ALL_POINTS.length > MAX_POINTS) {
          ALL_POINTS.splice(0, ALL_POINTS.length - MAX_POINTS);
        }
        updateHeatmapIncremental(incoming);
        updateSpeedHistogramIncremental(incoming);
      }

      const now = Date.now();
      const shouldCompute = !initialized || now - lastStatsTime >= STATS_INTERVAL_MS;

      if (shouldCompute && ALL_POINTS.length > 0) {
        initialized = true;
        lastStatsTime = now;
        try {
          const stats = computeStats();
          self.postMessage({ type: 'STATS_UPDATE', data: stats } as WorkerOutMessage);

          const clusters = dbscanClustering(ALL_POINTS);
          self.postMessage({ type: 'CLUSTERS_UPDATE', data: clusters } as WorkerOutMessage);

          const anomalies = detectAnomalies(incoming);
          if (anomalies.length > 0) {
            self.postMessage({ type: 'ANOMALIES_UPDATE', data: anomalies } as WorkerOutMessage);
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
      HEATMAP_GRID.clear();
      for (let i = 0; i < SPEED_HISTOGRAM.length; i++) SPEED_HISTOGRAM[i] = 0;
      SPEED_HISTOGRAM_TOTAL.count = 0;
      SPEED_HISTOGRAM_TOTAL.windowStart = Date.now();
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
