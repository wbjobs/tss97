export type VehicleType = 'taxi' | 'ship';

export interface GPSPoint {
  id: string;
  vehicleId: string;
  type: VehicleType;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: number;
}

export interface Vehicle {
  id: string;
  type: VehicleType;
  name: string;
  baseLat: number;
  baseLng: number;
  currentLat: number;
  currentLng: number;
  currentSpeed: number;
  currentHeading: number;
  lastUpdate: number;
}

export interface WSMessage {
  type: 'gps_batch' | 'status';
  data: GPSPoint[] | { connected: number; throughput: number };
}

export interface WorkerInMessage {
  type: 'ADD_POINTS' | 'GET_STATS' | 'RESET';
  points?: GPSPoint[];
}

export interface SpeedBin {
  bin: number;
  count: number;
}

export interface HeatmapCell {
  lat: number;
  lng: number;
  intensity: number;
}

export interface StatsData {
  speedHistogram: SpeedBin[];
  heatmapGrid: HeatmapCell[];
  totalPoints: number;
  activeVehicles: number;
}

export interface Cluster {
  id: string;
  centerLat: number;
  centerLng: number;
  pointCount: number;
  vehicleIds: string[];
}

export interface AnomalyPoint {
  id: string;
  vehicleId: string;
  type: VehicleType;
  lat: number;
  lng: number;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  avgSpeed: number;
}

export interface WorkerOutMessage {
  type: 'STATS_UPDATE' | 'CLUSTERS_UPDATE' | 'ANOMALIES_UPDATE';
  data: StatsData | Cluster[] | AnomalyPoint[];
}

export interface VehicleInfo {
  id: string;
  type: VehicleType;
  lastLat: number;
  lastLng: number;
  lastSpeed: number;
  lastUpdate: number;
}
