// Optional private-report integration test; report bytes are never committed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
if (!process.argv[2]) throw Error('Usage: node scripts/verify_report.cjs /path/to/report.html');
const assets = { editor: read('src/report-editor.js'), rules: read('src/editor-rules.js'), template: read('src/template-interactions.js'), css: read('src/report-editor.css') };
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => { if (error.type !== 'css parsing') throw error; });
function load(html) {
  const parser = new JSDOM('', {runScripts:'outside-only',virtualConsole});
  parser.window.eval(read('src/importer.js'));
  const converted = parser.window.PresalesImporter.convert(html, assets, 'private-test'); parser.window.close();
  const dom = new JSDOM(converted, {runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  dom.window.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close = function(){this.open=false;};
  dom.window.eval(assets.rules); dom.window.eval(assets.editor); return dom;
}
let dom = load(fs.readFileSync(process.argv[2], 'utf8'));
try {
  let w = dom.window, e = w.PresalesEditor, d = w.document;
  const originalBrand=e.state.brand, subtitle=d.querySelector('[data-hero-report]')?.innerHTML;
  const beforeKeys=[...e.fields.keys()];
  const before=JSON.stringify(e.state.values), count=e.fields.size, charts=d.querySelectorAll('[data-pre-chart]').length;
  e.setEditing(true); const hero=d.querySelector('.hero-brand');
  assert.equal(hero.getAttribute('contenteditable'),'true');
  hero.focus(); hero.textContent=originalBrand+' QA'; hero.blur();
  assert.equal(e.state.brand,originalBrand+' QA'); assert.equal(JSON.stringify(e.state.values).includes('NaN'),false);
  // Renaming may update stance strings, but no numeric metric may change.
  for(const [key,value] of Object.entries(JSON.parse(before))) if(typeof value==='number') assert.equal(e.state.values[key],value,key);
  assert.equal(d.querySelector('[data-hero-report]')?.innerHTML,subtitle);
  const changes={'overall.mention':45.5,'overall.citation':12.34,'topic.0.brand.0':62.25};
  for(const [key,value] of Object.entries(changes)) {
    assert(e.fields.has(key),key); e.openData(key);
    d.querySelector('[data-key="'+key+'"]').value=value;
    d.querySelector('#pre-dialog form').dispatchEvent(new w.Event('submit',{cancelable:true}));
    assert.equal(d.querySelector('#pre-dialog').open,false); assert.equal(e.state.values[key],value);
  }
  const texts=JSON.stringify(e.state.texts), html=e.serialize(); dom.window.close(); dom=load(html);
  e=dom.window.PresalesEditor; d=dom.window.document;
  assert.equal(e.state.brand,originalBrand+' QA'); assert.equal(e.state.brandId,originalBrand);
  assert.equal(e.fields.size,count); assert.equal(d.querySelectorAll('[data-pre-chart]').length,charts);
  assert.equal(JSON.stringify(e.state.texts),texts);
  for(const [key,value] of Object.entries(changes)) assert.equal(e.state.values[key],value,key);
  for(const node of d.querySelectorAll('[data-pre-brand-identity]')) assert.equal(node.textContent.trim(),originalBrand+' QA');
  console.log('Private report integration passed:',JSON.stringify({fields:count,charts,numericEdits:changes,roundtrip:true,subtitlePreserved:true}));
} finally {dom.window.close();}
