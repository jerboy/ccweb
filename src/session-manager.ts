import crypto from "crypto";
import { Terminal } from "./terminal";

export interface Session {
  id: string;
  terminal: Terminal;
  buffer: string[];
  clients: Set<(data: string) => void>;
  onExit: Set<() => void>;
  alive: boolean;
}

const MAX_BUFFER = 5000;

export class SessionManager {
  private sessions = new Map<string, Session>();
  private order: string[] = [];

  create(shell: string, cols: number, rows: number): Session {
    const id = crypto.randomUUID();
    const terminal = new Terminal({ shell, cols, rows });

    const session: Session = {
      id,
      terminal,
      buffer: [],
      clients: new Set(),
      onExit: new Set(),
      alive: true,
    };

    terminal.onData((data) => {
      if (session.buffer.length >= MAX_BUFFER) {
        session.buffer.shift();
      }
      session.buffer.push(data);
      for (const cb of session.clients) {
        cb(data);
      }
    });

    terminal.onExit(() => {
      session.alive = false;
      for (const cb of session.onExit) {
        cb();
      }
    });

    this.sessions.set(id, session);
    this.order.push(id);
    return session;
  }

  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session && !session.alive) {
      this.sessions.delete(id);
      this.order = this.order.filter((x) => x !== id);
      return undefined;
    }
    return session;
  }

  listIds(): string[] {
    this.order = this.order.filter((id) => {
      const s = this.sessions.get(id);
      if (s && s.alive) return true;
      this.sessions.delete(id);
      return false;
    });
    return [...this.order];
  }

  remove(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.terminal.kill();
      this.sessions.delete(id);
    }
    this.order = this.order.filter((x) => x !== id);
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.terminal.kill();
    }
    this.sessions.clear();
    this.order = [];
  }
}
