/**
 * URL匹配器
 * 支持精确匹配、正则匹配、关键字包含、域名匹配四种模式
 */

const { getStaticExts } = require('./config');

/**
 * 检查URL是否匹配规则
 * @param {string} url - 请求URL
 * @param {object} rule - 规则对象 { matchType, pattern, methods }
 * @param {string} method - HTTP请求方法
 * @returns {boolean}
 */
function matchUrl(url, rule, method) {
  if (!rule || !rule.enabled) return false;

  // 方法过滤
  if (rule.methods && rule.methods.length > 0) {
    if (!rule.methods.includes(method.toUpperCase())) return false;
  }

  try {
    const u = new URL(url);

    // 排除静态资源
    const staticExts = getStaticExts();
    if (staticExts.some(ext => u.pathname.toLowerCase().endsWith(ext))) return false;

    switch (rule.matchType) {
      case 'exact':
        // 精确匹配完整URL
        return url === rule.pattern;

      case 'regex': {
        // 正则匹配（可匹配URL任意部分）
        const re = new RegExp(rule.pattern, 'i');
        return re.test(url);
      }

      case 'contains':
        // 关键字包含（匹配URL任意位置）
        return url.toLowerCase().includes(rule.pattern.toLowerCase());

      case 'domain': {
        // 域名匹配（逗号分隔多个域名）
        const host = u.hostname;
        const domains = rule.pattern.split(',').map(d => d.trim()).filter(Boolean);
        return domains.some(d => host.endsWith(d) || host.includes(d));
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * 测试URL匹配所有启用的规则
 * @param {string} url - 请求URL
 * @param {string} method - HTTP方法
 * @param {Array<object>} rules - 启用的规则列表
 * @returns {{ matched: boolean, rule: object|null }}
 */
function matchAnyRule(url, method, rules) {
  for (const rule of rules) {
    if (matchUrl(url, rule, method)) {
      return { matched: true, rule };
    }
  }
  return { matched: false, rule: null };
}

module.exports = { matchUrl, matchAnyRule };
