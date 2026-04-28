alter table public.match_history
add column if not exists coach_summary jsonb;
