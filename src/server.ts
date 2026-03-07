import crypto from "crypto";
import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "./session-manager";
import { TmuxSession } from "./tmux-session";

export interface ServerOptions {
  port: number;
  host: string;
  shell: string;
  username: string;
  password: string;
}

interface ClientMessage {
  type: "input" | "resize" | "kill";
  data?: string;
  cols?: number;
  rows?: number;
}

export function startServer(options: ServerOptions): void {
  const { port, host, shell, username, password } = options;

  TmuxSession.checkTmux();

  const sessionManager = new SessionManager();

  const expectedAuth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const app = express();
  const server = http.createServer(app);

  function verifyAuth(auth: string | undefined): boolean {
    if (!auth) return false;
    const authBuf = Buffer.from(auth);
    const expectedBuf = Buffer.from(expectedAuth);
    if (authBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(authBuf, expectedBuf);
  }

  app.use((req, res, next) => {
    if (verifyAuth(req.headers.authorization)) {
      return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="ccweb"');
    res.status(401).send("Unauthorized");
  });

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!verifyAuth(req.headers.authorization)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"ccweb\"\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId");
    const cols = parseInt(url.searchParams.get("cols") || "80", 10);
    const rows = parseInt(url.searchParams.get("rows") || "24", 10);

    let session: TmuxSession | undefined;
    let isReconnect = false;

    if (sessionId) {
      session = sessionManager.get(sessionId);
      if (session) isReconnect = true;
    }

    if (!session) {
      try {
        session = sessionManager.create(shell, cols, rows);
      } catch (err) {
        console.error("[ccweb] Failed to create session:", err);
        ws.send(
          JSON.stringify({
            type: "output",
            data: `\r\nFailed to create session: ${err}\r\n`,
          })
        );
        ws.close();
        return;
      }
    }

    const currentSession = session;
    console.log(
      `[ccweb] ${isReconnect ? "Reconnected" : "New"} session: ${currentSession.id}`
    );

    let ptyProcess: ReturnType<TmuxSession["attach"]>;
    try {
      ptyProcess = currentSession.attach(cols, rows);
    } catch (err) {
      console.error("[ccweb] Failed to attach session:", err);
      ws.send(
        JSON.stringify({
          type: "output",
          data: `\r\nFailed to attach session: ${err}\r\n`,
        })
      );
      ws.close();
      return;
    }

    ws.send(JSON.stringify({ type: "session", id: currentSession.id }));

    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    let sessionKilled = false;

    ptyProcess.onExit(() => {
      if (sessionKilled) return;
      if (!TmuxSession.exists(currentSession.id)) {
        console.log(`[ccweb] Session ended: ${currentSession.id}`);
        sessionManager.remove(currentSession.id);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "exit" }));
          ws.close();
        }
      }
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        switch (msg.type) {
          case "input":
            if (msg.data && currentSession.isAttached) {
              ptyProcess.write(msg.data);
            }
            break;
          case "resize":
            if (msg.cols && msg.rows) {
              currentSession.resize(msg.cols, msg.rows);
            }
            break;
          case "kill":
            sessionKilled = true;
            console.log(`[ccweb] Session killed: ${currentSession.id}`);
            sessionManager.remove(currentSession.id);
            ws.close();
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (!sessionKilled) {
        currentSession.detach();
      }
    });

    ws.on("error", () => {
      if (!sessionKilled) {
        currentSession.detach();
      }
    });
  });

  server.listen(port, host, () => {
    const addr = host === "0.0.0.0" ? "localhost" : host;
    console.log(`[ccweb] Terminal server running at http://${addr}:${port}`);
    console.log(`[ccweb] Shell: ${shell}`);
    console.log(`[ccweb] Username: ${username}`);
    console.log(`[ccweb] Password: ${password}`);
    console.log(`[ccweb] Press Ctrl+C to stop`);
  });

  const shutdown = () => {
    console.log("\n[ccweb] Shutting down...");
    wss.clients.forEach((client) => client.close());
    sessionManager.destroyAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
