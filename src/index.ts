import { Command } from "commander";
import { startServer } from "./server";

const program = new Command();

program
  .name("ccweb")
  .description("A CLI tool that exposes an interactive web terminal in the browser")
  .version("1.0.0")
  .option("-p, --port <number>", "port to listen on", "8080")
  .option("-H, --host <address>", "host to bind to", "0.0.0.0")
  .option(
    "-s, --shell <path>",
    "shell to spawn",
    process.env.SHELL || "/bin/bash"
  )
  .action((opts) => {
    const port = parseInt(opts.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${opts.port}`);
      process.exit(1);
    }

    startServer({
      port,
      host: opts.host,
      shell: opts.shell,
    });
  });

program.parse();
