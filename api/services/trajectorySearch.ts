import type { GPSPoint, SimilarTrajectoryResult, VehicleType } from '../../shared/types';
import { dtwDistance, distanceToSimilarity, downsample } from './dtw';
import { store } from '../store';

const DOWNSAMPLE_LEN = 32;
const TRAIL_LIMIT = 500;
const DEFAULT_TOP_K = 10;

export function searchSimilarTrajectories(
  queryPoints: GPSPoint[],
  topK = DEFAULT_TOP_K,
  vehicleType: VehicleType | 'all' = 'all',
): SimilarTrajectoryResult[] {
  if (!queryPoints || queryPoints.length < 2) return [];

  const queryDownsampled = downsample(queryPoints, DOWNSAMPLE_LEN);
  const trails = store.getAllVehicleTrails(TRAIL_LIMIT);
  const results: SimilarTrajectoryResult[] = [];

  for (const [vehicleId, points] of trails) {
    if (points.length < 2) continue;

    const first = points[0];
    if (vehicleType !== 'all' && first.type !== vehicleType) continue;

    const candidateDownsampled = downsample(points, DOWNSAMPLE_LEN);
    const distance = dtwDistance(queryDownsampled, candidateDownsampled);

    if (distance === Infinity) continue;

    const similarity = distanceToSimilarity(distance);
    results.push({
      vehicleId,
      type: first.type,
      distance,
      similarity,
      points: points.slice(-200),
      startTime: points[0].timestamp,
      endTime: points[points.length - 1].timestamp,
    });
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}
