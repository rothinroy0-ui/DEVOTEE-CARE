-- ============================================================================
-- ISKCON DEVOTEE CARE — LOGIN ID RESOLVER FUNCTION
-- Supabase Project: nghiqkgdrqxupxxrrlwb
--
-- PURPOSE:
--   Allows devotees to log in using EITHER their:
--     1. Full registered Email Address (e.g. rothinroy0@gmail.com, devotee@iskcon.org)
--     2. Login ID / Username (e.g. rothinroy0, sangita, admin, dev-001)
--
-- HOW IT WORKS:
--   A security definer function that securely matches a login identifier against:
--     - email prefix: split_part(email, '@', 1)
--     - full_name
--     - custom login_id column if present
--   Returns the registered email so Supabase Auth can verify the password.
--
-- HOW TO RUN:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Click "New query", paste this entire script, and click "Run" (▶)
-- ============================================================================

-- STEP 1: Add login_id column to user_profiles if not present
alter table public.user_profiles add column if not exists login_id text;
alter table public.profiles add column if not exists login_id text;

-- STEP 2: Create resolution function
create or replace function public.resolve_login_email(p_login_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_clean text;
begin
  v_clean := lower(trim(coalesce(p_login_id, '')));
  
  if v_clean = '' then
    return null;
  end if;

  -- 1. If user already entered a full email, return as-is
  if v_clean like '%@%' then
    return v_clean;
  end if;

  -- 2. Exact match on explicit login_id column in user_profiles
  select email into v_email
  from public.user_profiles
  where lower(coalesce(login_id, '')) = v_clean
    and email is not null
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 3. Match on email prefix in user_profiles (e.g. 'rothinroy0' matches 'rothinroy0@gmail.com')
  select email into v_email
  from public.user_profiles
  where lower(split_part(email, '@', 1)) = v_clean
    and email is not null
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 4. Match on full_name in user_profiles
  select email into v_email
  from public.user_profiles
  where lower(replace(full_name, ' ', '')) = lower(replace(v_clean, ' ', ''))
    and email is not null
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 5. Fallback search in public.profiles table if present
  begin
    select email into v_email
    from public.profiles
    where lower(split_part(email, '@', 1)) = v_clean
      and email is not null
    limit 1;

    if v_email is not null then
      return v_email;
    end if;
  exception when others then
    -- profiles table may not exist, safely ignore
    null;
  end;

  return null;
end;
$$;

-- STEP 3: Grant public execution access for authentication
grant execute on function public.resolve_login_email(text) to anon, authenticated;

comment on function public.resolve_login_email(text) is 'Resolves a Login ID / username to registered email for devotee login';
