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

  function block(label, text) {
    if (!has(text)) return null;
    var b = h('div', 'block');
    add(b, h('span', 'label', label), h('p', '', text.trim()));
    return b;
  }

  function card(title, small) {
    var c = h('section', 'card');
    var t = h('h2', '', title);
    if (small) t.appendChild(h('small', '', small));
    c.appendChild(t);
    return c;
  }

  function bar(value, max) {
    var p = document.createElement('progress');
    p.max = max > 0 ? max : 1;
    p.value = Math.max(0, Math.min(value, p.max));
    return p;
  }

  var ATTENDANCE_TONE = { '출석': 'ok', '지각': 'warn', '결석': 'bad', '보강': 'info' };
  var HOMEWORK_TONE = { '완료': 'ok', '일부': 'warn', '미제출': 'bad' };

  // ---------- 화면 조각 ----------
  function renderHero(data) {
    var hero = h('header', 'hero');
    var name = (data.student && data.student.name) || '';
    var grade = data.student && data.student.grade;
    add(hero, h('p', 'brand', 'Rachel English'), h('h1', '', name + ' 학생의 학습 현황'));
    if (has(grade)) hero.appendChild(h('p', 'sub', grade));
    return hero;
  }

  function renderSummary(data) {
    var summary = data.month_summary || {};
    var makeups = data.makeups || [];
    var keys = ['출석', '지각', '결석', '보강'].filter(function (k) { return summary[k]; });
    if (!keys.length && !makeups.length) return null;

    var month = new Date().getMonth() + 1;
    var c = card(month + '월 출결');
    if (keys.length) {
      var chips = h('div', 'chips');
      keys.forEach(function (k) {
        var chip = h('span', 'chip');
        add(chip, document.createTextNode(k + ' '), h('b', '', summary[k] + '회'));
        chips.appendChild(chip);
      });
      c.appendChild(chips);
    }
    makeups.forEach(function (m) {
      var when = fmtDate(m.date);
      var t = fmtTime(m.start);
      if (t) when += ' ' + t + (fmtTime(m.end) ? ' ~ ' + fmtTime(m.end) : '');
      c.appendChild(h('p', 'note', '예정된 보강  ' + when));
    });
    return c;
  }

  function renderProgress(list) {
    if (!list || !list.length) return null;
    var c = card('교재 진도');
    list.forEach(function (p) {
      var wrap = h('div', 'book');
      var row = h('div', 'row');
      var label = has(p.unit_label) ? p.unit_label : 'Unit';
      add(row,
        h('span', 'title', p.textbook),
        h('span', 'count', num(p.current_unit) + ' / ' + num(p.total_units) + ' ' + label));
      add(wrap, row, bar(Number(p.current_unit), Number(p.total_units)));
      c.appendChild(wrap);
    });
    return c;
  }

  function lessonItem(l) {
    var item = h('article', 'lesson');
    var top = h('div', 'top');
    top.appendChild(h('span', 'date', fmtDate(l.date)));
    if (l.attendance) top.appendChild(h('span', 'badge ' + (ATTENDANCE_TONE[l.attendance] || 'mute'), l.attendance));
    if (l.homework) top.appendChild(h('span', 'badge ' + (HOMEWORK_TONE[l.homework] || 'mute'), '숙제 ' + l.homework));
    item.appendChild(top);

    if (has(l.textbook) || has(l.topic)) {
      var what = h('p', 'what');
      if (has(l.textbook)) {
        what.appendChild(h('b', '', l.textbook));
        if (l.from_unit !== null && l.to_unit !== null && l.from_unit !== undefined && l.to_unit !== undefined) {
          what.appendChild(document.createTextNode('  ' + num(l.from_unit) + ' → ' + num(l.to_unit)));
        }
      }
      if (has(l.topic)) {
        if (has(l.textbook)) what.appendChild(document.createElement('br'));
        what.appendChild(document.createTextNode(l.topic));
      }
      item.appendChild(what);
    }

    add(item,
      block('숙제', l.homework_note),
      block('선생님 코멘트', l.teacher_comment),
      block('다음 수업', l.next_plan));
    return item;
  }

  function renderLessons(list) {
    if (!list || !list.length) return null;
    var c = card('최근 수업');
    var FIRST = 5;
    list.slice(0, FIRST).forEach(function (l) { c.appendChild(lessonItem(l)); });
    if (list.length > FIRST) {
      var more = document.createElement('details');
      more.appendChild(h('summary', '', '이전 수업 ' + (list.length - FIRST) + '개 더 보기'));
      list.slice(FIRST).forEach(function (l) { more.appendChild(lessonItem(l)); });
      c.appendChild(more);
    }
    return c;
  }

  function renderTests(list) {
    if (!list || !list.length) return null;
    var c = card('시험 결과');
    list.forEach(function (t) {
      var wrap = h('div', 'test');
      var row = h('div', 'row');
      var name = h('span', 'name', has(t.title) ? t.title : t.kind);
      if (has(t.title) && has(t.kind)) name.appendChild(h('small', '', t.kind));
      name.appendChild(h('small', '', fmtDate(t.date)));

      var unit = has(t.unit) ? t.unit : '점';
      var score = (Number(t.max_score) === 100 && unit === '점')
        ? num(t.score) + '점'
        : num(t.score) + ' / ' + num(t.max_score) + unit;
      add(row, name, h('span', 'score', score));
      add(wrap, row, bar(Number(t.score), Number(t.max_score)));
      c.appendChild(wrap);
    });
    return c;
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

  function evalItem(e) {
    var item = h('article', 'eval');
    item.appendChild(h('h3', '', e.year + '년 ' + e.month + '월 평가'));

    var ratings = scoreGrid(e.ratings, RATING_LABELS);
    var attitude = scoreGrid(e.attitude, ATTITUDE_LABELS);
    if (ratings) add(item, h('p', 'subhead', '영역별 성취'), ratings);
    if (attitude) add(item, h('p', 'subhead', '수업 태도'), attitude);

    add(item,
      block('잘하고 있는 점', e.achievement),
      block('더 보완할 점', e.improvement),
      block('다음 달 계획', e.next_plan),
      block('학부모님께', e.parent_note));
    return item;
  }

  function renderEvaluations(list) {
    if (!list || !list.length) return null;
    var c = card('월간 평가');
    c.appendChild(evalItem(list[0]));
    if (list.length > 1) {
      var more = document.createElement('details');
      more.appendChild(h('summary', '', '이전 평가 보기'));
      list.slice(1).forEach(function (e) { more.appendChild(evalItem(e)); });
      c.appendChild(more);
    }
    return c;
  }

  function render(data) {
    root.textContent = '';
    add(root,
      renderHero(data),
      renderSummary(data),
      renderProgress(data.progress),
      renderLessons(data.lessons),
      renderTests(data.tests),
      renderEvaluations(data.evaluations));

    var hasAny = ['progress', 'lessons', 'tests', 'evaluations'].some(function (k) {
      return data[k] && data[k].length;
    });
    if (!hasAny) {
      var empty = card('아직 기록이 없어요');
      empty.appendChild(h('p', '', '수업 기록이 쌓이면 이곳에 표시됩니다.'));
      root.appendChild(empty);
    }

    root.appendChild(h('p', 'foot',
      '학생 전용 링크입니다. 다른 사람에게 전달하지 말아 주세요. 궁금한 점은 선생님께 문의해 주세요.'));
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
