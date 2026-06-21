import type { GPSPoint } from '../../shared/types';

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function pointDistance(a: GPSPoint, b: GPSPoint): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
}

export function dtwDistance(
  query: GPSPoint[],
  candidate: GPSPoint[],
  maxWarp?: number,
): number {
  const n = query.length;
  const m = candidate.length;
  if (n === 0 || m === 0) return Infinity;

  const w = maxWarp ?? Math.max(Math.abs(n - m), 5);
  const wConstrained = Math.min(Math.max(w, Math.abs(n - m) + 1), m);

  const dtw: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(Infinity),
  );
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    const jStart = Math.max(1, i - wConstrained);
    const jEnd = Math.min(m, i + wConstrained);
    for (let j = jStart; j <= jEnd; j++) {
      const cost = pointDistance(query[i - 1], candidate[j - 1]);
      dtw[i][j] =
        cost +
        Math.min(
          dtw[i - 1][j],
          dtw[i][j - 1],
          dtw[i - 1][j - 1],
        );
    }
  }

  return dtw[n][m];
}

export function normalizeDtw(
  distance: number,
  queryLen: number,
  candidateLen: number,
): number {
  const norm = distance / (queryLen + candidateLen);
  return norm;
}

export function distanceToSimilarity(distance: number): number {
  if (distance === Infinity) return 0;
  const score = 1 / (1 + distance / 100);
  return Math.max(0, Math.min(1, score)) * 100;
}

export function downsample(points: GPSPoint[], targetLength: number): GPSPoint[] {
  if (points.length <= targetLength) return points.slice();
  const step = points.length / targetLength;
  const result: GPSPoint[] = [];
  for (let i = 0; i < targetLength; i++) {
    const idx = Math.floor(i * step);
    result.push(points[Math.min(idx, points.length - 1)]);
  }
  return result;
}
