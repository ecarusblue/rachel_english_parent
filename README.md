# rachel_english_parent

Rachel English 학부모 확인용 페이지. 학생별 전용 링크로 접속하면 자기 아이의 진도·수업 기록·시험·월간 평가를 **읽기 전용**으로 볼 수 있습니다.

- 화면: Firebase Hosting (정적 파일, 무료 Spark 플랜)
- 데이터: Supabase `rachel_english` 프로젝트 (진도표 앱과 같은 DB)
- 접근 방식: 학생별 추측 불가능한 토큰이 들어간 링크 (로그인 없음)

```
public/                       Firebase Hosting이 서빙하는 파일
  index.html  style.css  app.js  config.js  robots.txt
supabase/migrations/          DB에 적용한 SQL (parent_links, RPC 3종)
firebase.json                 호스팅 설정 + 보안 헤더(CSP, noindex 등)
```

## 동작 방식

1. 원장이 학생별 링크를 발급하면 DB에는 토큰의 **SHA-256 해시만** 저장됩니다. 토큰 원문은 발급 순간에만 보입니다.
2. 링크는 `https://<호스팅 주소>/#t=<토큰>` 형태입니다. 토큰이 `#` 뒤에 있어서 서버 로그나 Referer로 전송되지 않습니다.
3. 화면은 테이블을 직접 읽지 않고 `get_parent_view(토큰)` 함수 하나만 호출합니다. 토큰이 맞을 때만 그 학생의 데이터가 반환됩니다.
4. 학부모는 로그인이 필요 없습니다. 링크가 유출되면 해당 학생 링크만 재발급하면 됩니다.

## 학부모에게 보이는 항목

| 구분 | 노출되는 항목 |
|---|---|
| 학생 | 이름, 학년 |
| 출결 | 최근 12개월 월별 출석/지각/결석/보강 횟수와 날짜별 출결 (‹ › 버튼으로 월 이동), 예정된 보강 일정(이번 달) |
| 진도 | 교재명, 현재 단원, 전체 단원 |
| 수업(최근 12회) | 날짜, 출결, 숙제 상태, 숙제 내용, 교재·범위, 주제, 선생님 코멘트, 다음 수업 계획 |
| 시험(최근 15개) | 날짜, 종류, 제목, 점수 |
| 월간 평가(최근 3개월, 상태가 `완료`인 것만) | 영역별 성취, 수업 태도, 잘하는 점, 보완할 점, 다음 달 계획, 학부모님께 |

**노출되지 않는 항목**: 수업 메모(`lessons.memo`), 학생 메모(`students.memo`), AI 추천(`recommendations`), 라이팅 첨삭 원문(`writings`), 다른 학생 정보, `AI 초안`/`작성중` 상태의 평가.

노출 범위를 바꾸려면 `get_parent_view` 함수를 수정하는 새 마이그레이션을 추가하세요.
퇴원 처리(`students.active = false`)된 학생의 링크는 자동으로 막힙니다.

## 링크 발급 / 재발급 / 폐기

Supabase 대시보드의 SQL Editor에서 실행합니다.

```sql
-- 활동 중인 학생 전체의 링크 한 번에 발급 (기존 링크는 자동 폐기)
select s.name, public.create_parent_link(s.id) as token
from public.students s
where s.active
order by s.name;

-- 한 명만 재발급 (링크가 유출됐거나 분실했을 때)
select public.create_parent_link(id) as token
from public.students
where name = '학생이름';

-- 한 명의 링크 폐기
select public.revoke_parent_link(id)
from public.students
where name = '학생이름';
```

받은 토큰을 아래처럼 붙여서 카카오톡으로 보내세요.

```
https://<호스팅 주소>/#t=<토큰>
```

주의: 토큰은 다시 조회할 수 없습니다. 놓쳤다면 재발급하세요. 각 링크의 마지막 접속 시각은 `parent_links.last_used_at`에서 확인할 수 있습니다.

```sql
select s.name, l.created_at, l.last_used_at
from public.parent_links l
join public.students s on s.id = l.student_id
where l.revoked_at is null
order by s.name;
```

## 배포 (Firebase Hosting)

```bash
npm i -g firebase-tools
firebase login
firebase use --add          # Firebase 프로젝트 선택 (처음 한 번)
firebase deploy --only hosting
```

배포 후 나온 주소(`https://<프로젝트>.web.app`)가 링크의 앞부분이 됩니다.

배포 전에 한 가지 확인하세요. `firebase.json`의 CSP는 Supabase 주소 `https://gfxchylhbljnnpqfojtt.supabase.co`만 허용합니다. Supabase 프로젝트를 바꾸면 `firebase.json`의 `connect-src`와 `public/config.js`를 함께 수정해야 합니다.

## 보안 메모

- `config.js`의 키는 publishable(공개용) 키입니다. 접근 제어는 키가 아니라 토큰 검증이 담당합니다. `service_role` 키는 절대 넣지 마세요.
- 토큰은 256비트 난수라서 무작위 대입으로 맞출 수 없습니다.
- `parent_links` 테이블은 RLS가 켜져 있고, 비로그인 사용자는 읽기·쓰기가 모두 막혀 있습니다.
- 페이지는 `noindex` 메타·헤더와 `robots.txt`로 검색 노출을 막고, `Referrer-Policy: no-referrer`를 사용합니다.

## 디자인 메모

- "알림장" 스타일: 줄 노트 + 손글씨 코멘트, 출석부 기호(○ 출석 / △ 지각 / ✕ 결석 / ◎ 보강), 교재 진도 도장판(단원 60개 초과 시 막대), 숙제·다음 수업 형광펜 강조.
- 손글씨체 Gaegu(SIL OFL)는 `public/fonts/`에 직접 포함해 외부 요청 없이 로드합니다 (CSP `font-src 'self'`). 본문은 시스템 글꼴입니다.
- 최근 수업 1건은 맨 위에 크게, 나머지는 "지난 수업"에 접어서 보여줍니다.
