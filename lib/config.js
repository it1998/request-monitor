/**
 * 配置管理模块
 * 管理用户自定义规则，支持配置文件/环境变量/API动态更新
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'custom-rules.json');

const DEFAULTS = {
  staticExts: ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
               '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webp', '.avif'],
  maxLogs: 200,
};

function createRule(opts = {}) {
  return {
    id: opts.id || '', name: opts.name || '', enabled: opts.enabled !== false,
    matchType: opts.matchType || 'domain', pattern: opts.pattern || '',
    methods: opts.methods || [], captureHeaders: opts.captureHeaders !== false,
    captureBody: opts.captureBody !== false, description: opts.description || '',
    source: opts.source || 'custom',
  };
}

let customRules = [];

function loadCustomRules() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      customRules = JSON.parse(raw).map(r => createRule({ ...r, source: 'custom' }));
    }
  } catch (e) { console.error('[Config] 加载规则失败:', e.message); customRules = []; }
}

function saveCustomRules() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(customRules.map(r => {
      const { source, ...rest } = r; return rest;
    }), null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('[Config] 保存规则失败:', e.message); return false; }
}

loadCustomRules();

function getAllRules() { return [...customRules]; }
function getEnabledRules() { return customRules.filter(r => r.enabled); }
function getCustomRules() { return [...customRules]; }

function addRule(ruleData) {
  const rule = createRule({
    ...ruleData,
    id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    source: 'custom',
  });
  customRules.push(rule);
  saveCustomRules();
  return rule;
}

function updateRule(id, updates) {
  const idx = customRules.findIndex(r => r.id === id);
  if (idx === -1) return null;
  customRules[idx] = { ...customRules[idx], ...updates, id, source: 'custom' };
  saveCustomRules();
  return customRules[idx];
}

function deleteRule(id) {
  const len = customRules.length;
  customRules = customRules.filter(r => r.id !== id);
  if (customRules.length !== len) { saveCustomRules(); return true; }
  return false;
}

function toggleRule(id) {
  const rule = customRules.find(r => r.id === id);
  if (!rule) return null;
  rule.enabled = !rule.enabled;
  saveCustomRules();
  return rule;
}

function resetToDefaults() { customRules = []; saveCustomRules(); }
function getStaticExts() { return DEFAULTS.staticExts; }
function getMaxLogs() { return DEFAULTS.maxLogs; }

module.exports = {
  getAllRules, getEnabledRules, getCustomRules,
  addRule, updateRule, deleteRule, toggleRule, resetToDefaults,
  getStaticExts, getMaxLogs,
};
