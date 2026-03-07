# ccweb

A CLI tool that exposes an interactive web terminal in the browser, similar to [ttyd](https://github.com/tsl0922/ttyd).

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18

## Install

```bash
npm install -g ccweb
```

## Usage

```bash
# Start with default settings (port 8080, all interfaces)
ccweb

# Custom port and host
ccweb --port 3000 --host 127.0.0.1

# Specify a different shell
ccweb --shell /bin/bash
```

Then open `http://localhost:8080` in your browser.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | `8080` | Port to listen on |
| `-H, --host <address>` | `0.0.0.0` | Host to bind to |
| `-s, --shell <path>` | `$SHELL` or `/bin/bash` | Shell to spawn |
| `-u, --username <name>` | `cc` | Username for authentication |
| `--password <password>` | random | Password for authentication |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
npm start

# Watch mode
npm run dev
```

## Architecture

- **node-pty** spawns pseudo-terminals on the server
- **xterm.js** renders the terminal in the browser
- **WebSocket** provides real-time bidirectional communication
- Each browser tab gets its own independent shell session
