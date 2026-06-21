import { Activity, Car, Ship, Radio, RadioTower, Play, Pause, RotateCcw } from 'lucide-react';
import { useTrackingStore, ViewMode } from '../store/tracking';

export default function ControlBar() {
  const {
    viewMode,
    setViewMode,
    filterType,
    setFilterType,
    isConnected,
    throughput,
    fps,
    stats,
    anomalies,
    clearAll,
  } = useTrackingStore();

  const modes: Array<{ id: ViewMode; label: string }> = [
    { id: 'realtime', label: '实时监控' },
    { id: 'playback', label: '历史回放' },
  ];

  const filters: Array<{ id: 'all' | 'taxi' | 'ship'; label: string; icon: typeof Car }> = [
    { id: 'all', label: '全部', icon: Activity },
    { id: 'taxi', label: '出租车', icon: Car },
    { id: 'ship', label: '船只', icon: Ship },
  ];

  return (
    <div className="h-14 bg-[#0a0e1a]/95 backdrop-blur-xl border-b border-[#1e293b] flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <RadioTower size={20} className="text-[#00f5d4]" />
        <h1
          className="text-lg font-bold tracking-wider text-[#00f5d4]"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          TRAJECTORY DASHBOARD
        </h1>
      </div>

      <div className="h-8 w-px bg-[#1e293b]" />

      <div className="flex items-center gap-1 bg-[#111827]/60 rounded border border-[#1e293b] p-0.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setViewMode(m.id)}
            className={`px-3 py-1 text-xs font-mono rounded transition-all ${
              viewMode === m.id
                ? 'bg-[#00f5d4] text-[#0a0e1a] shadow-[0_0_10px_rgba(0,245,212,0.4)]'
                : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}
          >
            {viewMode === m.id ? <Play size={10} className="inline mr-1" /> : <Pause size={10} className="inline mr-1 opacity-50" />}
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-8 w-px bg-[#1e293b]" />

      <div className="flex items-center gap-1 bg-[#111827]/60 rounded border border-[#1e293b] p-0.5">
        {filters.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-2.5 py-1 text-xs font-mono rounded flex items-center gap-1 transition-all ${
                filterType === f.id
                  ? 'bg-[#1e293b] text-[#00f5d4]'
                  : 'text-[#64748b] hover:text-[#94a3b8]'
              }`}
            >
              <Icon size={12} />
              {f.label}
            </button>
          );
        })}
      </div>

      <button
        onClick={clearAll}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-[#64748b] hover:text-[#00f5d4] rounded border border-[#1e293b] hover:border-[#00f5d4]/40 transition-all"
      >
        <RotateCcw size={12} />
        清空
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-[#00f5d4] animate-pulse shadow-[0_0_8px_#00f5d4]' : 'bg-[#64748b]'
            }`}
          />
          <span className="text-[11px] font-mono text-[#64748b]">
            {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        <div className="h-6 w-px bg-[#1e293b]" />

        <div className="flex items-center gap-3 text-[11px] font-mono text-[#64748b]">
          <div className="flex flex-col items-end">
            <span className="text-[#00f5d4]">{throughput.toLocaleString()}</span>
            <span className="text-[9px]">pts/s</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[#00f5d4]">{fps}</span>
            <span className="text-[9px]">fps</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[#00f5d4]">{stats?.activeVehicles || 0}</span>
            <span className="text-[9px]">在线</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[#ff6b35]">{anomalies.length}</span>
            <span className="text-[9px]">异常</span>
          </div>
        </div>
      </div>
    </div>
  );
}
