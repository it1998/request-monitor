/**
 * 捕获引擎 — 核心拦截逻辑，与具体业务地址解耦
 * 使用 config.js 中的规则 + url-matcher.js 进行匹配
 */

const { getEnabledRules, getStaticExts } = require('./config');
const { matchAnyRule } = require('./url-matcher');

/**
 * 为捕获状态提供存储（由 server.js 传入）
 * 通过依赖注入解耦，避免循环引用
 */
let STATE = null;
let broadcastSse = null;
let debugLog = null;

function init(sharedState, broadcastFn, logFn) {
  STATE = sharedState;
  broadcastSse = broadcastFn;
  debugLog = logFn;
}

/** 提取URL中的API路径用于显示 */
function extractApiPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url.substring(0, 80);
  }
}

/** 生成API的友好名称 */
function generateApiName(url, method) {
  const path = extractApiPath(url);
  const parts = path.split('/').filter(Boolean);
  return `${method} /${parts.slice(-3).join('/')}`;
}

/**
 * 为指定 Page 实例安装请求/响应拦截器
 * 使用启用的规则进行匹配，不再硬编码特定地址
 */
function attachInterceptorsToPage(page) {
  page.setRequestInterception(true)
    .catch(e => debugLog(`setRequestInterception失败: ${e.message}`, 'error'));

  // ---- 请求拦截 ----
  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    const resourceType = request.resourceType();

    const { matched, rule } = matchAnyRule(url, method, getEnabledRules());

    if (matched) {
      debugLog(`[捕获] ${method} ${extractApiPath(url)} (规则: ${rule.name})`, 'api');

      const id = ++STATE.captureIdCounter;
      const entry = {
        id,
        url,
        path: extractApiPath(url),
        method,
        resourceType,
        name: generateApiName(url, method),
        matchedRule: { id: rule.id, name: rule.name },
        requestHeaders: rule.captureHeaders ? request.headers() : {},
        postData: (rule.captureBody ? request.postData() : null) || null,
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString(),
        status: null,
        responseHeaders: null,
        responseData: null,
        responseSize: 0,
        duration: 0,
        _startTime: Date.now(),
        _completed: false,
        _pageUrl: page.url(),
      };

      STATE.capturedApis.unshift(entry);

      broadcastSse('capture-start', {
        id, url, path: entry.path, method,
        name: entry.name, timeStr: entry.timeStr,
        resourceType, ruleName: rule.name,
      });
    }

    request.continue();
  });

  // ---- 响应拦截 ----
  page.on('response', async response => {
    const request = response.request();
    const url = request.url();
    const method = request.method();

    const { matched } = matchAnyRule(url, method, getEnabledRules());
    if (!matched) return;

    const entry = STATE.capturedApis.find(e => e.url === url && !e._completed);
    if (!entry) return;

    entry.status = response.status();
    entry.responseHeaders = response.headers();
    entry._completed = true;
    entry.duration = Date.now() - entry._startTime;

    try {
      const contentType = (response.headers()['content-type'] || '').toLowerCase();
      if (contentType.includes('json') || contentType.includes('javascript')) {
        entry.responseData = await response.json();
      } else {
        const text = await response.text();
        entry.responseData = text.length > 10000 ? text.substring(0, 10000) + '... [截断]' : text;
      }
      entry.responseSize = JSON.stringify(entry.responseData).length;
    } catch (e) {
      entry.responseData = { _warning: '响应体读取失败', message: e.message };
    }

    broadcastSse('capture-done', {
      id: entry.id,
      status: entry.status,
      duration: entry.duration,
      size: entry.responseSize,
      dataPreview: typeof entry.responseData === 'object'
        ? JSON.stringify(entry.responseData).substring(0, 200)
        : String(entry.responseData).substring(0, 200),
    });
  });
}

module.exports = { init, attachInterceptorsToPage, extractApiPath, generateApiName };
