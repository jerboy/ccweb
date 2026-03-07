import crypto from "crypto";
import { spawnSync } from "child_process";
import * as pty from "node-pty";
import os from "os";

const TMUX_SOCKET = "ccweb";

export interface TmuxClient {
  pty: pty.IPty;
  groupId: string;
  dispose: () => void;
}

export class TmuxSession {
  readonly id: string;
  private disposed = false;

  private constructor(id: string) {
    this.id = id;
  }

  private static tmux(
    ...args: string[]
  ): { success: boolean; stdout: string } {
    const result = spawnSync("tmux", ["-L", TMUX_SOCKET, ...args], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      success: result.status === 0,
      stdout: (result.stdout || "").trim(),
    };
  }

  static checkTmux(): void {
    const result = spawnSync("tmux", ["-V"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(
        "tmux is not installed or not in PATH. Please install tmux first."
      );
    }
    console.log(`[ccweb] Found ${(result.stdout || "").trim()}`);
  }

  static create(
    id: string,
    shell: string,
    cols: number,
    rows: number
  ): TmuxSession {
    const session = new TmuxSession(id);

    const result = TmuxSession.tmux(
      "new-session",
      "-d",
      "-s",
      id,
      "-x",
      String(cols),
      "-y",
      String(rows),
      shell
    );

    if (!result.success) {
      throw new Error(`Failed to create tmux session: ${id}`);
    }

    TmuxSession.tmux(
      "set-option",
      "-t",
      id,
      "default-terminal",
      "xterm-256color"
    );
    TmuxSession.tmux("set-option", "-t", id, "history-limit", "50000");
    TmuxSession.tmux("set-option", "-t", id, "mouse", "on");
    TmuxSession.tmux("set-option", "-g", "window-size", "latest");
    TmuxSession.tmux(
      "set-option",
      "-g",
      "terminal-overrides",
      ",xterm-256color:Tc"
    );
    // Allow grouped sessions to resize independently
    TmuxSession.tmux("set-option", "-g", "aggressive-resize", "on");

    return session;
  }

  static adopt(id: string): TmuxSession {
    return new TmuxSession(id);
  }

  static exists(id: string): boolean {
    return TmuxSession.tmux("has-session", "-t", id).success;
  }

  /**
   * Attach via a grouped session: creates a temporary session linked to this
   * one so each client gets its own independent window size. The grouped
   * session is destroyed when the client disconnects.
   */
  attach(cols: number, rows: number): TmuxClient {
    const groupId = `${this.id}-c-${crypto.randomBytes(4).toString("hex")}`;

    // Create a grouped session sharing the same window group
    const result = TmuxSession.tmux(
      "new-session",
      "-d",
      "-s",
      groupId,
      "-t",
      this.id,
      "-x",
      String(cols),
      "-y",
      String(rows)
    );

    if (!result.success) {
      throw new Error(`Failed to create grouped session: ${groupId}`);
    }

    const env = Object.assign({}, process.env, {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORCE_COLOR: "3",
      TERM_PROGRAM: "xterm-256color",
    });
    delete (env as Record<string, string | undefined>).NO_COLOR;

    const ptyProcess = pty.spawn(
      "tmux",
      ["-L", TMUX_SOCKET, "attach-session", "-t", groupId],
      {
        name: "xterm-256color",
        cols,
        rows,
        cwd: os.homedir(),
        env: env as Record<string, string>,
      }
    );

    const dispose = () => {
      try {
        ptyProcess.kill();
      } catch {
        // Already dead
      }
      // Kill the grouped session but not the main session
      TmuxSession.tmux("kill-session", "-t", groupId);
    };

    return { pty: ptyProcess, groupId, dispose };
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    TmuxSession.tmux("kill-session", "-t", this.id);
  }

  static destroyAll(): void {
    TmuxSession.tmux("kill-server");
  }
}
