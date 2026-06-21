import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { StatsData } from '../../shared/types';

interface HeatCell {
  x: number;
  y: number;
  intensity: number;
}

interface Props {
  data: StatsData | null;
}

export default function HeatmapGrid({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 280;
    const height = 160;
    const margin = { top: 15, right: 10, bottom: 30, left: 20 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', '#0a0e1a')
      .attr('rx', 4)
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1);

    if (!data || !data.heatmapGrid || data.heatmapGrid.length === 0) {
      g.append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#475569')
        .attr('font-size', 11)
        .attr('font-family', 'JetBrains Mono, monospace')
        .text('等待数据...');
      return;
    }

    const heat = data.heatmapGrid;

    const lats = heat.map((h) => h.lat);
    const lngs = heat.map((h) => h.lng);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);
    const latRange = latMax - latMin || 0.01;
    const lngRange = lngMax - lngMin || 0.01;

    const cellSize = 8;
    const cols = Math.floor(innerW / cellSize);
    const rows = Math.floor(innerH / cellSize);

    const gridMap = new Map<string, HeatCell>();
    for (const h of heat) {
      const x = Math.min(cols - 1, Math.floor(((h.lng - lngMin) / lngRange) * cols));
      const y = Math.min(rows - 1, Math.floor((1 - (h.lat - latMin) / latRange) * rows));
      const key = `${x}-${y}`;
      const existing = gridMap.get(key);
      if (existing) {
        existing.intensity = Math.max(existing.intensity, h.intensity);
      } else {
        gridMap.set(key, { x, y, intensity: h.intensity });
      }
    }
    const grid = Array.from(gridMap.values());

    const cells = g.selectAll<SVGRectElement, HeatCell>('rect.cell').data(grid, (d) => `${d.x}-${d.y}`);

    const colorDomain: [number, number] = [0, 1];
    const colorScale = d3
      .scaleLinear<string, number>()
      .domain(colorDomain)
      .range(['#0a1628', '#ff6b35']);

    const cellsEnter = cells
      .enter()
      .append('rect')
      .attr('class', 'cell')
      .attr('x', (d) => d.x * cellSize)
      .attr('y', (d) => d.y * cellSize)
      .attr('width', cellSize - 1)
      .attr('height', cellSize - 1)
      .attr('rx', 1)
      .attr('opacity', 0);

    cellsEnter
      .merge(cells)
      .transition()
      .duration(500)
      .attr('opacity', 1)
      .attr('fill', (d) => colorScale(d.intensity));

    cells.exit().remove();

    const legendW = innerW;
    const legendH = 6;
    const legendG = g.append('g').attr('transform', `translate(0,${innerH + 8})`);
    const defs = svg.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'heatLegend')
      .attr('x1', '0%')
      .attr('x2', '100%');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#0a1628');
    gradient.append('stop').attr('offset', '50%').attr('stop-color', '#00f5d4');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#ff6b35');

    legendG.append('rect').attr('width', legendW).attr('height', legendH).attr('rx', 2).attr('fill', 'url(#heatLegend)');

    legendG.append('text')
      .attr('x', 0)
      .attr('y', legendH + 10)
      .attr('fill', '#64748b')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace')
      .text('低');

    legendG.append('text')
      .attr('x', legendW / 2)
      .attr('y', legendH + 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace')
      .text('密度');

    legendG.append('text')
      .attr('x', legendW)
      .attr('y', legendH + 10)
      .attr('text-anchor', 'end')
      .attr('fill', '#64748b')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace')
      .text('高');
  }, [data]);

  return (
    <div className="bg-[#111827]/60 backdrop-blur border border-[#1e293b] rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[#00f5d4] text-xs font-bold tracking-wider uppercase" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          热点区域
        </h3>
        <span className="text-[#64748b] text-[10px] font-mono">
          {data?.heatmapGrid?.length || 0} cells
        </span>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: 160 }} />
    </div>
  );
}
