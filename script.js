/* ==========================================================
   きょうのページ — script.js
   1日1ページのデジタルノート（保存はブラウザ内 localStorage）
   ========================================================== */
(function () {
  'use strict';

  /* ---------------- 定数 ---------------- */

  var STORAGE_KEY = 'hitohi.v1';
  var LEGACY_KEY = 'kyou-no-page.v1';
  var FIRST_HOUR = 5;
  var LAST_HOUR = 25;
  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  var RANK_LABEL = ['TOP1', 'TOP2', 'TOP3'];
  var STEP_KEYS = ['list', 'top3', 'time', 'done'];

  var HOURS = [];
  for (var h = FIRST_HOUR; h <= LAST_HOUR; h++) HOURS.push(h);

  /* ---------------- 小さな道具 ---------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function hourLabel(h) { return pad2(h) + ':00'; }
  function hourOf(time) { return time ? parseInt(time.slice(0, 2), 10) : null; }

  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayKey() { return dateKey(new Date()); }
  function parseKey(key) {
    var p = key.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function shiftKey(key, days) {
    var d = parseKey(key);
    d.setDate(d.getDate() + days);
    return dateKey(d);
  }
  function displayDate(key) { return key.replace(/-/g, ' / '); }
  function weekdayOf(key) { return WEEKDAYS[parseKey(key).getDay()] + '曜日'; }
  function shortDate(key) {
    var p = key.split('-');
    return p[0] + ' / ' + p[1] + ' / ' + p[2] + '（' + WEEKDAYS[parseKey(key).getDay()] + '）';
  }
  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- データ ---------------- */

  function createState() { return { version: 1, pages: {} }; }

  function emptyPage(date) { return { date: date, todos: [], memo: '' }; }

  function ensurePage(st, date) {
    if (!st.pages[date]) st.pages[date] = emptyPage(date);
    return st.pages[date];
  }
  function readPage(st, date) { return st.pages[date] || emptyPage(date); }

  function nextOrder(page) {
    var max = 0;
    page.todos.forEach(function (t) { if (t.order > max) max = t.order; });
    return max + 1;
  }
  function findTodo(page, id) {
    for (var i = 0; i < page.todos.length; i++) if (page.todos[i].id === id) return page.todos[i];
    return null;
  }
  function sortedTodos(page) {
    return page.todos.slice().sort(function (a, b) { return a.order - b.order; });
  }

  function addTodo(st, date, text) {
    var clean = String(text == null ? '' : text).trim();
    if (!clean) return null;
    var page = ensurePage(st, date);
    var todo = {
      id: uid(),
      text: clean,
      date: date,
      completed: false,
      importantRank: null,
      scheduledTime: null,
      order: nextOrder(page)
    };
    page.todos.push(todo);
    return todo;
  }

  /* TOP3の候補：ほかのTOP欄で選ばれているものを除外（自分の欄のものは残す） */
  function candidates(page, rank) {
    return sortedTodos(page).filter(function (t) {
      return !t.importantRank || t.importantRank === rank;
    });
  }

  function setImportant(page, rank, id) {
    var todo = findTodo(page, id);
    if (!todo) return false;
    page.todos.forEach(function (t) { if (t.importantRank === rank) t.importantRank = null; });
    todo.importantRank = rank;
    return true;
  }
  function clearImportant(page, rank) {
    page.todos.forEach(function (t) { if (t.importantRank === rank) t.importantRank = null; });
  }
  function importantAt(page, rank) {
    for (var i = 0; i < page.todos.length; i++) if (page.todos[i].importantRank === rank) return page.todos[i];
    return null;
  }
  function setTime(page, id, time) {
    var todo = findTodo(page, id);
    if (!todo) return false;
    todo.scheduledTime = time;
    return true;
  }

  function deleteTodo(st, date, id) {
    var page = st.pages[date];
    if (!page) return false;
    var i = page.todos.findIndex(function (t) { return t.id === id; });
    if (i < 0) return false;
    page.todos.splice(i, 1);
    return true;
  }

  /* 移動：元の日から消えて、移動先に同じToDoが現れる（コピーではない） */
  function moveTodo(st, fromDate, id, toDate) {
    if (fromDate === toDate) return false;
    var from = st.pages[fromDate];
    if (!from) return false;
    var i = from.todos.findIndex(function (t) { return t.id === id; });
    if (i < 0) return false;
    var todo = from.todos.splice(i, 1)[0];
    var to = ensurePage(st, toDate);
    todo.date = toDate;
    todo.importantRank = null;        // TOP3は日ごとに選び直す
    todo.order = nextOrder(to);
    to.todos.push(todo);
    return true;
  }

  /* 複製：元は残る */
  function duplicateTodo(st, fromDate, id, toDate) {
    var from = st.pages[fromDate];
    if (!from) return null;
    var src = findTodo(from, id);
    if (!src) return null;
    var to = ensurePage(st, toDate);
    var copy = {
      id: uid(),
      text: src.text,
      date: toDate,
      completed: false,
      importantRank: null,
      scheduledTime: src.scheduledTime,
      order: nextOrder(to)
    };
    to.todos.push(copy);
    return copy;
  }

  /* 4つのステップが済んでいるか */
  function stepStatus(page) {
    var todos = page.todos;
    var need = Math.min(3, todos.length);
    var ranked = todos.filter(function (t) { return t.importantRank; });
    var list = todos.length > 0;
    var top3 = need > 0 && ranked.length >= need;
    var time = ranked.length > 0 && ranked.every(function (t) { return !!t.scheduledTime; });
    var done = todos.length > 0 && todos.every(function (t) { return t.completed; });
    return { list: list, top3: top3, time: time, done: done };
  }

  function pruneEmptyPages(st) {
    Object.keys(st.pages).forEach(function (k) {
      var p = st.pages[k];
      if (p.todos.length === 0 && !String(p.memo || '').trim()) delete st.pages[k];
    });
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || !raw.pages) return createState();
    var st = createState();
    Object.keys(raw.pages).forEach(function (k) {
      var p = raw.pages[k] || {};
      var page = emptyPage(k);
      page.memo = typeof p.memo === 'string' ? p.memo : '';
      if (['list', 'top3', 'time', 'done'].indexOf(p.step) >= 0) page.step = p.step;
      (Array.isArray(p.todos) ? p.todos : []).forEach(function (t, i) {
        if (!t || typeof t.text !== 'string') return;
        page.todos.push({
          id: t.id || uid(),
          text: t.text,
          date: k,
          completed: !!t.completed,
          importantRank: (t.importantRank === 1 || t.importantRank === 2 || t.importantRank === 3) ? t.importantRank : null,
          scheduledTime: typeof t.scheduledTime === 'string' ? t.scheduledTime : null,
          order: typeof t.order === 'number' ? t.order : i + 1
        });
      });
      st.pages[k] = page;
    });
    return st;
  }

  var API = {
    createState: createState, ensurePage: ensurePage, readPage: readPage,
    addTodo: addTodo, candidates: candidates, setImportant: setImportant,
    clearImportant: clearImportant, importantAt: importantAt, setTime: setTime,
    deleteTodo: deleteTodo, moveTodo: moveTodo, duplicateTodo: duplicateTodo,
    stepStatus: stepStatus, migrate: migrate, shiftKey: shiftKey, hourLabel: hourLabel,
    sortedTodos: sortedTodos, pruneEmptyPages: pruneEmptyPages
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.KyouNoPage = API;

  if (typeof document === 'undefined') return;

  /* ==========================================================
     ここから画面
     ========================================================== */

  var state = createState();
  var viewDate = todayKey();
  var activeStep = 'list';
  var stepPinned = false;
  var editingId = null;
  var editingBlockId = null;
  var justToggled = null;
  var undoSnapshot = null;
  var undoTimer = null;
  var saveTimer = null;
  var el = {};

  function save() {
    try {
      pruneEmptyPages(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showToast('保存できませんでした。ブラウザの空き容量を確認してください。');
    }
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_KEY);   // 旧名からの引き継ぎ
      state = raw ? migrate(JSON.parse(raw)) : createState();
    } catch (err) {
      state = createState();
    }
  }

  function page() { return readPage(state, viewDate); }
  function livePage() { return ensurePage(state, viewDate); }

  /* ---------------- Undo ---------------- */

  function snapshot() { undoSnapshot = JSON.stringify(state); }

  function showToast(message, undoLabel) {
    clearTimeout(undoTimer);
    el.toast.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = message;
    el.toast.appendChild(span);
    if (undoLabel && undoSnapshot) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = undoLabel;
      btn.addEventListener('click', function () {
        try { state = migrate(JSON.parse(undoSnapshot)); } catch (e) { return; }
        undoSnapshot = null;
        save();
        hideToast();
        render();
      });
      el.toast.appendChild(btn);
    }
    el.toast.hidden = false;
    undoTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() { el.toast.hidden = true; el.toast.innerHTML = ''; }

  /* ---------------- シート ---------------- */

  function closeSheet() {
    el.sheetLayer.hidden = true;
    el.sheetLayer.className = 'sheet-layer';
    el.sheetLayer.innerHTML = '';
  }

  /* opts.anchor を渡すと、そのボタンの真下（右そろえ）に出る */
  function openSheet(title, buildBody, opts) {
    opts = opts || {};
    el.sheetLayer.innerHTML = '';
    var sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.addEventListener('click', function (e) { e.stopPropagation(); });

    var head = document.createElement('div');
    head.className = 'sheet-head' + (title ? '' : ' is-bare');
    var h = document.createElement('div');
    h.className = 'sheet-title';
    h.textContent = title || '';
    if (!title) h.style.display = 'none';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'sheet-close';
    close.setAttribute('aria-label', '閉じる');
    close.textContent = '✕';
    close.addEventListener('click', closeSheet);
    head.appendChild(h);
    head.appendChild(close);

    var body = document.createElement('div');
    body.className = 'sheet-body';
    buildBody(body);

    sheet.appendChild(head);
    sheet.appendChild(body);

    el.sheetLayer.className = 'sheet-layer' + (opts.anchor ? ' is-anchored' : '');
    if (opts.anchor) sheet.className = 'sheet is-anchored' + (opts.compact ? ' is-compact' : '');

    el.sheetLayer.appendChild(sheet);
    el.sheetLayer.hidden = false;
    if (opts.anchor) placeSheet(sheet, opts);
  }

  /* タップした場所の近くに置く。side:true は「その要素の左横」、
     それ以外は要素のすぐ下（入らなければ上）。画面外には出さない。 */
  function placeSheet(sheet, opts) {
    var r = opts.anchor.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    sheet.style.maxHeight = Math.round(Math.min(vh - 24, 560)) + 'px';
    var w = sheet.offsetWidth, h = sheet.offsetHeight;

    if (opts.side) {
      var top = Math.max(12, Math.min(r.top - 6, vh - h - 12));
      sheet.style.top = Math.round(top) + 'px';
      if (r.left - 12 - w >= 12) {
        sheet.classList.add('is-side');
        sheet.style.right = Math.round(vw - r.left + 12) + 'px';
        sheet.style.setProperty('--caret-y',
          Math.round(Math.min(Math.max(r.top + r.height / 2 - top, 22), h - 22)) + 'px');
      } else {
        /* 左に場所がなければ、その要素の右端にそろえて重ねる */
        sheet.classList.add('no-caret');
        sheet.style.right = Math.round(Math.max(12, vw - Math.max(r.right, w + 12))) + 'px';
      }
      return;
    }

    var below = vh - r.bottom - 22;
    var above = r.top - 22;
    var useBelow = below >= 280 || below >= above;
    if (!useBelow) sheet.classList.add('is-above');
    sheet.style.maxHeight = Math.round(Math.min(useBelow ? below : above, 560)) + 'px';
    if (opts.align === 'left') {
      sheet.classList.add('is-left');
      sheet.style.left = Math.round(Math.max(12, Math.min(r.left, vw - w - 12))) + 'px';
    } else {
      sheet.style.right = Math.round(Math.max(12, vw - r.right)) + 'px';
    }
    if (useBelow) sheet.style.top = Math.round(r.bottom + 10) + 'px';
    else sheet.style.bottom = Math.round(vh - r.top + 10) + 'px';
  }

  function sheetItem(body, main, opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sheet-item' +
      (opts.primary ? ' is-primary' : '') +
      (opts.checked ? ' is-checked' : '') +
      (opts.danger ? ' is-danger' : '') +
      (opts.current ? ' is-current' : '') +
      (opts.done ? ' is-done' : '');
    var m = document.createElement('span');
    m.className = 'si-main';
    m.textContent = main;
    b.appendChild(m);
    if (opts.sub) {
      var s = document.createElement('span');
      s.className = 'si-sub';
      s.textContent = opts.sub;
      b.appendChild(s);
    }
    if (opts.onTap) b.addEventListener('click', opts.onTap);
    body.appendChild(b);
    return b;
  }

  function sheetNote(body, text) {
    var p = document.createElement('p');
    p.className = 'sheet-note';
    p.textContent = text;
    body.appendChild(p);
  }

  function sheetDatePicker(body, buttonLabel, initial, onPick) {
    var wrap = document.createElement('div');
    wrap.className = 'dateform';
    var input = document.createElement('input');
    input.type = 'date';
    input.value = initial || viewDate;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = buttonLabel;
    btn.addEventListener('click', function () {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) return;
      onPick(input.value);
    });
    wrap.appendChild(input);
    wrap.appendChild(btn);
    body.appendChild(wrap);
  }

  /* ---------------- 描画 ---------------- */

  function render() {
    var p = page();
    var status = stepStatus(p);

    if (!stepPinned) activeStep = suggestedStep(p);
    document.body.dataset.step = activeStep;
    document.body.classList.toggle('is-today', viewDate === todayKey());

    el.dateMain.textContent = displayDate(viewDate);
    el.dateSub.textContent = weekdayOf(viewDate);

    ['list', 'top3', 'time', 'done'].forEach(function (key) {
      var btn = el.steps.querySelector('.step[data-step="' + key + '"]');
      btn.classList.toggle('is-current', activeStep === key);
      btn.classList.toggle('is-cleared', status[key] && activeStep !== key);
      btn.setAttribute('aria-current', activeStep === key ? 'step' : 'false');
    });

    renderSlots(p);
    renderTodos(p);
    renderTimeline(p);

    if (document.activeElement !== el.memo) el.memo.value = p.memo || '';
    justToggled = null;
    updateFocus();
  }

  /* TODO が1つもない日は必ず LIST から。1つでも入っていれば、その日に最後に開いていた
     ステップの続き。件数や進み具合で勝手に先へは進めない。 */
  function suggestedStep(p) {
    if (!p.todos.length) return 'list';
    return STEP_KEYS.indexOf(p.step) >= 0 ? p.step : 'list';
  }

  /* いま操作しているステップにインデックスを合わせる */
  function setStep(key) {
    stepPinned = true;
    if (activeStep === key) return;
    if (key === 'done') pendingFocusScroll = true;
    activeStep = key;
    document.body.dataset.step = key;
    if (page().todos.length) { livePage().step = key; save(); }
  }

  /* 終わりがはっきりしているステップだけ、終わった瞬間に次へ進む
     TOP3：3つそろったら TIME へ／TIME：全 TODO に時間が入ったら CHECK へ */
  function autoAdvance() {
    var p = page();
    if (activeStep === 'top3' && importantAt(p, 1) && importantAt(p, 2) && importantAt(p, 3)) setStep('time');
    if (activeStep === 'time' && p.todos.length &&
        p.todos.every(function (t) { return !!t.scheduledTime; })) setStep('done');
  }

  function renderSlots(p) {
    el.slots.innerHTML = '';
    [1, 2, 3].forEach(function (rank) {
      var todo = importantAt(p, rank);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot' + (todo ? '' : ' is-empty') + (todo && todo.completed ? ' is-done' : '');
      btn.dataset.rank = String(rank);

      var r = document.createElement('span');
      r.className = 'slot-rank';
      r.textContent = RANK_LABEL[rank - 1];
      var t = document.createElement('span');
      t.className = 'slot-text';
      t.textContent = todo ? todo.text : 'タップして選ぶ';
      btn.appendChild(r);
      btn.appendChild(t);

      if (todo && todo.scheduledTime) {
        var time = document.createElement('span');
        time.className = 'slot-time';
        time.textContent = todo.scheduledTime;
        btn.appendChild(time);
      }
      btn.addEventListener('click', function () { setStep('top3'); openRankSheet(rank, btn); });
      el.slots.appendChild(btn);
    });
  }

  /* 右ページ（TODO行）でも左ページ（TIMEカード）でも同じ編集フィールドを使う。
     どちらで直しても同じ ToDo データなので、もう片方にもそのまま反映される。 */
  function buildEditor(todo, where) {
    var input = document.createElement('input');
    input.className = where === 'block' ? 'todo-edit block-edit' : 'todo-edit';
    input.type = 'text';
    input.value = todo.text;
    input.enterKeyHint = 'done';
    var done = false;
    var commit = function () {
      if (done) return;
      done = true;
      var v = input.value.trim();
      editingId = null;
      editingBlockId = null;
      if (v && v !== todo.text) {
        var live = findTodo(livePage(), todo.id);
        if (live) { live.text = v; save(); }
      }
      render();
    };
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { done = true; editingId = null; editingBlockId = null; render(); }
    });
    input.addEventListener('blur', commit);
    setTimeout(function () { input.focus(); input.select(); }, 0);
    return input;
  }

  function renderTodos(p) {
    el.todos.innerHTML = '';
    var list = sortedTodos(p);
    var doneCount = list.filter(function (t) { return t.completed; }).length;
    el.todoCount.textContent = list.length ? doneCount + ' / ' + list.length : '';

    if (!list.length) return;

    list.forEach(function (todo) {
      var li = document.createElement('li');
      li.className = 'todo' + (todo.completed ? ' is-done' : '') +
        (justToggled === todo.id ? ' just-toggled' : '');
      li.dataset.id = todo.id;

      var check = document.createElement('button');
      check.type = 'button';
      check.className = 'check';
      check.setAttribute('aria-label', todo.completed ? '未完了にもどす' : '完了にする');
      check.innerHTML = '<span class="box"></span>';
      check.addEventListener('click', function () { toggleDone(todo.id); });
      li.appendChild(check);

      if (todo.importantRank) {
        var rank = document.createElement('span');
        rank.className = 'todo-rank';
        rank.textContent = RANK_LABEL[todo.importantRank - 1];
        li.appendChild(rank);
      }

      if (editingId === todo.id) {
        li.appendChild(buildEditor(todo, 'list'));
      } else {
        var text = document.createElement('button');
        text.type = 'button';
        text.className = 'todo-text';
        text.textContent = todo.text;
        text.addEventListener('click', function () { setStep('list'); editingId = todo.id; render(); });
        li.appendChild(text);
      }

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (todo.scheduledTime ? ' has-time' : '');
      chip.textContent = todo.scheduledTime || 'TIME';
      chip.setAttribute('aria-label', todo.scheduledTime ? 'TIME を変える' : 'TIME に置く');
      chip.addEventListener('click', function () { setStep('time'); openTimeSheet(todo.id, chip); });
      li.appendChild(chip);

      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'more';
      more.setAttribute('aria-label', 'そのほかの操作');
      more.textContent = '…';
      more.addEventListener('click', function () { openTodoMenu(todo.id, 'list', more); });
      li.appendChild(more);

      el.todos.appendChild(li);
    });
  }

  function renderTimeline(p) {
    el.timeline.innerHTML = '';
    var placed = sortedTodos(p).filter(function (t) { return t.scheduledTime; });

    var nowHour = null;
    if (viewDate === todayKey()) {
      var nh = new Date().getHours();
      if (nh < FIRST_HOUR) nh += 24;
      if (nh >= FIRST_HOUR && nh <= LAST_HOUR) nowHour = nh;
    }

    HOURS.forEach(function (hour) {
      var row = document.createElement('div');
      row.className = 'hour' + (nowHour === hour ? ' is-now' : '');
      row.dataset.hour = String(hour);

      var label = document.createElement('div');
      label.className = 'hour-label';
      label.textContent = hourLabel(hour);
      row.appendChild(label);

      var slot = document.createElement('div');
      slot.className = 'hour-slot';

      placed.filter(function (t) { return hourOf(t.scheduledTime) === hour; }).forEach(function (todo) {
        var block = document.createElement('div');
        block.className = 'block' +
          (todo.importantRank ? ' is-important' : '') +
          (todo.completed ? ' is-done' : '');
        block.dataset.id = todo.id;

        if (editingBlockId === todo.id) {
          block.appendChild(buildEditor(todo, 'block'));
        } else {
          var text = document.createElement('button');
          text.type = 'button';
          text.className = 'block-text';
          if (todo.importantRank) {
            var brank = document.createElement('span');
            brank.className = 'block-rank';
            brank.textContent = RANK_LABEL[todo.importantRank - 1];
            text.appendChild(brank);
          }
          text.appendChild(document.createTextNode(todo.text));
          text.addEventListener('click', function () { openTodoMenu(todo.id, 'block', block); });
          block.appendChild(text);
        }

        var grip = document.createElement('button');
        grip.type = 'button';
        grip.className = 'grip';
        grip.setAttribute('aria-label', 'ドラッグして TIME を移す');
        grip.textContent = '⋮⋮';
        block.appendChild(grip);

        slot.appendChild(block);
      });

      row.appendChild(slot);
      el.timeline.appendChild(row);
    });
  }

  /* ---------------- 操作 ---------------- */

  function toggleDone(id) {
    var todo = findTodo(livePage(), id);
    if (!todo) return;
    todo.completed = !todo.completed;
    justToggled = id;
    setStep('done');
    save();
    render();
  }

  function addFromInput() {
    var text = el.addInput.value;
    if (!text.trim()) return;
    addTodo(state, viewDate, text);
    el.addInput.value = '';
    setStep('list');
    save();
    render();
  }

  function openRankSheet(rank, anchor) {
    var p = livePage();
    var current = importantAt(p, rank);
    var list = candidates(p, rank);
    var label = RANK_LABEL[rank - 1];

    openSheet('', function (body) {
      if (!list.length) {
        sheetNote(body, 'TODO がありません。');
        return;
      }
      list.forEach(function (t) {
        sheetItem(body, t.text, {
          sub: t.scheduledTime || '',
          current: current && current.id === t.id,
          done: t.completed,
          onTap: function () {
            setImportant(p, rank, t.id);
            autoAdvance();
            save();
            closeSheet();
            render();
          }
        });
      });
      if (current) {
        sheetItem(body, label + ' を空にする', {
          danger: true,
          onTap: function () {
            clearImportant(p, rank);
            save();
            closeSheet();
            render();
          }
        });
      }
    }, { anchor: anchor, align: 'left' });
  }

  function openTimeSheet(id, anchor) {
    var p = livePage();
    var todo = findTodo(p, id);
    if (!todo) return;

    /* 時刻だけを並べる。いま入っている時刻をもう一度押すと、TIME から外れる（TODO は残る） */
    openSheet('', function (body) {
      var grid = document.createElement('div');
      grid.className = 'hour-grid';
      HOURS.forEach(function (hour) {
        var current = hourOf(todo.scheduledTime) === hour;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'hour-pick' + (current ? ' is-current' : '');
        b.textContent = hourLabel(hour);
        b.setAttribute('aria-pressed', current ? 'true' : 'false');
        b.addEventListener('click', function () {
          setTime(p, id, current ? null : hourLabel(hour));
          if (!current) autoAdvance();
          save();
          closeSheet();
          render();
        });
        grid.appendChild(b);
      });
      body.appendChild(grid);
    }, { anchor: anchor, side: true });
  }

  function openMoveSheet(id) {
    var p = livePage();
    var todo = findTodo(p, id);
    if (!todo) return;
    var from = viewDate;

    var go = function (toDate) {
      snapshot();
      moveTodo(state, from, id, toDate);
      save();
      closeSheet();
      render();
      showToast(shortDate(toDate) + ' に移動しました', '元に戻す');
    };

    openSheet('「' + todo.text + '」を移動する日', function (body) {
      sheetItem(body, '明日', { sub: shortDate(shiftKey(from, 1)), onTap: function () { go(shiftKey(from, 1)); } });
      sheetItem(body, 'あさって', { sub: shortDate(shiftKey(from, 2)), onTap: function () { go(shiftKey(from, 2)); } });
      sheetItem(body, '1週間後', { sub: shortDate(shiftKey(from, 7)), onTap: function () { go(shiftKey(from, 7)); } });
      sheetDatePicker(body, '移動', shiftKey(from, 1), function (d) {
        if (d === from) { closeSheet(); return; }
        go(d);
      });
    });
  }

  function openDuplicateSheet(id) {
    var p = livePage();
    var todo = findTodo(p, id);
    if (!todo) return;
    var from = viewDate;

    var go = function (toDate) {
      duplicateTodo(state, from, id, toDate);
      save();
      closeSheet();
      render();
      showToast(toDate === from ? 'この日に複製しました' : shortDate(toDate) + ' に複製しました');
    };

    openSheet('「' + todo.text + '」の複製先', function (body) {
      sheetItem(body, '今日', { sub: shortDate(from), onTap: function () { go(from); } });
      sheetItem(body, '明日', { sub: shortDate(shiftKey(from, 1)), onTap: function () { go(shiftKey(from, 1)); } });
      sheetItem(body, '1週間後', { sub: shortDate(shiftKey(from, 7)), onTap: function () { go(shiftKey(from, 7)); } });
      sheetDatePicker(body, '複製', shiftKey(from, 1), function (d) { go(d); });
    });
  }

  /* mode: 'list' = ToDo行の「…」／'block' = TIME欄のカードをタップ
     チェックボックス・本文タップ・TIMEチップ・Important欄で直接できる操作は入れない */
  function openTodoMenu(id, mode, anchor) {
    var p = livePage();
    var todo = findTodo(p, id);
    if (!todo) return;
    var block = mode === 'block';

    openSheet(block ? '' : todo.text, function (body) {
      if (block) {
        var checkItem = sheetItem(body, todo.completed ? 'CHECK を取り消す' : 'CHECK', {
          primary: true,
          checked: todo.completed,
          onTap: function () {
            if (checkItem.dataset.busy) return;
            checkItem.dataset.busy = '1';
            checkItem.classList.toggle('is-checked');   /* チェックが入る動きを見せてから閉じる */
            setTimeout(function () { closeSheet(); toggleDone(id); }, 420);
          }
        });
        sheetItem(body, 'TODO を修正', {
          onTap: function () { closeSheet(); setStep('list'); editingId = null; editingBlockId = id; render(); }
        });
      }
      sheetItem(body, '明日に移動', {
        sub: shortDate(shiftKey(viewDate, 1)),
        onTap: function () {
          var to = shiftKey(viewDate, 1);
          snapshot();
          moveTodo(state, viewDate, id, to);
          save(); closeSheet(); render();
          showToast('明日に移動しました', '元に戻す');
        }
      });
      sheetItem(body, '日付を指定して移動', { onTap: function () { closeSheet(); openMoveSheet(id); } });
      sheetItem(body, '複製', { onTap: function () { closeSheet(); openDuplicateSheet(id); } });
      sheetItem(body, '削除', {
        danger: true,
        onTap: function () {
          snapshot();
          deleteTodo(state, viewDate, id);
          save(); closeSheet(); render();
          showToast('削除しました', '元に戻す');
        }
      });
    }, block ? { anchor: anchor, align: 'left', compact: true }
             : { anchor: anchor, side: true });
  }

  function openPagesSheet(anchor) {
    var keys = Object.keys(state.pages).sort().reverse();
    openSheet('ページ一覧', function (body) {
      sheetDatePicker(body, 'OPEN PAGE', viewDate, function (d) {
        closeSheet();
        goToDate(d);
      });
      if (!keys.length) {
        sheetNote(body, 'ページがありません。');
        return;
      }
      keys.forEach(function (k) {
        var p = state.pages[k];
        var done = p.todos.filter(function (t) { return t.completed; }).length;
        var bits = [];
        if (p.todos.length) bits.push(p.todos.length + '件・' + done + '完了');
        if (String(p.memo || '').trim()) bits.push('メモあり');
        var label = shortDate(k) + (k === todayKey() ? '　今日' : '');
        sheetItem(body, label, {
          sub: bits.join('　'),
          current: k === viewDate,
          onTap: function () { closeSheet(); goToDate(k); }
        });
      });
    }, { anchor: anchor });
  }

  /* 見出しごと見えるところまでスクロールする（画面が狭いときはページ全体が動く） */
  function scrollPanelsTo(selector) {
    var target = document.querySelector(selector);
    if (!target) return;
    var box = el.panels.scrollHeight > el.panels.clientHeight + 4 ? el.panels : el.page;
    if (box.scrollHeight <= box.clientHeight + 4) return;
    var top = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, top - 10);
  }

  function goToDate(key) {
    editingId = null;
    editingBlockId = null;
    flushMemo();
    viewDate = key;
    stepPinned = false;
    render();
    el.timecol.scrollTop = 0;
    el.panels.scrollTop = 0;
    el.page.scrollTop = 0;
  }

  function flushMemo() {
    var text = el.memo.value;
    var p = state.pages[viewDate];
    if (!text.trim() && !p) return;
    if (!p || p.memo !== text) {
      ensurePage(state, viewDate).memo = text;
      save();
    }
  }

  /* ---------------- FOCUS の演出：いまの時間帯の枠を青くする ---------------- */

  var focusTimer = null;
  var pendingFocusScroll = false;

  function currentHourRow() {
    if (viewDate !== todayKey()) return null;
    var h = new Date().getHours();
    if (h < FIRST_HOUR) h += 24;
    return el.timeline.querySelector('.hour[data-hour="' + h + '"]');
  }

  /* FOCUS の間だけ、いまの時間帯（例：11:20 なら 11:00〜12:00）の枠に色をのせる。1分ごとに見直す */
  function updateFocus() {
    var on = activeStep === 'done';
    var prev = el.timeline.querySelectorAll('.hour.is-focus-now');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('is-focus-now');
    if (!on) {
      clearTimeout(focusTimer);
      focusTimer = null;
      pendingFocusScroll = false;
      return;
    }
    var row = currentHourRow();
    if (row) {
      row.classList.add('is-focus-now');
      if (pendingFocusScroll) {
        var box = el.timecol.scrollHeight > el.timecol.clientHeight + 4 ? el.timecol : el.page;
        if (box.scrollHeight > box.clientHeight + 4) {
          var delta = row.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3;
          box.scrollTop = Math.max(0, box.scrollTop + delta);
        }
      }
    }
    pendingFocusScroll = false;
    scheduleFocusTick();
  }

  function scheduleFocusTick() {
    clearTimeout(focusTimer);
    var now = new Date();
    var ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 80;
    focusTimer = setTimeout(function () {
      if (activeStep === 'done') updateFocus();
    }, ms);
  }

  /* ---------------- 時間割のドラッグ ---------------- */

  var drag = null;

  function scrollerEl() {
    if (el.timecol.scrollHeight > el.timecol.clientHeight + 4) return el.timecol;
    if (el.page.scrollHeight > el.page.clientHeight + 4) return el.page;
    return el.timecol;
  }

  function hourRowAt(clientY) {
    var rows = el.timeline.querySelectorAll('.hour');
    if (!rows.length) return null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return rows[i];
    }
    var first = rows[0].getBoundingClientRect();
    return clientY < first.top ? rows[0] : rows[rows.length - 1];
  }

  function onGripDown(e) {
    var grip = e.target.closest ? e.target.closest('.grip') : null;
    if (!grip) return;
    var block = grip.closest('.block');
    if (!block) return;
    e.preventDefault();

    var todo = findTodo(livePage(), block.dataset.id);
    if (!todo) return;

    var ghost = document.createElement('div');
    ghost.className = 'block-ghost';
    ghost.textContent = todo.text;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    document.body.appendChild(ghost);
    block.classList.add('is-dragging');
    document.body.classList.add('is-dragging');

    drag = { id: todo.id, ghost: ghost, block: block, y: e.clientY, target: null, pointerId: e.pointerId };
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }

    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
    requestAnimationFrame(dragTick);
  }

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    drag.y = e.clientY;
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    updateDropTarget();
  }

  function updateDropTarget() {
    var row = hourRowAt(drag.y);
    if (row === drag.target) return;
    if (drag.target) drag.target.classList.remove('is-drop-target');
    drag.target = row;
    if (row) row.classList.add('is-drop-target');
  }

  function dragTick() {
    if (!drag) return;
    var sc = scrollerEl();
    var r = sc.getBoundingClientRect();
    var margin = 70;
    if (drag.y < r.top + margin) sc.scrollTop -= 12;
    else if (drag.y > r.bottom - margin) sc.scrollTop += 12;
    updateDropTarget();
    requestAnimationFrame(dragTick);
  }

  function onDragEnd() {
    if (!drag) return;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);

    var target = drag.target;
    var id = drag.id;
    if (drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    if (target) target.classList.remove('is-drop-target');
    document.body.classList.remove('is-dragging');
    drag = null;

    if (target) {
      var hour = parseInt(target.dataset.hour, 10);
      var todo = findTodo(livePage(), id);
      if (todo && todo.scheduledTime !== hourLabel(hour)) {
        setTime(livePage(), id, hourLabel(hour));
        setStep('time');
        autoAdvance();
        save();
      }
    }
    render();
  }

  /* ---------------- 起動 ---------------- */

  function init() {
    el.steps = document.getElementById('steps');
    el.dateMain = document.getElementById('dateMain');
    el.dateSub = document.getElementById('dateSub');
    el.slots = document.getElementById('slots');
    el.todos = document.getElementById('todos');
    el.todoCount = document.getElementById('todoCount');
    el.timeline = document.getElementById('timeline');
    el.timecol = document.getElementById('timecol');
    el.panels = document.querySelector('.panels');
    el.page = document.querySelector('.page');
    el.memo = document.getElementById('memo');
    el.addInput = document.getElementById('addInput');
    el.sheetLayer = document.getElementById('sheetLayer');
    el.toast = document.getElementById('toast');

    load();
    render();

    el.steps.addEventListener('click', function (e) {
      var btn = e.target.closest('.step');
      if (!btn) return;
      setStep(btn.dataset.step);
      render();
      if (activeStep === 'list') {
        scrollPanelsTo('.panel-todo');
        el.addInput.focus();
      } else if (activeStep === 'top3') {
        scrollPanelsTo('.panel-important');
      } else if (activeStep === 'time') {
        scrollPanelsTo('.panel-todo');
      }
    });

    document.getElementById('prevDay').addEventListener('click', function () { goToDate(shiftKey(viewDate, -1)); });
    document.getElementById('nextDay').addEventListener('click', function () { goToDate(shiftKey(viewDate, 1)); });
    document.getElementById('todayBtn').addEventListener('click', function () { goToDate(todayKey()); });
    document.getElementById('pagesBtn').addEventListener('click', function (e) {
      flushMemo();
      openPagesSheet(e.currentTarget);
    });

    document.getElementById('addBtn').addEventListener('click', addFromInput);
    el.addInput.addEventListener('focus', function () {
      if (activeStep !== 'list') { setStep('list'); render(); }
    });
    el.addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addFromInput(); }
    });

    el.memo.addEventListener('input', function () {
      ensurePage(state, viewDate).memo = el.memo.value;
      saveSoon();
    });
    el.memo.addEventListener('blur', function () { flushMemo(); });

    el.sheetLayer.addEventListener('click', closeSheet);
    el.timeline.addEventListener('pointerdown', onGripDown);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.sheetLayer.hidden) closeSheet();
    });

    /* 変更のたびに保存しているので、離脱時は未確定のメモだけ確定させる。
       （ここで無条件に save() すると、別タブが書いた内容を古い状態で上書きしてしまう） */
    window.addEventListener('pagehide', function () { flushMemo(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { flushMemo(); clearTimeout(focusTimer); }
      else if (activeStep === 'done') updateFocus();
    });

    /* 別タブ・別ウインドウで更新されたら読み直す */
    window.addEventListener('storage', function (e) {
      if (e.key !== STORAGE_KEY) return;
      load();
      render();
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* オフラインでも本体は動く */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
