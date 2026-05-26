/**
 * Express 路由注册
 */
function registerRoutes(app, { STATE, debugLog, broadcastSse, addSseClient,
                                browserMgr, captureEngine, proxy, config }) {

  const { extractApiPath } = captureEngine;
  const { replayCaptured } = proxy;

  // ========== 浏览器管理 ==========
  app.post('/api/browser/open', async (req, res) => {
    try {
      const result = await browserMgr.openBrowser(req.body.url || '');
      res.json(result);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.post('/api/browser/close', async (req, res) => {
    try { await browserMgr.closeBrowser(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  app.get('/api/browser/status', (req, res) => {
    res.json({ open: STATE.browser !== null && STATE.browserReady,
      pageCount: STATE.capturedApis.length, capturing: STATE.isCapturing });
  });

  // ========== SSE ==========
  app.get('/api/captured/stream', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`event: init\ndata: ${JSON.stringify({
      browserOpen: STATE.browser !== null && STATE.browserReady,
      count: STATE.capturedApis.length })}\n\n`);
    addSseClient(res);
  });

  // ========== 调试日志 ==========
  app.get('/api/debug/logs', (req, res) => {
    res.json({ success: true, logs: STATE.debugLogs });
  });

  // ========== 捕获的API管理 ==========
  app.get('/api/captured/list', (req, res) => {
    const list = STATE.capturedApis.map(e => ({
      id: e.id, name: e.name, path: e.path, method: e.method,
      status: e.status, timeStr: e.timeStr, duration: e.duration,
      size: e.responseSize, completed: e._completed,
      ruleName: e.matchedRule?.name || '',
    }));
    res.json({ success: true, count: list.length, list });
  });

  app.get('/api/captured/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const entry = STATE.capturedApis.find(e => e.id === id);
    if (!entry) return res.status(404).json({ success: false, message: '未找到' });
    res.json({ success: true, data: entry });
  });

  app.post('/api/captured/clear', (req, res) => {
    STATE.capturedApis = [];
    res.json({ success: true, message: '已清除' });
  });

  app.post('/api/captured/replay/:id', async (req, res) => {
    try {
      const result = await replayCaptured(parseInt(req.params.id));
      if (result.error) return res.status(404).json({ success: false, message: result.error });
      res.json(result);
    } catch (e) {
      res.status(500).json({ success: false, message: e.message, detail: e.stack?.substring(0, 300) });
    }
  });

  // ========== 规则管理 ==========
  app.get('/api/rules', (req, res) => { res.json({ success: true, rules: config.getAllRules() }); });

  app.post('/api/rules', (req, res) => {
    const { name, matchType, pattern, methods, description } = req.body;
    if (!name || !pattern) return res.status(400).json({ success: false, message: '名称和匹配表达式不能为空' });
    const rule = config.addRule({ name, matchType, pattern, methods, description });
    res.json({ success: true, rule });
  });

  app.put('/api/rules/:id', (req, res) => {
    const rule = config.updateRule(req.params.id, req.body);
    if (!rule) return res.status(404).json({ success: false, message: '规则不存在' });
    res.json({ success: true, rule });
  });

  app.delete('/api/rules/:id', (req, res) => {
    if (!config.deleteRule(req.params.id)) return res.status(404).json({ success: false, message: '规则不存在' });
    res.json({ success: true });
  });

  app.post('/api/rules/:id/toggle', (req, res) => {
    const rule = config.toggleRule(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: '规则不存在' });
    res.json({ success: true, enabled: rule.enabled });
  });

  app.post('/api/rules/reset', (req, res) => {
    config.resetToDefaults();
    res.json({ success: true, message: '已重置' });
  });
}

module.exports = { registerRoutes };
