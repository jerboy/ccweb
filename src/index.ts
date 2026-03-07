import crypto from "crypto";
import { Command } from "commander";
import { startServer } from "./server";
import { checkUpdate, selfUpdate } from "./updater";

declare const __VERSION__: string;

const program = new Command();

program
  .name("ccweb")
  .description("A CLI tool that exposes an interactive web terminal in the browser")
  .version(__VERSION__);

program
  .command("update")
  .description("Update ccweb to the latest version")
  .action(async () => {
    await selfUpdate();
  });

program
  .command("start", { isDefault: true })
  .description("Start the web terminal server")
  .option("-p, --port <number>", "port to listen on", "8080")
  .option("-H, --host <address>", "host to bind to", "0.0.0.0")
  .option(
    "-s, --shell <path>",
    "shell to spawn",
    process.env.SHELL || "/bin/bash"
  )
  .option("-u, --username <name>", "username for authentication", "cc")
  .option("--password <password>", "password for authentication (random if not set)")
  .option("--tunnel", "expose via Cloudflare Tunnel (no account required)")
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${opts.port}`);
      process.exit(1);
    }

    const password = opts.password || crypto.randomBytes(12).toString("base64url");

    // Check for updates in background (non-blocking)
    checkUpdate();

    startServer({
      port,
      host: opts.host,
      shell: opts.shell,
      username: opts.username,
      password,
      tunnel: !!opts.tunnel,
    });
  });

program.parse();
