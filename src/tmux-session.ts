import { spawnSync } from "child_process";
import * as pty from "node-pty";
import os from "os";

const TMUX_SOCKET = "ccweb";

export class TmuxSession {
  readonly id: string;
  private ptyProcess: pty.IPty | null = null;
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
    TmuxSession.tmux(
      "set-option",
      "-g",
      "terminal-overrides",
      ",xterm-256color:Tc"
    );

    return session;
  }

  static adopt(id: string): TmuxSession {
    return new TmuxSession(id);
  }

  static exists(id: string): boolean {
    return TmuxSession.tmux("has-session", "-t", id).success;
  }

  get isAttached(): boolean {
    return this.ptyProcess !== null;
  }

  attach(cols: number, rows: number): pty.IPty {
    this.detach();

    const env = Object.assign({}, process.env, {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORCE_COLOR: "3",
      TERM_PROGRAM: "xterm-256color",
    });
    delete (env as Record<string, string | undefined>).NO_COLOR;

    this.ptyProcess = pty.spawn(
      "tmux",
      ["-L", TMUX_SOCKET, "attach-session", "-t", this.id],
      {
        name: "xterm-256color",
        cols,
        rows,
        cwd: os.homedir(),
        env: env as Record<string, string>,
      }
    );

    return this.ptyProcess;
  }

  detach(): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch {
        // Already dead
      }
      this.ptyProcess = null;
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
      } catch {
        // PTY may be closed
      }
    }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    TmuxSession.tmux("kill-session", "-t", this.id);
  }

  static destroyAll(): void {
    TmuxSession.tmux("kill-server");
  }
}
