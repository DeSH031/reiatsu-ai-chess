alter table public.games enable row level security;
alter table public.games force row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'Users can update their own games'
  ) then
    create policy "Users can update their own games"
      on public.games
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'games'
      and policyname = 'Users can delete their own games'
  ) then
    create policy "Users can delete their own games"
      on public.games
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;
