alter table public.match_history
  add column if not exists opponent_type text,
  add column if not exists reiatsu_before integer,
  add column if not exists reiatsu_after integer,
  add column if not exists reiatsu_delta integer;

update public.match_history
set opponent_type = coalesce(opponent_type, game_mode)
where opponent_type is null;

alter table public.match_history
  alter column opponent_type set default 'ai';
