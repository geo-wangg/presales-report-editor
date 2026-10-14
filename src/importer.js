/* 同模板 HTML 转换器：读取数据字面量，不执行上传文件的脚本。 */
(function (root) {
  'use strict';
  function readLiteral(source, start = 0) {
    let at = start, nodes = 0;
    const space = () => { while (/\s/.test(source[at] || '') && at < source.length) at++; };
    function string() {
      const quote = source[at++]; let result = '';
      while (at < source.length) {
        const char = source[at++];
        if (char === quote) return result;
        if (char !== '\\') { result += char; continue; }
        const escaped = source[at++];
        const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' };
        if (escaped === 'u' || escaped === 'x') {
          const length = escaped === 'u' ? 4 : 2, hex = source.slice(at, at + length);
          if (!new RegExp('^[0-9a-f]{' + length + '}$', 'i').test(hex)) throw Error('数据字符串转义格式不正确');
          result += String.fromCharCode(parseInt(hex, 16)); at += length;
        } else if (escaped === '\n') { /* 换行续写 */ }
        else result += escapes[escaped] ?? escaped;
      }
      throw Error('数据字符串未闭合');
    }
    function item(depth = 0) {
      if (++nodes > 200000 || depth > 40) throw Error('数据结构过大');
      space(); const char = source[at];
      if (char === '"' || char === "'") return string();
      if (char === '[' || char === '{') {
        const array = char === '[', end = array ? ']' : '}', value = array ? [] : Object.create(null); at++; space();
        while (source[at] !== end) {
          if (at >= source.length) throw Error('数据结构未闭合');
          if (array) value.push(item(depth + 1));
          else {
            space(); let key;
            if (source[at] === '"' || source[at] === "'") key = string();
            else { const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(at)); if (!match) throw Error('数据属性格式不正确'); key = match[0]; at += key.length; }
            space(); if (source[at++] !== ':') throw Error('数据属性缺少冒号');
            value[key] = item(depth + 1);
          }
          space(); if (source[at] === end) break;
          if (source[at++] !== ',') throw Error('只支持静态数据字面量');
          space();
        }
        at++; return value;
      }
      const match = /^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)\b/i.exec(source.slice(at));
      if (!match) throw Error('只支持静态数据字面量');
      at += match[0].length; return JSON.parse(match[0]);
    }
    const value = item(); space();
    if (at < source.length && !/[;,]/.test(source[at])) throw Error('数据包含不支持的表达式');
    return value;
  }
  const safeJSON = data => JSON.stringify(data).replace(/</g, '\\u003c');
  function inspect(doc) {
    if (!doc.querySelector('.hero-brand') || !doc.querySelector('main#reportContent') || !doc.querySelector('section.report-section')) throw Error('未识别到售前报告模板。请选择平台生成的同模板 HTML。');
    const charts = doc.querySelectorAll('[data-donut-chart], .bar-chart-grid, .topic-mention-table');
    if (!charts.length) throw Error('未找到模板中的图表或主题表格，暂时无法建立数据联动。');
    doc.querySelectorAll('[data-donut-chart]').forEach(wrap => {
      let data;
      try { data = JSON.parse(wrap.querySelector('.donut-data')?.textContent || 'null'); } catch (_) { throw Error('环形图数据格式不正确，请重新导出原始报告。'); }
      if (!wrap.querySelector('.donut-canvas') || !Array.isArray(data) || data.some(item => !item || typeof item.name !== 'string' || !Number.isFinite(Number(item.value)) || Number(item.value) < 0 || Number(item.value) > 100)) throw Error('环形图结构或数值不符合模板，请重新导出原始报告。');
      if (new Set(data.map(item => item.name)).size !== data.length) throw Error('环形图包含重复品牌名称，无法唯一绑定数据。');
    });
    doc.querySelectorAll('.bar-chart-wrap').forEach(row => {
      if (!row.querySelector('.bar-chart-brand-name') || !row.querySelector('.bar-rate-name') || !row.querySelector('.bar-chart-out')) throw Error('条形图结构不符合模板。');
    });
    doc.querySelectorAll('.search-volume').forEach(el => { if (!el.querySelector('strong')) throw Error('搜索量图标结构不符合模板。'); });
    doc.querySelectorAll('.topic-mention-score').forEach(el => { if (!el.querySelector('strong') || !el.querySelector('span')) throw Error('主题可见度结构不符合模板。'); });
    const stateEl = doc.querySelector('#pre-state');
    if (stateEl) {
      let state;
      try { state = JSON.parse(stateEl.textContent); } catch (_) { throw Error('已保存的编辑数据损坏，请选择完整的 HTML。'); }
      if (!state || typeof state !== 'object' || Array.isArray(state) || !state.values || typeof state.values !== 'object' || Array.isArray(state.values) || !state.texts || typeof state.texts !== 'object' || Array.isArray(state.texts) || Object.values(state.texts).some(value => typeof value !== 'string') || Object.values(state.values).some(value => typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) || !Array.isArray(state.editedKeys || [])) throw Error('已保存的编辑数据结构不正确。');
    }
  }
  function extractReportData(doc) {
    const existing = doc.querySelector('#pre-report-data');
    if (existing) { try { return JSON.parse(existing.textContent); } catch (_) { throw Error('报告附带数据损坏。'); } }
    const output = {};
    const keys = ['__geoPlatformIcons', '__geoKeywordsPositive', '__geoKeywordsNegative'];
    doc.querySelectorAll('script:not([type="application/json"])').forEach(script => {
      const code = script.textContent;
      keys.forEach(key => {
        const match = new RegExp('(?:^|[\\n;])\\s*window\\.' + key + '\\s*=\\s*', 'm').exec(code);
        if (match) output[key] = readLiteral(code, match.index + match[0].length);
      });
      const csv = /\bvar\s+sentimentKeywordCsvUrl\s*=\s*(['"])/.exec(code);
      if (csv) output.__geoSentimentCsvUrl = readLiteral(code, csv.index + csv[0].length - 1);
    });
    return output;
  }
  function convert(html, assets, channel) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    inspect(doc);
    const reportData = extractReportData(doc);
    // 上传文件在隔离预览中运行。仅注入本工具自带的交互与编辑脚本。
    doc.querySelectorAll('script').forEach(script => { if (!script.matches('.donut-data[type="application/json"], #pre-state[type="application/json"]')) script.remove(); });
    doc.querySelectorAll('#pre-toolbar, #pre-dialog, #pre-toast, #pre-format, #pre-editor-style, iframe, object, embed, base, meta[http-equiv], link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"]').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (/^on/i.test(attr.name) || attr.name === 'srcdoc' || (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(attr.name) && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name);
      });
      el.removeAttribute('contenteditable');
    });
    doc.body.classList.remove('pre-edit', 'geo-drawer-open');
    doc.body.style.overflow = '';
    doc.querySelectorAll('.geo-drawer').forEach(el => { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); });
    doc.querySelectorAll('.donut-canvas, #compete-strategy-chart-id').forEach(el => el.replaceChildren());
    doc.querySelectorAll('.topic-mention-legend-item').forEach(el => Array.from(el.childNodes).forEach(node => { if (node.nodeType === 3) node.textContent = node.textContent.replace('高 (>60%)', '高 (≥60%)').replace('中 (30-59%)', '中 (30%–<60%)'); }));
    const nonce = channel;
    const add = (tag, attrs, content, parent = doc.body) => { const el = doc.createElement(tag); Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value)); el.textContent = content; parent.append(el); return el; };
    const csp = "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline' https: data:; img-src https: http: data: blob:; font-src https: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    doc.head.prepend(Object.assign(doc.createElement('meta'), { httpEquiv: 'Content-Security-Policy', content: csp }));
    add('meta', { name: 'referrer', content: 'no-referrer' }, '', doc.head);
    add('style', { id: 'pre-editor-style' }, assets.css, doc.head);
    if (!doc.querySelector('#pre-state')) add('script', { id: 'pre-state', type: 'application/json' }, safeJSON({ version: 4, values: {}, texts: {}, editedKeys: [] }));
    add('script', { id: 'pre-report-data', type: 'application/json' }, safeJSON(reportData));
    add('script', { id: 'pre-host', type: 'application/json' }, safeJSON({ channel }));
    const dataLoader = "(function(){const d=JSON.parse(document.getElementById('pre-report-data').textContent);['__geoPlatformIcons','__geoKeywordsPositive','__geoKeywordsNegative','__geoSentimentCsvUrl'].forEach(k=>{if(k in d)window[k]=d[k]});})();\n";
    add('script', { id: 'pre-template-script', nonce }, dataLoader + assets.template);
    add('script', { id: 'pre-editor-script', nonce }, assets.rules + '\n' + assets.editor);
    add('script', { id: 'pre-bridge-bootstrap', nonce }, "if(!window.PresalesEditor)window.parent.postMessage({channel:" + safeJSON(channel) + ",type:'error',message:'报告编辑器未能加载。请检查模板结构或选择完整的原始 HTML。'},'*');");
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }
  root.PresalesImporter = { readLiteral, convert, inspect };
  if (typeof module !== 'undefined') module.exports = root.PresalesImporter;
})(typeof window !== 'undefined' ? window : globalThis);
