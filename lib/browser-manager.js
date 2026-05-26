/**
 * 浏览器管理模块
 * 封装Puppeteer浏览器的打开/关闭/新页面监听
 */
const fs = require('fs');
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) {}

let STATE = null;
let debugLog = null;
let broadcastSse = null;
let attachFn = null; // capture-engine 的 attachInterceptorsToPage

function init(sharedState, logFn, broadcastFn, attachInterceptors) {
  STATE = sharedState;
  debugLog = logFn;
  broadcastSse = broadcastFn;
  attachFn = attachInterceptors;
}

/** 自动检测系统上已安装的Chrome/Edge浏览器路径 */
function findChromePath() {
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.USERPROFILE + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 启动Puppeteer浏览器 */
async function openBrowser(targetUrl = '') {
  if (STATE.browser) throw new Error('浏览器已打开，请先关闭');
  if (!puppeteer) throw new Error('Puppeteer-Core 未安装，请执行: npm install puppeteer-core');

  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('未找到Chrome/Edge浏览器。请安装Chrome或执行: npm install puppeteer (会自动下载Chromium)');
  }
  debugLog(`检测到浏览器: ${chromePath}`, 'info');

  STATE.browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: { width: 1366, height: 900 },
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,900',
    ],
    ignoreHTTPSErrors: true,
  });

  // 监控所有新标签页/窗口
  STATE.browser.on('targetcreated', async (target) => {
    debugLog(`检测到新目标: type=${target.type()} url=${target.url().substring(0, 100)}`, 'target');
    if (target.type() === 'page') {
      try {
        const newPage = await target.page();
        if (newPage) {
          debugLog(`为新页面安装拦截器: ${newPage.url().substring(0, 100)}`, 'target');
          attachFn(newPage);
          newPage.on('framenavigated', (frame) => {
            if (frame === newPage.mainFrame()) debugLog(`页面导航到: ${frame.url().substring(0, 120)}`, 'nav');
          });
          newPage.on('close', () => debugLog('页面已关闭', 'target'));
        }
      } catch (e) { debugLog(`为新页面安装拦截器失败: ${e.message}`, 'error'); }
    }
  });

  const pages = await STATE.browser.pages();
  STATE.page = pages[0] || await STATE.browser.newPage();
  STATE.capturedApis = [];
  STATE.captureIdCounter = 0;
  STATE.isCapturing = true;

  attachFn(STATE.page);

  STATE.page.on('close', () => { debugLog('初始页面已关闭', 'info'); });

  STATE.browser.on('disconnected', () => {
    debugLog('浏览器连接断开', 'error');
    STATE.browser = null; STATE.page = null;
    STATE.isCapturing = false;
    broadcastSse('browser-status', { open: false });
  });

  try {
    await STATE.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) { debugLog(`导航到${targetUrl}提示: ${e.message}`, 'nav'); }

  STATE.browserReady = true;
  broadcastSse('browser-status', { open: true, url: targetUrl });
  debugLog(`浏览器已打开: ${targetUrl}`, 'info');
  return { success: true, message: '浏览器已打开，请在窗口中登录' };
}

/** 关闭Puppeteer浏览器 */
async function closeBrowser() {
  try {
    if (STATE.browser) await STATE.browser.close();
    else if (STATE.page && !STATE.page.isClosed()) await STATE.page.close();
  } catch (e) { debugLog(`关闭浏览器出错: ${e.message}`, 'error'); }
  STATE.browser = null; STATE.page = null;
  STATE.isCapturing = false; STATE.browserReady = false;
  broadcastSse('browser-status', { open: false });
  debugLog('浏览器已关闭', 'info');
}

module.exports = { init, openBrowser, closeBrowser, findChromePath };
