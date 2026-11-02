-- 학부모 확인용 링크(토큰) + 조회 RPC
--
-- 설계 원칙
--  * 토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다.
--  * 학부모 화면(anon)은 테이블을 직접 읽지 못하고, get_parent_view() 하나만 호출한다.
--  * 응답에는 학부모에게 보여줄 항목만 담는다. (lessons.memo, students.memo,
--    recommendations, writings 등 내부 자료는 제외)
--  * 링크 발급/폐기는 소유자(로그인한 원장) 또는 SQL 에디터(postgres)에서만 가능하다.

-- 1) 링크 테이블 ---------------------------------------------------------------
create table if not exists public.parent_links (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id),
  student_id   uuid not null references public.students(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

comment on table public.parent_links is
  '학부모 확인용 링크. token_hash는 토큰의 SHA-256(hex). 원문은 발급 시 한 번만 반환된다.';

create index if not exists parent_links_active_student_idx
  on public.parent_links (student_id)
  where revoked_at is null;

alter table public.parent_links enable row level security;

-- 클라이언트는 자기 소유 링크의 "목록 조회"만 가능. 생성/수정은 RPC로만 한다.
revoke all on public.parent_links from anon, authenticated;
grant select on public.parent_links to authenticated;

drop policy if exists "owner reads own parent links" on public.parent_links;
create policy "owner reads own parent links"
  on public.parent_links
  for select
  to authenticated
  using (owner = (select auth.uid()));

-- 2) 링크 발급 (기존 링크는 자동 폐기 = 재발급) --------------------------------
create or replace function public.create_parent_link(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_token text;
begin
  select owner into v_owner from public.students where id = p_student_id;
  if v_owner is null then
    raise exception 'student not found';
  end if;

  -- 로그인한 사용자는 자기 학생만. (auth.uid()가 null이면 SQL 에디터/service_role 호출)
  if v_uid is not null and v_uid <> v_owner then
    raise exception 'not allowed';
  end if;

  update public.parent_links
     set revoked_at = now()
   where student_id = p_student_id
     and revoked_at is null;

  -- 256비트 난수 → URL 안전 base64 (43자)
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.parent_links (owner, student_id, token_hash)
  values (v_owner, p_student_id, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  return v_token;
end;
$$;

-- 3) 링크 폐기 -----------------------------------------------------------------
create or replace function public.revoke_parent_link(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  select owner into v_owner from public.students where id = p_student_id;
  if v_owner is null then
    raise exception 'student not found';
  end if;
  if v_uid is not null and v_uid <> v_owner then
    raise exception 'not allowed';
  end if;

  update public.parent_links
     set revoked_at = now()
   where student_id = p_student_id
     and revoked_at is null;
end;
$$;

-- 4) 학부모 화면용 조회 (토큰 검증 후 필요한 필드만 반환) ----------------------
create or replace function public.get_parent_view(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link    public.parent_links%rowtype;
  v_student public.students%rowtype;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_result  jsonb;
begin
  -- 형식이 이상한 입력은 DB를 조회하지 않고 바로 거절
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    return null;
  end if;

  select * into v_link
    from public.parent_links
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and revoked_at is null;
  if not found then
    return null;
  end if;

  -- 퇴원(active = false) 학생은 접근 차단
  select * into v_student from public.students where id = v_link.student_id;
  if not found or v_student.active is not true then
    return null;
  end if;

  update public.parent_links set last_used_at = now() where id = v_link.id;

  select jsonb_build_object(
    'generated_at', now(),

    'student', jsonb_build_object(
      'name',  v_student.name,
      'grade', v_student.grade
    ),

    -- 이번 달 출결 요약 (예: {"출석": 6, "결석": 1})
    'month_summary', (
      select coalesce(jsonb_object_agg(a.attendance, a.c), '{}'::jsonb)
        from (
          select l.attendance, count(*) as c
            from public.lessons l
           where l.student_id = v_student.id
             and l.lesson_date >= date_trunc('month', v_today)::date
           group by l.attendance
        ) a
    ),

    -- 교재별 진도
    'progress', (
      select coalesce(jsonb_agg(s.j order by s.updated_at desc), '[]'::jsonb)
        from (
          select p.updated_at,
                 jsonb_build_object(
                   'textbook',     t.title,
                   'current_unit', p.current_unit,
                   'total_units',  t.total_units,
                   'unit_label',   t.unit_label,
                   'updated_at',   p.updated_at
                 ) as j
            from public.progress p
            join public.textbooks t on t.id = p.textbook_id
           where p.student_id = v_student.id
           order by p.updated_at desc
           limit 8
        ) s
    ),

    -- 최근 수업 12회 (lessons.memo 는 내부 메모라 제외)
    'lessons', (
      select coalesce(jsonb_agg(s.j order by s.lesson_date desc, s.created_at desc), '[]'::jsonb)
        from (
          select l.lesson_date, l.created_at,
                 jsonb_build_object(
                   'date',            l.lesson_date,
                   'attendance',      l.attendance,
                   'homework',        l.homework,
                   'homework_note',   l.homework_note,
                   'textbook',        t.title,
                   'from_unit',       l.from_unit,
                   'to_unit',         l.to_unit,
                   'topic',           l.topic,
                   'teacher_comment', l.teacher_comment,
                   'next_plan',       l.next_plan
                 ) as j
            from public.lessons l
            left join public.textbooks t on t.id = l.textbook_id
           where l.student_id = v_student.id
           order by l.lesson_date desc, l.created_at desc
           limit 12
        ) s
    ),

    -- 최근 시험 15개
    'tests', (
      select coalesce(jsonb_agg(s.j order by s.test_date desc, s.created_at desc), '[]'::jsonb)
        from (
          select x.test_date, x.created_at,
                 jsonb_build_object(
                   'date',      x.test_date,
                   'kind',      x.kind,
                   'title',     x.title,
                   'score',     x.score,
                   'max_score', x.max_score,
                   'unit',      coalesce(k.unit, '점')
                 ) as j
            from public.tests x
            left join public.test_kinds k
              on k.owner = x.owner and k.name = x.kind
           where x.student_id = v_student.id
           order by x.test_date desc, x.created_at desc
           limit 15
        ) s
    ),

    -- 예정된 보강
    'makeups', (
      select coalesce(jsonb_agg(s.j order by s.planned_date), '[]'::jsonb)
        from (
          select m.planned_date,
                 jsonb_build_object(
                   'date',  m.planned_date,
                   'start', m.planned_start,
                   'end',   m.planned_end
                 ) as j
            from public.makeups m
           where m.student_id = v_student.id
             and m.status = '예정'
             and m.planned_date is not null
             and m.planned_date >= v_today
           order by m.planned_date
           limit 5
        ) s
    ),

    -- 월간 평가: 상태가 '완료'인 것만, 최근 3개월
    'evaluations', (
      select coalesce(jsonb_agg(s.j order by s.year desc, s.month desc), '[]'::jsonb)
        from (
          select e.year, e.month,
                 jsonb_build_object(
                   'year',        e.year,
                   'month',       e.month,
                   'ratings',     e.ratings,
                   'attitude',    e.attitude,
                   'achievement', e.achievement,
                   'improvement', e.improvement,
                   'next_plan',   e.next_plan,
                   'parent_note', e.parent_note
                 ) as j
            from public.monthly_evaluations e
           where e.student_id = v_student.id
             and e.status = '완료'
           order by e.year desc, e.month desc
           limit 3
        ) s
    )
  ) into v_result;

  return v_result;
end;
$$;

-- 5) 실행 권한 -------------------------------------------------------------------
-- 함수는 기본적으로 PUBLIC/anon에 실행 권한이 열려 있으므로 먼저 모두 회수한다.
revoke execute on function public.create_parent_link(uuid)  from public, anon, authenticated;
revoke execute on function public.revoke_parent_link(uuid)  from public, anon, authenticated;
revoke execute on function public.get_parent_view(text)     from public, anon, authenticated;

-- 발급/폐기: 로그인한 원장만
grant execute on function public.create_parent_link(uuid)  to authenticated;
grant execute on function public.revoke_parent_link(uuid)  to authenticated;

-- 조회: 학부모(비로그인)도 호출 가능. 토큰이 맞아야만 데이터가 나온다.
grant execute on function public.get_parent_view(text)     to anon, authenticated;
