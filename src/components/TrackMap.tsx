import { useEffect, useRef } from 'react';
import L from 'leaflet';
import * as d3 from 'd3';
import { useTrackingStore } from '../store/tracking';
import type { GPSPoint, Cluster, AnomalyPoint } from '../../shared/types';
import 'leaflet/dist/leaflet.css';

const SHANGHAI_CENTER: [number, number] = [31.2304, 121.4737];

function getVehicleColor(type: 'taxi' | 'ship', speed: number): string {
  if (type === 'ship') return '#38bdf8';
  if (speed > 60) return '#ef4444';
  if (speed > 40) return '#f59e0b';
  if (speed > 20) return '#10b981';
  return '#00f5d4';
}

export default function TrackMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const svgLayerRef = useRef<SVGSVGElement | null>(null);
  const trailsGroupRef = useRef<SVGGElement | null>(null);
  const markersGroupRef = useRef<SVGGElement | null>(null);
  const heatmapGroupRef = useRef<SVGGElement | null>(null);
  const clustersGroupRef = useRef<SVGGElement | null>(null);
  const anomaliesGroupRef = useRef<SVGGElement | null>(null);
  const rafRef = useRef<number>(0);

  const {
    vehicleTrails,
    stats,
    clusters,
    anomalies,
    filterType,
    selectedVehicleId,
    selectVehicle,
  } = useTrackingStore();

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: SHANGHAI_CENTER,
      zoom: 12,
      minZoom: 10,
      maxZoom: 16,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: false,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);

    const svgLayer = L.svg({ pane: 'overlayPane' });
    svgLayer.addTo(map);

    const svg = d3.select(map.getPane('overlayPane')).select('svg');
    svg.attr('pointer-events', 'auto');

    const gRoot = svg.append('g').attr('class', 'leaflet-zoom-hide');
    const trailsGroup = gRoot.append('g').attr('class', 'trails');
    const heatmapGroup = gRoot.append('g').attr('class', 'heatmap');
    const clustersGroup = gRoot.append('g').attr('class', 'clusters');
    const anomaliesGroup = gRoot.append('g').attr('class', 'anomalies');
    const markersGroup = gRoot.append('g').attr('class', 'markers');

    svgLayerRef.current = svg.node() as SVGSVGElement | null;
    trailsGroupRef.current = trailsGroup.node() as SVGGElement | null;
    markersGroupRef.current = markersGroup.node() as SVGGElement | null;
    heatmapGroupRef.current = heatmapGroup.node() as SVGGElement | null;
    clustersGroupRef.current = clustersGroup.node() as SVGGElement | null;
    anomaliesGroupRef.current = anomaliesGroup.node() as SVGGElement | null;
    mapInstanceRef.current = map;

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const projectPoint = (lat: number, lng: number): [number, number] => {
      const p = map.latLngToLayerPoint([lat, lng]);
      return [p.x, p.y];
    };

    const render = () => {
      if (!mapInstanceRef.current) return;

      const trailsG = d3.select(trailsGroupRef.current!);
      const markersG = d3.select(markersGroupRef.current!);
      const heatmapG = d3.select(heatmapGroupRef.current!);
      const clustersG = d3.select(clustersGroupRef.current!);
      const anomaliesG = d3.select(anomaliesGroupRef.current!);

      const topLeft = projectPoint(
        mapInstanceRef.current.getBounds().getNorthWest().lat,
        mapInstanceRef.current.getBounds().getNorthWest().lng,
      );

      trailsG.attr('transform', `translate(${-topLeft[0]},${-topLeft[1]})`);
      markersG.attr('transform', `translate(${-topLeft[0]},${-topLeft[1]})`);
      heatmapG.attr('transform', `translate(${-topLeft[0]},${-topLeft[1]})`);
      clustersG.attr('transform', `translate(${-topLeft[0]},${-topLeft[1]})`);
      anomaliesG.attr('transform', `translate(${-topLeft[0]},${-topLeft[1]})`);

      const trails: Array<{
        id: string;
        type: 'taxi' | 'ship';
        points: GPSPoint[];
      }> = [];
      vehicleTrails.forEach((trail, id) => {
        const first = trail[0];
        if (!first) return;
        if (filterType !== 'all' && first.type !== filterType) return;
        if (trail.length < 2) return;
        trails.push({ id, type: first.type, points: trail });
      });

      const lineFunc = d3
        .line<GPSPoint>()
        .x((d) => projectPoint(d.lat, d.lng)[0])
        .y((d) => projectPoint(d.lat, d.lng)[1])
        .curve(d3.curveBasis);

      const trailPaths = trailsG
        .selectAll<SVGPathElement, (typeof trails)[0]>('path.trail')
        .data(trails, (d) => d.id);

      trailPaths
        .enter()
        .append('path')
        .attr('class', 'trail')
        .attr('fill', 'none')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('opacity', (d) =>
          selectedVehicleId && selectedVehicleId !== d.id ? 0.15 : 0.7,
        )
        .attr('stroke', (d) => {
          const last = d.points[d.points.length - 1];
          return getVehicleColor(d.type, last?.speed || 0);
        })
        .merge(trailPaths)
        .attr('d', (d) => lineFunc(d.points))
        .attr('opacity', (d) =>
          selectedVehicleId && selectedVehicleId !== d.id ? 0.15 : 0.7,
        )
        .attr('stroke', (d) => {
          const last = d.points[d.points.length - 1];
          return getVehicleColor(d.type, last?.speed || 0);
        });

      trailPaths.exit().remove();

      const markerData: GPSPoint[] = [];
      vehicleTrails.forEach((trail) => {
        const last = trail[trail.length - 1];
        if (last) {
          if (filterType === 'all' || last.type === filterType) {
            markerData.push(last);
          }
        }
      });

      const markers = markersG
        .selectAll<SVGGElement, GPSPoint>('g.vehicle-marker')
        .data(markerData, (d) => d.vehicleId);

      const markersEnter = markers
        .enter()
        .append('g')
        .attr('class', 'vehicle-marker')
        .style('cursor', 'pointer')
        .on('click', (_, d) => {
          selectVehicle(
            selectedVehicleId === d.vehicleId ? null : d.vehicleId,
          );
        });

      markersEnter
        .append('circle')
        .attr('class', 'pulse')
        .attr('r', 6)
        .attr('fill', 'none')
        .attr('stroke', (d) => getVehicleColor(d.type, d.speed))
        .attr('stroke-width', 2)
        .attr('opacity', 0.8);

      markersEnter
        .append('circle')
        .attr('r', 5)
        .attr('stroke', '#0a0e1a')
        .attr('stroke-width', 1.5)
        .attr('fill', (d) => getVehicleColor(d.type, d.speed));

      markersEnter
        .append('text')
        .text((d) => (d.type === 'taxi' ? '🚕' : '🚢'))
        .attr('font-size', 12)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('y', 1)
        .style('pointer-events', 'none');

      markers
        .merge(markersEnter as unknown as d3.Selection<
          SVGGElement,
          GPSPoint,
          SVGGElement,
          unknown
        >)
        .attr(
          'transform',
          (d) =>
            `translate(${projectPoint(d.lat, d.lng)[0]},${projectPoint(d.lat, d.lng)[1]})`,
        )
        .attr('opacity', (d) =>
          selectedVehicleId && selectedVehicleId !== d.vehicleId ? 0.3 : 1,
        );

      markers.exit().remove();

      if (stats?.heatmapGrid) {
        const heatPts = stats.heatmapGrid
          .map((h) => {
            const [x, y] = projectPoint(h.lat, h.lng);
            return { ...h, x, y };
          })
          .filter(
            (h) =>
              h.x > -50 &&
              h.y > -50 &&
              h.x < mapInstanceRef.current!.getSize().x + 50 &&
              h.y < mapInstanceRef.current!.getSize().y + 50,
          );

        const heatCircles = heatmapG
          .selectAll<SVGCircleElement, (typeof heatPts)[0]>('circle.heat')
          .data(heatPts, (d, i) => `${d.lat}-${d.lng}-${i}`);

        heatCircles
          .enter()
          .append('circle')
          .attr('class', 'heat')
          .attr('r', 40)
          .attr('fill', 'url(#heatGradient)')
          .merge(heatCircles)
          .attr('cx', (d) => d.x)
          .attr('cy', (d) => d.y)
          .attr('opacity', (d) => d.intensity * 0.35);

        heatCircles.exit().remove();

        let defs = d3.select(svgLayerRef.current!).select<SVGDefsElement>('defs');
        if (defs.empty()) {
          defs = d3.select(svgLayerRef.current!).append('defs');
          const grad = defs
            .append('radialGradient')
            .attr('id', 'heatGradient');
          grad.append('stop').attr('offset', '0%').attr('stop-color', '#ff6b35').attr('stop-opacity', 0.9);
          grad.append('stop').attr('offset', '40%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.5);
          grad.append('stop').attr('offset', '100%').attr('stop-color', '#00f5d4').attr('stop-opacity', 0);
        }
      }

      if (clusters && clusters.length > 0) {
        const clustersProjected = clusters.map((c) => {
          const [x, y] = projectPoint(c.centerLat, c.centerLng);
          return { ...c, x, y };
        });

        const clusterSel = clustersG
          .selectAll<SVGGElement, (typeof clustersProjected)[0]>('g.cluster')
          .data(clustersProjected, (d) => d.id);

        const clusterEnter = clusterSel.enter().append('g').attr('class', 'cluster');

        clusterEnter
          .append('circle')
          .attr('fill', '#00f5d4')
          .attr('fill-opacity', 0.15)
          .attr('stroke', '#00f5d4')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4 3');

        clusterEnter
          .append('text')
          .attr('fill', '#00f5d4')
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('font-size', 10)
          .attr('font-weight', 'bold')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle');

        clusterSel
          .merge(clusterEnter)
          .attr('transform', (d) => `translate(${d.x},${d.y})`)
          .select('circle')
          .attr('r', (d) => 15 + Math.min(30, d.pointCount / 5));

        clusterSel
          .merge(clusterEnter)
          .select('text')
          .text((d) => `${d.vehicleIds.length}车`);

        clusterSel.exit().remove();
      } else {
        clustersG.selectAll('g.cluster').remove();
      }

      if (anomalies && anomalies.length > 0) {
        const anomProjected: Array<
          AnomalyPoint & { x: number; y: number }
        > = anomalies.map((a) => {
          const [x, y] = projectPoint(a.lat, a.lng);
          return { ...a, x, y };
        });

        const anomSel = anomaliesG
          .selectAll<SVGGElement, (typeof anomProjected)[0]>('g.anomaly')
          .data(anomProjected, (d) => d.id);

        const anomEnter = anomSel.enter().append('g').attr('class', 'anomaly');

        anomEnter
          .append('circle')
          .attr('r', 14)
          .attr('fill', '#ff6b35')
          .attr('fill-opacity', 0.2)
          .attr('stroke', '#ff6b35')
          .attr('stroke-width', 2);

        anomEnter
          .append('text')
          .attr('font-size', 14)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .text('⚠');

        anomSel
          .merge(anomEnter)
          .attr('transform', (d) => `translate(${d.x},${d.y})`);

        anomSel.exit().remove();
      } else {
        anomaliesG.selectAll('g.anomaly').remove();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    const moveHandler = () => {
      // trigger re-render handled by RAF
    };
    map.on('move', moveHandler);
    map.on('zoom', moveHandler);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off('move', moveHandler);
      map.off('zoom', moveHandler);
    };
  }, [vehicleTrails, stats, clusters, anomalies, filterType, selectedVehicleId, selectVehicle]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full bg-[#0a0e1a]"
    />
  );
}
