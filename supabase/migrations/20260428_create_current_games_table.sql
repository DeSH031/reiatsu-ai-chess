create table if not exists public.current_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  fen text not null,
  move_history jsonb,
  game_mode text,
  updated_at timestamptz not null default now()
);

create index if not exists current_games_user_id_idx
  on public.current_games (user_id);

alter table public.current_games enable row level security;

create policy "Users can upsert their own current game"
  on public.current_games
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own current game"
  on public.current_games
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read their own current game"
  on public.current_games
  for select
  to authenticated
  using (auth.uid() = user_id);
