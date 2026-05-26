/**
 * 代理转发与回放模块
 */
const axios = require('axios');

function createProxyHandler(STATE, extractApiPath) {
  async function replayCaptured(id) {
    const entry = STATE.capturedApis.find(e => e.id === id);
    if (!entry) return { error: '未找到该API记录' };

    const requestConfig = {
      method: entry.method.toLowerCase(),
      url: entry.url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
      timeout: 60000,
      validateStatus: () => true,
      responseType: 'json',
    };

    if (entry.requestHeaders && entry.requestHeaders.cookie) {
      requestConfig.headers['Cookie'] = entry.requestHeaders.cookie;
    } else if (entry.requestHeaders && entry.requestHeaders.Cookie) {
      requestConfig.headers['Cookie'] = entry.requestHeaders.Cookie;
    }

    if (entry.postData && ['POST', 'PUT', 'PATCH'].includes(entry.method)) {
      requestConfig.data = entry.postData;
      if (!requestConfig.headers['Content-Type']) {
        requestConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    console.log(`[回放] ${entry.method} ${extractApiPath(entry.url)}`);
    const response = await axios(requestConfig);

    return {
      success: response.status >= 200 && response.status < 300,
      httpStatus: response.status,
      headers: response.headers,
      data: response.data,
      timestamp: new Date().toISOString(),
    };
  }

  return { replayCaptured };
}

module.exports = { createProxyHandler };
