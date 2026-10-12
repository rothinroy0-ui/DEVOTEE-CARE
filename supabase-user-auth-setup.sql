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
-- 1) ROLE ENUM DEFINITION
--    Roles: SUPER_ADMIN, ADMIN, STAFF, USER, VIEWER
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role_enum') then
    create type user_role_enum as enum ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER', 'VIEWER');
  else
    -- Add any missing enum values safely
    begin alter type user_role_enum add value if not exists 'USER'; exception when others then null; end;
    begin alter type user_role_enum add value if not exists 'SUPER_ADMIN'; exception when others then null; end;
    begin alter type user_role_enum add value if not exists 'ADMIN'; exception when others then null; end;
    begin alter type user_role_enum add value if not exists 'STAFF'; exception when others then null; end;
    begin alter type user_role_enum add value if not exists 'VIEWER'; exception when others then null; end;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) USER PROFILES TABLE (The SQL User & Role Model)
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique,
  full_name   text,
  role        user_role_enum not null default 'USER',
  division    text default 'All',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Ensure all expected columns exist if the table was created previously
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'division') then
    alter table public.user_profiles add column division text default 'All';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'full_name') then
    alter table public.user_profiles add column full_name text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'updated_at') then
    alter table public.user_profiles add column updated_at timestamptz default now();
  end if;
end $$;

-- Optional view: alias public.profiles to public.user_profiles for backward compatibility
create or replace view public.profiles as
  select id, email, full_name, role::text as role, division, created_at
  from public.user_profiles;

-- ----------------------------------------------------------------------------
-- 3) AUTO-CREATE PROFILE ON SIGN-UP OR USER CREATION
--    Whenever a user is added to auth.users (via Dashboard or API),
--    this trigger automatically populates public.user_profiles!
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role_enum := 'USER';
  v_meta_role text;
begin
  v_meta_role := upper(coalesce(new.raw_user_meta_data->>'role', new.raw_app_meta_data->>'role', ''));
  if v_meta_role in ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'VIEWER') then
    v_role := v_meta_role::user_role_enum;
  end if;

  insert into public.user_profiles (id, email, full_name, role, division)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    v_role,
    coalesce(new.raw_user_meta_data->>'division', 'All')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, user_profiles.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

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
  );
$$;

-- ----------------------------------------------------------------------------
-- 5) ROW LEVEL SECURITY (RLS) FOR USER PROFILES
-- ----------------------------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists "read own profile or admin reads all" on public.user_profiles;
create policy "read own profile or admin reads all"
  on public.user_profiles
  for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "admins update any profile" on public.user_profiles;
create policy "admins update any profile"
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
  'USER'::user_role_enum
from auth.users u
where u.email is not null
  and not exists (select 1 from public.user_profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 7) HOW TO PROMOTE AN ACCOUNT TO ADMIN (EDIT EMAIL AND RUN AS NEEDED)
-- ----------------------------------------------------------------------------
-- update public.user_profiles
-- set role = 'ADMIN'
-- where email = 'your-admin-email@example.com';
--
-- Available roles: 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER', 'VIEWER'
-- ============================================================================
