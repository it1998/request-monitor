/** 请求监听工具 — 前端逻辑 */
const STATE = { browserOpen: false, selectedApiId: null, selectedApiData: null, replayResult: null, allCaptured: [] };

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = message;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; setTimeout(() => t.remove(), 300); }, 3500);
}

function highlightJson(obj) {
  let s = typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj);
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return s.replace(/(\"(?:[^\"\\\\]|\\\\.)*\")\s*:/g,'<span class="json-key">$1</span>:')
          .replace(/:(\s*)(\"(?:[^\"\\\\]|\\\\.)*\")/g,':<span class="json-string">$1$2</span>')
          .replace(/:\s*(\d+\.?\d*)/g,': <span class="json-number">$1</span>')
          .replace(/:\s*(true|false)/g,': <span class="json-boolean">$1</span>')
          .replace(/:\s*null/g,': <span class="json-null">null</span>');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ======================== 浏览器管理 ========================
function fillUrl(url) { document.getElementById('targetUrl').value = url; }

async function startListen() {
  const targetUrl = document.getElementById('targetUrl').value.trim();
  if (!targetUrl) { showToast('请输入要监听的网址', 'warning'); return; }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) { showToast('网址必须以 http:// 或 https:// 开头', 'warning'); return; }

  // 自动添加目标域名规则
  try {
    const hostname = new URL(targetUrl).hostname;
    const rulesRes = await fetch('/api/rules');
    const rulesData = await rulesRes.json();
    const alreadyHas = rulesData.rules.some(r => r.enabled && r.matchType === 'domain' && r.pattern.includes(hostname));
    if (!alreadyHas) {
      await fetch('/api/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: hostname, matchType: 'domain', pattern: hostname, description: '自动添加' }) });
      loadRules();
    }
  } catch (e) { /* ignore */ }

  await openBrowser(targetUrl);
}

async function openBrowser(url) {
  const targetUrl = url || document.getElementById('targetUrl').value.trim() || 'https://example.com';
  const btn = document.getElementById('btnOpenBrowser');
  btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> 打开中...';

  try {
    const res = await fetch('/api/browser/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: targetUrl }) });
    const result = await res.json();
    if (result.success) {
      STATE.browserOpen = true; updateBrowserStatus(true);
      document.getElementById('btnCloseBrowser').disabled = false; document.getElementById('browserHint').style.display = 'block';
      showToast('✅ 浏览器已打开', 'success'); startSseConnection();
    } else { showToast('❌ ' + result.message, 'error'); }
  } catch (err) { showToast('❌ 打开失败: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '🚀 开始监听'; }
}

async function closeBrowser() {
  const btn = document.getElementById('btnCloseBrowser'); btn.disabled = true;
  try {
    await fetch('/api/browser/close', { method: 'POST' });
    STATE.browserOpen = false; updateBrowserStatus(false);
    document.getElementById('browserHint').style.display = 'none'; document.getElementById('btnOpenBrowser').disabled = false;
    showToast('已停止监听', 'info');
  } catch (err) { showToast('关闭失败: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '⏹ 停止监听'; }
}

function updateBrowserStatus(open) {
  const el = document.getElementById('browserStatus');
  if (open) { el.className = 'status-indicator online'; el.innerHTML = '<span class="dot"></span><span>监听中 — 操作浏览器即可捕获请求</span>'; }
  else { el.className = 'status-indicator offline'; el.innerHTML = '<span class="dot"></span><span>未开始监听</span>'; }
  document.getElementById('btnOpenBrowser').disabled = open;
}

// ======================== SSE ========================
let sseSource = null;
function startSseConnection() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource('/api/captured/stream');
  sseSource.addEventListener('init', (e) => { const d = JSON.parse(e.data); STATE.browserOpen = d.browserOpen; updateBrowserStatus(d.browserOpen); if (d.count) refreshCapturedList(); });
  sseSource.addEventListener('capture-start', (e) => { const d = JSON.parse(e.data); addCaptureItem(d); document.getElementById('captureCount').textContent = parseInt(document.getElementById('captureCount').textContent||'0')+1; });
  sseSource.addEventListener('capture-done', (e) => { const d = JSON.parse(e.data); updateCaptureItem(d); });
  sseSource.addEventListener('browser-status', (e) => { const d = JSON.parse(e.data); STATE.browserOpen = d.open; updateBrowserStatus(d.open); if (!d.open) { document.getElementById('btnCloseBrowser').disabled = true; document.getElementById('browserHint').style.display = 'none'; } });
  sseSource.onerror = () => { setTimeout(() => { if (STATE.browserOpen) startSseConnection(); }, 3000); };
}

// ======================== 捕获列表 ========================
function addCaptureItem(data) {
  STATE.allCaptured.unshift({ id: data.id, method: data.method, path: data.path, name: data.name, url: data.url, timeStr: data.timeStr, status: null });
  applyFilter();
}

function updateCaptureItem(data) {
  const item = STATE.allCaptured.find(i => i.id === data.id);
  if (item) item.status = data.status;
  // 仅在当前筛选结果中该元素可见时更新DOM
  const el = document.getElementById(`status-${data.id}`); if (!el) return;
  el.className = `capture-status ${data.status>=200&&data.status<300?'ok':data.status?'fail':'pending'}`;
  el.textContent = data.status || '...';
}

async function refreshCapturedList() {
  try {
    const res = await fetch('/api/captured/list'); const data = await res.json();
    if (!data.success) return;
    STATE.allCaptured = data.list || [];
    document.getElementById('captureCount').textContent = STATE.allCaptured.length;
    if (!STATE.allCaptured.length) {
      document.getElementById('capturedList').innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--gray-400);"><div style="font-size:40px;margin-bottom:12px;">📡</div><p>暂无捕获记录</p></div>';
      return;
    }
    applyFilter();
  } catch (err) { console.error(err); }
}

async function clearCaptured() {
  await fetch('/api/captured/clear', { method: 'POST' });
  STATE.selectedApiId = null; STATE.selectedApiData = null; STATE.allCaptured = [];
  refreshCapturedList(); resetDetailPanel();
  document.getElementById('captureCount').textContent = '0';
  showToast('已清空', 'info');
}

/** 筛选 — 按方法 & 关键字过滤 */
function applyFilter() {
  const method = document.getElementById('filterMethod').value;
  const keyword = document.getElementById('filterKeyword').value.trim().toLowerCase();
  const container = document.getElementById('capturedList');
  container.innerHTML = '';

  let filtered = STATE.allCaptured;
  if (method) filtered = filtered.filter(i => i.method === method);
  if (keyword) filtered = filtered.filter(i => (i.name + i.path + i.url).toLowerCase().includes(keyword));

  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px 16px;color:var(--gray-400);font-size:13px;">没有匹配的请求</div>';
    return;
  }
  filtered.forEach(item => {
    const div = document.createElement('div'); div.className = 'capture-item'; if (STATE.selectedApiId === item.id) div.classList.add('active');
    div.id = `capture-${item.id}`; div.onclick = () => showCaptureDetail(item.id);
    div.innerHTML = `<span class="method-badge ${item.method}">${item.method}</span><span class="capture-path" title="${item.path||''}">${item.name||item.path||''}</span><span class="capture-status ${item.status>=200&&item.status<300?'ok':item.status?'fail':'pending'}">${item.status||'...'}</span><span class="capture-time">${item.timeStr||''}</span>`;
    container.appendChild(div);
  });
  document.getElementById('captureCount').textContent = filtered.length;
}

// ======================== 详情 ========================
async function showCaptureDetail(id) {
  STATE.selectedApiId = id;
  document.querySelectorAll('.capture-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(`capture-${id}`); if (el) el.classList.add('active');
  try {
    const res = await fetch(`/api/captured/${id}`); const result = await res.json();
    if (!result.success) return;
    STATE.selectedApiData = result.data; const d = result.data;
    document.getElementById('detailTitle').textContent = `请求详情: ${d.name||d.path}`;
    document.getElementById('detailBadge').className = `status-badge ${d._completed?'success':'pending'}`;
    document.getElementById('detailBadge').textContent = d._completed ? `已完成 (${d.status})` : '请求中';
    document.getElementById('detailToolbar').style.display = 'flex';
    document.getElementById('detailRequest').style.display = 'block';
    document.getElementById('detailHeaders').style.display = 'block';
    document.getElementById('detailResponse').style.display = 'block';
    document.getElementById('detailEmpty').style.display = 'none';
    document.getElementById('detailMethod').innerHTML = `<span class="method-badge ${d.method}" style="display:inline-block;">${d.method}</span>`;
    document.getElementById('detailUrl').textContent = d.url||d.path;
    document.getElementById('detailStatus').innerHTML = `<span style="color:${d.status>=200&&d.status<300?'var(--success)':'var(--danger)'};font-weight:600;">${d.status||'等待中'}</span>`;
    document.getElementById('detailDuration').textContent = d.duration ? (d.duration<1000?`${d.duration}ms`:`${(d.duration/1000).toFixed(1)}s`) : '-';
    document.getElementById('detailHeadersContent').textContent = d.requestHeaders ? JSON.stringify(d.requestHeaders,null,2) : '无';
    document.getElementById('detailResponseContent').innerHTML = d.responseData ? highlightJson(d.responseData) : (d._completed ? '<span style="color:var(--gray-400);">无响应数据</span>' : '<span style="color:var(--warning);">⏳ 请求尚未完成...</span>');
  } catch (err) { showToast('获取详情失败: ' + err.message, 'error'); }
}

function resetDetailPanel() {
  STATE.selectedApiData = null;
  document.getElementById('detailTitle').textContent = '请求详情 & 回放';
  document.getElementById('detailBadge').className = 'status-badge pending'; document.getElementById('detailBadge').textContent = '等待选择';
  document.getElementById('detailToolbar').style.display = 'none'; document.getElementById('detailRequest').style.display = 'none';
  document.getElementById('detailHeaders').style.display = 'none'; document.getElementById('detailResponse').style.display = 'none';
  document.getElementById('detailEmpty').style.display = 'block';
}

// ======================== 回放 ========================
async function replayCaptured() {
  if (!STATE.selectedApiId) { showToast('请先选择请求', 'warning'); return; }
  const btn = document.getElementById('btnReplay'); btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> 回放中...';
  let box = document.getElementById('replayResultBox');
  if (!box) { box = document.createElement('div'); box.id = 'replayResultBox'; box.className = 'replay-result-box'; document.getElementById('detailResponse').after(box); }
  box.innerHTML = '<div class="replay-header">⏳ 正在回放...</div>';
  try {
    const res = await fetch(`/api/captured/replay/${STATE.selectedApiId}`, { method: 'POST' });
    const result = await res.json(); STATE.replayResult = result;
    box.innerHTML = `<div class="replay-header" style="display:flex;justify-content:space-between;align-items:center;"><span>📊 回放结果</span><span style="font-size:12px;color:${result.success?'var(--success)':'var(--danger)'}">HTTP ${result.httpStatus||0}</span></div><pre class="result-viewer" style="max-height:400px;">${highlightJson(result)}</pre>`;
    showToast(result.success ? '✅ 回放成功' : '❌ 回放失败', result.success ? 'success' : 'error');
  } catch (err) { box.innerHTML = `<div class="replay-header" style="color:var(--danger);">❌ 回放出错</div><div class="json-viewer">${err.message}</div>`; showToast('回放出错: '+err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '▶️ 回放此请求'; }
}

function copyDetailUrl() { navigator.clipboard.writeText(document.getElementById('detailUrl').textContent).then(() => showToast('URL已复制','success')); }
function copyDetailResponse() { navigator.clipboard.writeText(document.getElementById('detailResponseContent').textContent).then(() => showToast('响应已复制','success')); }
function copyDetailHeaders() { navigator.clipboard.writeText(document.getElementById('detailHeadersContent').textContent).then(() => showToast('Headers已复制','success')); }
function exportDetailJson() {
  const data = STATE.replayResult || STATE.selectedApiData;
  if (!data) { showToast('没有数据','warning'); return; }
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  downloadBlob(blob, `request_${Date.now()}.json`); showToast('JSON已导出','success');
}

// ======================== 规则管理 ========================
async function loadRules() {
  const el = document.getElementById('ruleList');
  try {
    const res = await fetch('/api/rules'); const data = await res.json();
    if (!data.success) { el.innerHTML = '加载失败'; return; }
    if (!data.rules.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);">暂无规则，点击「添加规则」或「开始监听」自动添加</div>'; return; }
    el.innerHTML = data.rules.map(r => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e4e6eb;border-radius:6px;margin-bottom:4px;font-size:13px;">
        <span style="cursor:pointer;font-size:16px;${r.enabled?'color:#34c759;':'color:#c4c8cc;'}" onclick="toggleRule('${r.id}')" title="${r.enabled?'点击禁用':'点击启用'}">${r.enabled?'●':'○'}</span>
        <span style="font-weight:500;flex-shrink:0;min-width:80px;">${r.name}</span>
        <span style="font-size:11px;background:#e8f0fe;color:#1e7ae6;padding:1px 6px;border-radius:4px;flex-shrink:0;">${r.matchType}</span>
        <code style="flex:1;font-size:11px;color:#4e535b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${r.pattern}</code>
        <button class="btn btn-sm btn-outline" style="font-size:11px;padding:2px 8px;" onclick="deleteRule('${r.id}')">删除</button>
      </div>
    `).join('');
  } catch (e) { el.innerHTML = '加载失败: ' + e.message; }
}

async function toggleRule(id) { await fetch('/api/rules/'+id+'/toggle',{method:'POST'}); loadRules(); }
async function deleteRule(id) { if (!confirm('确认删除？')) return; await fetch('/api/rules/'+id,{method:'DELETE'}); loadRules(); }

function showAddRuleModal() {
  const name = prompt('规则名称:'); if (!name) return;
  const matchType = prompt('匹配模式 (exact/regex/contains/domain):','contains');
  if (!matchType||!['exact','regex','contains','domain'].includes(matchType)) { alert('请输入有效模式'); return; }
  const pattern = prompt('匹配表达式:'); if (!pattern) return;
  const desc = prompt('备注（可选）:','')||'';
  fetch('/api/rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,matchType,pattern,description:desc})})
    .then(r=>r.json()).then(d=>{ if(d.success){loadRules();showToast('规则已添加','success');}else showToast('添加失败: '+d.message,'error'); });
}

async function resetRules() { if (!confirm('确认重置所有规则？')) return; await fetch('/api/rules/reset',{method:'POST'}); loadRules(); showToast('已重置','info'); }

// ======================== 调试日志 ========================
async function refreshDebugLogs() {
  try {
    const res = await fetch('/api/debug/logs'); const data = await res.json();
    if (!data.success) return;
    const el = document.getElementById('debugLogContent'); if (!el) return;
    el.innerHTML = data.logs.length ? data.logs.map(l => {
      const c = l.type==='error'?'#ff3b30':l.type==='api'?'#34c759':l.type==='nav'?'#007aff':l.type==='target'?'#ff9500':'#d4d4d4';
      return `<span style="color:#888;">[${l.time}]</span> <span style="color:${c};">[${l.type}]</span> ${l.msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}`;
    }).join('\n') : '暂无日志';
    el.scrollTop = el.scrollHeight;
  } catch {}
}

// ======================== 初始化 ========================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('serverAddress').textContent = window.location.href;
  loadRules();

  fetch('/api/browser/status').then(r=>r.json()).then(status => {
    if (status.open) {
      STATE.browserOpen = true; updateBrowserStatus(true);
      document.getElementById('btnCloseBrowser').disabled = false; document.getElementById('browserHint').style.display = 'block';
      startSseConnection(); refreshCapturedList();
    }
  }).catch(() => {});

  setInterval(() => { if (STATE.browserOpen) refreshCapturedList(); }, 5000);
  refreshDebugLogs();
  setInterval(refreshDebugLogs, 3000);

  console.log('📋 请求监听工具 v3 已加载');
});
