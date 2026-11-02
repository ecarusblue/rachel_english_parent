(function () {
  'use strict';

  var cfg = window.PARENT_CONFIG;
  var root = document.getElementById('app');

  // ---------- 작은 유틸 ----------
  // 서버에서 온 값은 전부 textContent로만 넣는다. (HTML로 해석되지 않음)
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null && text !== '') e.textContent = String(text);
    return e;
  }

  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      if (arguments[i]) parent.appendChild(arguments[i]);
    }
    return parent;
  }

  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function fmtDate(s) {
    var d = parseDate(s);
    return d ? (d.getMonth() + 1) + '/' + d.getDate() + ' (' + DAYS[d.getDay()] + ')' : '';
  }

  function fmtTime(s) {
    return s ? String(s).slice(0, 5) : '';
  }

  function num(n) {
    var v = Number(n);
    return isFinite(v) ? String(Math.round(v * 10) / 10) : '';
  }

  function has(s) {
    return typeof s === 'string' && s.trim() !== '';
  }

  function bar(value, max) {
    var p = document.createElement('progress');
    p.max = max > 0 ? max : 1;
    p.value = Math.max(0, Math.min(value, p.max));
    return p;
  }

  var DAYS_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  function fmtLong(s) {
    var d = parseDate(s);
    return d ? (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS_LONG[d.getDay()] : '';
  }

  function fmtShort(s) {
    var d = parseDate(s);
    return d ? (d.getMonth() + 1) + '/' + d.getDate() + ' (' + DAYS[d.getDay()] + ')' : '';
  }

  function fmtClock(s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    if (!m) return '';
    var hh = Number(m[1]);
    var mm = Number(m[2]);
    var half = hh < 12 ? '오전' : '오후';
    var h12 = hh % 12 === 0 ? 12 : hh % 12;
    return half + ' ' + h12 + '시' + (mm ? ' ' + mm + '분' : '');
  }

  // ---------- 출석부 기호 (SVG) ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  var P_O = 'M14.2 3.6c6.1-.5 10.7 4.1 10.3 10.2-.4 6.2-4.9 10.7-10.9 10.5C7.6 24.1 3.4 19.5 3.7 13.9 4 8.3 8.5 3.9 14.2 3.6z';
  var P_T = 'M14 4.8L24.2 22.4 4.1 21.9z';
  var P_X = 'M6.2 6.2L21.8 21.8M21.8 6.4L6.4 21.6';
  var MARKS = { '출석': 'o', '지각': 't', '결석': 'x', '보강': 'd' };

  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function svg(w, h2, vb, cls) {
    return svgEl('svg', { width: w, height: h2, viewBox: vb, 'aria-hidden': 'true', 'class': cls || '' });
  }

  // 출석(○) 지각(△) 결석(✕) 보강(◎). 알 수 없는 값은 null.
  function mark(att, size, sw) {
    var kind = MARKS[att];
    if (!kind) return null;
    var s = svg(size, size, '0 0 28 28', 'mk');
    var a = function (d) { return svgEl('path', { d: d, 'stroke-width': sw }); };
    if (kind === 'o' || kind === 'd') s.appendChild(a(P_O));
    if (kind === 't') s.appendChild(a(P_T));
    if (kind === 'x') s.appendChild(a(P_X));
    if (kind === 'd') s.appendChild(svgEl('circle', { cx: 14, cy: 14, r: 4.6, 'stroke-width': sw - 0.2 }));
    return s;
  }

  function planMark(size) {
    var s = svg(size, size, '0 0 28 28', 'mk');
    s.appendChild(svgEl('circle', { cx: 14, cy: 14, r: 9.5, 'stroke-width': 2, 'class': 'plan' }));
    return s;
  }

  function chevron(cls, dir) {
    var s = svg(18, 18, '0 0 18 18', cls);
    s.appendChild(svgEl('path', { d: dir === 'l' ? 'M11 3.5L5.5 9l5.5 5.5' : (dir === 'r' ? 'M7 3.5L12.5 9 7 14.5' : 'M4 6.8L9 12l5-5.2') }));
    return s;
  }

  function highlight(text) {
    var p = h('p');
    p.appendChild(h('span', 'mark', text.trim()));
    return p;
  }

  function row2(label, content) {
    var r = h('div', 'row2');
    add(r, h('div', 'k', label), content);
    return r;
  }

  // 줄 노트에 쓴 글. 짧으면 손글씨체, 길면 읽기 쉬운 본문체.
  function ruled(lines, signed) {
    var total = lines.join('').length;
    var d = h('div', 'ruled' + (total > 90 ? ' long' : ''));
    lines.forEach(function (t) { d.appendChild(h('p', '', t.trim())); });
    if (signed) d.appendChild(h('p', 'sign', 'Rachel 선생님'));
    return d;
  }

  // 교재 이름으로 단원 단위(단원/Unit 등)를 찾는다.
  function unitLabelFor(data, textbook) {
    var found = (data.progress || []).filter(function (p) { return p.textbook === textbook && has(p.unit_label); })[0];
    return found ? found.unit_label : '';
  }

  function rangeText(l, label) {
    if (l.from_unit === null || l.from_unit === undefined || l.to_unit === null || l.to_unit === undefined) return '';
    var a = num(l.from_unit);
    var b = num(l.to_unit);
    return (a === b ? a : a + '~' + b) + (/^[A-Za-z]/.test(label) ? ' ' : '') + label;
  }

  // ---------- 화면 조각 ----------
  function renderHeader(data) {
    var name = (data.student && data.student.name) || '';
    var grade = data.student && data.student.grade;
    var f = document.createDocumentFragment();
    add(f,
      h('p', 'brand', 'Rachel English'),
      h('h1', 'title', name + ' 학생의 학습 현황'),
      has(grade) ? h('p', 'grade', grade) : null);
    return f;
  }

  function renderLatest(data) {
    var l = (data.lessons || [])[0];
    if (!l) return null;
    var sec = h('section', 'latest');
    var head = h('div', 'latest-head');
    var left = h('div');
    left.appendChild(h('h2', '', fmtLong(l.date) + ' 수업'));
    if (l.homework) {
      var hw = h('p', 'hwline');
      if (l.homework === '완료') {
        var ck = svg(16, 16, '0 0 16 16', 'mk');
        ck.appendChild(svgEl('path', { d: 'M3.2 8.6l3.1 3.1 6.5-7.4', 'stroke-width': 2.2 }));
        hw.appendChild(ck);
      }
      hw.appendChild(h('span', '', '숙제 ' + l.homework));
      left.appendChild(hw);
    }
    head.appendChild(left);

    if (l.attendance) {
      var circ = h('div', 'circled');
      var s = svg(64, 40, '0 0 64 40', 'mk');
      s.appendChild(svgEl('path', {
        d: 'M32 3.5C48 2.8 60.5 9.6 60.2 20.4 59.9 31 47.5 37.4 31.6 36.8 15.6 36.2 3.6 30 3.9 19.6 4.2 9.4 16.4 4.1 32 3.5z',
        'stroke-width': 2.4
      }));
      add(circ, s, h('span', '', l.attendance));
      head.appendChild(circ);
    }
    sec.appendChild(head);

    if (has(l.textbook) || has(l.topic)) {
      if (has(l.textbook)) {
        var what = h('p', 'what');
        what.appendChild(h('b', '', l.textbook));
        var rg = rangeText(l, unitLabelFor(data, l.textbook));
        if (rg) what.appendChild(h('span', 'range', rg));
        sec.appendChild(what);
      }
      if (has(l.topic)) sec.appendChild(h('p', 'topic', l.topic));
    }

    if (has(l.teacher_comment)) sec.appendChild(ruled([l.teacher_comment], true));

    var rows = h('div', 'rows');
    if (has(l.homework_note)) rows.appendChild(row2('숙제', highlight(l.homework_note)));
    if (has(l.next_plan)) rows.appendChild(row2('다음 수업', highlight(l.next_plan)));
    if (rows.childNodes.length) sec.appendChild(rows);
    return sec;
  }

  function monthKey(year, month) {
    return year + '-' + (month < 10 ? '0' : '') + month;
  }

  // 월 이동이 되는 출석부 달력
  function renderAttendance(data) {
    var log = data.attendance || [];
    var makeups = data.makeups || [];
    if (!log.length && !makeups.length) return null;

    var now = new Date();
    var nowIdx = now.getFullYear() * 12 + now.getMonth();

    var byDate = {};
    var startIdx = nowIdx;
    log.forEach(function (r) {
      var d = parseDate(r.date);
      if (!d) return;
      var key = r.date.slice(0, 10);
      if (!byDate[key]) byDate[key] = r.attendance;
      startIdx = Math.min(startIdx, d.getFullYear() * 12 + d.getMonth());
    });

    var planned = {};
    makeups.forEach(function (mk) { if (mk.date) planned[String(mk.date).slice(0, 10)] = true; });

    var months = [];
    for (var idx = startIdx; idx <= nowIdx; idx++) {
      months.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
    }
    var pos = months.length - 1;

    var sec = h('section', 'section');
    var head = h('div', 'cardhead');
    var title = h('h2');
    var nav = h('div', 'nav');
    var prev = h('button', 'navbtn');
    var next = h('button', 'navbtn');
    prev.type = 'button';
    next.type = 'button';
    prev.setAttribute('aria-label', '이전 달');
    next.setAttribute('aria-label', '다음 달');
    prev.appendChild(chevron('', 'l'));
    next.appendChild(chevron('', 'r'));
    add(nav, prev, next);
    head.appendChild(title);
    if (months.length > 1) head.appendChild(nav);
    sec.appendChild(head);

    var daysHead = h('div', 'cal-head');
    DAYS.forEach(function (d) { daysHead.appendChild(h('span', '', d)); });
    sec.appendChild(daysHead);

    var grid = h('div', 'cal-grid');
    var legend = h('div', 'legend');
    var extra = h('div');
    add(sec, grid, legend, extra);

    function draw() {
      var cur = months[pos];
      title.textContent = (cur.year !== now.getFullYear() ? cur.year + '년 ' : '') + cur.month + '월 출석';
      prev.disabled = pos === 0;
      next.disabled = pos === months.length - 1;
      grid.textContent = '';
      legend.textContent = '';
      extra.textContent = '';

      var first = new Date(cur.year, cur.month - 1, 1).getDay();
      var days = new Date(cur.year, cur.month, 0).getDate();
      var counts = { '출석': 0, '지각': 0, '결석': 0, '보강': 0 };

      for (var i = 0; i < first; i++) grid.appendChild(h('div', 'cell'));
      for (var d = 1; d <= days; d++) {
        var key = monthKey(cur.year, cur.month) + '-' + (d < 10 ? '0' : '') + d;
        var att = byDate[key];
        var isPlan = !att && planned[key];
        var isToday = cur.year === now.getFullYear() && cur.month === now.getMonth() + 1 && d === now.getDate();
        var cell = h('div', 'cell' + (att || isPlan ? ' has' : '') + (isToday ? ' today' : ''));
        cell.appendChild(h('span', 'd', d));
        if (att || isPlan) {
          var m = h('div', 'm');
          var icon = att ? mark(att, 28, 2.4) : planMark(28);
          if (icon) m.appendChild(icon);
          cell.appendChild(m);
          cell.appendChild(h('span', 'sr', cur.month + '월 ' + d + '일 ' + (att || '보강 예정')));
        }
        if (att && counts[att] !== undefined) counts[att]++;
        grid.appendChild(cell);
      }

      ['출석', '지각', '결석', '보강'].forEach(function (k) {
        var item = h('div');
        add(item, mark(k, 18, 3), h('span', '', k), h('b', '', counts[k]));
        legend.appendChild(item);
      });

      var any = counts['출석'] + counts['지각'] + counts['결석'] + counts['보강'];
      if (!any) extra.appendChild(h('p', 'empty', '이 달에는 수업 기록이 없어요.'));

      if (pos === months.length - 1) {
        makeups.forEach(function (mk) {
          var when = fmtLong(mk.date);
          var t = fmtClock(mk.start);
          var line = h('p', 'plan-line');
          add(line, planMark(20), h('span', '', when + (t ? ' ' + t : '') + ' 보강 예정'));
          extra.appendChild(line);
        });
      }
    }

    prev.addEventListener('click', function () { if (pos > 0) { pos--; draw(); } });
    next.addEventListener('click', function () { if (pos < months.length - 1) { pos++; draw(); } });
    draw();
    return sec;
  }

  // 교재 진도: 단원 수가 적당하면 도장판, 너무 많으면 막대
  function renderProgress(list) {
    if (!list || !list.length) return null;
    var sec = h('section', 'section');
    sec.appendChild(h('h2', '', '교재 진도'));
    list.forEach(function (p) {
      var cur = Number(p.current_unit);
      var tot = Number(p.total_units);
      var done = tot > 0 && cur >= tot;
      var label = has(p.unit_label) ? p.unit_label : 'Unit';
      var b = h('div', 'book');
      var line = h('div', 'line');
      line.appendChild(h('span', 'name', p.textbook));
      if (done) line.appendChild(h('span', 'seal', '완료'));
      else line.appendChild(h('span', 'count', num(cur) + ' / ' + num(tot) + ' ' + label));
      b.appendChild(line);

      if (!done && tot > 0) {
        if (tot <= 60) {
          var st = h('div', 'stamps');
          st.setAttribute('role', 'img');
          st.setAttribute('aria-label', num(tot) + ' ' + label + ' 중 ' + num(cur) + ' ' + label + ' 진행');
          for (var i = 0; i < Math.ceil(tot); i++) {
            var cls = 'stamp';
            if (cur >= i + 1) cls += ' full';
            else if (cur > i) cls += ' half';
            st.appendChild(h('div', cls));
          }
          b.appendChild(st);
        } else {
          b.appendChild(bar(cur, tot));
        }
      }
      sec.appendChild(b);
    });
    return sec;
  }

  function renderTests(list) {
    if (!list || !list.length) return null;
    var sec = h('section', 'section');
    sec.appendChild(h('h2', '', '시험 결과'));
    list.forEach(function (t) {
      var w = h('div', 'test');
      var line = h('div', 'line');
      var left = h('div');
      var meta = [has(t.title) ? t.kind : '', fmtShort(t.date)].filter(has).join(' · ');
      add(left, h('div', 'name', has(t.title) ? t.title : t.kind), h('div', 'meta', meta));

      var unit = has(t.unit) ? t.unit : '점';
      var score = h('div', 'score');
      if (Number(t.max_score) === 100 && unit === '점') {
        add(score, document.createTextNode(num(t.score)), h('small', '', '점'));
      } else {
        add(score, document.createTextNode(num(t.score)), h('small', '', ' / ' + num(t.max_score) + unit));
      }
      add(line, left, score);
      add(w, line, bar(Number(t.score), Number(t.max_score)));
      sec.appendChild(w);
    });
    return sec;
  }

  var RATING_LABELS = [
    ['listening', '듣기'], ['speaking', '말하기'], ['reading', '읽기'],
    ['writing', '쓰기'], ['vocab', '어휘'], ['grammar', '문법']
  ];
  var ATTITUDE_LABELS = [['homework', '숙제'], ['participation', '참여도'], ['focus', '집중력']];

  function dots(value) {
    var d = h('span', 'dots');
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', '5점 만점에 ' + value + '점');
    for (var i = 1; i <= 5; i++) d.appendChild(h('i', i <= value ? 'on' : ''));
    return d;
  }

  function scoreGrid(values, labels) {
    var items = labels.filter(function (p) { return typeof (values || {})[p[0]] === 'number'; });
    if (!items.length) return null;
    var g = h('div', 'grid');
    items.forEach(function (p) {
      var item = h('div', 'item');
      add(item, h('span', '', p[1]), dots(values[p[0]]));
      g.appendChild(item);
    });
    return g;
  }

  function evalTitle(e) {
    return e.month + '월 평가' + (e.year !== new Date().getFullYear() ? ' (' + e.year + ')' : '');
  }

  function evalItem(e, noTitle) {
    var item = h('article', 'eval');
    if (!noTitle) item.appendChild(h('h3', '', evalTitle(e)));

    var ratings = scoreGrid(e.ratings, RATING_LABELS);
    var attitude = scoreGrid(e.attitude, ATTITUDE_LABELS);
    if (ratings) add(item, h('p', 'subhead', '영역별 성취'), ratings);
    if (attitude) add(item, h('p', 'subhead gap', '수업 태도'), attitude);

    var rows = h('div', 'rows');
    [['잘하고 있는 점', e.achievement], ['더 보완할 점', e.improvement], ['다음 달 계획', e.next_plan]]
      .forEach(function (p) {
        if (has(p[1])) rows.appendChild(row2(p[0], h('p', '', p[1].trim())));
      });
    if (rows.childNodes.length) item.appendChild(rows);

    if (has(e.parent_note)) item.appendChild(ruled(['학부모님께,', e.parent_note], true));
    return item;
  }

  function renderEvaluations(list) {
    if (!list || !list.length) return null;
    var sec = h('section', 'section');
    sec.appendChild(h('h2', '', evalTitle(list[0])));
    sec.appendChild(evalItem(list[0], true));
    if (list.length > 1) {
      var olds = h('div');
      olds.hidden = true;
      list.slice(1).forEach(function (e) { olds.appendChild(evalItem(e)); });
      var btn = h('button', 'more', '이전 평가 보기');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () {
        olds.hidden = !olds.hidden;
        btn.setAttribute('aria-expanded', String(!olds.hidden));
        btn.textContent = olds.hidden ? '이전 평가 보기' : '이전 평가 접기';
      });
      add(sec, btn, olds);
    }
    return sec;
  }

  // 지난 수업: 한 줄 요약, 누르면 펼침 (처음 5개 + 더 보기)
  function pastItem(data, l) {
    var wrap = h('div', 'past');
    var btn = h('button');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    var what = h('span', 'pwhat');
    if (has(l.textbook)) what.appendChild(h('span', '', l.textbook));
    var rg = rangeText(l, unitLabelFor(data, l.textbook));
    if (rg) what.appendChild(h('span', 'range', rg));
    if (!has(l.textbook) && has(l.topic)) what.appendChild(h('span', '', l.topic));
    var pm = h('span', 'pmark');
    var icon = mark(l.attendance, 22, 2.6);
    if (icon) pm.appendChild(icon);
    else if (l.attendance) pm.appendChild(h('span', 'sr', l.attendance));
    if (icon) pm.appendChild(h('span', 'sr', l.attendance));
    add(btn, h('span', 'pdate', fmtShort(l.date)), pm, what, chevron('chev', 'd'));

    var detail = h('div', 'detail');
    detail.hidden = true;
    var parts = [
      [has(l.topic) && has(l.textbook) ? '수업 내용' : '', l.topic],
      ['숙제', l.homework_note],
      ['선생님 코멘트', l.teacher_comment],
      ['다음 수업', l.next_plan]
    ];
    if (l.homework) parts.splice(1, 0, ['숙제 확인', l.homework]);
    parts.forEach(function (p) {
      if (!has(p[1]) || !p[0]) return;
      var para = h('p');
      add(para, h('span', 'k', p[0]), document.createTextNode(p[1].trim()));
      detail.appendChild(para);
    });
    if (!detail.childNodes.length) detail.appendChild(h('p', '', '남겨진 메모가 없어요.'));

    btn.addEventListener('click', function () {
      detail.hidden = !detail.hidden;
      btn.setAttribute('aria-expanded', String(!detail.hidden));
    });
    add(wrap, btn, detail);
    return wrap;
  }

  function renderPast(data) {
    var list = (data.lessons || []).slice(1);
    if (!list.length) return null;
    var sec = h('section', 'section');
    sec.appendChild(h('h2', '', '지난 수업'));
    var FIRST = 5;
    list.slice(0, FIRST).forEach(function (l) { sec.appendChild(pastItem(data, l)); });
    if (list.length > FIRST) {
      var rest = h('div');
      rest.hidden = true;
      list.slice(FIRST).forEach(function (l) { rest.appendChild(pastItem(data, l)); });
      var btn = h('button', 'more', '이전 수업 ' + (list.length - FIRST) + '개 더 보기');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () {
        rest.hidden = false;
        btn.hidden = true;
      });
      add(sec, rest, btn);
    }
    return sec;
  }

  function render(data) {
    root.textContent = '';
    var sheet = h('div', 'sheet');
    sheet.appendChild(renderHeader(data));
    add(sheet,
      renderLatest(data),
      renderAttendance(data),
      renderProgress(data.progress),
      renderTests(data.tests),
      renderEvaluations(data.evaluations),
      renderPast(data));

    var hasAny = ['progress', 'lessons', 'tests', 'evaluations'].some(function (k) {
      return data[k] && data[k].length;
    });
    if (!hasAny) {
      var empty = h('section', 'section');
      add(empty, h('h2', '', '아직 기록이 없어요'), h('p', 'empty', '수업 기록이 쌓이면 이곳에 표시됩니다.'));
      sheet.appendChild(empty);
    }

    sheet.appendChild(h('p', 'foot',
      '학생 전용 링크입니다. 다른 사람에게 전달하지 말아 주세요. 궁금한 점은 선생님께 문의해 주세요.'));
    root.appendChild(sheet);
  }

  // ---------- 상태 화면 ----------
  function showMessage(title, body, retry) {
    root.textContent = '';
    var p = h('p', 'status');
    add(p, h('strong', '', title), document.createTextNode(body));
    if (retry) {
      var b = h('button', 'btn', '다시 시도');
      b.type = 'button';
      b.addEventListener('click', retry);
      p.appendChild(document.createElement('br'));
      p.appendChild(b);
    }
    root.appendChild(p);
  }

  // ---------- 데이터 로드 ----------
  function readToken() {
    var m = /[#&]t=([A-Za-z0-9_-]{32,128})/.exec(window.location.hash || '');
    return m ? m[1] : null;
  }

  function load() {
    var token = readToken();
    if (!token) {
      showMessage('링크를 확인해 주세요', '올바른 학습 현황 링크가 아니에요. 선생님께 링크를 다시 요청해 주세요.');
      return;
    }

    root.textContent = '';
    root.appendChild(h('p', 'status', '불러오는 중…'));

    fetch(cfg.supabaseUrl + '/rest/v1/rpc/get_parent_view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.publishableKey },
      body: JSON.stringify({ p_token: token }),
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data) {
          showMessage('만료되었거나 올바르지 않은 링크예요', '선생님께 새 링크를 요청해 주세요.');
          return;
        }
        render(data);
      })
      .catch(function () {
        showMessage('불러오지 못했어요', '네트워크 상태를 확인하고 다시 시도해 주세요.', load);
      });
  }

  window.addEventListener('hashchange', load);
  load();
})();
