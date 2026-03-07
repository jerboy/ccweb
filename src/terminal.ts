import * as pty from "node-pty";
import os from "os";

export interface TerminalOptions {
  shell: string;
  cols?: number;
  rows?: number;
  cwd?: string;
}

export class Terminal {
  private process: pty.IPty;
  private disposed = false;

  constructor(options: TerminalOptions) {
    const { shell, cols = 80, rows = 24, cwd } = options;
    const env = Object.assign({}, process.env, {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORCE_COLOR: "3",
      TERM_PROGRAM: "xterm-256color",
    });
    delete (env as Record<string, string | undefined>).NO_COLOR;

    this.process = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: cwd || os.homedir(),
      env: env as Record<string, string>,
    });
  }

  get pid(): number {
    return this.process.pid;
  }

  onData(callback: (data: string) => void): void {
    this.process.onData(callback);
  }

  onExit(callback: (exitCode: number, signal?: number) => void): void {
    this.process.onExit(({ exitCode, signal }) => {
      callback(exitCode, signal);
    });
  }

  write(data: string): void {
    if (!this.disposed) {
      this.process.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.disposed) {
      try {
        this.process.resize(cols, rows);
      } catch {
        // PTY may already be closed
      }
    }
  }

  kill(): void {
    if (!this.disposed) {
      this.disposed = true;
      try {
        this.process.kill();
      } catch {
        // Already dead
      }
    }
  }
}
