/* ==========================================================
   きょうのページ — script.js
   1日1ページのデジタルノート（保存はブラウザ内 localStorage）
   ========================================================== */
(function () {
  'use strict';

  /* ---------------- 定数 ---------------- */

  var STORAGE_KEY = 'kyou-no-page.v1';
  var FIRST_HOUR = 5;
  var LAST_HOUR = 25;
  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

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
  function firstEmptyRank(page) {
    for (var r = 1; r <= 3; r++) if (!importantAt(page, r)) return r;
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
    el.sheetLayer.innerHTML = '';
  }

  function openSheet(title, buildBody) {
    el.sheetLayer.innerHTML = '';
    var sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.addEventListener('click', function (e) { e.stopPropagation(); });

    var head = document.createElement('div');
    head.className = 'sheet-head';
    var h = document.createElement('div');
    h.className = 'sheet-title';
    h.textContent = title;
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
    el.sheetLayer.appendChild(sheet);
    el.sheetLayer.hidden = false;
  }

  function sheetItem(body, main, opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sheet-item' +
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

    if (!stepPinned) {
      activeStep = !status.list ? 'list' : (!status.top3 ? 'top3' : (!status.time ? 'time' : 'done'));
    }
    document.body.dataset.step = activeStep;
    document.body.classList.toggle('is-today', viewDate === todayKey());

    el.dateMain.textContent = displayDate(viewDate);
    el.dateSub.textContent = weekdayOf(viewDate);

    ['list', 'top3', 'time', 'done'].forEach(function (key) {
      var btn = el.steps.querySelector('.step[data-step="' + key + '"]');
      var mark = btn.querySelector('.step-mark');
      btn.classList.toggle('is-current', activeStep === key);
      btn.classList.toggle('is-cleared', status[key] && activeStep !== key);
      mark.textContent = activeStep === key ? '●' : (status[key] ? '✓' : '○');
    });

    renderSlots(p);
    renderTodos(p);
    renderTimeline(p);

    if (document.activeElement !== el.memo) el.memo.value = p.memo || '';
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
      r.textContent = ['①', '②', '③'][rank - 1];
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
      btn.addEventListener('click', function () { openRankSheet(rank); });
      el.slots.appendChild(btn);
    });
  }

  function renderTodos(p) {
    el.todos.innerHTML = '';
    var list = sortedTodos(p);
    var doneCount = list.filter(function (t) { return t.completed; }).length;
    el.todoCount.textContent = list.length ? doneCount + ' / ' + list.length : '';

    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'empty-note';
      li.textContent = '今日やることを、思いつくままに書き出すところから。';
      el.todos.appendChild(li);
      return;
    }

    list.forEach(function (todo) {
      var li = document.createElement('li');
      li.className = 'todo' + (todo.completed ? ' is-done' : '');
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
        rank.textContent = ['①', '②', '③'][todo.importantRank - 1];
        li.appendChild(rank);
      }

      if (editingId === todo.id) {
        var input = document.createElement('input');
        input.className = 'todo-edit';
        input.type = 'text';
        input.value = todo.text;
        input.enterKeyHint = 'done';
        var commit = function (keep) {
          var v = input.value.trim();
          editingId = null;
          if (v && v !== todo.text) {
            var live = findTodo(livePage(), todo.id);
            if (live) { live.text = v; save(); }
          }
          render();
        };
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { editingId = null; render(); }
        });
        input.addEventListener('blur', commit);
        li.appendChild(input);
        setTimeout(function () { input.focus(); input.select(); }, 0);
      } else {
        var text = document.createElement('button');
        text.type = 'button';
        text.className = 'todo-text';
        text.textContent = todo.text;
        text.addEventListener('click', function () { editingId = todo.id; render(); });
        li.appendChild(text);
      }

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (todo.scheduledTime ? ' has-time' : '');
      chip.textContent = todo.scheduledTime || '時間';
      chip.setAttribute('aria-label', todo.scheduledTime ? '時間を変える' : '時間に置く');
      chip.addEventListener('click', function () { openTimeSheet(todo.id); });
      li.appendChild(chip);

      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'more';
      more.setAttribute('aria-label', 'そのほかの操作');
      more.textContent = '…';
      more.addEventListener('click', function () { openTodoMenu(todo.id); });
      li.appendChild(more);

      el.todos.appendChild(li);
    });
  }

  function renderTimeline(p) {
    el.timeline.innerHTML = '';
    var placed = sortedTodos(p).filter(function (t) { return t.scheduledTime; });

    if (!placed.length) {
      var note = document.createElement('p');
      note.className = 'timeline-empty';
      note.textContent = 'ToDo の「時間」を押すと、ここに置けます。';
      el.timeline.appendChild(note);
    }

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

        var text = document.createElement('button');
        text.type = 'button';
        text.className = 'block-text';
        text.textContent = (todo.importantRank ? ['①', '②', '③'][todo.importantRank - 1] + ' ' : '') + todo.text;
        text.addEventListener('click', function () { openTodoMenu(todo.id); });
        block.appendChild(text);

        var grip = document.createElement('button');
        grip.type = 'button';
        grip.className = 'grip';
        grip.setAttribute('aria-label', 'ドラッグして時間を移す');
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
    save();
    render();
  }

  function addFromInput() {
    var text = el.addInput.value;
    if (!text.trim()) return;
    addTodo(state, viewDate, text);
    el.addInput.value = '';
    save();
    render();
  }

  function openRankSheet(rank) {
    var p = livePage();
    var current = importantAt(p, rank);
    var list = candidates(p, rank);
    var label = ['①', '②', '③'][rank - 1];

    openSheet(label + ' に入れる ToDo を選ぶ', function (body) {
      if (!list.length) {
        sheetNote(body, 'まだ ToDo がありません。① LIST で書き出してから選べます。');
        return;
      }
      list.forEach(function (t) {
        sheetItem(body, t.text, {
          sub: t.scheduledTime || '',
          current: current && current.id === t.id,
          done: t.completed,
          onTap: function () {
            setImportant(p, rank, t.id);
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
    });
  }

  function openTimeSheet(id) {
    var p = livePage();
    var todo = findTodo(p, id);
    if (!todo) return;

    openSheet('「' + todo.text + '」を時間に置く', function (body) {
      var grid = document.createElement('div');
      grid.className = 'hour-grid';
      HOURS.forEach(function (hour) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'hour-pick' + (hourOf(todo.scheduledTime) === hour ? ' is-current' : '');
        b.textContent = hourLabel(hour);
        b.addEventListener('click', function () {
          setTime(p, id, hourLabel(hour));
          save();
          closeSheet();
          render();
        });
        grid.appendChild(b);
      });
      body.appendChild(grid);

      if (todo.scheduledTime) {
        sheetItem(body, '時間から外す（ToDo は残る）', {
          onTap: function () {
            setTime(p, id, null);
            save();
            closeSheet();
            render();
          }
        });
      }
    });
  }

  function openReplaceRankSheet(id) {
    var p = livePage();
    openSheet('どの Important と入れ替える？', function (body) {
      [1, 2, 3].forEach(function (rank) {
        var cur = importantAt(p, rank);
        sheetItem(body, ['①', '②', '③'][rank - 1] + ' ' + (cur ? cur.text : '（空き）'), {
          onTap: function () {
            setImportant(p, rank, id);
            save();
            closeSheet();
            render();
          }
        });
      });
    });
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
      showToast(shortDate(toDate) + ' に移しました', '元に戻す');
    };

    openSheet('「' + todo.text + '」を移す日', function (body) {
      sheetItem(body, '明日', { sub: shortDate(shiftKey(from, 1)), onTap: function () { go(shiftKey(from, 1)); } });
      sheetItem(body, 'あさって', { sub: shortDate(shiftKey(from, 2)), onTap: function () { go(shiftKey(from, 2)); } });
      sheetItem(body, '1週間後', { sub: shortDate(shiftKey(from, 7)), onTap: function () { go(shiftKey(from, 7)); } });
      sheetDatePicker(body, '移す', shiftKey(from, 1), function (d) {
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

    openSheet('「' + todo.text + '」を複製する先', function (body) {
      sheetItem(body, 'この日にもう1つ', { sub: shortDate(from), onTap: function () { go(from); } });
      sheetItem(body, '明日', { sub: shortDate(shiftKey(from, 1)), onTap: function () { go(shiftKey(from, 1)); } });
      sheetItem(body, '1週間後', { sub: shortDate(shiftKey(from, 7)), onTap: function () { go(shiftKey(from, 7)); } });
      sheetDatePicker(body, '複製', shiftKey(from, 1), function (d) { go(d); });
    });
  }

  function openTodoMenu(id) {
    var p = livePage();
    var todo = findTodo(p, id);
    if (!todo) return;

    openSheet(todo.text, function (body) {
      sheetItem(body, todo.completed ? '未完了にもどす' : '完了にする', {
        onTap: function () { closeSheet(); toggleDone(id); }
      });
      sheetItem(body, '文字を直す', {
        onTap: function () { closeSheet(); editingId = id; render(); }
      });
      sheetItem(body, todo.scheduledTime ? '時間を変える' : '時間に置く', {
        sub: todo.scheduledTime || '',
        onTap: function () { closeSheet(); openTimeSheet(id); }
      });
      if (todo.scheduledTime) {
        sheetItem(body, '時間から外す', {
          onTap: function () {
            setTime(p, id, null);
            save(); closeSheet(); render();
          }
        });
      }
      if (todo.importantRank) {
        sheetItem(body, 'Important から外す', {
          onTap: function () {
            clearImportant(p, todo.importantRank);
            save(); closeSheet(); render();
          }
        });
      } else {
        sheetItem(body, 'Important に入れる', {
          onTap: function () {
            var rank = firstEmptyRank(p);
            if (rank) {
              setImportant(p, rank, id);
              save(); closeSheet(); render();
            } else {
              closeSheet();
              openReplaceRankSheet(id);
            }
          }
        });
      }
      sheetItem(body, '明日に移す', {
        sub: shortDate(shiftKey(viewDate, 1)),
        onTap: function () {
          var to = shiftKey(viewDate, 1);
          snapshot();
          moveTodo(state, viewDate, id, to);
          save(); closeSheet(); render();
          showToast('明日に移しました', '元に戻す');
        }
      });
      sheetItem(body, '日付を指定して移す', { onTap: function () { closeSheet(); openMoveSheet(id); } });
      sheetItem(body, '複製する', { onTap: function () { closeSheet(); openDuplicateSheet(id); } });
      sheetItem(body, '削除する', {
        danger: true,
        onTap: function () {
          snapshot();
          deleteTodo(state, viewDate, id);
          save(); closeSheet(); render();
          showToast('削除しました', '元に戻す');
        }
      });
    });
  }

  function openPagesSheet() {
    var keys = Object.keys(state.pages).sort().reverse();
    openSheet('ページ一覧', function (body) {
      sheetDatePicker(body, 'ひらく', viewDate, function (d) {
        closeSheet();
        goToDate(d);
      });
      if (!keys.length) {
        sheetNote(body, 'まだ書いたページがありません。書き込むと、ここに残ります。');
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
    });
  }

  function goToDate(key) {
    if (editingId) editingId = null;
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
      activeStep = btn.dataset.step;
      stepPinned = true;
      document.body.dataset.step = activeStep;
      render();
      if (activeStep === 'list') {
        el.panels.scrollTop = document.querySelector('.panel-todo').offsetTop - 8;
        el.addInput.focus();
      } else if (activeStep === 'top3') {
        el.panels.scrollTop = 0;
      } else if (activeStep === 'time') {
        el.panels.scrollTop = document.querySelector('.panel-todo').offsetTop - 8;
      }
    });

    document.getElementById('prevDay').addEventListener('click', function () { goToDate(shiftKey(viewDate, -1)); });
    document.getElementById('nextDay').addEventListener('click', function () { goToDate(shiftKey(viewDate, 1)); });
    document.getElementById('todayBtn').addEventListener('click', function () { goToDate(todayKey()); });
    document.getElementById('pagesBtn').addEventListener('click', function () { flushMemo(); openPagesSheet(); });

    document.getElementById('addBtn').addEventListener('click', addFromInput);
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
      if (document.visibilityState === 'hidden') flushMemo();
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
