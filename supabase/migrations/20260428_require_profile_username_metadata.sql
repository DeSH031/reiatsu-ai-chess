create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_username text;
begin
  resolved_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  if resolved_username is null then
    raise exception 'Username is required for profile creation';
  end if;

  insert into public.profiles (id, username)
  values (new.id, resolved_username)
  on conflict (id) do nothing;

  return new;
end;
$$;
