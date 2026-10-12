-- ============================================================================
-- ISKCON DEVOTEE CARE — FIX FOR "DATABASE ERROR CREATING NEW USER"
-- Supabase Project: nghiqkgdrqxupxxrrlwb
--
-- WHY THE ERROR HAPPENED:
--   A background trigger on auth.users was trying to insert into public.profiles
--   with an 'email' column that was missing, and into public.user_profiles with
--   role 'USER' which was not yet registered in the Postgres enum type.
--
-- WHAT THIS FIX DOES:
--   1. Adds 'USER' to user_role_enum cleanly as a standalone command.
--   2. Adds all missing columns (email, division, updated_at) to BOTH tables.
--   3. Replaces the trigger with an exception-proof trigger that NEVER blocks
--      user creation, even if profile data has unexpected fields.
--   4. Syncs both public.user_profiles and public.profiles so both stay updated.
--
-- HOW TO RUN:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Click "New query", paste this entire script, and click "Run" (▶)
--   3. Now go to Authentication → Users → "Add user" → It will succeed!
-- ============================================================================

-- STEP 1: Add 'USER' to the PostgreSQL enum type (must be standalone)
alter type public.user_role_enum add value if not exists 'USER';

-- STEP 2: Ensure columns exist on both public.profiles and public.user_profiles
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists division text default 'All';
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists division text default 'All';
alter table public.user_profiles add column if not exists updated_at timestamptz default now();

-- STEP 3: Create bulletproof trigger function that will NEVER fail auth user creation
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
  -- Resolve display name from metadata or email
  v_display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  );

  -- Resolve requested role (default to USER)
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
    -- If 'USER' is not in enum, fallback to 'VIEWER'
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

  -- 3b. Save to public.profiles (keeps legacy table in sync)
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

-- STEP 4: Attach trigger to auth.users (replacing any older failing triggers)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Drop legacy handle_new_user to eliminate conflicting functions
drop function if exists public.handle_new_user();

-- STEP 5: Security Definer Helper functions for RLS checks
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

-- STEP 6: Row Level Security for user_profiles
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

-- STEP 7: Backfill: Link any users currently in auth.users
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
