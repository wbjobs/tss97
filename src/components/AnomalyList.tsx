import type { AnomalyPoint } from '../../shared/types';
import { Clock, AlertTriangle } from 'lucide-react';

interface Props {
  anomalies: AnomalyPoint[];
}

function formatDuration(min: number): string {
  const hours = Math.floor(min / 60);
  const mins = Math.floor(min % 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AnomalyList({ anomalies }: Props) {
  return (
    <div className="bg-[#111827]/60 backdrop-blur border border-[#1e293b] rounded-lg p-3 flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={12} className="text-[#ff6b35]" />
          <h3 className="text-[#ff6b35] text-xs font-bold tracking-wider uppercase" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            异常停留
          </h3>
        </div>
        <span className="text-[#ff6b35] text-[10px] font-mono px-1.5 py-0.5 bg-[#ff6b35]/10 rounded">
          {anomalies.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
        {anomalies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-[#475569]">
            <Clock size={20} className="mb-1 opacity-50" />
            <p className="text-[10px] font-mono">暂无异常停留</p>
          </div>
        ) : (
          anomalies.map((a) => (
            <div
              key={a.id}
              className="bg-[#0a0e1a]/80 border border-[#ff6b35]/20 hover:border-[#ff6b35]/50 rounded p-2 text-xs transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span>{a.type === 'taxi' ? '🚕' : '🚢'}</span>
                  <span className="text-[#e2e8f0] font-mono text-[11px] font-bold">
                    {a.vehicleId}
                  </span>
                </div>
                <span className="text-[#ff6b35] font-mono text-[11px] font-bold">
                  {formatDuration(a.durationMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#64748b] font-mono">
                <span>{formatTime(a.startTime)} - {formatTime(a.endTime)}</span>
                <span>{a.avgSpeed.toFixed(1)} km/h</span>
              </div>
              <div className="text-[10px] text-[#64748b] font-mono mt-0.5">
                {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
