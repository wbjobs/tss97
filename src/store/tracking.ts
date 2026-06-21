import { create } from 'zustand';
import type {
  GPSPoint,
  StatsData,
  Cluster,
  AnomalyPoint,
  VehicleInfo,
} from '../../shared/types';

export type ViewMode = 'realtime' | 'playback';

interface TrackingState {
  points: GPSPoint[];
  vehicleTrails: Map<string, GPSPoint[]>;
  selectedVehicleId: string | null;
  stats: StatsData | null;
  clusters: Cluster[];
  anomalies: AnomalyPoint[];
  vehicles: VehicleInfo[];
  viewMode: ViewMode;
  isConnected: boolean;
  throughput: number;
  fps: number;
  filterType: 'all' | 'taxi' | 'ship';

  setViewMode: (mode: ViewMode) => void;
  setFilterType: (type: 'all' | 'taxi' | 'ship') => void;
  addPoints: (points: GPSPoint[]) => void;
  setStats: (stats: StatsData) => void;
  setClusters: (clusters: Cluster[]) => void;
  setAnomalies: (anomalies: AnomalyPoint[]) => void;
  setVehicles: (vehicles: VehicleInfo[]) => void;
  selectVehicle: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
  setThroughput: (rate: number) => void;
  setFps: (fps: number) => void;
  clearAll: () => void;
}

export const useTrackingStore = create<TrackingState>((set, get) => ({
  points: [],
  vehicleTrails: new Map(),
  selectedVehicleId: null,
  stats: null,
  clusters: [],
  anomalies: [],
  vehicles: [],
  viewMode: 'realtime',
  isConnected: false,
  throughput: 0,
  fps: 0,
  filterType: 'all',

  setViewMode: (mode) => set({ viewMode: mode }),
  setFilterType: (type) => set({ filterType: type }),

  addPoints: (newPoints) => {
    const state = get();
    const filterType = state.filterType;
    const filtered =
      filterType === 'all'
        ? newPoints
        : newPoints.filter((p) => p.type === filterType);

    const trails = new Map(state.vehicleTrails);
    for (const p of filtered) {
      const trail = trails.get(p.vehicleId) || [];
      trail.push(p);
      if (trail.length > 200) trail.splice(0, trail.length - 200);
      trails.set(p.vehicleId, trail);
    }

    const allPoints = [...state.points, ...filtered];
    const maxPoints = 30000;
    const trimmedPoints =
      allPoints.length > maxPoints
        ? allPoints.slice(allPoints.length - maxPoints)
        : allPoints;

    set({
      points: trimmedPoints,
      vehicleTrails: trails,
    });
  },

  setStats: (stats) => set({ stats }),
  setClusters: (clusters) => set({ clusters }),
  setAnomalies: (anomalies) => set({ anomalies }),
  setVehicles: (vehicles) => set({ vehicles }),
  selectVehicle: (id) => set({ selectedVehicleId: id }),
  setConnected: (connected) => set({ isConnected: connected }),
  setThroughput: (rate) => set({ throughput: rate }),
  setFps: (fps) => set({ fps }),
  clearAll: () =>
    set({
      points: [],
      vehicleTrails: new Map(),
      selectedVehicleId: null,
    }),
}));
