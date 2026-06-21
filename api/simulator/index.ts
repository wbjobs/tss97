import type { GPSPoint, Vehicle, VehicleType } from '../../shared/types';
import { store } from '../store';

interface MovingState {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  pauseRemaining: number;
  wanderAngle: number;
}

const SHANGHAI_CENTER = { lat: 31.2304, lng: 121.4737 };

export class GPSSimulator {
  private vehicles: Map<string, MovingState> = new Map();
  private vehicleTypes: Map<string, VehicleType> = new Map();
  private taxiCount: number;
  private shipCount: number;
  private idCounter: number;

  constructor(taxiCount = 80, shipCount = 20) {
    this.taxiCount = taxiCount;
    this.shipCount = shipCount;
    this.idCounter = 0;
    this.initVehicles();
  }

  private initVehicles() {
    for (let i = 0; i < this.taxiCount; i++) {
      this.createVehicle('taxi');
    }
    for (let i = 0; i < this.shipCount; i++) {
      this.createVehicle('ship');
    }
  }

  private createVehicle(type: VehicleType) {
    const id = `${type}-${String(++this.idCounter).padStart(4, '0')}`;
    const offsetRange = type === 'taxi' ? 0.12 : 0.18;
    const lat =
      SHANGHAI_CENTER.lat + (Math.random() - 0.5) * 2 * offsetRange;
    const lng =
      SHANGHAI_CENTER.lng + (Math.random() - 0.5) * 2 * offsetRange;
    const baseSpeed = type === 'taxi' ? 35 : 18;
    const speed = baseSpeed + Math.random() * (type === 'taxi' ? 40 : 15);
    const heading = Math.random() * 360;

    const state: MovingState = {
      lat,
      lng,
      speed,
      heading,
      pauseRemaining: 0,
      wanderAngle: (Math.random() - 0.5) * 0.5,
    };

    this.vehicles.set(id, state);
    this.vehicleTypes.set(id, type);

    const vehicle: Vehicle = {
      id,
      type,
      name: `${type === 'taxi' ? '出租车' : '船只'} #${this.idCounter}`,
      baseLat: lat,
      baseLng: lng,
      currentLat: lat,
      currentLng: lng,
      currentSpeed: speed,
      currentHeading: heading,
      lastUpdate: Date.now(),
    };

    store.registerVehicle(vehicle);
  }

  private moveVehicle(id: string, state: MovingState, dt: number): GPSPoint {
    const type = this.vehicleTypes.get(id)!;

    if (state.pauseRemaining > 0) {
      state.pauseRemaining -= dt;
      state.speed = Math.max(0, state.speed - dt * 20);
    } else {
      if (Math.random() < 0.003) {
        state.pauseRemaining = 5 + Math.random() * 25;
      }

      state.wanderAngle += (Math.random() - 0.5) * 0.3;
      state.wanderAngle = Math.max(-0.8, Math.min(0.8, state.wanderAngle));
      state.heading += state.wanderAngle * dt * 30;

      const targetSpeed =
        (type === 'taxi' ? 35 : 18) +
        Math.random() * (type === 'taxi' ? 40 : 15);
      state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 0.3);

      const speedKmh = state.speed;
      const metersPerSec = speedKmh / 3.6;
      const distance = metersPerSec * dt;
      const headingRad = (state.heading * Math.PI) / 180;
      const latDelta = (distance * Math.cos(headingRad)) / 111320;
      const lngDelta =
        (distance * Math.sin(headingRad)) /
        (111320 * Math.cos((state.lat * Math.PI) / 180));

      state.lat += latDelta;
      state.lng += lngDelta;

      const center = SHANGHAI_CENTER;
      const range = type === 'taxi' ? 0.15 : 0.22;
      if (Math.abs(state.lat - center.lat) > range) {
        state.heading = 180 - state.heading;
        state.lat = center.lat + Math.sign(state.lat - center.lat) * range;
      }
      if (Math.abs(state.lng - center.lng) > range) {
        state.heading = -state.heading;
        state.lng = center.lng + Math.sign(state.lng - center.lng) * range;
      }
    }

    const timestamp = Date.now();
    return {
      id: `${id}-${timestamp}`,
      vehicleId: id,
      type,
      lat: state.lat,
      lng: state.lng,
      speed: state.speed,
      heading: state.heading,
      timestamp,
    };
  }

  tick(dt: number): GPSPoint[] {
    const points: GPSPoint[] = [];
    for (const [id, state] of this.vehicles) {
      points.push(this.moveVehicle(id, state, dt));
    }
    store.addPoints(points);
    return points;
  }

  getVehicleIds(): string[] {
    return Array.from(this.vehicles.keys());
  }
}

export const simulator = new GPSSimulator();
