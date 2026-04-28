create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  moves text not null,
  result text not null,
  created_at timestamptz not null default now()
);

create index games_user_id_created_at_idx
  on public.games (user_id, created_at desc);

alter table public.games enable row level security;

create policy "Users can insert their own games"
  on public.games
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read their own games"
  on public.games
  for select
  to authenticated
  using (auth.uid() = user_id);
