// DOM integration test: real editor/importer, synthetic public fixture, no client data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assets = { editor: process.env.EDITOR_SOURCE ? fs.readFileSync(process.env.EDITOR_SOURCE, 'utf8') : read('src/report-editor.js'), rules: read('src/editor-rules.js'), template: '', css: '' };
const row = (name, self, rate) => `<div class="bar-chart-wrap"><span class="bar-chart-brand-name">${name}</span><div class="bar-chart-out ${self ? 'is-brand' : ''}"><div><span class="bar-rate-name">${rate}%</span></div></div></div>`;
const fixture = `<!doctype html><html><head></head><body><header class="cover"><span class="hero-brand">Acme</span><span class="cover-target">Acme</span></header><main id="reportContent">
<section id="ai-visibility" class="report-section"><div class="visibility-main-rate"><strong>20%</strong></div><div class="bar-chart-grid">${row('Acme', true, 20)}${row('Peer', false, 80)}</div>
<div class="visibility-sov-overview"><div data-donut-chart data-donut-inner="60" data-donut-outer="90"><script type="application/json" class="donut-data">[{"name":"Acme","value":20,"color":"blue"},{"name":"Peer","value":80,"color":"red"}]</script><div class="donut-canvas"></div><div class="donut-center"><strong>20%</strong><em></em></div></div><ul><li><span class="legend-name">Acme</span><span class="legend-rate">20%</span></li><li><span class="legend-name">Peer</span><span class="legend-rate">80%</span></li></ul></div></section>
<section id="source-reference" class="report-section"><div class="bar-chart-grid">${row('Acme', false, 20)}${row('Peer', false, 80)}</div></section>
<table class="topic-mention-table"><thead><tr><th>Topic</th><th>Volume</th><th>Acme</th><th>Peer</th></tr></thead><tbody><tr><td class="topic-mention-topic">TV</td><td>100</td><td class="topic-mention-score"><strong>20%</strong><span></span></td><td class="topic-mention-score"><strong>80%</strong><span></span></td></tr></tbody></table>
<table class="ai-visibility-rate-table"><tbody><tr><td>TV</td><td>20.5%</td></tr></tbody></table><span class="compete-strategy-status">Acme胜</span><p>Acme narrative: manual review</p></main></body></html>`;
function load(html, standalone = false) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.eval(read('src/importer.js'));
  const converted = w.PresalesImporter.convert(html, assets, 'test-nonce');
  const report = new JSDOM(converted, { runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.close();
  report.window.HTMLDialogElement.prototype.showModal = w.HTMLDialogElement.prototype.showModal;
  report.window.HTMLDialogElement.prototype.close = w.HTMLDialogElement.prototype.close;
  if (standalone) report.window.document.querySelector('#pre-host').remove();
  report.window.eval(assets.rules);
  report.window.eval(assets.editor);
  return report;
}
function rename(dom, name) {
  const w = dom.window, node = w.document.querySelector('.hero-brand');
  w.PresalesEditor.setEditing(true); node.focus(); node.innerHTML = name; node.blur();
}
function apply(dom, key, values) {
  const w = dom.window, e = w.PresalesEditor;
  e.openData(key);
  for (const [k, v] of Object.entries(values)) w.document.querySelector(`[data-key="${k}"]`).value = v;
  w.document.querySelector('#pre-dialog form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(w.document.querySelector('#pre-dialog').open, false);
}
function check(dom, name, sov = 35) {
  const w = dom.window, e = w.PresalesEditor, d = w.document;
  assert.equal(e.state.brand, name);
  assert.equal(e.state.brandId, 'Acme');
  for (const node of d.querySelectorAll('[data-pre-brand-identity="Acme"]')) assert.equal(node.textContent.trim(), name);
  assert.equal(d.querySelector('.donut-center strong').textContent, sov + '%');
  assert.equal(JSON.parse(d.querySelector('.donut-data').textContent)[0].name, name);
  assert.equal(e.state.values['overall.sov'], sov);
  assert.equal(d.querySelector('.ai-visibility-rate-table td:nth-child(2)').dataset.preField, 'topic.0.brand.0');
  assert.equal(d.querySelector('#source-reference [data-pre-brand-identity="Acme"]').closest('.bar-chart-wrap').querySelector('[data-pre-field]').dataset.preField, 'overall.citation');
  assert.equal(e.fields.get('sov.all.Acme').label, name + ' · 提及份额');
  assert.equal(d.querySelector('p').textContent, 'Acme narrative: manual review');
}
if (process.env.BASELINE_PROBE) {
  const before = load(fixture, true);
  rename(before, 'Nova/TV');
  let filename;
  before.window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  before.window.URL.createObjectURL = () => 'blob:test'; before.window.URL.revokeObjectURL = () => {};
  before.window.document.querySelector('[data-action="save"]').click();
  console.log('旧版导出文件名:', filename);
  const saved = before.window.PresalesEditor.serialize();
  console.log('旧版改名后:', JSON.stringify({ hero: before.window.document.querySelector('.hero-brand').textContent, stateBrand: before.window.PresalesEditor.state.brand, donutBrand: JSON.parse(before.window.document.querySelector('.donut-data').textContent)[0].name }));
  before.window.close();
  const after = load(saved);
  console.log('旧版重新导入后:', JSON.stringify({ hero: after.window.document.querySelector('.hero-brand').textContent, stateBrand: after.window.PresalesEditor.state.brand }));
  after.window.close(); process.exit(0);
}
// A v4 export can have a new hero in texts but an old saved.brand.
const legacy = fixture.replace('class="hero-brand">Acme', 'class="hero-brand" data-pre-text="legacy-hero">Nova')
  .replace('</body>', '<script id="pre-state" type="application/json">' + JSON.stringify({ version: 4, brand: 'Acme', values: {}, texts: { 'legacy-hero': '<b>Nova</b>' }, editedKeys: [] }) + '</script></body>');
const old = load(legacy);
assert.equal(old.window.PresalesEditor.state.brand, 'Nova');
assert.equal(old.window.PresalesEditor.state.brandId, 'Acme');
assert.equal(old.window.document.querySelector('.legend-name').textContent, 'Nova');
assert.equal(old.window.document.querySelector('.compete-strategy-status').textContent, 'Nova胜');
old.window.close();
let dom = load(fixture);
try {
  rename(dom, '<b>Nova/TV</b>');
  assert.equal(dom.window.PresalesEditor.state.brand, 'Nova/TV');
  dom.window.PresalesEditor.restore(-1); assert.equal(dom.window.PresalesEditor.state.brand, 'Acme');
  dom.window.PresalesEditor.restore(1); assert.equal(dom.window.document.querySelector('.hero-brand b').textContent, 'Nova/TV');
  apply(dom, 'sov.all.Acme', { 'sov.all.Acme': 35, 'sov.all.Peer': 65 });
  check(dom, 'Nova/TV');
  apply(dom, 'overall.mention', { 'overall.mention': 60 });
  assert.equal(dom.window.document.querySelector('#ai-visibility .visibility-main-rate strong').textContent, '60.0%');
  apply(dom, 'overall.citation', { 'overall.citation': 48 });
  apply(dom, 'topic.0.brand.0', { 'topic.0.brand.0': 42.5 });
  assert.equal(dom.window.document.querySelector('.ai-visibility-rate-table td:nth-child(2)').textContent, '42.5%');
  rename(dom, 'Peer'); check(dom, 'Nova/TV');
  rename(dom, '   '); check(dom, 'Nova/TV');
  // Serialize while focus is still in the hero, as with keyboard save.
  const hero = dom.window.document.querySelector('.hero-brand'); hero.focus(); hero.textContent = 'Final/TV';
  const html = dom.window.PresalesEditor.serialize(); check(dom, 'Final/TV');
  let filename;
  dom.window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  dom.window.URL.createObjectURL = () => 'blob:test'; dom.window.URL.revokeObjectURL = () => {};
  // Standalone download branch, rather than host postMessage branch.
  const standalone = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  standalone.window.eval(assets.rules); standalone.window.eval(assets.editor);
  standalone.window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  standalone.window.URL.createObjectURL = () => 'blob:test'; standalone.window.URL.revokeObjectURL = () => {};
  standalone.window.document.querySelector('[data-action="save"]').click();
  assert.match(filename, /^Final_TV_可编辑报告_.*\.html$/); standalone.window.close();
  dom.window.close(); dom = load(html); check(dom, 'Final/TV');
  assert.equal(dom.window.PresalesEditor.state.values['overall.mention'], 60);
  assert.equal(dom.window.PresalesEditor.state.values['overall.citation'], 48);
  assert.equal(dom.window.document.querySelector('.ai-visibility-rate-table td:nth-child(2)').textContent, '42.5%');
  apply(dom, 'sov.all.Acme', { 'sov.all.Acme': 45, 'sov.all.Peer': 55 }); check(dom, 'Final/TV', 45);
  rename(dom, 'Third'); check(dom, 'Third', 45);
  const again = dom.window.PresalesEditor.serialize(); dom.window.close(); dom = load(again); check(dom, 'Third', 45);
  // Daily editing regression: ordinary text, validation, distributions and sorting.
  const w = dom.window, d = w.document, e = w.PresalesEditor;
  const paragraph = d.querySelector('p');
  paragraph.focus(); paragraph.innerHTML = 'Edited <b>analysis</b> with a <a href="https://example.com/">link</a>'; paragraph.blur();
  assert.equal(paragraph.querySelector('b').textContent, 'analysis');
  e.restore(-1); assert.equal(paragraph.textContent, 'Acme narrative: manual review');
  e.restore(1); assert.equal(paragraph.querySelector('b').textContent, 'analysis');
  e.openData('overall.mention');
  d.querySelector('[data-key="overall.mention"]').value = '101';
  d.querySelector('#pre-dialog form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.equal(d.querySelector('#pre-dialog').open, true);
  assert.equal(e.state.values['overall.mention'], 60);
  d.querySelector('#pre-dialog').close();
  e.openData('sov.all.Acme');
  const selfInput = d.querySelector('[data-key="sov.all.Acme"]'), peerInput = d.querySelector('[data-key="sov.all.Peer"]');
  selfInput.value = '70'; selfInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(peerInput.value, '55'); // no automatic redistribution while typing
  d.querySelector('#pre-dialog form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.equal(d.querySelector('#pre-dialog').open, true);
  assert.equal(e.state.values['sov.all.Acme'], 45);
  d.querySelector('#pre-dialog [data-action="normalize"]').click();
  assert.equal(Number(selfInput.value) + Number(peerInput.value), 100);
  d.querySelector('#pre-dialog form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.equal(d.querySelector('#pre-dialog').open, false);
  apply(dom, 'overall.mention', { 'overall.mention': 90 });
  assert.equal(d.querySelector('#ai-visibility .bar-chart-brand-name').textContent, 'Third');
  assert.equal(d.querySelector('#ai-visibility .bar-chart-filled').style.width, '100%');
  e.setEditing(false); assert.equal(d.querySelectorAll('[contenteditable]').length, 0);
  e.setEditing(true); assert.equal(paragraph.getAttribute('contenteditable'), 'true');
  const finalHTML = e.serialize();
  const exported = new JSDOM(finalHTML);
  assert.equal(exported.window.document.querySelector('#pre-toolbar'), null);
  assert.equal(exported.window.document.querySelector('#pre-host'), null);
  assert.equal(exported.window.document.querySelector('[contenteditable]'), null);
  exported.window.close();
  const finalRoundtrip = load(finalHTML);
  assert.equal(finalRoundtrip.window.document.querySelector('p b').textContent, 'analysis');
  assert.equal(finalRoundtrip.window.PresalesEditor.state.values['overall.mention'], 90);
  finalRoundtrip.window.close();
  const hostile = new JSDOM(fixture.replace('<main ', '<script>alert("unsafe")</script><main onclick="alert(1)" '));
  w.eval(read('src/importer.js'));
  const safe = w.PresalesImporter.convert(hostile.serialize(), assets, 'regression');
  assert.equal(safe.includes('onclick='), false);
  assert.equal(safe.includes('alert("unsafe")'), false);
  hostile.window.close();
  const built = new JSDOM(read('docs/index.html'));
  const bundled = JSON.parse(built.window.document.querySelector('#tool-assets').textContent);
  for (const [key, file] of Object.entries({ editor: 'report-editor.js', rules: 'editor-rules.js', template: 'template-interactions.js', css: 'report-editor.css' })) assert.equal(bundled[key], read('src/' + file));
  built.window.close();
  console.log('通用回归通过：富文本保留、撤销重做、数值校验、占比分组/归一化、条形排序、模式切换、导出清理、导入脚本隔离、构建一致性。');
  console.log('品牌回归通过：改名、撤销重做、非法名、文件名、SOV/主题/引用绑定、两次重新导入。');
} finally { dom.window.close(); }
