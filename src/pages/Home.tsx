import ControlBar from '@/components/ControlBar';
import TrackMap from '@/components/TrackMap';
import SpeedHistogram from '@/components/SpeedHistogram';
import HeatmapGrid from '@/components/HeatmapGrid';
import AnomalyList from '@/components/AnomalyList';
import { useTrackingWebSocket } from '@/hooks/useTrackingWebSocket';
import { useTrackingStore } from '@/store/tracking';

export default function Home() {
  useTrackingWebSocket();

  const { stats, anomalies } = useTrackingStore();

  return (
    <div className="w-full h-full flex flex-col bg-[#0a0e1a]">
      <ControlBar />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative">
          <TrackMap />
          <div className="absolute bottom-4 left-4 bg-[#111827]/80 backdrop-blur border border-[#1e293b] rounded-lg p-3 text-[10px] font-mono pointer-events-none">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00f5d4]" />
              <span className="text-[#94a3b8]">
                <span className="text-[#00f5d4] font-bold">出租车</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
              <span className="text-[#94a3b8]">
                <span className="text-[#38bdf8] font-bold">船只</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff6b35]" />
              <span className="text-[#94a3b8]">
                <span className="text-[#ff6b35] font-bold">异常停留</span>
              </span>
            </div>
          </div>
        </div>

        <div className="w-[340px] border-l border-[#1e293b] bg-[#0a0e1a] flex flex-col gap-2 p-2">
          <SpeedHistogram data={stats} />
          <HeatmapGrid data={stats} />
          <AnomalyList anomalies={anomalies} />
        </div>
      </div>
    </div>
  );
}
