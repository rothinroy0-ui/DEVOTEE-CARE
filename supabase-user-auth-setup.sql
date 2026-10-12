-- ============================================================================
-- ISKCON DEVOTEE CARE — SUPABASE USER, PASSWORD & ROLE AUTHENTICATION SETUP
-- Supabase Project: nghiqkgdrqxupxxrrlwb
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor (https://supabase.com/dashboard/project/nghiqkgdrqxupxxrrlwb/sql)
--   2. Click "New query", paste this entire script, and click "Run" (▶)
--   3. Go to Authentication → Users → "Add user" to create your users!
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ROLE ENUM DEFINITION (Standalone statement)
--    Roles: SUPER_ADMIN, ADMIN, STAFF, USER, VIEWER
-- ----------------------------------------------------------------------------
alter type public.user_role_enum add value if not exists 'USER';

-- ----------------------------------------------------------------------------
-- 2) ENSURE COLUMNS EXIST (On both public.profiles and public.user_profiles)
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique,
  full_name   text,
  role        user_role_enum not null default 'VIEWER',
  division    text default 'All',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists division text default 'All';
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists division text default 'All';
alter table public.user_profiles add column if not exists updated_at timestamptz default now();

-- ----------------------------------------------------------------------------
-- 3) BULLETPROOF AUTO-CREATE PROFILE TRIGGER
--    Catches all exceptions so auth.users creation can NEVER fail
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_display_name text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  );

  v_role := upper(coalesce(
    new.raw_user_meta_data->>'role',
    new.raw_app_meta_data->>'role',
    'USER'
  ));
  if v_role not in ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER', 'VIEWER') then
    v_role := 'USER';
  end if;

  -- 3a. Save to public.user_profiles
  begin
    insert into public.user_profiles (id, email, full_name, role, division)
    values (
      new.id,
      new.email,
      v_display_name,
      v_role::public.user_role_enum,
      coalesce(new.raw_user_meta_data->>'division', 'All')
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = coalesce(excluded.full_name, user_profiles.full_name),
      updated_at = now();
  exception when others then
    -- Fallback to VIEWER if USER enum value is missing, never crash auth
    begin
      insert into public.user_profiles (id, email, full_name, role, division)
      values (
        new.id,
        new.email,
        v_display_name,
        'VIEWER'::public.user_role_enum,
        coalesce(new.raw_user_meta_data->>'division', 'All')
      )
      on conflict (id) do update set
        email = excluded.email,
        full_name = coalesce(excluded.full_name, user_profiles.full_name),
        updated_at = now();
    exception when others then
      raise warning 'user_profiles insert failed: %', sqlerrm;
    end;
  end;

  -- 3b. Sync into legacy public.profiles table
  begin
    insert into public.profiles (id, email, full_name, role, division)
    values (
      new.id,
      new.email,
      v_display_name,
      v_role,
      coalesce(new.raw_user_meta_data->>'division', 'All')
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = coalesce(excluded.full_name, profiles.full_name);
  exception when others then
    raise warning 'profiles sync failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- Connect trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop function if exists public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4) HELPER FUNCTIONS FOR ROLE-BASED ACCESS CONTROL (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and role in ('SUPER_ADMIN', 'ADMIN')
  ) or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('SUPER_ADMIN', 'ADMIN')
  );
$$;

create or replace function public.has_role(roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and role::text = any(roles)
  ) or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = any(roles)
  );
$$;

-- ----------------------------------------------------------------------------
-- 5) ROW LEVEL SECURITY (RLS) FOR USER PROFILES
-- ----------------------------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_policy" on public.user_profiles;
create policy "user_profiles_select_policy"
  on public.user_profiles
  for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "user_profiles_update_policy" on public.user_profiles;
create policy "user_profiles_update_policy"
  on public.user_profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6) BACKFILL: LINK ANY PRE-EXISTING USERS IN auth.users
-- ----------------------------------------------------------------------------
insert into public.user_profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'VIEWER'::user_role_enum
from auth.users u
where u.email is not null
  and not exists (select 1 from public.user_profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 7) HOW TO PROMOTE AN ACCOUNT TO ADMIN (EDIT EMAIL AND RUN AS NEEDED)
-- ----------------------------------------------------------------------------
-- update public.user_profiles
-- set role = 'SUPER_ADMIN'
-- where email = 'your-admin-email@example.com';
--
-- Available roles: 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER', 'VIEWER'
-- ============================================================================
