(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const assets = JSON.parse($('#tool-assets').textContent);
  const iframe = $('#report');
  let channel = '', dirty = false, loaded = false, generation = 0, loadTimer, noticeTimer;
  const pending = new Map();
  const newChannel = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), n => n.toString(16).padStart(2, '0')).join('');
  function error(message) { $('#error').textContent = message; $('#error').hidden = false; }
  function busy(on) { $('#import').disabled = on; $('#choose').disabled = on; }
  function notice(message) { clearTimeout(noticeTimer); $('#notice').textContent = message; $('#notice').hidden = false; noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 6000); }
  function confirmReplace() {
    if (!dirty) return Promise.resolve(true);
    return new Promise(resolve => {
      const dialog = $('#replace-dialog'); dialog.returnValue = ''; dialog.showModal();
      const cancel = () => dialog.close('cancel'), confirm = () => dialog.close('confirm');
      $('#replace-cancel').addEventListener('click', cancel);
      $('#replace-confirm').addEventListener('click', confirm);
      dialog.addEventListener('close', () => { $('#replace-cancel').removeEventListener('click', cancel); $('#replace-confirm').removeEventListener('click', confirm); resolve(dialog.returnValue === 'confirm'); }, { once: true });
    });
  }
  async function prepareSwitch() {
    if (!loaded) return;
    const request = newChannel();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(request); reject(Error('当前报告尚未响应，请稍后重试。')); }, 5000);
      pending.set(request, { resolve, timer });
      iframe.contentWindow.postMessage({ channel, type: 'prepare-switch', request }, '*');
    });
  }
  async function importFile(file) {
    if (!file) return;
    busy(true); $('#error').hidden = true;
    try {
      if (!/\.html?$/i.test(file.name)) throw Error('请选择 .html 或 .htm 报告文件。');
      if (file.size > 20 * 1024 * 1024) throw Error('报告超过 20 MB，请选择平台直接导出的 HTML。');
      const html = await file.text(), nextChannel = newChannel();
      const converted = window.PresalesImporter.convert(html, assets, nextChannel);
      await prepareSwitch();
      if (!await confirmReplace()) return;
      clearTimeout(loadTimer); generation++; const current = generation;
      channel = nextChannel; loaded = false; dirty = false;
      $('#filename').textContent = file.name; $('#filename').title = file.name;
      $('#brand').textContent = '正在读取报告'; $('#details').textContent = '';
      $('#status').textContent = '加载中'; $('#loading').hidden = false;
      $('#welcome').hidden = true; $('#workspace').hidden = false;
      iframe.srcdoc = converted;
      loadTimer = setTimeout(() => { if (current === generation && !loaded) { error('报告加载时间较长。请检查文件是否完整，或重新导入。'); $('#loading').hidden = true; } }, 20000);
    } catch (e) { error(e.message || '导入失败，请检查报告文件。'); }
    finally { busy(false); $('#file').value = ''; }
  }
  function download(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  window.addEventListener('message', ev => {
    if (ev.source !== iframe.contentWindow || ev.data?.channel !== channel || !channel) return;
    const data = ev.data;
    if (data.type === 'ready') {
      loaded = true; clearTimeout(loadTimer); $('#loading').hidden = true; $('#error').hidden = true;
      $('#brand').textContent = data.brand;
      $('#details').textContent = '已关联 ' + data.fields + ' 个数据项 · ' + data.charts + ' 处图表';
    }
    if (data.type === 'status' || data.type === 'prepared') { dirty = Boolean(data.dirty); $('#status').textContent = dirty ? '有修改未保存' : '已就绪'; }
    if (data.type === 'prepared') { const callback = pending.get(data.request); if (callback) { clearTimeout(callback.timer); pending.delete(data.request); callback.resolve(); } }
    if (data.type === 'export' && typeof data.html === 'string' && typeof data.filename === 'string') {
      download(data.html, data.filename); dirty = false; $('#status').textContent = '已生成新 HTML';
      iframe.contentWindow.postMessage({ channel, type: 'saved' }, '*');
      notice('已生成新报告，请在浏览器下载位置查看。');
    }
    if (data.type === 'error') { clearTimeout(loadTimer); $('#loading').hidden = true; error(data.message); }
  });
  $('#import').addEventListener('click', () => $('#file').click());
  $('#choose').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', ev => importFile(ev.target.files[0]));
  $('#help').addEventListener('click', () => $('#help-dialog').showModal());
  $('#help-close').addEventListener('click', () => $('#help-dialog').close());
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(name => drop.addEventListener(name, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(name => drop.addEventListener(name, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', ev => { if (!$('#import').disabled) importFile(ev.dataTransfer.files[0]); });
  window.addEventListener('beforeunload', ev => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  $('#boot-warning').hidden = true;
})();
