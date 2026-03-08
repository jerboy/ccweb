import crypto from "crypto";
import { spawn } from "child_process";
import express from "express";
import http from "http";
import os from "os";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "./session-manager";

export interface ServerOptions {
  port: number;
  host: string;
  shell: string;
  username: string;
  password: string;
  tunnel?: boolean;
  tunnelToken?: string;
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
  const { port, host, shell, username, password, tunnel: enableTunnel, tunnelToken } = options;

  const sessionManager = new SessionManager();
  const authSecret = generateSecret();

  const app = express();
  app.set("trust proxy", true);
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

  // Login rate limiting: 3 failures per IP → 30 min lockout
  const LOGIN_MAX_ATTEMPTS = 3;
  const LOGIN_LOCKOUT_MS = 30 * 60 * 1000;
  const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

  function getClientIp(req: express.Request): string {
    return (req.ip || req.socket.remoteAddress || "unknown");
  }

  // Login endpoint
  app.use(express.urlencoded({ extended: false }));

  app.post("/login", (req, res) => {
    const ip = getClientIp(req);
    const record = loginAttempts.get(ip);

    if (record && record.lockedUntil > Date.now()) {
      const remaining = Math.ceil((record.lockedUntil - Date.now()) / 60000);
      return res.status(429).send(`Too many failed attempts. Try again in ${remaining} minute(s).`);
    }

    const { username: u, password: p } = req.body as { username?: string; password?: string };
    if (!u || !p) {
      return res.status(400).send("Missing credentials");
    }
    const uMatch = u.length === username.length && crypto.timingSafeEqual(Buffer.from(u), Buffer.from(username));
    const pMatch = p.length === password.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(password));
    if (!uMatch || !pMatch) {
      const attempts = (record?.count || 0) + 1;
      if (attempts >= LOGIN_MAX_ATTEMPTS) {
        loginAttempts.set(ip, { count: attempts, lockedUntil: Date.now() + LOGIN_LOCKOUT_MS });
        console.log(`[ccweb] IP ${ip} locked out for 30 minutes after ${attempts} failed attempts`);
        return res.status(429).send(`Too many failed attempts. Try again in 30 minute(s).`);
      }
      loginAttempts.set(ip, { count: attempts, lockedUntil: 0 });
      return res.status(401).send(`Invalid credentials (${LOGIN_MAX_ATTEMPTS - attempts} attempt(s) remaining)`);
    }

    // Successful login - clear failed attempts
    loginAttempts.delete(ip);

    const token = signToken("auth", authSecret);
    const secure = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
    const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
    res.setHeader("Set-Cookie", `ccweb_token=${encodeURIComponent(token)}; ${cookieFlags}`);
    res.redirect("/");
  });

  // Auth middleware - skip login route and static login page
  app.use((req, res, next) => {
    if (isAuthenticated(req.headers.cookie)) {
      return next();
    }
    // Serve login page for GET requests
    if (req.method === "GET") {
      return res.sendFile(path.join(__dirname, "public", "login.html"), { dotfiles: "allow" });
    }
    res.status(401).send("Unauthorized");
  });

  app.use(express.static(path.join(__dirname, "public"), { dotfiles: "allow" }));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"), { dotfiles: "allow" });
  });

  const wss = new WebSocketServer({ noServer: true });

  // WebSocket ping/pong keepalive (Cloudflare Tunnel idle timeout is ~100s)
  const WS_PING_INTERVAL = 30_000;
  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, WS_PING_INTERVAL);
  wss.on("close", () => clearInterval(pingInterval));

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
        const session = sessionManager.create(shell, cols, rows);
        console.log(`[ccweb] Default session: ${session.id}`);
      }
      ws.send(JSON.stringify({ type: "tabs", tabs: sessionManager.listIds() }));

      ws.on("message", (raw: Buffer) => {
        try {
          const msg: ClientMessage = JSON.parse(raw.toString());
          if (msg.type === "create") {
            const c = msg.cols || 80;
            const r = msg.rows || 24;
            const session = sessionManager.create(shell, c, r);
            console.log(`[ccweb] New session: ${session.id}`);
            broadcastTabs();
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

    // Session-specific connection
    const session = sessionManager.get(sessionId);
    if (!session) {
      ws.send(JSON.stringify({ type: "error", data: "Session not found" }));
      ws.close();
      allClients.delete(ws);
      return;
    }

    console.log(`[ccweb] Client attached to session: ${sessionId}`);

    // Replay buffered output so new clients see existing content
    for (const chunk of session.buffer) {
      ws.send(JSON.stringify({ type: "output", data: chunk }));
    }

    // Subscribe to live output
    const onOutput = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    };
    session.clients.add(onOutput);

    const onExit = () => {
      console.log(`[ccweb] Session ended: ${sessionId}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exit" }));
        ws.close();
      }
      sessionManager.remove(sessionId);
      broadcastTabs();
    };
    session.onExit.add(onExit);

    // Resize to match this client
    session.terminal.resize(cols, rows);

    ws.on("message", (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        switch (msg.type) {
          case "input":
            if (msg.data) {
              session.terminal.write(msg.data);
            }
            break;
          case "resize":
            if (msg.cols && msg.rows) {
              session.terminal.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      allClients.delete(ws);
      session.clients.delete(onOutput);
      session.onExit.delete(onExit);
    });

    ws.on("error", () => {
      allClients.delete(ws);
      session.clients.delete(onOutput);
      session.onExit.delete(onExit);
    });
  });

  server.listen(port, host, () => {
    const addr = host === "0.0.0.0" ? "localhost" : host;
    console.log(`[ccweb] Terminal server running at http://${addr}:${port}`);
    console.log(`[ccweb] Shell: ${shell}`);
    console.log(`[ccweb] Username: ${username}`);
    console.log(`[ccweb] Password: ${password}`);
    console.log(`[ccweb] Press Ctrl+C to stop`);

    // Start Cloudflare Tunnel if requested
    if (enableTunnel || tunnelToken) {
      console.log("[ccweb] Starting Cloudflare Tunnel...");
      import("cloudflared").then(({ Tunnel }) => {
        console.log("[ccweb] cloudflared module loaded, creating tunnel...");
        const t = tunnelToken
          ? Tunnel.withToken(tunnelToken)
          : Tunnel.quick(`http://localhost:${port}`, { "--no-autoupdate": true });

        console.log("[ccweb] Tunnel process PID:", t.process.pid);
        t.on("url", (url: string) => {
          console.log(`[ccweb] Tunnel: ${url}`);
        });
        t.on("stdout", (output: string) => {
          const line = output.trim();
          if (line) console.log(`[ccweb] Tunnel stdout: ${line}`);
        });
        t.on("stderr", (output: string) => {
          const line = output.trim();
          if (line) console.log(`[ccweb] Tunnel stderr: ${line}`);
        });
        t.on("error", (err: Error) => {
          console.error(`[ccweb] Tunnel error: ${err.message}`);
        });
        t.on("exit", (code: number | null, signal: string | null) => {
          console.log(`[ccweb] Tunnel exited with code=${code} signal=${signal}`);
        });
        const stopTunnel = () => t.stop();
        process.on("SIGINT", stopTunnel);
        process.on("SIGTERM", stopTunnel);
      }).catch((err) => {
        console.error("[ccweb] Failed to start tunnel:", err.message);
      });
    }

    // Prevent system sleep while ccweb is running
    const platform = os.platform();
    if (platform === "darwin") {
      const caffeinate = spawn("caffeinate", ["-s", "-w", process.pid.toString()], {
        stdio: "ignore",
      });
      caffeinate.unref();
      console.log("[ccweb] Sleep prevention enabled (caffeinate)");
    } else if (platform === "win32") {
      const script = `
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class Power {
  [DllImport("kernel32.dll")]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
"@
while($true) {
  [Power]::SetThreadExecutionState(0x80000001)
  Start-Sleep -Seconds 30
}`;
      const ps = spawn("powershell", ["-NoProfile", "-Command", script], {
        stdio: "ignore",
      });
      ps.unref();
      console.log("[ccweb] Sleep prevention enabled (SetThreadExecutionState)");
    }
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
