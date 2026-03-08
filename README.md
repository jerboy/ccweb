# ccweb

**随时随地远程操控你的电脑命令行 — 让 AI 编程工具不受设备限制。**

**Remote-control your computer's terminal from anywhere — unleash AI coding tools beyond device boundaries.**

在手机、平板或任意设备的浏览器中打开你家里或办公室电脑的完整终端。配合 Cloudflare Tunnel，无需公网 IP、无需端口映射，一条命令即可安全地将终端暴露到公网。

Open a full terminal to your home or office computer from any device's browser. With Cloudflare Tunnel, no public IP or port forwarding needed — one command to securely expose your terminal to the internet.

## 为什么用 ccweb？ / Why ccweb?

**在手机上也能用 [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)、[Cursor Agent](https://www.cursor.com/)、[Aider](https://aider.chat/)** — 这些 AI 编程工具都运行在终端中。ccweb 让你通过浏览器远程访问电脑终端，这意味着你可以：

**Run [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Cursor Agent](https://www.cursor.com/), [Aider](https://aider.chat/) from your phone** — these AI coding tools all run in the terminal. ccweb gives you browser-based remote terminal access, which means you can:

- 📱 **手机/平板远程编程** — 躺在床上、出门在外，打开浏览器就能让 AI 帮你写代码
- 📱 **Code from phone/tablet** — lying in bed or on the go, open a browser and let AI write code for you
- 🖥️ **远程操控任意电脑** — 在公司操作家里的电脑，或反过来
- 🖥️ **Control any computer remotely** — operate your home PC from office, or vice versa
- 🤖 **运行 AI 命令行工具** — Claude Code、Aider、GitHub Copilot CLI 等工具在浏览器终端中完美运行
- 🤖 **Run AI CLI tools** — Claude Code, Aider, GitHub Copilot CLI, etc. work perfectly in the browser terminal
- 🌍 **一条命令公网访问** — `ccweb --tunnel`，无需配置路由器、无需公网 IP
- 🌍 **One command for public access** — `ccweb --tunnel`, no router config or public IP needed
- 🔒 **内置安全认证** — 用户名/密码保护，防止未授权访问
- 🔒 **Built-in auth** — username/password protection against unauthorized access

## 特性 / Features

- **node-pty** — 在服务端创建真实伪终端 / Spawns real pseudo-terminals on the server
- **xterm.js** — 在浏览器中渲染完整终端体验 / Full terminal experience rendered in the browser
- **WebSocket** — 实时双向通信，低延迟 / Real-time bidirectional communication with low latency
- 每个浏览器标签页拥有独立的 Shell 会话 / Each browser tab gets its own independent shell session
- 内置用户名/密码认证 / Built-in authentication (username/password)
- 可选 [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 支持，一条命令公网访问 / Optional Cloudflare Tunnel — one command for public access
- 自动防止系统休眠，保持后台长时间运行 / Automatic sleep prevention to keep the server running

## 快速开始 / Quick Start

> 环境要求 / Prerequisites: [Node.js](https://nodejs.org/) >= 18

```bash
# 1. 安装 / Install
npm install -g ccwebtty

# 2. 启动并开启公网访问 / Start with public access
ccweb --tunnel
```

启动后终端会输出一个公网 URL，在任意设备浏览器中打开即可操控你的电脑命令行。

After starting, a public URL will be printed — open it in any device's browser to control your computer's terminal.

## 使用场景 / Use Cases

### 在手机上运行 Claude Code / Run Claude Code from your phone

```bash
# 在电脑上启动 ccweb / On your computer
ccweb --tunnel

# 在手机浏览器打开输出的 URL，然后执行 / Open the URL on your phone, then run
claude
```

### 远程使用 AI 编程工具 / Remote AI coding tools

```bash
# 在手机浏览器终端中运行 Aider / Run Aider in mobile browser terminal
aider --model claude-3.5-sonnet

# 或者使用 GitHub Copilot CLI / Or use GitHub Copilot CLI
gh copilot suggest "create a REST API"
```

### 远程管理服务器 / Remote server management

```bash
# 远程执行 git 操作 / Remote git operations
git pull && npm run deploy

# 远程查看日志 / Remote log monitoring
tail -f /var/log/app.log
```

## 更多用法 / More Usage

```bash
# 使用默认设置启动（端口 1989，监听所有网络接口）
# Start with default settings (port 1989, all interfaces)
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

# 使用自定义域名（需要 Cloudflare 账号，在 Zero Trust 后台获取 Token）
# Use a custom domain (requires Cloudflare account, get token from Zero Trust dashboard)
ccweb --tunnel-token eyJhIjoiNjM...

# 组合使用 / Combine options
ccweb --port 3000 --shell /bin/zsh --tunnel
```

本地访问：在浏览器中打开 `http://localhost:<port>`（默认：`http://localhost:1989`）。

Local access: open `http://localhost:<port>` in your browser (default: `http://localhost:1989`).

## 参数 / Options

| 参数 Option | 默认值 Default | 说明 Description |
|--------|---------|-------------|
| `-p, --port <number>` | `1989` | 监听端口 / Port to listen on |
| `-H, --host <address>` | `0.0.0.0` | 绑定地址 / Host to bind to |
| `-s, --shell <path>` | `$SHELL` or `/bin/bash` | 要启动的 Shell / Shell to spawn |
| `-u, --username <name>` | `cc` | 认证用户名 / Username for authentication |
| `--password <password>` | 随机生成 random | 认证密码（未设置则自动生成）/ Password for authentication |
| `--tunnel` | 禁用 disabled | 通过 Cloudflare Tunnel 暴露到公网（无需账号）/ Expose via Cloudflare Tunnel |
| `--tunnel-token <token>` | — | 使用 Cloudflare Tunnel Token 绑定自定义域名 / Use a Cloudflare Tunnel token for custom domain |

## 命令 / Commands

| 命令 Command | 说明 Description |
|---------|-------------|
| `ccweb start` | 启动 Web 终端服务（默认命令）/ Start the web terminal server (default) |
| `ccweb update` | 更新 ccweb 到最新版本 / Update ccweb to the latest version |

## 自定义域名（Cloudflare Tunnel Token）/ Custom Domain

除了使用 `--tunnel` 获取随机域名外，你还可以通过 Cloudflare Tunnel Token 绑定自己的域名。

In addition to using `--tunnel` for a random domain, you can bind your own domain via a Cloudflare Tunnel Token.

### 获取 Token / How to get a Token

1. 登录 [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) 后台 / Log in to the Cloudflare Zero Trust dashboard
2. 进入 **Networks → Tunnels**，点击 **Create a tunnel** / Go to **Networks → Tunnels**, click **Create a tunnel**
3. 选择 **Cloudflared** 类型，为隧道命名（如 `ccweb`）/ Select **Cloudflared**, name your tunnel (e.g. `ccweb`)
4. 在安装页面复制 Token（`eyJ` 开头的字符串）/ Copy the Token from the install page (starts with `eyJ`)
5. 配置 **Public Hostname** / Configure **Public Hostname**:
   - **Subdomain**: 填入子域名，如 `terminal` / Enter a subdomain, e.g. `terminal`
   - **Domain**: 选择你在 Cloudflare 的域名 / Select your domain in Cloudflare
   - **Service Type**: `HTTP`
   - **URL**: `localhost:1989`（与 ccweb 端口一致）/ (must match ccweb port)

### 使用 / Usage

```bash
ccweb --tunnel-token eyJhIjoiNjM...
```

配置完成后，即可通过自定义域名（如 `https://terminal.example.com`）访问终端。

Once configured, you can access the terminal via your custom domain (e.g. `https://terminal.example.com`).

### 对比 / Comparison

| | `--tunnel` | `--tunnel-token <token>` |
|---|---|---|
| 域名 Domain | 随机 `*.trycloudflare.com` / Random | 自定义域名 / Custom domain |
| 需要账号 Account | 不需要 / No | 需要 Cloudflare 账号 / Yes |
| 持久性 Persistence | 每次启动域名不同 / Changes on restart | 固定域名 / Persistent |
| 适用场景 Use case | 临时分享 / Temporary sharing | 长期使用 / Long-term use |

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
