<p align="center">
  <img src="https://img.shields.io/badge/version-3.0.0-blue" alt="version">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="node">
  <img src="https://img.shields.io/badge/license-MIT-orange" alt="license">
</p>

<h1 align="center">📡 请求监听工具</h1>
<p align="center">通用 HTTP/HTTPS 请求拦截与监听工具 — 基于 Puppeteer 浏览器自动化</p>

<p align="center">
  输入目标网址 → 自动打开浏览器 → 实时捕获所有 API 请求 → 查看详情 / 回放 / 导出
</p>

---

## ✨ 功能特性

| 特性 | 说明 |
|------|------|
| 🚀 **浏览器自动化** | 自动打开 Chrome/Edge 浏览器并导航到目标网址，无需手动配置代理 |
| 📡 **实时捕获** | 拦截所有 XHR/Fetch 请求，实时展示方法、URL、Headers、响应数据 |
| 🔄 **请求回放** | 一键重新发送已捕获的请求，查看最新响应 |
| 🔍 **灵活筛选** | 按 GET/POST/PUT/DELETE 过滤，支持关键字搜索 URL |
| ⚙️ **自定义规则** | 四种匹配模式：精确匹配、正则表达式、关键字包含、域名匹配 |
| 📥 **数据导出** | 复制请求详情、导出 JSON 文件 |
| 📑 **多标签页** | 自动监听浏览器中打开的所有新标签页和窗口 |
| 📋 **调试日志** | 内置实时日志面板，方便排查问题 |

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本要求 |
|------|----------|
| **Node.js** | >= 18 |
| **Chrome / Edge** | 系统已安装（用于 Puppeteer 自动化）|

### 安装

```bash
# 克隆或进入项目目录
cd request-monitor

# 安装依赖
npm install

# 启动服务
npm start
```

### 使用

启动后浏览器访问 **http://localhost:3000**

```
┌─────────────────────────────────────────────────┐
│  ① 输入目标网址 → 点击「开始监听」               │
│  ② Chrome 浏览器自动打开并跳转到目标网站         │
│  ③ 在浏览器中操作网站功能                        │
│  ④ 请求自动出现在「已捕获的请求」列表中           │
│  ⑤ 点击请求查看详情 / 回放 / 导出                │
└─────────────────────────────────────────────────┘
```

---

## 🏗️ 项目架构

```
server.js                  # 主入口
lib/
├── config.js              # 规则配置管理（持久化）
├── url-matcher.js         # URL 匹配引擎
├── capture-engine.js      # 请求/响应拦截核心
├── browser-manager.js     # Puppeteer 浏览器管理
├── sse.js                 # SSE 实时推送
├── proxy.js               # 请求回放
└── routes.js              # API 路由注册
public/
├── index.html             # 前端页面
├── css/style.css          # 样式
└── js/app.js              # 前端逻辑
```

### 工作原理

```
浏览器操作 ──→ Puppeteer 拦截 ──→ capture-engine 匹配规则
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                     SSE 推送      存入内存     状态更新
                          │            │            │
                          └────────────┼────────────┘
                                       ▼
                              前端实时展示列表
```

---

## ⚙️ 监听规则

### 匹配模式

| 模式 | 说明 | 示例 |
|------|------|------|
| `domain` | 域名匹配，逗号分隔多个 | `example.com,api.example.com` |
| `contains` | URL 包含关键字 | `/api/`、`/v2/` |
| `regex` | 正则表达式 | `\/api\/v[12]\/(order\|product)` |
| `exact` | 精确匹配完整 URL | `https://example.com/api/v1/list` |

### 管理方式

- **页面操作**：底部「监听规则」面板添加 / 删除 / 启用 / 禁用
- **自动添加**：点击「开始监听」自动为目标域名创建规则
- **持久化**：规则保存在 `custom-rules.json`（已加入 `.gitignore`）
- **重置**：一键清空所有自定义规则

---

## 📡 API 接口文档

### 浏览器管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/browser/open` | 打开浏览器并导航到目标网址 |
| `POST` | `/api/browser/close` | 关闭浏览器 |
| `GET` | `/api/browser/status` | 获取浏览器状态 |

### 请求捕获

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/captured/stream` | SSE 实时推送捕获事件 |
| `GET` | `/api/captured/list` | 获取捕获的请求列表 |
| `GET` | `/api/captured/:id` | 获取单条请求详情 |
| `POST` | `/api/captured/clear` | 清空所有捕获记录 |
| `POST` | `/api/captured/replay/:id` | 回放已捕获的请求 |

### 规则管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/rules` | 获取所有规则 |
| `POST` | `/api/rules` | 添加新规则 |
| `PUT` | `/api/rules/:id` | 更新规则 |
| `DELETE` | `/api/rules/:id` | 删除规则 |
| `POST` | `/api/rules/:id/toggle` | 切换规则启用状态 |
| `POST` | `/api/rules/reset` | 重置为默认（清空所有规则） |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/debug/logs` | 获取服务器调试日志 |

---

## 🔧 常见问题

**Q: 为什么打开浏览器后没有请求被捕获？**

检查页面底部的「监听规则」面板，确认当前网址的域名是否在已启用的规则中。点击「开始监听」会自动添加域名规则，也可手动添加。

**Q: 如何监听多个不同的网站？**

一个浏览器窗口支持多标签页，自动监听所有新打开的标签页。在同一个浏览器中导航到不同网站即可。

**Q: 捕获的数据能保存吗？**

支持导出为 JSON 文件。运行时的数据保存在服务器内存中，服务重启后清空。

**Q: 浏览器窗口不小心关闭了怎么办？**

点击「停止监听」→ 重新输入网址 → 再次点击「开始监听」。

---

## ⚠️ 注意事项

- 需要系统上已安装 Chrome 或 Edge 浏览器
- 请勿关闭打开的浏览器窗口，关闭后监听自动停止
- 捕获的数据存储在服务器内存中，刷新页面或重启服务会清空
- 实时推送依赖 Server-Sent Events，请勿使用拦截跨域请求的浏览器插件
- `custom-rules.json` 已加入 `.gitignore`，不会提交到仓库

---

<p align="center">Made with ❤️</p>
