import { Router } from 'express';
import { store } from '../store';
import { searchSimilarTrajectories } from '../services/trajectorySearch';
import type { GPSPoint } from '../../shared/types';

const router = Router();

router.get('/vehicles', (_req, res) => {
  const vehicles = store.getAllVehicles().map((v) => ({
    id: v.id,
    type: v.type,
    name: v.name,
    lastLat: v.currentLat,
    lastLng: v.currentLng,
    lastSpeed: v.currentSpeed,
    lastHeading: v.currentHeading,
    lastUpdate: v.lastUpdate,
  }));
  res.json({ vehicles });
});

router.get('/vehicles/:id/trail', (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit as string) || 500;
  const points = store.getVehicleTrail(id, limit);
  res.json({ points });
});

router.get('/history', (req, res) => {
  const startTime = parseInt(req.query.startTime as string);
  const endTime = parseInt(req.query.endTime as string);
  const vehicleId = req.query.vehicleId as string | undefined;

  if (!startTime || !endTime) {
    return res.status(400).json({
      error: 'startTime and endTime are required',
    });
  }

  let points;
  if (vehicleId) {
    points = store.getHistory(vehicleId, startTime, endTime);
  } else {
    points = store.getAllHistory(startTime, endTime);
  }

  res.json({ points });
});

router.get('/stats', (_req, res) => {
  const vehicles = store.getAllVehicles();
  res.json({
    totalVehicles: vehicles.length,
    taxiCount: vehicles.filter((v) => v.type === 'taxi').length,
    shipCount: vehicles.filter((v) => v.type === 'ship').length,
    totalPoints: store.getTotalPoints(),
  });
});

router.post('/trajectory/search', (req, res) => {
  try {
    const { queryPoints, topK, vehicleType } = req.body;
    if (!Array.isArray(queryPoints) || queryPoints.length < 2) {
      return res.status(400).json({ error: 'queryPoints must have at least 2 points' });
    }
    const results = searchSimilarTrajectories(
      queryPoints as GPSPoint[],
      topK ?? 10,
      vehicleType ?? 'all',
    );
    res.json({ results });
  } catch (err) {
    console.error('[API] Trajectory search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
