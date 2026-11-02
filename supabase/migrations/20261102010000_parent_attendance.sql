-- get_parent_view 에 '월별 출결 보기'용 attendance 목록 추가
--  * 최근 12개월(이번 달 포함)의 수업 날짜 + 출결만 내려준다.
--  * 기존 키(month_summary 등)는 그대로 유지한다.
--  * create or replace 는 기존 실행 권한(anon/authenticated)을 유지하지만,
--    안전하게 마지막에 권한을 다시 명시한다.

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

    -- 월별 출결 보기용: 최근 12개월(이번 달 포함), 날짜 + 출결만
    'attendance', (
      select coalesce(jsonb_agg(s.j order by s.lesson_date desc, s.created_at desc), '[]'::jsonb)
        from (
          select l.lesson_date, l.created_at,
                 jsonb_build_object(
                   'date',       l.lesson_date,
                   'attendance', l.attendance
                 ) as j
            from public.lessons l
           where l.student_id = v_student.id
             and l.lesson_date >= (date_trunc('month', v_today) - interval '11 months')::date
           order by l.lesson_date desc, l.created_at desc
           limit 600
        ) s
    ),

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

revoke execute on function public.get_parent_view(text) from public, anon, authenticated;
grant  execute on function public.get_parent_view(text) to anon, authenticated;
