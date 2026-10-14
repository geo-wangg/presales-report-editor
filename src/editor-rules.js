/* 与源码模板一致的显示规则；浏览器和验证脚本共用。 */
(function (root) {
  'use strict';
  const round = (v, digits = 2) => { const scale = 10 ** digits; return Math.round((Number(v) + Number.EPSILON * Math.max(1, Math.abs(v))) * scale) / scale; };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rules = {
    round, clamp,
    volume(v) { return v > 1000 ? { level: 'high', bars: 5 } : v > 100 ? { level: 'medium', bars: 3 } : v > 0 ? { level: 'low', bars: 2 } : { level: 'low', bars: 0 }; },
    visibility(v) { return v >= 60 ? { level: 'high', label: '高' } : v >= 30 ? { level: 'medium', label: '中' } : v >= 0 ? { level: 'low', label: '低' } : { level: 'unknown', label: '' }; },
    score(v, module = false) {
      return v < 40 ? { fg: '#F53F3F', bg: module ? '#FFE8E8' : '#FDCDC5', label: '明显落后' }
        : v < 60 ? { fg: module ? '#F53F3F' : '#FF7D00', bg: module ? '#FFF7E8' : '#FFE4BA', label: '有待提升' }
          : v < 80 ? { fg: '#165DFF', bg: module ? '#E8F3FF' : '#BEDAFF', label: '接近行业' }
            : { fg: '#00B42A', bg: module ? '#E8FFEA' : '#AFF0B5', label: '表现领先' };
    },
    relative(v, min, max) { const percent = max === min ? 0 : Math.round((v - min) / (max - min) * 100); return { percent: clamp(percent, 0, 100), level: percent > 66.67 ? 'excellent' : percent > 33.33 ? 'normal' : 'weak', label: percent > 66.67 ? '优秀' : percent > 33.33 ? '一般' : '偏弱' }; },
    widths(values) { const max = Math.max(0, ...values); return values.map(v => max > 0 ? round(v / max * 100) : 0); },
    redistribute(values, index, next) {
      const others = values.reduce((sum, v, i) => sum + (i === index ? 0 : v), 0);
      const remainder = 100 - next;
      const result = values.map((v, i) => i === index ? next : others > 0 ? v / others * remainder : remainder / (values.length - 1));
      return result.map(v => round(v, 6));
    },
    normalize(values) { const sum = values.reduce((a, b) => a + b, 0); return sum ? values.map(v => round(v / sum * 100, 6)) : values; },
    rate(positive, negative) { return positive + negative > 0 ? round(positive / (positive + negative) * 100, 6) : 0; }
  };
  root.PresalesRules = rules;
  if (typeof module !== 'undefined') module.exports = rules;
})(typeof window !== 'undefined' ? window : globalThis);
