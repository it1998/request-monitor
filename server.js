/**
 * 请求监听工具 — 主入口
 * 加载各模块并启动 Express 服务
 */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const http = require('http');
const path = require('path');

const config = require('./lib/config');
const { createSseManager } = require('./lib/sse');
const { init: initCaptureEngine, attachInterceptorsToPage, extractApiPath } = require('./lib/capture-engine');
const { init: initBrowserMgr, openBrowser, closeBrowser } = require('./lib/browser-manager');
const { createProxyHandler } = require('./lib/proxy');
const { registerRoutes } = require('./lib/routes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

const STATE = {
  browser: null, page: null, capturedApis: [], captureIdCounter: 0,
  isCapturing: false, sseClients: [], browserReady: false, debugLogs: [],
};

function debugLog(msg, type = 'info') {
  console.log(`[${type}] ${msg}`);
  STATE.debugLogs.unshift({ time: new Date().toLocaleTimeString(), type, msg });
  if (STATE.debugLogs.length > config.getMaxLogs()) STATE.debugLogs.length = config.getMaxLogs();
}

const { addSseClient, broadcastSse } = createSseManager(STATE);
initCaptureEngine(STATE, broadcastSse, debugLog);
initBrowserMgr(STATE, debugLog, broadcastSse, attachInterceptorsToPage);
const proxy = createProxyHandler(STATE, extractApiPath);

registerRoutes(app, { STATE, debugLog, broadcastSse, addSseClient,
  browserMgr: { openBrowser, closeBrowser },
  captureEngine: { extractApiPath, attachInterceptorsToPage },
  proxy, config });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          请求监听工具 v3.0 — 通用可配置化              ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  地址: http://localhost:${PORT}                        ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  功能: Puppeteer 浏览器请求拦截与监听                   ║');
  console.log('║  新增: 自定义监听规则（URL精确/正则/包含/域名）          ║');
  console.log('║  用法: 输入网址 → 开始监听 → 自动捕获所有 API 请求      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  debugLog('服务器启动完成', 'info');
});

process.on('SIGINT', async () => { console.log('\n正在关闭...'); await closeBrowser(); process.exit(0); });
process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0); });
