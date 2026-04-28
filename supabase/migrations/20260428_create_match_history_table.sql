create table if not exists public.match_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  final_fen text not null,
  move_history jsonb not null default '[]'::jsonb,
  game_mode text not null,
  result text not null,
  winner text,
  player_color text,
  ai_difficulty text,
  reiatsu_change integer,
  created_at timestamptz not null default now()
);

create index if not exists match_history_user_id_created_at_idx
  on public.match_history (user_id, created_at desc);

alter table public.match_history enable row level security;

create policy "Users can select their own match history"
  on public.match_history
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own match history"
  on public.match_history
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own match history"
  on public.match_history
  for delete
  to authenticated
  using (auth.uid() = user_id);
