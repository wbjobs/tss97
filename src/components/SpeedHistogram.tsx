import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { StatsData } from '../../shared/types';

interface HistogramBin {
  bin: number;
  count: number;
}

interface Props {
  data: StatsData | null;
}

export default function SpeedHistogram({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || !data.speedHistogram.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 280;
    const height = 160;
    const margin = { top: 20, right: 10, bottom: 30, left: 35 };

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const histogram = data.speedHistogram as HistogramBin[];
    const maxCount = Math.max(1, ...histogram.map((h) => h.count));

    const x = d3
      .scaleBand<string>()
      .domain(histogram.map((h) => `${h.bin}`))
      .range([0, innerW])
      .padding(0.15);

    const y = d3.scaleLinear().domain([0, maxCount]).range([innerH, 0]).nice();

    const colorDomain: [number, number] = [0, histogram.length - 1];
    const colorScale = d3
      .scaleLinear<string, number>()
      .domain(colorDomain)
      .range(['#00f5d4', '#ef4444']);

    const xAxis = d3.axisBottom(x).tickValues(
      histogram.filter((_, i) => i % 2 === 0).map((h) => `${h.bin}`),
    );

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace');

    g.selectAll<SVGElement, unknown>('.domain, .tick line').attr('stroke', '#334155');

    const yAxis = d3.axisLeft(y).ticks(4);
    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace');

    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', height - margin.top - 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', 10)
      .attr('font-family', 'JetBrains Mono, monospace')
      .text('速度 (km/h)');

    const bars = g.selectAll<SVGRectElement, HistogramBin>('rect.bar').data(histogram, (d) => `${d.bin}`);

    const barsEnter = bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(`${d.bin}`)!)
      .attr('width', x.bandwidth())
      .attr('y', innerH)
      .attr('height', 0)
      .attr('rx', 2);

    barsEnter
      .merge(bars)
      .attr('fill', (_, i) => colorScale(Math.min(histogram.length - 1, i)))
      .attr('fill-opacity', 0.85)
      .transition()
      .duration(600)
      .attr('y', (d) => y(d.count))
      .attr('height', (d) => innerH - y(d.count));

    bars.exit().remove();
  }, [data]);

  return (
    <div className="bg-[#111827]/60 backdrop-blur border border-[#1e293b] rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[#00f5d4] text-xs font-bold tracking-wider uppercase" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          速度分布
        </h3>
        <span className="text-[#64748b] text-[10px] font-mono">
          {data?.totalPoints || 0} pts
        </span>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: 160 }} />
    </div>
  );
}
