import { X, TrendingUp, Clock, Gauge } from 'lucide-react';
import { useTrackingStore } from '../store/tracking';
import type { SimilarTrajectoryResult } from '../../shared/types';

const COLORS = [
  '#ff6b35',
  '#00f5d4',
  '#f59e0b',
  '#a855f7',
  '#22c55e',
  '#3b82f6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
];

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s}秒`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

export default function ComparisonPanel() {
  const {
    similarResults,
    showComparison,
    setShowComparison,
    queryPoints,
    clearSearch,
    toggleSearchMode,
  } = useTrackingStore();

  if (!showComparison || similarResults.length === 0) return null;

  const handleClose = () => {
    setShowComparison(false);
  };

  const handleClearAll = () => {
    clearSearch();
    toggleSearchMode();
  };

  const avgSimilarity =
    similarResults.reduce((sum, r) => sum + r.similarity, 0) / similarResults.length;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-[#0a0e1a]/95 backdrop-blur-xl border-l border-[#1e293b] z-[2000] flex flex-col">
      <div className="p-3 border-b border-[#1e293b] flex items-center justify-between">
        <div>
          <h3
            className="text-sm font-bold text-[#00f5d4]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            相似轨迹对比 · Top{similarResults.length}
          </h3>
          <p className="text-[10px] font-mono text-[#64748b] mt-0.5">
            查询轨迹 {queryPoints.length} 点 · 平均相似度 {avgSimilarity.toFixed(1)}%
          </p>
        </div>
        <button
          onClick={handleClose}
          className="p-1 text-[#64748b] hover:text-[#00f5d4] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {similarResults.map((result: SimilarTrajectoryResult, idx: number) => {
          const color = COLORS[idx % COLORS.length];
          const duration = result.endTime - result.startTime;
          const pointCount = result.points.length;
          const typeLabel = result.type === 'taxi' ? '出租车' : '船只';
          const typeIcon = result.type === 'taxi' ? '🚕' : '🚢';

          return (
            <div
              key={result.vehicleId}
              className="p-2.5 bg-[#111827]/60 border border-[#1e293b] rounded hover:border-[#334155] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{typeIcon}</span>
                    <span className="text-xs font-mono text-[#e2e8f0] truncate">
                      {result.vehicleId}
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-[#64748b]">{typeLabel}</div>
                </div>
                <div className="text-right">
                  <div
                    className="text-sm font-bold"
                    style={{ color }}
                  >
                    {result.similarity.toFixed(1)}%
                  </div>
                  <div className="text-[9px] font-mono text-[#64748b]">相似度</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="flex items-center gap-1 text-[#64748b]">
                  <TrendingUp size={10} className="text-[#00f5d4]" />
                  <span className="font-mono text-[#94a3b8]">{pointCount} pts</span>
                </div>
                <div className="flex items-center gap-1 text-[#64748b]">
                  <Clock size={10} className="text-[#f59e0b]" />
                  <span className="font-mono text-[#94a3b8]">
                    {formatDuration(duration)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[#64748b]">
                  <Gauge size={10} className="text-[#a855f7]" />
                  <span className="font-mono text-[#94a3b8]">
                    {Math.round(
                      result.points.reduce((s, p) => s + p.speed, 0) /
                        Math.max(1, result.points.length),
                    )}
                    km/h
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-[#1e293b] flex justify-between text-[9px] font-mono text-[#64748b]">
                <span>
                  <span className="text-[#22c55e]">●</span> {formatTime(result.startTime)}
                </span>
                <span>
                  <span className="text-[#ef4444]">●</span> {formatTime(result.endTime)}
                </span>
              </div>

              <div className="mt-2 h-1 bg-[#1e293b] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, result.similarity)}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 6px ${color}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-[#1e293b] space-y-2">
        <div className="text-[10px] font-mono text-[#64748b]">
          💡 点击地图上的数字标记可查看对应轨迹
        </div>
        <button
          onClick={handleClearAll}
          className="w-full py-2 text-xs font-mono text-[#64748b] hover:text-[#ff6b35] border border-[#1e293b] hover:border-[#ff6b35]/40 rounded transition-all"
        >
          清除搜索结果
        </button>
      </div>
    </div>
  );
}
