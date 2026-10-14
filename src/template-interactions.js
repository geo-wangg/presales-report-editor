/* 来自前端提供的同模板交互脚本；图表由内置编辑器渲染。 */
  // 2. 处理封面向下箭头，点击后平滑滚动到正文区域
  (function () {
    var coverArrow = document.querySelector('.cover-arrow');
    var reportContent = document.getElementById('reportContent');
    if (!coverArrow || !reportContent) return;

    coverArrow.addEventListener('click', function () {
      reportContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  })();

  // 2.1 封面主要竞品国家：使用 Intl.DisplayNames 将国家码转为中文地区名
  (function () {
    var countriesEl = document.querySelector('.cover-competitor-countries');
    if (!countriesEl) return;

    var countryCodes = (countriesEl.getAttribute('data-country-codes') || '')
      .split(',')
      .map(function (item) { return item.trim(); })
      .filter(Boolean);

    if (!countryCodes.length || typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
      return;
    }

    var regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
    var countryNames = countryCodes
      .map(function (code) { return regionNames.of(code); })
      .filter(Boolean);

    if (!countryNames.length) return;
    countriesEl.textContent = '（' + countryNames.join('、') + '）';
  })();

  // 3. 控制左侧报告导航的显隐与滚动高亮 (默认导航条, hover 展开面板由 CSS 处理)
  (function () {
    var reportNav = document.getElementById('reportNav');
    if (!reportNav) return;
    var ticks = Array.from(reportNav.querySelectorAll('.nav-rail-tick'));
    var rows = Array.from(reportNav.querySelectorAll('.nav-row'));

    // 根据导航 key 解析出真实锚点元素（单平台模式，直接用 key）
    function resolveTarget(key) {
      if (!key) return null;
      return document.getElementById(key);
    }

    // 收集所有可见锚点(按文档顺序), 返回 [{key, el}]
    function visibleAnchors() {
      return ticks.map(function (tick) {
        var key = tick.dataset.navKey;
        var el = resolveTarget(key);
        return el ? { key: key, el: el } : null;
      }).filter(Boolean);
    }

    // 同步所有导航条与面板行的高亮态
    function setActive(key) {
      ticks.forEach(function (t) { t.classList.toggle('active', t.dataset.navKey === key); });
      rows.forEach(function (r) { r.classList.toggle('active', r.dataset.navKey === key); });
    }

    // 根据滚动位置更新导航显隐与高亮
    function update() {
      var anchors = visibleAnchors();
      var inBody = window.scrollY > window.innerHeight * 0.72;
      reportNav.classList.toggle('visible', inBody);
      reportNav.setAttribute('aria-hidden', inBody ? 'false' : 'true');
      if (!anchors.length) return;
      // 取顶部已越过阈值线的最后一个锚点为当前项
      var activeKey = anchors[0].key;
      for (var i = 0; i < anchors.length; i++) {
        if (anchors[i].el.getBoundingClientRect().top <= window.innerHeight * 0.38) {
          activeKey = anchors[i].key;
        }
      }
      setActive(activeKey);
    }

    // 点击导航条或面板行: 平滑滚动到对应锚点
    function bindClick(el) {
      el.addEventListener('click', function (ev) {
        if (el.tagName === 'A') ev.preventDefault();
        var target = resolveTarget(el.dataset.navKey);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    ticks.forEach(bindClick);
    rows.forEach(bindClick);

    document.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  // 4. 品牌情绪指数 -下载功能
  (function () {
    var downloadBtn = document.getElementById('brandSentimentDownloadBtn');
    if (!downloadBtn) return;

    // 来源 CSV 由后端写入 report.sentimentKeywordCsvUrl
    var sentimentKeywordCsvUrl = window.__geoSentimentCsvUrl || '';
    if (!sentimentKeywordCsvUrl) {
      downloadBtn.disabled = true;
      downloadBtn.style.opacity = '0.5';
      downloadBtn.style.cursor = 'not-allowed';
      return;
    }

    downloadBtn.addEventListener('click', function () {
      // OBS 预签名链接通常跨域，直接用 a[download] 跳转下载即可
      var link = document.createElement('a');
      link.href = sentimentKeywordCsvUrl;
      link.rel = 'noopener noreferrer';
      link.download = 'presales-sentiment-keywords.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  })();

  // 5. 关键词详情抽屉：打开/关闭、正负向切换、关键词选中、答案展开、搜索过滤
  (function () {
    var drawers = document.querySelectorAll('.geo-drawer');
    if (!drawers.length) return;

    // 打开抽屉：点击带 data-drawer-open 的元素
    document.addEventListener('click', function (ev) {
      var trigger = ev.target.closest('[data-drawer-open]');
      if (!trigger) return;
      var drawer = document.getElementById(trigger.getAttribute('data-drawer-open'));
      if (!drawer) return;

      // 根据触发元素上的情感类型切换到对应 tab
      var sentiment = trigger.getAttribute('data-drawer-sentiment');
      if (sentiment) switchTab(drawer, sentiment);

      // 情绪词触发会带上关键词名，用于高亮并滚动到对应项
      openDrawer(drawer, { keywordName: trigger.getAttribute('data-drawer-keyword-name') });
    });

    function openDrawer(drawer, opts) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      // 抽屉打开后布局稳定，重新测量答案是否超 5 行
      measureAnswers(drawer);

      // 选中关键词：优先用触发元素指定的关键词名，否则默认选中当前可见面板的第一个
      var kwName = opts && opts.keywordName ? opts.keywordName.trim() : '';
      var target = null;
      if (kwName) {
        drawer.querySelectorAll('[data-drawer-panel]:not([hidden]) [data-drawer-keyword]').forEach(function (item) {
          if (target) return;
          if ((item.getAttribute('title') || '').trim() === kwName) target = item;
        });
      }
      if (!target) {
        target = drawer.querySelector('[data-drawer-panel]:not([hidden]) [data-drawer-keyword]');
      }
      // 兜底: 当前面板无任何关键词时, 清空右侧证据区展示空状态
      if (!target) {
        clearEvidencePanel(drawer);
        return;
      }
      // 指定关键词时滚动到可视区，默认选第一个则无需滚动
      selectKeyword(target, { scroll: !!kwName });
    }

    // 清空右侧证据区(无关键词可选时的兜底)
    function clearEvidencePanel(drawer) {
      var titleEl = drawer.querySelector('[data-drawer-evidence-keyword]');
      if (titleEl) titleEl.textContent = '';
      var sentimentEl = drawer.querySelector('[data-drawer-evidence-sentiment]');
      if (sentimentEl) { sentimentEl.className = 'geo-drawer-sentiment'; sentimentEl.textContent = ''; }
      var countEl = drawer.querySelector('[data-drawer-evidence-count]');
      if (countEl) countEl.textContent = '0';
      var loading = drawer.querySelector('[data-drawer-evidence-loading]');
      if (loading) loading.hidden = true;
      var listEl = drawer.querySelector('[data-drawer-evidence-list]');
      if (listEl) listEl.innerHTML = '<div class="geo-drawer-evidence-empty">暂无相关证据片段</div>';
      evidenceState = { list: [], rendered: 0, reqId: evidenceRequestId };
    }

    // 选中关键词：清除同抽屉其它选中态，高亮目标，并按需滚动到可视区
    function selectKeyword(kw, opts) {
      if (!kw) return;
      var drawer = kw.closest('.geo-drawer');
      if (!drawer) return;
      drawer.querySelectorAll('[data-drawer-keyword]').forEach(function (item) {
        item.classList.remove('active');
      });
      kw.classList.add('active');
      if (opts && opts.scroll) scrollKeywordIntoView(kw);

      // 选中后触发加载证据片段
      var keyword = (kw.getAttribute('title') || '').trim();
      var sentiment = 'positive'; // 默认正向
      var panel = kw.closest('[data-drawer-panel]');
      if (panel) sentiment = panel.getAttribute('data-drawer-panel') || 'positive';
      loadEvidences(drawer, keyword, sentiment);
    }

    // 将关键词项滚动到列表可视区居中（仅在超出可视范围时滚动）
    function scrollKeywordIntoView(kw) {
      var list = kw.closest('.geo-drawer-keyword-list');
      if (!list) return;
      var listRect = list.getBoundingClientRect();
      var kwRect = kw.getBoundingClientRect();
      if (kwRect.top < listRect.top || kwRect.bottom > listRect.bottom) {
        list.scrollTop += (kwRect.top - listRect.top) - (list.clientHeight - kw.offsetHeight) / 2;
      }
    }

    // 重置抽屉全部交互状态（关闭后调用）
    function resetDrawer(drawer) {
      // 清空搜索框
      var searchInput = drawer.querySelector('[data-drawer-search]');
      if (searchInput) searchInput.value = '';
      // tab 回到默认（第一个），switchTab 内部会按空搜索重刷高亮/空状态/清除按钮
      var firstTab = drawer.querySelector('[data-drawer-tab]');
      if (firstTab) {
        switchTab(drawer, firstTab.getAttribute('data-drawer-tab'));
      } else {
        applySearch(drawer);
      }
      // 收起所有已展开的答案
      drawer.querySelectorAll('.geo-drawer-answer.expanded').forEach(function (answer) {
        answer.classList.remove('expanded');
        var t = answer.querySelector('.geo-drawer-answer-toggle-text');
        if (t) t.textContent = '显示全部';
      });
      // 滚动位置归零
      var kwList = drawer.querySelector('.geo-drawer-keyword-list');
      if (kwList) kwList.scrollTop = 0;
      var evList = drawer.querySelector('.geo-drawer-evidence-list');
      if (evList) evList.scrollTop = 0;
      // 选中态重置为默认面板第一个; 无关键词时清空右侧
      var first = drawer.querySelector('[data-drawer-panel]:not([hidden]) [data-drawer-keyword]');
      if (first) {
        selectKeyword(first, { scroll: false });
      } else {
        clearEvidencePanel(drawer);
      }
    }

    // HTML 转义，防止关键词内容注入
    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    // 清洗 snippet 富文本：只保留高亮标签与安全 style, 其余标签降级为纯文本, 防止 XSS
    // snippet 由后端返回, 内含 <span style="color:...">高亮</span> 等, 但源文本来自第三方网页, 需白名单过滤
    function sanitizeSnippet(html) {
      // 允许保留的标签(高亮/强调/换行)
      var allowedTags = { SPAN: 1, MARK: 1, B: 1, STRONG: 1, EM: 1, I: 1, BR: 1 };
      // 允许保留的 style 声明(仅视觉高亮相关)
      var allowedStyleProp = /^(color|background-color|font-weight|font-style|text-decoration)$/i;

      var doc = new DOMParser().parseFromString(String(html), 'text/html');

      function clean(node) {
        var children = Array.prototype.slice.call(node.childNodes);
        children.forEach(function (child) {
          if (child.nodeType !== 1) return; // 非元素节点(文本等)保留
          if (allowedTags[child.tagName]) {
            // 过滤属性：清除全部, 再按白名单还原安全的 style
            var style = child.getAttribute('style') || '';
            Array.prototype.slice.call(child.attributes).forEach(function (attr) {
              child.removeAttribute(attr.name);
            });
            if (style) {
              var safe = style.split(';').map(function (s) { return s.trim(); }).filter(function (s) {
                if (!s) return false;
                var prop = s.split(':')[0].trim();
                return allowedStyleProp.test(prop);
              }).join('; ');
              if (safe) child.setAttribute('style', safe);
            }
            clean(child); // 递归清洗子节点
          } else {
            // 不允许的标签：用其纯文本内容替换, 丢弃标签本身
            child.parentNode.replaceChild(doc.createTextNode(child.textContent || ''), child);
          }
        });
      }

      clean(doc.body);
      return doc.body.innerHTML;
    }

    // 正则元字符转义
    function escapeReg(str) {
      return String(str).replace(/[.*+?^(){}|[\]\\$]/g, '\\$&');
    }

    // 在文本中高亮命中的搜索词（大小写不敏感），返回安全的 HTML
    function highlight(text, term) {
      var safe = escapeHtml(text);
      if (!term) return safe;
      var re = new RegExp('(' + escapeReg(escapeHtml(term)) + ')', 'gi');
      return safe.replace(re, '<mark>$1</mark>');
    }

    // 执行搜索过滤：高亮命中、显隐清除按钮、无结果时显示空状态
    function applySearch(drawer) {
      var searchInput = drawer.querySelector('[data-drawer-search]');
      if (!searchInput) return;
      var raw = searchInput.value.trim();
      var kw = raw.toLowerCase();

      // 清除按钮：有输入才显示
      var clearBtn = drawer.querySelector('[data-drawer-search-clear]');
      if (clearBtn) clearBtn.hidden = !searchInput.value;

      // 仅统计当前可见 tab 面板内的命中数
      var matched = 0;
      drawer.querySelectorAll('[data-drawer-keyword]').forEach(function (item) {
        var nameEl = item.querySelector('.geo-drawer-keyword-name');
        var name = nameEl ? nameEl.textContent : (item.getAttribute('title') || '');
        var hit = !kw || name.toLowerCase().indexOf(kw) !== -1;
        item.style.display = hit ? '' : 'none';
        if (nameEl) nameEl.innerHTML = highlight(name, raw);
        var group = item.closest('[data-drawer-panel]');
        if (hit && group && !group.hidden) matched++;
      });

      // 无结果空状态
      var emptyEl = drawer.querySelector('[data-drawer-search-empty]');
      if (emptyEl) emptyEl.hidden = !(kw && matched === 0);
    }

    // 测量单个证据卡片：答案文字是否超过 5 行，超出才显示展开/收起按钮
    // 入参 el 可以是 .geo-drawer-evidence 卡片, 也可以是 .geo-drawer-answer 本身
    function measureAnswerEl(el) {
      if (!el) return;
      var answer = el.classList.contains('geo-drawer-answer')
        ? el
        : el.querySelector('.geo-drawer-answer');
      if (!answer) return;
      var textEl = answer.querySelector('[data-drawer-answer]');
      if (!textEl) return;
      // 展开态不参与测量，避免误判
      if (answer.classList.contains('expanded')) return;
      var overflow = textEl.scrollHeight - textEl.clientHeight > 1;
      answer.classList.toggle('can-toggle', overflow);
    }

    // 测量抽屉内所有答案卡片（用于打开抽屉/窗口 resize 等场景）
    function measureAnswers(drawer) {
      drawer.querySelectorAll('.geo-drawer-answer').forEach(measureAnswerEl);
    }

    // 从关键词数据中直接获取证据片段（不再调用接口）
    // 入参：keyword 关键词、sentiment 情感类型（positive/negative）
    // 返回：Promise<{ keyword, sentiment, total, list: [{ question, platform, answer }] }>
    function fetchEvidences(keyword, sentiment) {
      return new Promise(function (resolve) {
        var emptyResult = { keyword: keyword || '', sentiment: sentiment, total: 0, list: [] };

        // 从对应的正负向列表中查找关键词; 列表可能为 null/undefined/非数组
        var raw = sentiment === 'positive'
          ? window.__geoKeywordsPositive
          : window.__geoKeywordsNegative;
        var keywordsList = Array.isArray(raw) ? raw : [];
        if (!keywordsList.length) {
          resolve(emptyResult);
          return;
        }

        var keywordData = null;
        for (var i = 0; i < keywordsList.length; i++) {
          if (keywordsList[i] && keywordsList[i].keyword === keyword) {
            keywordData = keywordsList[i];
            break;
          }
        }

        // 未找到关键词, 或 sources 非数组(null/缺失/非法) 时返回空结果
        if (!keywordData || !Array.isArray(keywordData.sources) || !keywordData.sources.length) {
          resolve(emptyResult);
          return;
        }

        // 转换数据格式: 过滤掉整条无内容(prompt/snippet 均空)的 source, 其余字段逐个兜底
        var list = keywordData.sources
          .filter(function (src) {
            if (!src) return false;
            var hasPrompt = src.prompt != null && String(src.prompt).trim() !== '';
            var hasSnippet = src.snippet != null && String(src.snippet).trim() !== '';
            return hasPrompt || hasSnippet;
          })
          .map(function (src) {
            return {
              question: src.prompt != null ? String(src.prompt) : '',
              platform: src.platform != null ? String(src.platform) : '',
              answer: src.snippet != null ? String(src.snippet) : ''
            };
          });

        resolve({
          keyword: keyword,
          sentiment: sentiment,
          // 计数以过滤后的真实条数为准, 避免 frequency 与实际展示数量不一致
          total: list.length,
          list: list
        });
      });
    }

    // 竞态控制：递增的请求 ID，只渲染最新请求的结果
    var evidenceRequestId = 0;
    // 分页配置：每批渲染的证据卡片数量
    var EVIDENCE_PAGE_SIZE = 30;
    // 分页状态：保存当前关键词的完整证据列表与已渲染位置
    var evidenceState = { list: [], rendered: 0, reqId: 0 };

    // 加载证据片段：显示 loading → 请求 → 更新标题 + 渲染列表
    function loadEvidences(drawer, keyword, sentiment) {
      if (!keyword || !sentiment) return;
      var reqId = ++evidenceRequestId;

      var loading = drawer.querySelector('[data-drawer-evidence-loading]');
      var listEl = drawer.querySelector('[data-drawer-evidence-list]');
      if (loading) loading.hidden = false;
      if (listEl) {
        listEl.innerHTML = '';
        listEl.scrollTop = 0;
      }

      fetchEvidences(keyword, sentiment).then(function (data) {
        // 无论是否竞态，都先隐藏 loading（避免快速切换时 loading 卡住）
        if (loading) loading.hidden = true;
        // 竞态检查：仅渲染最新请求的内容
        if (reqId !== evidenceRequestId) return;
        renderEvidences(drawer, data, reqId);
      });
    }

    // 生成单个证据卡片的 HTML
    function buildEvidenceCard(ev) {
      ev = ev || {};
      var question = ev.question != null ? ev.question : '';
      var platform = ev.platform != null ? ev.platform : '';
      var answer = ev.answer != null ? ev.answer : '';
      var platformIcons = window.__geoPlatformIcons || { map: {}, default: '' };
      var icon = (platformIcons.map && platformIcons.map[platform]) || platformIcons.default || '';
      return [
        '<article class="geo-drawer-evidence">',
        '  <div class="geo-drawer-evidence-q">',
        '    <span class="geo-drawer-evidence-q-icon" aria-hidden="true">',
        '      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">',
        '        <path d="M6.45455 19L2 22.5V4C2 3.44772 2.44772 3 3 3H21C21.5523 3 22 3.44772 22 4V18C22 18.5523 21.5523 19 21 19H6.45455ZM11 14V16H13V14H11ZM8.56731 8.81346L10.5288 9.20577C10.6656 8.51823 11.2723 8 12 8C12.8284 8 13.5 8.67157 13.5 9.5C13.5 10.3284 12.8284 11 12 11H11V13H12C13.933 13 15.5 11.433 15.5 9.5C15.5 7.567 13.933 6 12 6C10.302 6 8.88637 7.20919 8.56731 8.81346Z" fill="url(#paint0_linear_331401_21929)"/>',
        '        <defs>',
        '          <linearGradient id="paint0_linear_331401_21929" x1="12" y1="3" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">',
        '            <stop stop-color="#165DFF"/><stop offset="1" stop-color="#6F9BFF"/>',
        '          </linearGradient>',
        '        </defs>',
        '      </svg>',
        '    </span>',
        '    <p class="geo-drawer-evidence-q-text" title="' + escapeHtml(question) + '">' + escapeHtml(question) + '</p>',
        '  </div>',
        '  <div class="geo-drawer-answer">',
        '    <div class="geo-drawer-answer-head">',
        '      <img class="geo-drawer-answer-logo" src="' + escapeHtml(icon) + '" alt="' + escapeHtml(platform) + '"/>',
        '      <span class="geo-drawer-answer-platform">' + escapeHtml(platform) + '</span>',
        '    </div>',
        '    <div class="geo-drawer-answer-text" data-drawer-answer>' + sanitizeSnippet(answer) + '</div>',
        '    <button type="button" class="geo-drawer-answer-toggle" data-drawer-answer-toggle>',
        '      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">',
        '       <path d="M8.35355 10.3131C8.15829 10.5083 7.84171 10.5083 7.64645 10.3131L4.85355 7.52018C4.53857 7.2052 4.76165 6.66663 5.20711 6.66663H10.7929C11.2383 6.66663 11.4614 7.2052 11.1464 7.52018L8.35355 10.3131Z" fill="#86909C"/>',
        '      </svg>',
        '      <span class="geo-drawer-answer-toggle-text">显示全部</span>',
        '    </button>',
        '  </div>',
        '</article>'
      ].join('\n');
    }

    // 追加渲染下一批证据卡片；返回本次是否有内容被追加
    function appendEvidencePage(drawer, listEl) {
      var start = evidenceState.rendered;
      if (start >= evidenceState.list.length) return false;
      var end = Math.min(start + EVIDENCE_PAGE_SIZE, evidenceState.list.length);

      var html = '';
      for (var i = start; i < end; i++) {
        html += buildEvidenceCard(evidenceState.list[i]);
      }
      // 记录追加前的卡片数, 用于只测量新增卡片
      var beforeCount = listEl.children.length;
      listEl.insertAdjacentHTML('beforeend', html);
      evidenceState.rendered = end;

      // 仅对新追加的卡片测量是否超 5 行, 避免每次都重测全部(回流随数量增长)
      for (var j = beforeCount; j < listEl.children.length; j++) {
        measureAnswerEl(listEl.children[j]);
      }
      return true;
    }

    // 渲染证据卡片列表：更新标题、计数，首批渲染 + 绑定滚动加载
    function renderEvidences(drawer, data, reqId) {
      // 更新标题区
      var titleEl = drawer.querySelector('[data-drawer-evidence-keyword]');
      if (titleEl) titleEl.textContent = data.keyword;
      var sentimentEl = drawer.querySelector('[data-drawer-evidence-sentiment]');
      if (sentimentEl) {
        sentimentEl.className = 'geo-drawer-sentiment ' + data.sentiment;
        sentimentEl.textContent = data.sentiment === 'positive' ? '正向' : '负向';
      }
      var countEl = drawer.querySelector('[data-drawer-evidence-count]');
      if (countEl) countEl.textContent = String(data.total);

      var listEl = drawer.querySelector('[data-drawer-evidence-list]');
      if (!listEl) return;
      listEl.innerHTML = '';

      // 兜底: 无证据片段时展示空状态, 不再走分页渲染
      var list = Array.isArray(data.list) ? data.list : [];
      if (!list.length) {
        evidenceState = { list: [], rendered: 0, reqId: reqId };
        listEl.innerHTML = '<div class="geo-drawer-evidence-empty">暂无相关证据片段</div>';
        return;
      }

      // 重置分页状态为当前关键词数据
      evidenceState = { list: list, rendered: 0, reqId: reqId };

      // 渲染首批
      appendEvidencePage(drawer, listEl);

      // 绑定一次滚动监听：接近底部时追加下一批
      bindEvidenceScroll(drawer, listEl);

      // 首批渲染后, 若内容未撑满容器(不可滚动), 继续补充直到可滚动或渲染完
      fillEvidenceUntilScrollable(drawer, listEl);
    }

    // 若列表内容未超出容器高度(无法滚动触发加载), 自动补充下一批
    function fillEvidenceUntilScrollable(drawer, listEl) {
      // 最多补充若干次, 防止极端情况死循环
      var guard = 0;
      while (listEl.scrollHeight <= listEl.clientHeight
        && evidenceState.rendered < evidenceState.list.length
        && guard < 50) {
        if (!appendEvidencePage(drawer, listEl)) break;
        guard++;
      }
    }

    // 绑定证据列表的滚动加载(每个 listEl 只绑定一次)
    function bindEvidenceScroll(drawer, listEl) {
      if (listEl.dataset.scrollBound === '1') return;
      listEl.dataset.scrollBound = '1';
      listEl.addEventListener('scroll', function () {
        // 距底部 200px 内即触发加载下一批
        if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 200) {
          appendEvidencePage(drawer, listEl);
        }
      });
    }

    function closeDrawer(drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      // 等滑出动画结束再重置状态，避免关闭过程中出现内容闪烁；
      // 若期间又被重新打开则跳过重置，防止竞态
      setTimeout(function () {
        if (!drawer.classList.contains('open')) resetDrawer(drawer);
      }, 300);
    }

    // 切换正向/负向关键词 tab
    function switchTab(drawer, sentiment) {
      drawer.querySelectorAll('[data-drawer-tab]').forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-drawer-tab') === sentiment);
      });
      drawer.querySelectorAll('[data-drawer-panel]').forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-drawer-panel') !== sentiment;
      });
      // 切换面板后，按当前搜索词重新过滤新面板（同步高亮与空状态）
      applySearch(drawer);
    }

    drawers.forEach(function (drawer) {
      // 关闭：遮罩、关闭按钮、Esc
      drawer.querySelectorAll('[data-drawer-close]').forEach(function (el) {
        el.addEventListener('click', function () { closeDrawer(drawer); });
      });

      // tab 点击切换
      drawer.querySelectorAll('[data-drawer-tab]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          switchTab(drawer, tab.getAttribute('data-drawer-tab'));
        });
      });

      // 关键词选中态（手动点击不滚动）
      drawer.addEventListener('click', function (ev) {
        var kw = ev.target.closest('[data-drawer-keyword]');
        if (!kw) return;
        selectKeyword(kw, { scroll: false });
      });

      // 答案展开/收起
      drawer.addEventListener('click', function (ev) {
        var toggle = ev.target.closest('[data-drawer-answer-toggle]');
        if (!toggle) return;
        var answer = toggle.closest('.geo-drawer-answer');
        if (!answer) return;
        var expanded = answer.classList.toggle('expanded');
        var textEl = toggle.querySelector('.geo-drawer-answer-toggle-text');
        if (textEl) textEl.textContent = expanded ? '收起' : '显示全部';
      });

      // 搜索过滤关键词 + 命中词高亮 + 清除
      var searchInput = drawer.querySelector('[data-drawer-search]');
      if (searchInput) {
        searchInput.addEventListener('input', function () { applySearch(drawer); });
        var clearBtn = drawer.querySelector('[data-drawer-search-clear]');
        if (clearBtn) {
          clearBtn.addEventListener('click', function () {
            searchInput.value = '';
            applySearch(drawer);
            searchInput.focus();
          });
        }
        applySearch(drawer);
      }

      // 答案区：初始判断是否需要展开/收起按钮
      measureAnswers(drawer);
    });

    // Esc 关闭当前打开的抽屉
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      drawers.forEach(function (drawer) {
        if (drawer.classList.contains('open')) closeDrawer(drawer);
      });
    });

    // 窗口尺寸变化时重新测量已打开抽屉的答案行数
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        drawers.forEach(function (drawer) {
          if (drawer.classList.contains('open')) measureAnswers(drawer);
        });
      }, 150);
    });
  })();
