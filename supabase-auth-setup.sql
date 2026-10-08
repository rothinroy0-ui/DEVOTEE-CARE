-- ============================================================
-- ISKCON Devotee Care — AUTH & ROLE SYSTEM (Phase 1)
-- Project: nghiqkgdrqxupxxrrlwb
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this → Run
--   (Same one-time step as supabase-setup.sql for the parcels table.)
--
-- WHAT IT DOES:
--   1. Creates the `profiles` table (one row per login, holds the role)
--   2. Auto-creates a profile with role USER when a user signs up
--   3. Adds is_admin() helper used by all policies
--   4. Enables Row Level Security so the anon key CANNOT read/write
--      roles without a signed-in session (server-side enforcement)
--   5. Promotes your first admin (edit the email in step 5!)
-- ============================================================

-- ------------------------------------------------------------
-- 1) PROFILES TABLE
--    role ∈ SUPER_ADMIN | ADMIN | STAFF | USER | VIEWER
--    (skipped automatically if the table already exists)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique,
  role        text not null default 'USER'
              check (role in ('SUPER_ADMIN','ADMIN','STAFF','USER','VIEWER')),
  division    text default 'All',
  created_at  timestamptz default now()
);

-- ------------------------------------------------------------
-- 2) AUTO-CREATE PROFILE ON SIGN-UP (always role USER —
--    nobody can sign themselves up as an admin)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'USER')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3) is_admin() — used by every policy below (runs as definer,
--    so it can read profiles without tripping RLS recursion)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('SUPER_ADMIN', 'ADMIN')
  );
$$;

-- ------------------------------------------------------------
-- 4) ROW LEVEL SECURITY
--    · signed-in users can read their OWN profile
--    · admins can read/update EVERY profile (user management)
--    · profiles are only CREATED by the signup trigger above
--      → no client insert/delete policy on purpose
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "read own profile or admin reads all" on public.profiles;
create policy "read own profile or admin reads all"
  on public.profiles
  for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "admins update any profile" on public.profiles;
create policy "admins update any profile"
  on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 4b) BACKFILL — any login created BEFORE this script gets a
--     profile row too (default role USER, runs only once)
-- ------------------------------------------------------------
insert into public.profiles (id, email, role)
select u.id, u.email, 'USER'
from auth.users u
where u.email is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5) ★ PROMOTE YOUR FIRST ADMIN (EDIT THE EMAIL, THEN RUN) ★
-- ------------------------------------------------------------
update public.profiles
set role = 'SUPER_ADMIN'
where email = 'EDIT-ME@example.com';

-- ------------------------------------------------------------
-- 6) HOW TO ADD USERS (Phase 1 — no service key needed)
--    a) Supabase Dashboard → Authentication → Users → "Add user"
--       (email + password) → the trigger creates profile role=USER
--    b) They can log in immediately at your portal with the
--       User Panel (Dashboard / Birthday / Anniversary / Parcels,
--       read-only on the main database)
--    c) Promote them when needed (SQL Editor):
--       update public.profiles set role='ADMIN' where email='...';
--    Available roles: SUPER_ADMIN, ADMIN, STAFF, USER, VIEWER
-- ------------------------------------------------------------
