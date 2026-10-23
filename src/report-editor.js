(function () {
  'use strict';
  const R = window.PresalesRules;
  const $ = (s, root = document) => root?.querySelector(s) || null;
  const $$ = (s, root = document) => Array.from(root?.querySelectorAll(s) || []);
  const saved = JSON.parse($('#pre-state')?.textContent || '{}');
  const state = { version: 5, values: saved.values || {}, texts: saved.texts || {}, editedKeys: saved.editedKeys || [], brand: saved.brand || $('.hero-brand')?.textContent.trim() || '本品' };
  // Older exports stored the entire cover h1 as one rich-text block.
  // Split its saved content before binding nodes so brand edits cannot be swallowed by h1.
  $$('[data-pre-text]').filter(node => $('.hero-brand', node)).forEach(node => {
    const key = node.dataset.preText;
    if (key in state.texts) node.innerHTML = state.texts[key];
    $$('.hero-brand, [data-hero-report], [data-hero-subtitle]', node).forEach((child, i) => {
      child.dataset.preText = child.dataset.preText || key + '.cover.' + i;
    });
    node.removeAttribute('data-pre-text'); delete state.texts[key];
  });
  const host = JSON.parse($('#pre-host')?.textContent || 'null');
  const sendHost = (type, data = {}) => { if (host && window.parent !== window) window.parent.postMessage({ channel: host.channel, type, ...data }, '*'); };
  const fields = new Map(), groups = new Map(), renders = [], textNodes = new Map();
  // Keep metric identity stable across display-name edits (including v4 exports).
  const brand = saved.brandId || state.brand;
  state.brandId = brand;
  const brandLabels = new Set();
  const identity = node => node?.dataset.preBrandIdentity || node?.textContent.trim();
  const brandSelector = '.hero-brand, .cover-target, .cover-card-cnt em, .bar-chart-brand-name, .legend-name, .topic-mention-table thead th, .opportunity-card-brand-label';
  $$(brandSelector + ', [data-pre-brand-identity]').forEach(node => {
    if (identity(node) === brand) { node.dataset.preBrandIdentity = brand; brandLabels.add(node); }
  });
  function syncBrand(name) {
    const previous = state.brand;
    Object.keys(state.values).filter(key => key.startsWith('stance.')).forEach(key => {
      if ([previous + '胜', previous + '负'].includes(state.values[key])) state.values[key] = name + state.values[key].slice(-1);
    });
    state.brand = name;
    brandLabels.forEach(node => {
      // Preserve rich text in the edited hero; structured labels use plain text.
      if (node.textContent.trim() !== name) node.textContent = name;
      if (node.dataset.preText) state.texts[node.dataset.preText] = node.innerHTML;
    });
    fields.forEach(f => {
      f.label = (f.brandLabel || f.label).split(' · ').map(part => part === brand ? name : part.startsWith(brand + ' ') ? name + part.slice(brand.length) : part).join(' · ');
      if (f.choices && f.key.startsWith('stance.')) f.choices = [name + '胜', '持平', name + '负'];
      f.endpoints.forEach(e => { e.el.title = '编辑：' + f.label; });
    });
  }
  let editing = false, dirty = false, dialogContext = null, toastTimer, history = [], historyAt = -1;
  let formatSelection = null, formatting = false;
  const number = text => Number(String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] || 0);
  const fmt = v => String(R.round(v));
  const percent = v => fmt(v) + '%';
  const create = (tag, attrs = {}, text = '') => { const node = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v)); node.textContent = text; return node; };
  function field(el, key, initial, label, options = {}) {
    if (!fields.has(key)) fields.set(key, { key, label, min: 0, max: 100, format: percent, endpoints: [], ...options });
    const f = fields.get(key);
    if (!f.brandLabel) f.brandLabel = label;
    if (!(key in state.values)) state.values[key] = initial;
    if (el) {
      el.dataset.preField = key;
      el.title = '编辑：' + label;
      f.endpoints.push({ el, format: options.format || f.format });
    }
    return f;
  }
  function bind(selector, key, label, options = {}, root = document) {
    const el = $(selector, root);
    if (el) field(el, key, number(el.textContent), label, options);
  }
  function group(key, title, keys, options = {}) {
    const g = { key, title, keys, ...options };
    groups.set(key, g);
    keys.forEach(k => { if (fields.has(k)) fields.get(k).group = key; });
    return g;
  }
  function chartTarget(el, key) { if (el) { el.dataset.preChart = key; el.title = '编辑图表数据'; } }
  function value(key) { return Number(state.values[key] || 0); }
  function notify(text) {
    clearTimeout(toastTimer); let toast = $('#pre-toast');
    if (!toast) { toast = create('div', { id: 'pre-toast', role: 'status' }); document.body.append(toast); }
    toast.textContent = text; toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4300);
  }
  function render() {
    renders.forEach(fn => fn());
    fields.forEach(f => f.endpoints.forEach(e => { e.el.textContent = e.format(state.values[f.key]); }));
    updateToolbar();
  }
  const snapshot = () => JSON.stringify(state);
  function record() {
    const snap = snapshot();
    if (history[historyAt] === snap) return;
    history = history.slice(0, historyAt + 1); history.push(snap);
    if (history.length > 100) history.shift();
    historyAt = history.length - 1; dirty = true; updateToolbar();
  }
  function commitText(node) {
    if (node && state.texts[node.dataset.preText] !== node.innerHTML) {
      if (node.matches('.hero-brand') || brandLabels.has(node)) {
        const name = node.textContent.trim();
        const collision = $$('.topic-mention-table thead th, .bar-chart-brand-name, .legend-name, .opportunity-card-brand-label').some(label => !brandLabels.has(label) && label.textContent.trim() === name)
          || donutModels.some(model => model.data.some(item => (item.brandId || item.name) !== brand && item.name === name));
        if (!name || collision) {
          node.innerHTML = state.texts[node.dataset.preText];
          notify('品牌名称不能为空或与竞品重名。'); return;
        }
        syncBrand(name); render();
      }
      state.texts[node.dataset.preText] = node.innerHTML;
      record();
    }
  }
  function restore(offset) {
    if (historyAt + offset < 0 || historyAt + offset >= history.length) return;
    historyAt += offset; const previous = JSON.parse(history[historyAt]);
    state.values = previous.values; state.texts = previous.texts; state.editedKeys = previous.editedKeys; state.brand = previous.brand;
    textNodes.forEach((node, key) => { if (key in state.texts) node.innerHTML = state.texts[key]; });
    syncBrand(state.brand); dirty = true; render();
  }
  function edited(key) { return state.editedKeys.includes(key); }
  function mark(keys) { keys.forEach(k => { if (!state.editedKeys.includes(k)) state.editedKeys.push(k); }); }

  // 主题表格使用更精确的“当前可见度”表还原原始小数。
  const topicRows = $$('.topic-mention-table tbody tr');
  const topicBrandIndex = $$('.topic-mention-table thead th').slice(2).findIndex(th => identity(th) === brand);
  const topicNames = topicRows.map(row => { const name = row.dataset.preTopic || $('.topic-mention-topic', row)?.getAttribute('title') || $('.topic-mention-topic', row)?.textContent.trim(); row.dataset.preTopic = name; return name; });
  const rawTopicRates = new Map();
  $$('.ai-visibility-rate-table tbody tr').forEach(row => rawTopicRates.set(row.cells[0].textContent.trim(), number(row.cells[1].textContent)));
  function volume(el, key, label) {
    if (!el) return;
    field($('strong', el), key, number($('strong', el).textContent), label, { max: 1e12, integer: true, format: v => Number(v).toLocaleString('en-US') });
    renders.push(() => { const meta = R.volume(value(key)); el.classList.remove('search-volume-low', 'search-volume-medium', 'search-volume-high'); el.classList.add('search-volume-' + meta.level); $$('.search-volume-bar', el).forEach((bar, i) => bar.classList.toggle('is-active', i < meta.bars)); });
  }
  topicRows.forEach((row, i) => {
    const topic = topicNames[i];
    volume($('.search-volume', row), 'topic.' + i + '.volume', topic + ' · 搜索量');
    $$('.topic-mention-score', row).forEach((cell, j) => {
      const name = identity($$('.topic-mention-table thead th')[j + 2]) || '品牌' + j;
      const key = 'topic.' + i + '.brand.' + j;
      const initial = name === brand && rawTopicRates.has(topic) ? rawTopicRates.get(topic) : number($('strong', cell).textContent);
      field($('strong', cell), key, initial, topic + ' · ' + name + ' 可见度', { format: v => Math.round(v) + '%' });
      renders.push(() => { const meta = R.visibility(value(key)); cell.className = 'topic-mention-score topic-mention-score-' + meta.level; $('span', cell).textContent = meta.label; });
    });
  });
  $$('.prompt-mention-topic-card').forEach((article, i) => {
    const title = $('.prompt-mention-topic-title', article)?.textContent.trim() || '';
    const idx = article.dataset.preTopicIndex !== undefined ? Number(article.dataset.preTopicIndex) : topicNames.findIndex(name => title.startsWith(name));
    article.dataset.preTopicIndex = idx;
    volume($('.search-volume', article), idx >= 0 ? 'topic.' + idx + '.volume' : 'prompt-topic.' + i + '.volume', title + ' · 搜索量');
  });
  $$('.ai-visibility-rate-table tbody tr').forEach(row => {
    const idx = row.dataset.preTopicIndex !== undefined ? Number(row.dataset.preTopicIndex) : topicNames.indexOf(row.cells[0].textContent.trim());
    row.dataset.preTopicIndex = idx;
    if (idx >= 0 && topicBrandIndex >= 0) field(row.cells[1], 'topic.' + idx + '.brand.' + topicBrandIndex, number(row.cells[1].textContent), topicNames[idx] + ' · ' + brand + ' 可见度', { format: percent });
  });
  const promptRows = $$('.prompt-mention-table tbody tr');
  $$('.opportunity-card').forEach((card, i) => {
    const promptTitle = card.dataset.prePrompt || $('.opportunity-card-title', card).textContent.trim(); card.dataset.prePrompt = promptTitle;
    const promptIndex = promptRows.findIndex(row => $('.prompt-mention-question', row)?.getAttribute('title') === promptTitle);
    const topicIndex = promptIndex >= 0 ? Number(promptRows[promptIndex].closest('.prompt-mention-topic-card').dataset.preTopicIndex) : -1;
    volume($('.search-volume', card), topicIndex >= 0 ? 'topic.' + topicIndex + '.volume' : 'opportunity.' + i + '.volume', '机会 ' + (i + 1) + ' · 搜索量');
    const keys = [];
    $$('.opportunity-card-brand', card).forEach((item, j) => {
      const key = item.classList.contains('is-brand') && promptIndex >= 0 ? 'prompt.rate.' + promptIndex : 'opportunity.' + i + '.brand.' + j; keys.push(key);
      field($('.opportunity-card-brand-rate', item), key, number($('.opportunity-card-brand-rate', item).textContent), '机会 ' + (i + 1) + ' · ' + identity($('.opportunity-card-brand-label', item)));
    });
    renders.push(() => {
      const items = $$('.opportunity-card-brand', card), max = Math.max(0, ...items.filter(item => !item.classList.contains('is-brand')).map(item => value($('.opportunity-card-brand-rate', item).dataset.preField)));
      items.forEach(item => { const v = value($('.opportunity-card-brand-rate', item).dataset.preField); item.classList.toggle('is-zero', v === 0); item.classList.toggle('is-top', !item.classList.contains('is-brand') && v > 0 && v === max); });
    });
  });

  // 六组条形图，字段共用可见度、首位率、评分等主指标。
  const barModels = [];
  const barGroupNames = ['AI提及率 · 品牌对比', 'AI提及率 · 分平台', '首位可见度 · 品牌对比', '平均位次 · 品牌对比', '官网引用率 · 品牌对比', '信源类别占比'];
  $$('.bar-chart-grid').forEach((grid, ordinal) => {
    const section = grid.closest('section')?.id;
    const index = section === 'ai-visibility' ? (grid.closest('.visibility-platform-breakdown') ? 1 : 0)
      : section === 'ai-brand-position' ? ($('.bar-rate-name', grid)?.textContent.includes('位') ? 3 : 2)
        : section === 'source-reference' ? (grid.closest('.citation-category-list') ? 5 : 4) : ordinal + 6;
    const key = 'bar.' + index, rank = index === 3;
    const rows = $$('.bar-chart-wrap', grid).map((row, i) => {
      const name = identity($('.bar-chart-brand-name', row));
      const self = $('.bar-chart-out', row).classList.contains('is-brand') || name === brand;
      const label = $('.bar-rate-name', row);
      let fieldKey = label.dataset.preField || key + '.row.' + i;
      if (self && index === 0) fieldKey = 'overall.mention';
      if (self && index === 2) fieldKey = 'overall.first';
      if (self && index === 3) fieldKey = 'overall.rank';
      if (name === brand && index === 4) fieldKey = 'overall.citation';
      if (index === 5) fieldKey = 'channel.' + name;
      field(label, fieldKey, number(label.textContent), (barGroupNames[index] || '条形图') + ' · ' + name, { max: rank ? 1000 : 100, format: rank ? v => '第 ' + fmt(v) + ' 位' : percent });
      return { row, name, key: fieldKey, label, out: $('.bar-chart-out', row), self };
    });
    group(key, barGroupNames[index] || '条形图数据', rows.map(row => row.key), { mode: index === 5 ? 'distribution' : 'independent', rank, hint: rank ? '平均位次数值越小越好；条形长度沿用原模板按最大位次缩放。' : '修改后会重算整组条形长度并更新已关联的指标。' });
    chartTarget(grid, key); barModels[index] = { grid, rows, rank };
    renders.push(() => {
      const widths = R.widths(rows.map(row => value(row.key)));
      rows.forEach((row, i) => {
        const v = value(row.key), fill = row.label.parentElement;
        fill.className = v > 0 ? 'bar-chart-filled' : 'bar-chart-rate-defalut';
        fill.style.width = v > 0 ? widths[i] + '%' : '';
      });
      const ordered = [...rows].sort((a, b) => rank ? (value(a.key) === 0 ? Infinity : value(a.key)) - (value(b.key) === 0 ? Infinity : value(b.key)) : value(b.key) - value(a.key));
      ordered.forEach(row => grid.append(row.row));
    });
  });
  const metrics = $$('#overview .metric-item');
  state.metricBounds = saved.metricBounds || metrics.slice(0, 3).map(item => ({ min: number($('.metric-ranking-label-min', item)?.textContent), max: number($('.metric-ranking-label-max', item)?.textContent) }));
  bind('.metric-description-text strong', 'overall.mention', '整体AI可见度', {}, metrics[0] || null);
  bind('.metric-description-text strong', 'overall.first', '整体首位可见度', {}, metrics[1] || null);
  bind('.metric-description-text strong', 'competition.rate', '正向及推荐率', {}, metrics[2] || null);
  bind('#ai-visibility .visibility-main-rate strong', 'overall.mention', '整体AI可见度', { format: v => R.round(v, 1).toFixed(1) + '%' });
  const positionMetrics = $$('#ai-brand-position .visibility-main-rate strong');
  positionMetrics.forEach(el => field(el, el.textContent.includes('位') || el.textContent.includes('--') ? 'overall.rank' : 'overall.first', number(el.textContent), el.textContent.includes('%') ? '整体首位可见度' : '平均位次', el.textContent.includes('%') ? { format: v => Number(v).toFixed(1) + '%' } : { max: 1000, format: v => v > 0 ? '第 ' + fmt(v) + ' 位' : '--' }));
  bind('#source-reference .visibility-main-rate strong', 'overall.citation', '官网引用率');
  bind('.ai-visibility-rate-kpi strong', 'overall.mention', '整体AI可见度');

  // 用 SVG 绘制环形图，编辑与保存均不依赖在线图表库。
  const NS = 'http://www.w3.org/2000/svg';
  function drawDonut(host, segments, inner = .6, outer = .9) {
    if (!host) return;
    host.replaceChildren();
    const size = host.clientWidth || parseFloat(host.style.width) || 240;
    const r = size * (inner + outer) / 4, stroke = size * (outer - inner) / 2, circumference = 2 * Math.PI * r;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size); svg.setAttribute('class', 'pre-donut'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', segments.map(s => s.name + ' ' + percent(s.value)).join('，'));
    const sum = segments.reduce((n, s) => n + s.value, 0);
    let offset = 0;
    (sum ? segments : [{ name: '暂无数据', value: 1, color: '#E5E6EB' }]).forEach(segment => {
      if (segment.value <= 0) return;
      const fraction = segment.value / (sum || 1), length = fraction * circumference;
      const circle = document.createElementNS(NS, 'circle');
      const attrs = { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: segment.color, 'stroke-width': stroke, 'stroke-dasharray': Math.max(0, length - (fraction < 1 ? 2.5 : 0)) + ' ' + circumference, 'stroke-dashoffset': -offset, transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' };
      Object.entries(attrs).forEach(([k, v]) => circle.setAttribute(k, v)); const title = document.createElementNS(NS, 'title'); title.textContent = segment.name + ' ' + (sum ? percent(segment.value) : ''); circle.append(title); svg.append(circle); offset += length;
    });
    host.append(svg);
  }
  const donutModels = [];
  $$('[data-donut-chart]').forEach((wrap, index) => {
    const data = JSON.parse($('.donut-data', wrap).textContent);
    const platform = wrap.closest('.platform-sov-item');
    const overall = !platform && Boolean(wrap.closest('#overview, #ai-visibility'));
    const key = overall ? 'sov.all' : 'sov.platform.' + ($('.donut-canvas', wrap)?.id || index);
    const keys = data.map((item, i) => {
      const fieldKey = key + '.' + (item.brandId || item.name);
      const legacyKey = 'sov.platform.' + index + '.' + item.name;
      if (saved.version <= 3 && platform && !(fieldKey in state.values) && legacyKey in state.values) state.values[fieldKey] = state.values[legacyKey];
      field(null, fieldKey, item.value, (item.brandId || item.name) + ' · 提及份额');
      return fieldKey;
    });
    group(key, overall ? '整体提及份额（SOV）' : '分平台提及份额（SOV）', keys, { mode: 'distribution', hint: '可同时修改全部品牌的份额，填写其他项目时已输入的数值保持不变。合计100%后一次应用。' });
    chartTarget(wrap, key);
    const selfIndex = data.findIndex(item => (item.brandId || item.name) === brand);
    if (selfIndex >= 0) field($('.donut-center strong', wrap) || $('.donut-center > span', wrap), keys[selfIndex], data[selfIndex].value, brand + ' · 提及份额');
    const legend = wrap.closest('.overview-chart-row, .visibility-sov-overview')?.querySelector('.legend, .visibility-sov-legend');
    const legendRoot = overall ? (wrap.closest('.overview-chart-row') || wrap.parentElement) : null;
    if (legendRoot) $$('.legend-rate', legendRoot).forEach((label, i) => { const name = identity($('.legend-name', label.closest('li'))); const idx = data.findIndex(item => (item.brandId || item.name) === name); if (idx >= 0) field(label, keys[idx], data[idx].value, name + ' · 提及份额'); });
    donutModels.push({ wrap, data, keys });
    renders.push(() => {
      const next = data.map((item, i) => ({ ...item, ...((item.brandId || item.name) === brand ? { brandId: brand, name: state.brand } : {}), value: value(keys[i]) }));
      $('.donut-data', wrap).textContent = JSON.stringify(next);
      drawDonut($('.donut-canvas', wrap), next, parseFloat(wrap.dataset.donutInner) / 100, parseFloat(wrap.dataset.donutOuter) / 100);
      const rank = $('.donut-center em', wrap);
      if (rank && selfIndex >= 0) rank.textContent = '第' + (1 + next.filter(item => item.value > next[selfIndex].value).length) + '名';
    });
  });
  if (fields.has('sov.all.' + brand)) {
    field(null, 'overall.sov', value('sov.all.' + brand), '整体SOV');
    fields.get('overall.sov').group = 'sov.all';
    renders.push(() => { state.values['overall.sov'] = value('sov.all.' + brand); });
  }

  // 总分、子模块及优化前后差值。
  $$('.metric-score-ring, .gw-score-ring').forEach((ring, i) => {
    const after = Boolean(ring.closest('.gw-compare-after')), beforeCompare = Boolean(ring.closest('.gw-compare-before'));
    const key = after ? 'audit.after' : 'audit.before', label = $('strong', ring), initial = number(label.textContent);
    field(label, key, initial, after ? '优化后网站评分' : '当前网站评分', { format: fmt });
    renders.push(() => {
      const score = value(key), colors = R.score(score), circles = $$('circle', ring), arc = circles[1];
      if (!arc) return;
      const c = 2 * 3.1415926 * Number(arc.getAttribute('r'));
      arc.setAttribute('stroke-dasharray', R.clamp(score / 100, 0, 1) * c + ' ' + c);
      circles[0].setAttribute('stroke', beforeCompare ? '#E5E6EB' : colors.bg); arc.setAttribute('stroke', beforeCompare ? '#C9CDD4' : colors.fg); label.style.color = beforeCompare ? '#86909C' : colors.fg;
    });
  });
  $$('.gw-module-card').forEach(card => {
    const title = $('.gw-module-title', card).textContent.trim();
    const keyBase = card.dataset.preModule || ('audit.module.' + title); card.dataset.preModule = keyBase;
    const compare = Boolean($('.gw-module-score-before', card));
    $$('.gw-module-score-text', card).forEach((label, i) => {
      const before = !compare || i === 0, key = keyBase + (before ? '.before' : '.after');
      field(label, key, number(label.textContent), title + (before ? ' · 当前评分' : ' · 优化后评分'), { format: fmt });
      if (!compare || !before) renders.push(() => { const colors = R.score(value(key), true); label.style.color = colors.fg; label.parentElement.style.background = colors.bg; });
    });
    if (compare) renders.push(() => {
      const diff = R.round(value(keyBase + '.after') - value(keyBase + '.before'), 1), tag = $('.gw-module-improve-tag', card);
      if (tag) { tag.textContent = diff > 0 ? '↑ ' + fmt(diff) + ' 分' : diff < 0 ? '↓ ' + fmt(-diff) + ' 分' : '持平'; tag.style.background = diff < 10 ? '#E5E6EB' : diff < 20 ? '#E8FFEA' : '#00B42A'; tag.style.color = diff < 10 ? '#86909C' : diff < 20 ? '#00B42A' : '#FFFFFF'; }
    });
  });
  renders.push(() => {
    const beforeTag = $('#audit .gw-overview-tag'), afterTag = $('#geo-tech .gw-overview-tag');
    if (beforeTag && edited('audit.before')) { const s = value('audit.before'); beforeTag.textContent = '网站健康度处于' + (s < 40 ? '薄弱' : s < 60 ? '基础' : s < 80 ? '良好' : '优秀') + '水平'; beforeTag.style.color = R.score(s).fg; }
    if (afterTag && (edited('audit.before') || edited('audit.after'))) { const delta = value('audit.after') - value('audit.before'); afterTag.textContent = delta > 0 ? '提升 ' + fmt(delta) + ' 分 ↑' : delta < 0 ? '下降 ' + fmt(-delta) + ' 分 ↓' : '持平'; }
  });

  // 位次分布与信源占比使用整组编辑，输入期间不改动其他项目。
  const positionItems = $$('.position-distribution-item');
  const positionKeys = positionItems.map((item, i) => {
    const key = 'position.' + i, label = $('.position-distribution-bar span', item);
    field(label, key, label ? number(label.textContent) : 0, $('.position-distribution-label', item).textContent.trim()); return key;
  });
  group('position', '位次分布', positionKeys, { mode: 'distribution' }); chartTarget($('.position-distribution-chart'), 'position');
  renders.push(() => {
    const heights = R.widths(positionKeys.map(value));
    positionItems.forEach((item, i) => {
      const host = $('.position-distribution-bar-wrap', item); let bar = $('.position-distribution-bar', item);
      if (!bar) { bar = create('div', { class: 'position-distribution-bar position-distribution-bar-' + (i < 2 ? 'gold' : i === 2 ? 'mid' : 'tail') }); const label = create('span'); bar.append(label); host.append(bar); field(label, positionKeys[i], 0, $('.position-distribution-label', item).textContent.trim()); }
      bar.style.height = heights[i] + '%'; bar.hidden = value(positionKeys[i]) === 0; $('span', bar).textContent = percent(value(positionKeys[i]));
    });
  });
  const channelSegments = $$('.channel-edge-category-segment'), channelKeys = [];
  channelSegments.forEach((segment, i) => {
    const name = $('.channel-edge-category-tooltip strong', segment).textContent.trim().split(' ')[0], key = 'channel.' + name;
    channelKeys.push(key); field($('span', segment), key, number(segment.style.width), name + ' · 信源占比');
    field($('.channel-edge-category-tooltip em', segment), key, number(segment.style.width), name + ' · 信源占比');
  });
  group('channel', '信源类别占比', channelKeys, { mode: 'distribution' }); chartTarget($('.channel-edge-category-bar-wrap'), 'channel');
  // 两处分类图共用同一分布编辑面板。
  channelKeys.forEach(k => { fields.get(k).group = 'channel'; });
  renders.push(() => {
    let offset = 0;
    channelSegments.forEach((segment, i) => { const v = value(channelKeys[i]); segment.style.width = v + '%'; if (channelKeys[i] === 'channel.You') { const callout = $('.channel-edge-category-callout'); if (callout) { callout.style.left = offset + v / 2 + '%'; callout.hidden = v === 0; callout.lastChild.textContent = 'You 品牌官网 ' + percent(v); } } offset += v; });
    $$('.channel-edge-category-legend-item').forEach(item => { if (item.textContent.includes('You')) { const icon = $('i', item); item.replaceChildren(icon, document.createTextNode('You 品牌官网 ' + percent(value('channel.You')))); } });
  });

  // 情绪与竞争率由可编辑计数推导，避免比例和计数矛盾。
  const sentimentRows = $$('.keyword-overview-row'), sentimentKeys = [];
  sentimentRows.forEach((row, i) => {
    const key = 'sentiment.count.' + i; sentimentKeys.push(key);
    field($('.keyword-overview-head em', row), key, number($('.keyword-overview-head em', row).textContent), ['正面记录数', '中性记录数', '负面记录数'][i], { integer: true, max: 1e9, format: v => fmt(v) + ' 条' });
    const rateKey = 'sentiment.rate.' + i;
    field($('.keyword-overview-head b', row), rateKey, number($('.keyword-overview-head b', row).textContent), ['正面占比', '中性占比', '负面占比'][i]); fields.get(rateKey).group = 'sentiment';
  });
  group('sentiment', '情绪记录数', sentimentKeys, { mode: 'counts', hint: '编辑记录数后，正面、中性、负面占比自动重算。' }); chartTarget($('.keyword-overview'), 'sentiment');
  renders.push(() => { const total = sentimentKeys.reduce((sum, key) => sum + value(key), 0); sentimentRows.forEach((row, i) => { const rate = total ? value(sentimentKeys[i]) / total * 100 : 0; state.values['sentiment.rate.' + i] = rate; $('.keyword-overview-bar i', row).style.width = rate + '%'; }); });
  const competition = $('[data-compete-summary]');
  if (competition) {
    field(null, 'competition.positive', number(competition.dataset.positive), '正向及推荐记录数', { max: 1e9, integer: true, format: fmt });
    field(null, 'competition.negative', number(competition.dataset.negative), '负向及未推荐记录数', { max: 1e9, integer: true, format: fmt });
    group('competition', '竞争策略 · 记录数', ['competition.positive', 'competition.negative'], { mode: 'counts', hint: '修改记录数，自动计算正向及推荐率并更新环形图。' });
    field($('.compete-strategy-chart-rate', competition), 'competition.rate', number(competition.dataset.rate), '正向及推荐率'); fields.get('competition.rate').group = 'competition';
    field($('.compete-strategy-chart-legend .positive b'), 'competition.positive', 1, '正向及推荐记录数', { format: fmt });
    field($('.compete-strategy-chart-legend .negative b'), 'competition.negative', 1, '负向及未推荐记录数', { format: fmt });
    chartTarget(competition, 'competition');
    renders.push(() => { const p = value('competition.positive'), n = value('competition.negative'), rate = R.rate(p, n); state.values['competition.rate'] = rate; competition.dataset.rate = rate; competition.dataset.positive = p; competition.dataset.negative = n; drawDonut($('#compete-strategy-chart-id'), p + n ? [{ name: '正向及推荐', value: rate, color: '#00B42A' }, { name: '负向及未推荐', value: 100 - rate, color: '#F53F3F' }] : [], .62, .92); });
  }

  // 概览进度条、重复指标和提示文字。
  const mainMetricKeys = ['overall.mention', 'overall.first', 'competition.rate'];
  metrics.slice(0, 3).forEach((item, i) => renders.push(() => {
    const key = mainMetricKeys[i], barIndex = i === 0 ? 0 : i === 1 ? 2 : null;
    const peers = barIndex !== null && barModels[barIndex]?.rows.length ? barModels[barIndex].rows.map(row => value(row.key)) : [state.metricBounds[i]?.min || 0, value(key), state.metricBounds[i]?.max || 0];
    const min = Math.min(...peers), max = Math.max(...peers), info = R.relative(value(key), min, max);
    const fill = $('.metric-ranking-fill', item), marker = $('.metric-ranking-marker', item), bar = $('.metric-ranking-bar', item);
    if (!fill || !marker || !bar) return;
    fill.style.width = info.percent + '%'; marker.style.left = info.percent + '%'; marker.style.setProperty('--marker-pct', info.percent); marker.textContent = info.label;
    bar.className = 'metric-ranking-bar metric-ranking-bar-' + info.level;
    $('.metric-ranking-label-min', item).textContent = '最低' + percent(min); $('.metric-ranking-label-max', item).textContent = '最高' + percent(max);
    if (edited(key) || (i === 2 && (edited('competition.positive') || edited('competition.negative')))) { const tooltip = $('.metric-description-text .metric-tooltip', item); if (tooltip) tooltip.textContent = '调整后的' + ['AI可见度', '首位可见度', '正向及推荐率'][i] + '：' + percent(value(key)) + '；分析文案请同步复核。'; }
  }));
  const summaryKeyMap = { '官网技术检测结果': 'audit.before', 'AI 可见度': 'overall.mention', '声量份额 SOV': 'overall.sov', '官网引用率': 'overall.citation', '首位提及率': 'overall.first', '平均位次': 'overall.rank' };
  bind('#ai-visibility-summary .summary-diagnosis-value', 'audit.before', '当前网站评分', { format: v => fmt(v) + '分' });
  $$('.summary-diagnosis-value-block').forEach(block => {
    const label = $('.summary-diagnosis-label', block)?.textContent.trim(), key = summaryKeyMap[label];
    if (key && fields.has(key)) field($('.summary-diagnosis-value', block), key, number($('.summary-diagnosis-value', block).textContent), label, { format: key === 'audit.before' ? v => fmt(v) + '分' : key === 'overall.rank' ? v => v ? '第' + fmt(v) + '位' : '--' : key === 'overall.citation' ? percent : v => Math.round(v) + '%' });
  });
  renders.push(() => {
    $$('.summary-diagnosis-value-block').forEach(block => {
      const label = $('.summary-diagnosis-label', block)?.textContent.trim(), sub = $('.summary-diagnosis-sub', block);
      if (!sub) return;
      const source = label === 'AI 可见度' ? barModels[0] : label === '首位提及率' ? barModels[2] : label === '平均位次' ? barModels[3] : label === '官网引用率' ? barModels[4] : null;
      if (source) { const values = source.rows.filter(row => !row.self).map(row => value(row.key)); const best = label === '平均位次' ? Math.min(...values.filter(v => v > 0)) : Math.max(0, ...values); sub.textContent = (label === '平均位次' ? '竞品最佳 ' + (Number.isFinite(best) ? fmt(best) : '--') + ' 位' : '竞品最高 ' + percent(best)); }
      if (label === '声量份额 SOV' && groups.has('sov.all')) sub.textContent = '竞品最高 ' + percent(Math.max(0, ...groups.get('sov.all').keys.filter(k => k !== 'sov.all.' + brand).map(value)));
    });
    if (edited('audit.before')) { const tag = $('#ai-visibility-summary .summary-diagnosis-card .status-tag-text'); if (tag?.dataset.preField) state.values[tag.dataset.preField] = R.score(value('audit.before')).label; }
  });

  // 上游业务标签提供手动选择并同步图标；不猜测上游算法。
  function updateStatus(tag) {
    const text = $('.status-tag-text', tag)?.textContent.trim() || '';
    const type = text === '表现领先' ? 'leading' : ['严重劣势', '明显落后', '严重边缘化'].includes(text) ? 'weak' : 'improving';
    tag.className = 'status-tag status-tag-' + type;
    const path = $('svg path', tag); if (path) path.setAttribute('d', type === 'leading' ? 'M4.7 8.15C5.18 9.04 6.01 9.5 7 9.5C7.99 9.5 8.82 9.04 9.3 8.15' : type === 'weak' ? 'M4.7 9.1C5.18 8.21 6.01 7.75 7 7.75C7.99 7.75 8.82 8.21 9.3 9.1' : 'M4.9 8.7H9.1');
  }
  $$('.status-tag-text').forEach((label, i) => {
    const key = label.dataset.preField || 'status.' + i;
    field(label, key, label.textContent.trim(), '诊断状态', { format: v => v, choices: ['需复核', '表现领先', '接近行业', '有待提升', '需要关注', '严重劣势', '明显落后', '严重边缘化'] });
    renders.push(() => { label.textContent = state.values[key]; updateStatus(label.closest('.status-tag')); });
  });
  $$('.compete-strategy-status').forEach((label, i) => {
    const key = label.dataset.preField || 'stance.' + i;
    field(label, key, label.textContent.trim(), '竞争态势', { format: v => v, choices: [brand + '胜', '持平', brand + '负'] });
    renders.push(() => { const text = state.values[key]; label.className = 'compete-strategy-status compete-strategy-status-' + (text === '持平' ? 'neutral' : text.endsWith('胜') ? 'positive' : 'negative'); });
  });
  $$('.prompt-mention-rate strong').forEach((label, i) => { const key = label.dataset.preField || 'prompt.rate.' + i; field(label, key, number(label.textContent), 'Prompt 可见度'); renders.push(() => label.parentElement.classList.toggle('is-zero', value(key) === 0)); });
  $$('.compete-strategy-rate-text strong').forEach((label, i) => field(label, label.dataset.preField || 'competition.platform.' + i, number(label.textContent), '分平台正向及推荐率'));
  // 其他纯数值表格单元格可独立编辑（不推导不同统计口径的总指标）。
  $$('table td').forEach((cell, i) => { if ((cell.dataset.preField && fields.has(cell.dataset.preField)) || $('[data-pre-field]', cell) || !/^\s*[\d,.]+%?\s*$/.test(cell.textContent)) return; const isPercent = cell.textContent.includes('%'); field(cell, cell.dataset.preField || 'table.cell.' + i, number(cell.textContent), '表格数值', { max: isPercent ? 100 : 1e12, format: isPercent ? percent : fmt }); });
  $$('header.cover *, main *').filter(node => !node.children.length && (!node.dataset.preField || !fields.has(node.dataset.preField)) && !node.closest('script, style, svg, [data-pre-chart], .geo-tooltip, .metric-tooltip, .gw-module-improve-tag') && /^\s*[\d,.]+%?\+?\s*$/.test(node.textContent)).forEach((node, i) => {
    const raw = node.textContent.trim(), isPercent = raw.includes('%'), plus = raw.includes('+'), comma = raw.includes(','), padded = /^0\d+$/.test(raw) ? raw.length : 0;
    field(node, node.dataset.preField || 'standalone.' + i, number(raw), '报告数值', { max: 1e12, format: v => (isPercent ? percent(v) : padded ? String(v).padStart(padded, '0') : comma ? Number(v).toLocaleString('en-US') : fmt(v)) + (plus ? '+' : '') });
  });

  // 只让正文块成为富文本编辑区，保持强调色、链接与版式。
  const textSelectors = '.hero-brand, [data-hero-report], [data-hero-subtitle], .cover-target, .cover-card-cnt em, h1, h2, h3, h4, p, .summary-copy, .gw-overview-desc, .gw-module-desc, .gw-module-impact, .competitor-block > div, .competitor-analysis-text, .summary-diagnosis-copy, .guide-step-desc, .guide-step-title, .opportunity-card-summary, .topic-mention-topic, .topic-mention-topic-sub, .prompt-mention-question, .prompt-mention-question-sub, .bar-chart-brand-name, .citation-card-title, .section-title-en, .keyword-chip, .ai-visibility-rate-topic';
  const leafTexts = $$('header.cover *, main *').filter(node => !node.children.length && !node.dataset.preField && !node.closest('script, style, svg, [data-pre-chart], .geo-tooltip, .metric-tooltip, .topic-mention-score, .metric-ranking, .gw-overview-tag') && !node.hasAttribute('data-pre-chart') && node.textContent.trim());
  const candidates = [...new Set([...$$('[data-pre-text]'), ...$$(textSelectors), ...leafTexts])].filter(node => !node.closest('script, style, .nav-rail, .nav-menu, svg') && !node.dataset.preField && !$('[data-pre-field], [data-pre-chart], .hero-brand, [data-hero-report], [data-hero-subtitle]', node) && node.textContent.trim());
  candidates.filter(node => !candidates.some(other => other !== node && other.contains(node))).forEach((node, i) => {
    const key = node.dataset.preText || 'text.' + i; node.dataset.preText = key;
    if (!(key in state.texts)) state.texts[key] = node.innerHTML;
    else node.innerHTML = state.texts[key];
    textNodes.set(key, node);
  });
  $$('table td, table th').forEach((node, i) => {
    if (node.dataset.preField || $('[data-pre-field], [data-pre-text], button, input, svg, img', node) || node.closest('[data-pre-text]') || !node.textContent.trim()) return;
    const key = node.dataset.preText || 'table-text.' + i; node.dataset.preText = key; if (!(key in state.texts)) state.texts[key] = node.innerHTML; else node.innerHTML = state.texts[key]; textNodes.set(key, node);
  });

  const toolbar = create('div', { id: 'pre-toolbar', role: 'toolbar', 'aria-label': '报告编辑工具' });
  toolbar.innerHTML = '<span class="pre-name">报告编辑器</span><span class="pre-mode">浏览模式</span><span class="pre-help">进入编辑模式后，点击文案直接修改，点击数值或图表调整数据。</span><button data-action="toggle" class="primary">进入编辑模式</button><button data-action="undo" disabled>撤销</button><button data-action="redo" disabled>重做</button><button data-action="save">另存为 HTML</button>';
  document.body.prepend(toolbar); document.body.classList.add('pre-editor-page');
  const formatBar = create('div', { id: 'pre-format', role: 'toolbar', 'aria-label': '文字格式工具' });
  formatBar.hidden = true;
  formatBar.innerHTML = '<span class="pre-format-name">文字格式</span><button type="button" data-format="bold" aria-label="加粗" aria-pressed="false" title="加粗（⌘/Ctrl+B）"><b>B</b></button><button type="button" data-format="italic" aria-label="斜体" aria-pressed="false" title="斜体"><i>I</i></button><button type="button" data-format="underline" aria-label="下划线" aria-pressed="false" title="下划线"><u>U</u></button><span class="pre-format-divider"></span><span class="pre-color-label">文字颜色</span><button type="button" class="pre-color" data-color="#1d2129" aria-label="深灰色文字" title="深灰色" style="--swatch:#1d2129"></button><button type="button" class="pre-color" data-color="#165dff" aria-label="蓝色文字" title="蓝色" style="--swatch:#165dff"></button><button type="button" class="pre-color" data-color="#f53f3f" aria-label="红色文字" title="红色" style="--swatch:#f53f3f"></button><button type="button" class="pre-color" data-color="#00b42a" aria-label="绿色文字" title="绿色" style="--swatch:#00b42a"></button><button type="button" class="pre-color" data-color="#ff7d00" aria-label="橙色文字" title="橙色" style="--swatch:#ff7d00"></button><label class="pre-custom-color" title="自定义文字颜色"><span>自定义</span><input type="color" aria-label="自定义文字颜色" value="#165dff"></label><span class="pre-format-divider"></span><button type="button" data-format="removeFormat" aria-label="清除文字格式">清除格式</button><span class="pre-format-hint">先选中文字</span>';
  document.body.append(formatBar);
  function captureFormatSelection() {
    if (formatting) return;
    if (!editing || $('#pre-dialog')?.open) { formatBar.hidden = true; formatSelection = null; return; }
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      const node = anchor?.closest('[data-pre-text]');
      if (node && node.isContentEditable && node.contains(range.endContainer)) {
        formatBar.hidden = false;
        formatSelection = range.collapsed ? null : { node, range: range.cloneRange() };
        const disabled = !formatSelection;
        $$('button, input', formatBar).forEach(button => { button.disabled = disabled; });
        $('.pre-format-hint', formatBar).textContent = disabled ? '先选中文字' : '格式会随 HTML 保存';
        $$('[data-format]', formatBar).forEach(button => {
          if (button.dataset.format === 'removeFormat') return;
          let active = false;
          try { active = document.queryCommandState(button.dataset.format); } catch (_) {}
          button.setAttribute('aria-pressed', String(active));
        });
        return;
      }
    }
    // 颜色选择器获得焦点时，保留之前选中的正文范围。
    if (document.activeElement?.closest('#pre-format') && formatSelection) return;
    formatSelection = null; formatBar.hidden = true;
  }
  function applyTextFormat(command, color) {
    if (!editing || !formatSelection || !formatSelection.node.isConnected) { notify('请先选中要设置格式的文字。'); return; }
    const { node, range } = formatSelection;
    commitText(node);
    formatting = true;
    try {
      node.focus({ preventScroll: true });
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.execCommand('styleWithCSS', false, true);
      const applied = document.execCommand(command, false, color || null);
      if (!applied) { notify('当前浏览器未应用此格式，请重新选中文字再试。'); return; }
      commitText(node);
      if (selection.rangeCount) formatSelection = { node, range: selection.getRangeAt(0).cloneRange() };
    } finally {
      formatting = false;
      captureFormatSelection();
    }
  }
  formatBar.addEventListener('mousedown', ev => { if (ev.target.closest('button')) ev.preventDefault(); });
  formatBar.addEventListener('click', ev => {
    const button = ev.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.format) applyTextFormat(button.dataset.format);
    if (button.dataset.color) applyTextFormat('foreColor', button.dataset.color);
  });
  $('input[type="color"]', formatBar).addEventListener('change', ev => applyTextFormat('foreColor', ev.target.value));
  document.addEventListener('selectionchange', captureFormatSelection);
  const dialog = create('dialog', { id: 'pre-dialog', 'aria-labelledby': 'pre-dialog-title' });
  dialog.innerHTML = '<form><div class="pre-dialog-head"><h2 id="pre-dialog-title"></h2><button type="button" data-action="close" aria-label="关闭数据编辑面板">关闭</button></div><p class="pre-dialog-sub"></p><div class="pre-fields"></div><div class="pre-total"></div><div class="pre-error" role="alert"></div><div class="pre-actions"><button type="button" data-action="normalize">按比例调整全部数值</button><button type="button" data-action="close">取消</button><button type="submit" class="primary">应用修改</button></div></form>';
  document.body.append(dialog);
  function updateToolbar() {
    if (!$('#pre-toolbar')) return;
    $('.pre-mode', toolbar).textContent = (editing ? '编辑模式' : '浏览模式') + (dirty ? ' · 未保存' : '');
    $('[data-action="toggle"]', toolbar).textContent = editing ? '预览报告' : '进入编辑模式';
    $('.pre-help', toolbar).textContent = editing ? '文案直接改 · 选中文字可加粗、改颜色 · 数字和图表点击编辑' : '进入编辑模式后，点击文案直接修改，点击数值或图表调整数据。';
    $('[data-action="undo"]', toolbar).disabled = historyAt <= 0; $('[data-action="redo"]', toolbar).disabled = historyAt >= history.length - 1;
    sendHost('status', { dirty, editing, brand: state.brand });
  }
  function setEditing(on) { if (document.activeElement?.dataset.preText) document.activeElement.blur(); editing = on; document.body.classList.toggle('pre-edit', on); textNodes.forEach(node => { if (on) { node.setAttribute('contenteditable', 'true'); node.setAttribute('spellcheck', 'false'); } else node.removeAttribute('contenteditable'); }); if (!on) { formatBar.hidden = true; formatSelection = null; } updateToolbar(); }
  function openData(targetKey, isGroup = false) {
    formatBar.hidden = true; formatSelection = null;
    const f = fields.get(targetKey), g = isGroup ? groups.get(targetKey) : f?.group ? groups.get(f.group) : null;
    const single = !isGroup && f && (!g || !['counts', 'distribution'].includes(g.mode)) && targetKey !== 'overall.sov';
    const keys = single ? [targetKey] : g?.keys || [targetKey];
    dialogContext = { keys, group: g, single, fieldKey: targetKey };
    $('#pre-dialog-title').textContent = single ? f.label : g?.title || f?.label;
    $('.pre-dialog-sub', dialog).textContent = single ? (f?.choices ? '选择状态后，颜色与图标同步更新。' : '修改数值后，已关联的图标、颜色、比例和重复展示会同步更新。') : g?.mode === 'distribution' ? '可同时修改所有项目，其他已填写数值保持不变。合计100%后点击“应用修改”；按比例调整全部数值需手动点击下方按钮。' : g?.hint || '修改后重算图形，分析文案可在报告中直接编辑。';
    const host = $('.pre-fields', dialog); host.replaceChildren();
    keys.forEach((key, i) => {
      const meta = fields.get(key), row = create('div', { class: 'pre-row' }), id = 'pre-input-' + i;
      row.append(create('label', { for: id }, meta.label));
      let input;
      if (meta.choices) { input = create('select', { id, 'data-key': key }); [...new Set([state.values[key], ...meta.choices])].forEach(choice => { const option = create('option', { value: choice }, choice); input.append(option); }); input.value = state.values[key]; }
      else { input = create('input', { id, 'data-key': key, type: 'number', min: meta.min, max: meta.max, step: meta.integer ? '1' : 'any', value: String(R.round(value(key), 6)), required: '' }); }
      row.append(input); host.append(row);
    });
    $('[data-action="normalize"]', dialog).hidden = single || g?.mode !== 'distribution'; $('.pre-error', dialog).textContent = ''; updateTotal(); dialog.showModal();
    const first = $$('input, select', host).find(input => input.dataset.key === targetKey) || $('input, select', host); first?.focus(); if (first?.select) first.select();
  }
  function dialogValues() { return $$('[data-key]', dialog).map(input => input.tagName === 'SELECT' ? input.value : input.value.trim() === '' ? NaN : Number(input.value)); }
  function updateTotal() { const g = dialogContext?.group; $('.pre-total', dialog).textContent = g?.mode === 'distribution' && !dialogContext.single ? '当前合计：' + fmt(dialogValues().reduce((a, b) => a + b, 0)) + '%' : ''; }
  dialog.addEventListener('input', updateTotal);
  dialog.addEventListener('click', ev => {
    const action = ev.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') dialog.close();
    if (action === 'normalize') { const values = dialogValues(); if (!values.every(v => Number.isFinite(v) && v >= 0)) { $('.pre-error', dialog).textContent = '请先填写有效的非负数值。'; return; } const next = R.normalize(values); $$('input[data-key]', dialog).forEach((input, i) => { input.value = next[i]; }); updateTotal(); }
  });
  $('form', dialog).addEventListener('submit', ev => {
    ev.preventDefault(); const { keys, group: g, single } = dialogContext, vals = dialogValues();
    for (let i = 0; i < keys.length; i++) { const f = fields.get(keys[i]), v = vals[i]; if (!f.choices && (!Number.isFinite(v) || v < f.min || v > f.max || (f.integer && !Number.isInteger(v)))) { $('.pre-error', dialog).textContent = '请填写范围内的有效' + (f.integer ? '整数' : '数值') + '。'; return; } }
    if (!single && g?.mode === 'distribution') { const sum = vals.reduce((a, b) => a + b, 0); if (sum !== 0 && Math.abs(sum - 100) > .05) { $('.pre-error', dialog).textContent = '占比合计应为100%。请手动调整，或选择“按比例调整全部数值”。当前输入已保留。'; return; } }
    keys.forEach((key, i) => { state.values[key] = vals[i]; }); mark(keys);
    const changed = keys;
    const review = [];
    if (changed.some(k => k === 'overall.mention' || k.startsWith('bar.0.'))) { review.push($$('#ai-visibility .status-tag-text')[0]); review.push($$('#ai-visibility-summary .summary-diagnosis-card')[1]?.querySelector('.status-tag-text')); }
    if (changed.some(k => k.startsWith('sov.all.'))) { review.push($$('#ai-visibility .status-tag-text')[1]); review.push($$('#ai-visibility-summary .summary-diagnosis-card')[1]?.querySelector('.status-tag-text')); }
    if (changed.some(k => k === 'overall.first' || k === 'overall.rank' || k.startsWith('bar.2.') || k.startsWith('bar.3.'))) { review.push(...$$('#ai-brand-position .status-tag-text')); review.push($$('#ai-visibility-summary .summary-diagnosis-card')[3]?.querySelector('.status-tag-text')); }
    if (changed.some(k => k === 'overall.citation' || k.startsWith('bar.4.'))) { review.push($('#source-reference .status-tag-text')); review.push($$('#ai-visibility-summary .summary-diagnosis-card')[2]?.querySelector('.status-tag-text')); }
    review.filter(Boolean).forEach(node => { const k = node.dataset.preField; state.values[k] = '需复核'; });
    render(); record(); dialog.close(); notify('已同步更新。涉及的分析文案请复核，完成后另存为 HTML。');
  });
  document.addEventListener('click', ev => {
    if (!editing || ev.target.closest('#pre-toolbar, #pre-dialog, #pre-format')) return;
    const numeric = ev.target.closest('[data-pre-field]');
    if (numeric) { ev.preventDefault(); ev.stopImmediatePropagation(); openData(numeric.dataset.preField); return; }
    const chart = ev.target.closest('[data-pre-chart]');
    if (chart && !ev.target.closest('[data-pre-text]')) { ev.preventDefault(); ev.stopImmediatePropagation(); openData(chart.dataset.preChart, true); return; }
    if (ev.target.closest('[data-pre-text]')) { ev.stopImmediatePropagation(); if (ev.target.closest('a')) ev.preventDefault(); }
  }, true);
  document.addEventListener('focusout', ev => {
    const node = ev.target.closest('[data-pre-text]'); if (!node || !editing) return;
    commitText(node);
  });
  document.addEventListener('input', ev => { if (editing && ev.target.closest('[data-pre-text]')) sendHost('status', { dirty: true, editing }); });
  document.addEventListener('paste', ev => {
    if (!editing || !ev.target.closest('[data-pre-text]')) return;
    ev.preventDefault(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain'));
  });
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveHTML(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.target.closest('[contenteditable], input, select')) { ev.preventDefault(); restore(ev.shiftKey ? 1 : -1); }
  });
  toolbar.addEventListener('click', ev => { const action = ev.target.closest('[data-action]')?.dataset.action; if (action === 'toggle') setEditing(!editing); if (action === 'undo') restore(-1); if (action === 'redo') restore(1); if (action === 'save') saveHTML(); });
  function serialize() {
    if (document.activeElement?.dataset.preText) document.activeElement.blur();
    render(); const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('#pre-toolbar, #pre-dialog, #pre-toast, #pre-format, #pre-host, #pre-bridge-bootstrap').forEach(n => n.remove());
    clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    clone.querySelector('body').classList.remove('pre-edit');
    clone.querySelectorAll('.donut-canvas, #compete-strategy-chart-id').forEach(n => n.replaceChildren());
    clone.querySelectorAll('.geo-drawer').forEach(n => n.classList.remove('open'));
    clone.querySelector('body').classList.remove('geo-drawer-open');
    clone.querySelector('#pre-state').textContent = JSON.stringify(state).replace(/</g, '\\u003c');
    return '<!doctype html>\n' + clone.outerHTML;
  }
  function saveHTML() {
    const output = serialize(), stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(/[-:]/g, '').replace(' ', '_');
    const filename = state.brand.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) + '_可编辑报告_' + stamp + '.html';
    if (host) { sendHost('export', { html: output, filename }); return; }
    const blob = new Blob([output], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), link = create('a', { href: url, download: filename });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); dirty = false; updateToolbar(); notify('已生成新的 HTML，保存后可再次打开继续编辑。');
  }
  window.addEventListener('beforeunload', ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('message', ev => {
    if (!host || ev.source !== window.parent || ev.data?.channel !== host.channel) return;
    if (ev.data.type === 'saved') { dirty = false; updateToolbar(); notify('已生成新的 HTML，保存后可重新导入继续编辑。'); }
    if (ev.data.type === 'prepare-switch') { commitText(document.activeElement?.closest('[data-pre-text]')); sendHost('prepared', { dirty, request: ev.data.request }); }
  });
  syncBrand($('.hero-brand')?.textContent.trim() || state.brand);
  render(); history = [snapshot()]; historyAt = 0; dirty = false; updateToolbar();
  if (host) { setEditing(true); sendHost('ready', { brand: state.brand, fields: fields.size, texts: textNodes.size, charts: $$('[data-pre-chart]').length }); }
  // 验证接口仅用于本地自动化检查；实际操作通过工具栏和数据面板。
  window.PresalesEditor = { state, fields, groups, render, serialize, setEditing, openData, restore, get dirty() { return dirty; } };
})();
