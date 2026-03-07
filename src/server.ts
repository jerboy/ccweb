import crypto from "crypto";
import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "./session-manager";
import { TmuxSession, type TmuxClient } from "./tmux-session";

export interface ServerOptions {
  port: number;
  host: string;
  shell: string;
  username: string;
  password: string;
}

interface ClientMessage {
  type: "input" | "resize" | "kill" | "create";
  data?: string;
  cols?: number;
  rows?: number;
  sessionId?: string;
}

// Cookie-based auth helpers

function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function signToken(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return payload + "." + hmac.digest("hex");
}

function verifyToken(token: string, secret: string): boolean {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const payload = token.substring(0, dotIdx);
  const sig = token.substring(dotIdx + 1);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex");
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.substring(0, eq).trim();
    const val = part.substring(eq + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export function startServer(options: ServerOptions): void {
  const { port, host, shell, username, password } = options;

  TmuxSession.checkTmux();

  const sessionManager = new SessionManager();
  const authSecret = generateSecret();

  const app = express();
  const server = http.createServer(app);

  // Track all connected WebSocket clients for tab-list broadcasting
  const allClients = new Set<WebSocket>();

  function broadcastTabs(): void {
    const tabs = sessionManager.listIds();
    const msg = JSON.stringify({ type: "tabs", tabs });
    for (const client of allClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  function isAuthenticated(cookieHeader: string | undefined): boolean {
    const cookies = parseCookies(cookieHeader);
    const token = cookies["ccweb_token"];
    if (!token) return false;
    return verifyToken(token, authSecret);
  }

  // Login endpoint
  app.use(express.urlencoded({ extended: false }));

  app.post("/login", (req, res) => {
    const { username: u, password: p } = req.body as { username?: string; password?: string };
    if (!u || !p) {
      return res.status(400).send("Missing credentials");
    }
    const uMatch = u.length === username.length && crypto.timingSafeEqual(Buffer.from(u), Buffer.from(username));
    const pMatch = p.length === password.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(password));
    if (!uMatch || !pMatch) {
      return res.status(401).send("Invalid credentials");
    }
    const token = signToken("auth", authSecret);
    res.setHeader("Set-Cookie", `ccweb_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`);
    res.redirect("/");
  });

  // Auth middleware - skip login route and static login page
  app.use((req, res, next) => {
    if (isAuthenticated(req.headers.cookie)) {
      return next();
    }
    // Serve login page for GET requests
    if (req.method === "GET") {
      return res.sendFile(path.join(__dirname, "public", "login.html"));
    }
    res.status(401).send("Unauthorized");
  });

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!isAuthenticated(req.headers.cookie)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
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

    allClients.add(ws);

    // If no sessionId, this is a control connection - send current tab list
    if (!sessionId) {
      // Auto-create a default session if none exist
      if (sessionManager.listIds().length === 0) {
        try {
          const session = sessionManager.create(shell, cols, rows);
          console.log(`[ccweb] Default session: ${session.id}`);
        } catch (err) {
          console.error("[ccweb] Failed to create default session:", err);
        }
      }
      ws.send(JSON.stringify({ type: "tabs", tabs: sessionManager.listIds() }));

      ws.on("message", (raw: Buffer) => {
        try {
          const msg: ClientMessage = JSON.parse(raw.toString());
          if (msg.type === "create") {
            const c = msg.cols || 80;
            const r = msg.rows || 24;
            try {
              const session = sessionManager.create(shell, c, r);
              console.log(`[ccweb] New session: ${session.id}`);
              broadcastTabs();
            } catch (err) {
              console.error("[ccweb] Failed to create session:", err);
            }
          } else if (msg.type === "kill" && msg.sessionId) {
            console.log(`[ccweb] Session killed: ${msg.sessionId}`);
            sessionManager.remove(msg.sessionId);
            broadcastTabs();
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        allClients.delete(ws);
      });
      ws.on("error", () => {
        allClients.delete(ws);
      });
      return;
    }

    // Session-specific connection — each client gets its own grouped session
    const session = sessionManager.get(sessionId);
    if (!session) {
      ws.send(JSON.stringify({ type: "error", data: "Session not found" }));
      ws.close();
      allClients.delete(ws);
      return;
    }

    let client: TmuxClient;
    try {
      client = session.attach(cols, rows);
    } catch (err) {
      console.error("[ccweb] Failed to attach session:", err);
      ws.send(
        JSON.stringify({
          type: "output",
          data: `\r\nFailed to attach session: ${err}\r\n`,
        })
      );
      ws.close();
      allClients.delete(ws);
      return;
    }

    console.log(`[ccweb] Client attached to session: ${sessionId} (group: ${client.groupId})`);

    client.pty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    client.pty.onExit(() => {
      if (!TmuxSession.exists(sessionId)) {
        console.log(`[ccweb] Session ended: ${sessionId}`);
        sessionManager.remove(sessionId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "exit" }));
          ws.close();
        }
        broadcastTabs();
      }
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        switch (msg.type) {
          case "input":
            if (msg.data) {
              client.pty.write(msg.data);
            }
            break;
          case "resize":
            if (msg.cols && msg.rows) {
              client.pty.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      allClients.delete(ws);
      client.dispose();
    });

    ws.on("error", () => {
      allClients.delete(ws);
      client.dispose();
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
