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
  var DAYS_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
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

  // ---------- 아이콘 · 출석 기호 (SVG) ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  var MARKS = { '출석': 'o', '지각': 't', '결석': 'x', '보강': 'd' };

  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function svg(w, h2, vb, cls) {
    return svgEl('svg', { width: w, height: h2, viewBox: vb, 'aria-hidden': 'true', 'class': cls || '' });
  }

  // 출석(○) 지각(△) 결석(✕) 보강(◎). 색은 CSS에서 정한다. 알 수 없는 값은 null.
  function mark(att, size, sw) {
    var kind = MARKS[att];
    if (!kind) return null;
    var s = svg(size, size, '0 0 24 24', 'mk ' + kind);
    if (kind === 'o') s.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 7.6, 'stroke-width': sw }));
    if (kind === 'd') {
      s.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 8.2, 'stroke-width': sw }));
      s.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 3.6, 'stroke-width': sw }));
    }
    if (kind === 't') s.appendChild(svgEl('path', { d: 'M12 4.6L20.2 19H3.8z', 'stroke-width': sw }));
    if (kind === 'x') s.appendChild(svgEl('path', { d: 'M6 6l12 12M18 6L6 18', 'stroke-width': sw }));
    return s;
  }

  function planMark(size) {
    var s = svg(size, size, '0 0 24 24', 'mk p');
    s.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 7.6, 'stroke-width': 2, 'stroke-dasharray': '3.4 3.4' }));
    return s;
  }

  function chevron(cls, dir) {
    var s = svg(18, 18, '0 0 18 18', cls);
    s.appendChild(svgEl('path', { d: dir === 'l' ? 'M11 3.5L5.5 9l5.5 5.5' : (dir === 'r' ? 'M7 3.5L12.5 9 7 14.5' : 'M4 6.8L9 12l5-5.2') }));
    return s;
  }

  // 출결 배지: 출석은 기본색, 지각은 주황, 결석은 빨강
  function attBadge(att) {
    var cls = 'badge';
    if (att === '지각') cls += ' warn';
    if (att === '결석') cls += ' bad';
    return h('span', cls, att);
  }

  // 선생님이 남긴 글 블록 (왼쪽 선 + 연한 바탕)
  function note(label, text, signed) {
    var n = h('div', 'note');
    add(n, h('strong', '', label), h('p', '', text.trim()));
    if (signed) n.appendChild(h('p', 'sign', 'Rachel 선생님'));
    return n;
  }

  function kvRow(label, text) {
    var r = h('div');
    add(r, h('dt', '', label), add(h('dd'), h('span', '', text.trim())));
    return r;
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
  // 위쪽에 고정되는 청록 머리띠. 어느 탭에서나 로고와 학생 이름이 보인다.
  function renderTop(data) {
    var name = (data.student && data.student.name) || '';
    var grade = data.student && data.student.grade;

    var logo = h('img');
    logo.src = 'icons/logo-dark.svg';
    logo.alt = '';
    logo.width = 38;
    logo.height = 38;
    var title = h('div');
    add(title, h('b', '', 'Rachel English'), h('small', '', '학습 평가서'));

    var who = h('p', 'who');
    add(who, h('b', '', name + ' 학생'), has(grade) ? h('small', '', grade) : null);

    return add(h('header', 'top'),
      h('h1', 'sr', name + ' 학생의 학습 평가서'),
      add(h('div', 'brand'), logo, title),
      who);
  }

  function renderLatest(data) {
    var l = (data.lessons || [])[0];
    if (!l) return null;
    var sec = h('section', 'section');
    var d = parseDate(l.date);
    var head = h('div', 'lh' + (d ? '' : ' nodate'));

    if (d) {
      var tile = h('div', 'date');
      tile.setAttribute('aria-hidden', 'true');
      add(tile, h('small', '', (d.getMonth() + 1) + '월'), h('b', '', d.getDate()), h('span', '', DAYS_LONG[d.getDay()]));
      head.appendChild(tile);
    }

    var info = h('div');
    var title = h('h2');
    if (has(l.textbook)) {
      add(title, h('span', 'sr', fmtLong(l.date) + ' 수업, '), document.createTextNode(l.textbook.trim()));
    } else {
      title.textContent = fmtLong(l.date) + ' 수업';
    }
    info.appendChild(title);
    var rg = has(l.textbook) ? rangeText(l, unitLabelFor(data, l.textbook)) : '';
    if (rg) info.appendChild(h('p', 'range', rg));
    if (has(l.topic)) info.appendChild(h('p', 'topic', l.topic));

    var chips = h('div', 'chips');
    if (l.attendance) chips.appendChild(attBadge(l.attendance));
    if (l.homework) chips.appendChild(h('span', 'badge' + (l.homework === '완료' ? ' done' : ''), '숙제 ' + l.homework));
    if (chips.childNodes.length) info.appendChild(chips);
    head.appendChild(info);
    sec.appendChild(head);

    if (has(l.teacher_comment)) sec.appendChild(note('선생님 코멘트', l.teacher_comment, true));

    if (has(l.homework_note)) {
      var kv = h('dl', 'kv');
      kv.appendChild(kvRow('숙제', l.homework_note));
      sec.appendChild(kv);
    }
    if (has(l.next_plan)) {
      sec.appendChild(add(h('div', 'next'), h('strong', '', '다음 수업'), h('span', '', l.next_plan.trim())));
    }
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
    var prev = h('button', 'btn navbtn');
    var next = h('button', 'btn navbtn');
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
          var icon = att ? mark(att, 26, 2.4) : planMark(26);
          if (icon) m.appendChild(icon);
          cell.appendChild(m);
          cell.appendChild(h('span', 'sr', cur.month + '월 ' + d + '일 ' + (att || '보강 예정')));
        }
        if (att && counts[att] !== undefined) counts[att]++;
        grid.appendChild(cell);
      }

      ['출석', '지각', '결석', '보강'].forEach(function (k) {
        var item = h('div');
        add(item, mark(k, 18, 2.6), h('span', '', k), h('b', '', counts[k]));
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

  // 교재 진도: 단원 수가 적당하면 칸 채우기, 너무 많으면 막대
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
      if (done) line.appendChild(h('span', 'badge done', '완료'));
      else line.appendChild(h('span', 'count', num(cur) + ' / ' + num(tot) + ' ' + label));
      b.appendChild(line);

      if (!done && tot > 0) {
        if (tot <= 60) {
          var st = h('div', 'segs');
          st.style.gridTemplateColumns = 'repeat(' + (tot <= 12 ? Math.ceil(tot) : 10) + ', minmax(0, 1fr))';
          st.setAttribute('role', 'img');
          st.setAttribute('aria-label', num(tot) + ' ' + label + ' 중 ' + num(cur) + ' ' + label + ' 진행');
          for (var i = 0; i < Math.ceil(tot); i++) {
            var cls = '';
            if (cur >= i + 1) cls = 'full';
            else if (cur > i) cls = 'half';
            st.appendChild(h('i', cls));
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

  // 시험 점수 추이: 종류·단위·만점이 같은 시험을 2번 이상 봤을 때 꺾은선으로 보여 준다.
  // 세로 눈금은 실제 점수로 적고, 점수가 몰려 있으면 아래쪽을 잘라서 변화가 보이게 한다.
  function trendChart(g) {
    var pts = g.pts.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).slice(-8);
    var n = pts.length;
    var W = 320, H = 156, L = 34, R = 16, T = 24, B = 26;
    var plotW = W - L - R, plotH = H - T - B;
    var minPct = 100;
    pts.forEach(function (p) { minPct = Math.min(minPct, p.score / g.max * 100); });
    var lo = Math.max(0, Math.floor((minPct - 10) / 10) * 10);

    function X(i) { return L + 14 + (plotW - 28) * i / (n - 1); }
    function Y(score) {
      var pct = Math.max(lo, Math.min(100, score / g.max * 100));
      return T + plotH * (1 - (pct - lo) / (100 - lo));
    }
    function md(s) { var d = parseDate(s); return (d.getMonth() + 1) + '/' + d.getDate(); }

    var s = svg(W, H, '0 0 ' + W + ' ' + H, 'trendsvg');
    s.removeAttribute('width');
    s.removeAttribute('height');
    s.setAttribute('role', 'img');
    s.removeAttribute('aria-hidden');
    s.setAttribute('aria-label', g.kind + ' 점수 추이: ' + pts.map(function (p) { return md(p.date) + ' ' + num(p.score) + g.unit; }).join(', '));

    [lo, (lo + 100) / 2, 100].forEach(function (pct) {
      var y = T + plotH * (1 - (pct - lo) / (100 - lo));
      s.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y, y2: y, 'class': 'tr-grid' }));
      var t = svgEl('text', { x: L - 6, y: y + 3.5, 'text-anchor': 'end', 'class': 'tr-axis' });
      t.textContent = num(pct * g.max / 100);
      s.appendChild(t);
    });

    var line = '';
    pts.forEach(function (p, i) { line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.score).toFixed(1); });
    s.appendChild(svgEl('path', { d: line + 'L' + X(n - 1).toFixed(1) + ' ' + (T + plotH) + 'L' + X(0).toFixed(1) + ' ' + (T + plotH) + 'z', 'class': 'tr-area' }));
    s.appendChild(svgEl('path', { d: line, 'class': 'tr-line' }));

    pts.forEach(function (p, i) {
      var last = i === n - 1;
      s.appendChild(svgEl('circle', { cx: X(i), cy: Y(p.score), r: last ? 5 : 3.5, 'class': 'tr-dot' }));
      if (n <= 6 || i === 0 || last) {
        var v = svgEl('text', { x: X(i), y: Y(p.score) - 9, 'text-anchor': 'middle', 'class': 'tr-val' });
        v.textContent = num(p.score);
        s.appendChild(v);
      }
      if (n <= 5 || i === 0 || last || (i % 2 === 0 && i < n - 2)) {
        var x = svgEl('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', 'class': 'tr-axis' });
        x.textContent = md(p.date);
        s.appendChild(x);
      }
    });

    var wrap = h('div', 'trend');
    var head = h('div', 'trend-head');
    head.appendChild(h('span', 'name', g.kind + (g.unit !== '점' ? ' (' + g.unit + ')' : '')));
    var diff = pts[n - 1].score - pts[n - 2].score;
    if (diff > 0) head.appendChild(h('span', 'badge done', '지난 시험보다 ' + num(diff) + g.unit + ' 올랐어요'));
    else if (diff < 0) head.appendChild(h('span', 'badge', '지난 시험보다 ' + num(-diff) + g.unit + ' 낮아요'));
    else head.appendChild(h('span', 'badge', '지난 시험과 같아요'));
    return add(wrap, head, s);
  }

  function renderTrend(list) {
    if (!list || !list.length) return null;
    var groups = {};
    list.forEach(function (t) {
      var score = Number(t.score);
      var max = Number(t.max_score);
      if (!isFinite(score) || !(max > 0) || !parseDate(t.date)) return;
      var unit = has(t.unit) ? t.unit : '점';
      var kind = has(t.kind) ? t.kind : '시험';
      var key = kind + '|' + unit + '|' + max;
      if (!groups[key]) groups[key] = { kind: kind, unit: unit, max: max, pts: [] };
      groups[key].pts.push({ date: t.date, score: score });
    });
    var charts = Object.keys(groups).map(function (k) { return groups[k]; })
      .filter(function (g) { return g.pts.length >= 2; });
    if (!charts.length) return null;
    var sec = h('section', 'section');
    sec.appendChild(h('h2', '', '점수 추이'));
    charts.forEach(function (g) { sec.appendChild(trendChart(g)); });
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
    if (attitude) add(item, h('p', 'subhead', '수업 태도'), attitude);

    [['잘하고 있는 점', e.achievement], ['더 보완할 점', e.improvement], ['다음 달 계획', e.next_plan]]
      .forEach(function (p) {
        if (has(p[1])) item.appendChild(add(h('div', 'tx'), h('h4', '', p[0]), h('p', '', p[1].trim())));
      });

    if (has(e.parent_note)) item.appendChild(note('학부모님께', e.parent_note, true));
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
      var btn = h('button', 'btn more', '이전 평가 보기');
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
    var icon = mark(l.attendance, 20, 2.4);
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
      var btn = h('button', 'btn more', '이전 수업 ' + (list.length - FIRST) + '개 더 보기');
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

  // ---------- 탭 ----------
  // 아이콘은 24x24 안에 그린 선 아이콘.
  var TABS = [
    {
      id: 'lesson', label: '수업',
      icon: 'M3 5.5c3-1 6-.8 9 1v12.5c-3-1.8-6-2-9-1z M21 5.5c-3-1-6-.8-9 1v12.5c3-1.8 6-2 9-1z',
      empty: '수업 기록이 쌓이면 이곳에 표시됩니다.',
      build: function (data) { return [renderLatest(data), renderPast(data)]; }
    },
    {
      id: 'attend', label: '출석',
      icon: 'M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5z M4 9.5h16M8 3v4M16 3v4M9 14.5l2 2 4-4',
      empty: '출석 기록이 쌓이면 이곳에 표시됩니다.',
      build: function (data) { return [renderAttendance(data)]; }
    },
    {
      id: 'progress', label: '진도·시험',
      icon: 'M5 20v-8M12 20V5M19 20v-5',
      empty: '교재 진도와 시험 결과가 쌓이면 이곳에 표시됩니다.',
      build: function (data) { return [renderProgress(data.progress), renderTrend(data.tests), renderTests(data.tests)]; }
    },
    {
      id: 'eval', label: '평가',
      icon: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z',
      empty: '월간 평가가 등록되면 이곳에 표시됩니다.',
      build: function (data) { return [renderEvaluations(data.evaluations)]; }
    }
  ];

  var currentTab = TABS[0].id;

  function tabIcon(d) {
    var s = svg(24, 24, '0 0 24 24', 'ico');
    s.appendChild(svgEl('path', { d: d }));
    return s;
  }

  function render(data) {
    root.textContent = '';
    root.removeAttribute('aria-live');

    var panel = h('div', 'panel');
    panel.id = 'panel';
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;

    var bar = h('nav', 'tabbar');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', '학습 평가서 구역');

    var buttons = TABS.map(function (t) {
      var b = h('button', 'tab');
      b.type = 'button';
      b.id = 'tab-' + t.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'panel');
      add(b, tabIcon(t.icon), h('span', '', t.label));
      b.addEventListener('click', function () { show(t.id, true); });
      bar.appendChild(b);
      return b;
    });

    function show(id, toTop) {
      currentTab = id;
      var tab = TABS.filter(function (t) { return t.id === id; })[0];
      panel.textContent = '';
      var sections = tab.build(data).filter(Boolean);
      if (sections.length) {
        sections.forEach(function (s) { panel.appendChild(add(h('div', 'card'), s)); });
      } else {
        var empty = h('section', 'section');
        add(empty, h('h2', '', '아직 기록이 없어요'), h('p', 'empty', tab.empty));
        panel.appendChild(add(h('div', 'card'), empty));
      }
      if (id === 'lesson') {
        panel.appendChild(h('p', 'foot',
          '학생 전용 링크입니다. 다른 사람에게 전달하지 말아 주세요. 궁금한 점은 선생님께 문의해 주세요.'));
      }
      panel.setAttribute('aria-labelledby', 'tab-' + id);
      buttons.forEach(function (b, i) {
        var on = TABS[i].id === id;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      if (toTop) window.scrollTo(0, 0);
    }

    // 좌우 화살표로 탭 이동
    bar.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var at = TABS.map(function (t) { return t.id; }).indexOf(currentTab);
      var next = (at + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      show(TABS[next].id, true);
      buttons[next].focus();
    });

    add(root, renderTop(data), panel, bar);
    show(currentTab, false);
  }

  // ---------- 상태 화면 ----------
  function showMessage(title, body, retry) {
    root.textContent = '';
    root.setAttribute('aria-live', 'polite');
    var p = h('p', 'status');
    add(p, h('strong', '', title), document.createTextNode(body));
    if (retry) {
      var b = h('button', 'btn primary', '다시 시도');
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
      showMessage('링크를 확인해 주세요', '올바른 학습 평가서 링크가 아니에요. 선생님께 링크를 다시 요청해 주세요.');
      return;
    }

    root.textContent = '';
    root.setAttribute('aria-live', 'polite');
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
