do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'moves'
      and udt_name <> 'jsonb'
  ) then
    alter table public.games
      alter column moves type jsonb
      using to_jsonb(moves);
  end if;
end
$$;
