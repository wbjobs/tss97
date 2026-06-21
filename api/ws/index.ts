import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import { simulator } from '../simulator';
import { store } from '../store';
import type { WSMessage } from '../../shared/types';

export class WSManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private pushInterval: NodeJS.Timeout | null = null;
  private lastTick: number = Date.now();
  private throughput: number = 0;
  private pointsSent: number = 0;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupHandlers();
    this.startSimulation();
  }

  private setupHandlers() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`[WS] Client connected. Total: ${this.clients.size}`);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[WS] Client disconnected. Total: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[WS] Error:', err);
        this.clients.delete(ws);
      });
    });
  }

  private startSimulation() {
    const tickMs = 500;
    this.pushInterval = setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;

      const points = simulator.tick(dt);
      this.pointsSent += points.length;

      if (this.clients.size > 0 && points.length > 0) {
        const batchMsg: WSMessage = {
          type: 'gps_batch',
          data: points,
        };
        const payload = JSON.stringify(batchMsg);

        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    }, tickMs);

    setInterval(() => {
      this.throughput = this.pointsSent;
      this.pointsSent = 0;
      if (this.clients.size > 0) {
        const statusMsg: WSMessage = {
          type: 'status',
          data: {
            connected: this.clients.size,
            throughput: this.throughput,
          },
        };
        const payload = JSON.stringify(statusMsg);
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    }, 1000);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getThroughput(): number {
    return this.throughput;
  }

  close() {
    if (this.pushInterval) clearInterval(this.pushInterval);
    this.wss.close();
  }
}

export { store };
