alter table public.games enable row level security;
alter table public.games force row level security;

drop policy if exists "Users can insert their own games" on public.games;

create policy "Users can insert their own games"
  on public.games
  for insert
  to authenticated
  with check (user_id = auth.uid());
