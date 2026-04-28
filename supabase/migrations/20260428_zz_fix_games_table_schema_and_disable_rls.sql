create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  moves text not null,
  result text not null,
  created_at timestamptz not null default now()
);

alter table public.games
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists moves text,
  add column if not exists result text,
  add column if not exists created_at timestamptz default now();

do $$
declare
  moves_udt text;
begin
  select udt_name
  into moves_udt
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'games'
    and column_name = 'moves';

  if moves_udt = '_text' then
    execute 'alter table public.games alter column moves type text using to_json(moves)::text';
  elsif moves_udt in ('json', 'jsonb') then
    execute 'alter table public.games alter column moves type text using moves::text';
  elsif moves_udt is not null and moves_udt <> 'text' then
    execute 'alter table public.games alter column moves type text using moves::text';
  end if;
end
$$;

update public.games
set id = gen_random_uuid()
where id is null;

update public.games
set moves = '[]'
where moves is null;

update public.games
set result = 'unknown'
where result is null;

update public.games
set created_at = now()
where created_at is null;

alter table public.games
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column user_id type uuid using user_id::uuid,
  alter column user_id set not null,
  alter column moves type text using moves::text,
  alter column moves set not null,
  alter column result type text using result::text,
  alter column result set not null,
  alter column created_at type timestamptz using created_at::timestamptz,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.games'::regclass
      and contype = 'p'
  ) then
    alter table public.games add primary key (id);
  end if;
end
$$;

create index if not exists games_user_id_created_at_idx
  on public.games (user_id, created_at desc);

alter table public.games disable row level security;
