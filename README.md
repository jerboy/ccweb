# ccweb

A CLI tool that exposes an interactive web terminal in the browser, similar to [ttyd](https://github.com/tsl0922/ttyd).

一个在浏览器中提供交互式 Web 终端的命令行工具，类似于 [ttyd](https://github.com/tsl0922/ttyd)。

- **node-pty** — 在服务端创建伪终端 / Spawns pseudo-terminals on the server
- **xterm.js** — 在浏览器中渲染终端 / Renders the terminal in the browser
- **WebSocket** — 实时双向通信 / Real-time bidirectional communication
- 每个浏览器标签页拥有独立的 Shell 会话 / Each browser tab gets its own independent shell session
- 内置用户名/密码认证 / Built-in authentication (username/password)
- 可选 [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 支持，无需账号即可公网访问 / Optional Cloudflare Tunnel support for public access
- 自动防止系统休眠，保持后台长时间运行 / Automatic sleep prevention to keep the server running in the background

## 环境要求 / Prerequisites

- [Node.js](https://nodejs.org/) >= 18

## 安装 / Install

```bash
npm install -g ccwebtty
```

## 使用 / Usage

```bash
# 使用默认设置启动（端口 8080，监听所有网络接口）
# Start with default settings (port 8080, all interfaces)
ccweb

# 自定义端口和主机地址
# Custom port and host
ccweb --port 3000 --host 127.0.0.1

# 指定不同的 Shell
# Specify a different shell
ccweb --shell /bin/bash

# 通过 Cloudflare Tunnel 暴露到公网（无需账号）
# Expose via Cloudflare Tunnel (publicly accessible, no account required)
ccweb --tunnel

# 组合使用
# Combine options
ccweb --port 3000 --shell /bin/zsh --tunnel
```

然后在浏览器中打开 `http://localhost:<port>`（默认：`http://localhost:8080`）。

Then open `http://localhost:<port>` in your browser (default: `http://localhost:8080`).

## 参数 / Options

| 参数 Option | 默认值 Default | 说明 Description |
|--------|---------|-------------|
| `-p, --port <number>` | `8080` | 监听端口 / Port to listen on |
| `-H, --host <address>` | `0.0.0.0` | 绑定地址 / Host to bind to |
| `-s, --shell <path>` | `$SHELL` or `/bin/bash` | 要启动的 Shell / Shell to spawn |
| `-u, --username <name>` | `cc` | 认证用户名 / Username for authentication |
| `--password <password>` | 随机生成 random | 认证密码（未设置则自动生成）/ Password for authentication |
| `--tunnel` | 禁用 disabled | 通过 Cloudflare Tunnel 暴露到公网（无需账号）/ Expose via Cloudflare Tunnel |

## 命令 / Commands

| 命令 Command | 说明 Description |
|---------|-------------|
| `ccweb start` | 启动 Web 终端服务（默认命令）/ Start the web terminal server (default) |
| `ccweb update` | 更新 ccweb 到最新版本 / Update ccweb to the latest version |

## 防止休眠 / Sleep Prevention

ccweb 启动后会自动阻止系统进入休眠状态，确保终端服务在后台持续运行。

When ccweb starts, it automatically prevents the system from sleeping, ensuring the terminal server keeps running in the background.

| 平台 Platform | 实现方式 Implementation | 条件 Requirement |
|---------|---------|---------|
| macOS | `caffeinate -s -w <pid>` | 系统自带，无需额外安装 / Built-in, no extra install needed |
| Windows | PowerShell `SetThreadExecutionState` | 系统自带，无需额外安装 / Built-in, no extra install needed |
| Linux | 不支持 / Not supported | — |

## 开发 / Development

```bash
# 安装依赖 / Install dependencies
npm install

# 构建 / Build
npm run build

# 运行 / Run
npm start

# 监听模式 / Watch mode
npm run dev
```
