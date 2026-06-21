import type { GPSPoint, Vehicle, VehicleType } from '../../shared/types';

export class RingBufferStore {
  private buffer: GPSPoint[] = [];
  private maxSize: number;
  private vehicles: Map<string, Vehicle> = new Map();

  constructor(maxSize = 500000) {
    this.maxSize = maxSize;
  }

  addPoint(point: GPSPoint) {
    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.splice(0, this.buffer.length - this.maxSize);
    }

    const existing = this.vehicles.get(point.vehicleId);
    if (existing) {
      existing.currentLat = point.lat;
      existing.currentLng = point.lng;
      existing.currentSpeed = point.speed;
      existing.currentHeading = point.heading;
      existing.lastUpdate = point.timestamp;
    }
  }

  addPoints(points: GPSPoint[]) {
    for (const p of points) this.addPoint(p);
  }

  registerVehicle(vehicle: Vehicle) {
    this.vehicles.set(vehicle.id, vehicle);
  }

  getAllVehicles() {
    return Array.from(this.vehicles.values());
  }

  getVehicle(id: string): Vehicle | undefined {
    return this.vehicles.get(id);
  }

  getVehiclesByType(type: VehicleType) {
    return Array.from(this.vehicles.values()).filter((v) => v.type === type);
  }

  getHistory(vehicleId: string, startTime: number, endTime: number): GPSPoint[] {
    return this.buffer.filter(
      (p) =>
        p.vehicleId === vehicleId &&
        p.timestamp >= startTime &&
        p.timestamp <= endTime,
    );
  }

  getAllHistory(startTime: number, endTime: number): GPSPoint[] {
    return this.buffer.filter(
      (p) => p.timestamp >= startTime && p.timestamp <= endTime,
    );
  }

  getVehicleTrail(vehicleId: string, limit = 500): GPSPoint[] {
    const result: GPSPoint[] = [];
    for (let i = this.buffer.length - 1; i >= 0 && result.length < limit; i--) {
      if (this.buffer[i].vehicleId === vehicleId) {
        result.unshift(this.buffer[i]);
      }
    }
    return result;
  }

  getRecentPoints(limit = 10000): GPSPoint[] {
    return this.buffer.slice(-limit);
  }

  getTotalPoints(): number {
    return this.buffer.length;
  }

  getAllVehicleTrails(limitPerVehicle = 500): Map<string, GPSPoint[]> {
    const result = new Map<string, GPSPoint[]>();
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const p = this.buffer[i];
      let arr = result.get(p.vehicleId);
      if (!arr) {
        arr = [];
        result.set(p.vehicleId, arr);
      }
      if (arr.length < limitPerVehicle) {
        arr.unshift(p);
      }
      if (result.size >= this.vehicles.size && Array.from(result.values()).every((a) => a.length >= limitPerVehicle)) {
        break;
      }
    }
    return result;
  }
}

export const store = new RingBufferStore();
