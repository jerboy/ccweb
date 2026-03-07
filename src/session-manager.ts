import crypto from "crypto";
import { TmuxSession } from "./tmux-session";

export class SessionManager {
  private sessions = new Map<string, TmuxSession>();

  create(shell: string, cols: number, rows: number): TmuxSession {
    const id = crypto.randomUUID();
    const session = TmuxSession.create(id, shell, cols, rows);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): TmuxSession | undefined {
    let session = this.sessions.get(id);

    // Adopt orphaned tmux session (e.g., after server restart)
    if (!session && TmuxSession.exists(id)) {
      session = TmuxSession.adopt(id);
      this.sessions.set(id, session);
    }

    // tmux session died unexpectedly
    if (session && !TmuxSession.exists(id)) {
      this.sessions.delete(id);
      return undefined;
    }

    return session;
  }

  remove(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.destroy();
      this.sessions.delete(id);
    }
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
    TmuxSession.destroyAll();
  }
}
