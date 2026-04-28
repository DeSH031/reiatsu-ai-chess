create table if not exists public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_reiatsu integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_stats enable row level security;

create policy "Users can select their own user stats"
  on public.user_stats
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own user stats"
  on public.user_stats
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own user stats"
  on public.user_stats
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
