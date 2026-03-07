import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { Terminal } from "./terminal";

export interface ServerOptions {
  port: number;
  host: string;
  shell: string;
}

interface ClientMessage {
  type: "input" | "resize";
  data?: string;
  cols?: number;
  rows?: number;
}

export function startServer(options: ServerOptions): void {
  const { port, host, shell } = options;

  const app = express();
  const server = http.createServer(app);

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket) => {
    let terminal: Terminal;

    try {
      terminal = new Terminal({ shell });
    } catch (err) {
      console.error(`[ccweb] Failed to spawn PTY:`, err);
      ws.send(JSON.stringify({ type: "output", data: `\r\nFailed to spawn shell: ${err}\r\n` }));
      ws.close();
      return;
    }

    console.log(`[ccweb] New session (PID: ${terminal.pid})`);

    terminal.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    terminal.onExit((exitCode: number) => {
      console.log(`[ccweb] Session ended (PID: ${terminal.pid}, exit: ${exitCode})`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exit", exitCode }));
        ws.close();
      }
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case "input":
            if (msg.data) {
              terminal.write(msg.data);
            }
            break;
          case "resize":
            if (msg.cols && msg.rows) {
              terminal.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      terminal.kill();
    });

    ws.on("error", () => {
      terminal.kill();
    });
  });

  server.listen(port, host, () => {
    const addr = host === "0.0.0.0" ? "localhost" : host;
    console.log(`[ccweb] Terminal server running at http://${addr}:${port}`);
    console.log(`[ccweb] Shell: ${shell}`);
    console.log(`[ccweb] Press Ctrl+C to stop`);
  });

  const shutdown = () => {
    console.log("\n[ccweb] Shutting down...");
    wss.clients.forEach((client) => client.close());
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
