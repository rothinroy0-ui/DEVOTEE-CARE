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
--   3. Adds is_admin() / has_role() helpers used by all policies
--   4. Enables Row Level Security so the anon key CANNOT read/write
--      roles without a signed-in session (server-side enforcement)
--   5. Promotes your first admin (edit the email in step 5!)
--   6. Migrates existing logins into profiles (step 4b)
--   7. Protects the data tables (devotees / parcels) with role-based
--      RLS — signed-in sevaks read, Admin/Staff write, Admin deletes
--
-- RECOMMENDED ORDER: run supabase-setup.sql first (creates parcels),
--   then this file. Both are safe to re-run; if you run this one first,
--   run it again afterwards so step 7 can tighten the parcels table.
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

-- ============================================================
-- 7) DATA TABLE PROTECTION (RLS) — server-side authorization
--    The anon key is public, so without this ANY visitor could
--    read/write the tables. This section:
--      · lets every SIGNED-IN sevak read devotees + parcels
--      · lets Admin/Staff write them (User may only create parcels)
--      · lets only Admin/Super Admin delete devotees
--    Safe to re-run. Skips tables that don't exist yet — so if you
--    run this BEFORE supabase-setup.sql, just run this file again
--    after the parcels table is created.
-- ============================================================

-- Role check helper (array form of is_admin)
create or replace function public.has_role(roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = any(roles)
  );
$$;

do $$
declare
  t        text;
  v_ins    text;
  v_upd    text;
  v_del    text;
begin
  foreach t in array array['devotees', 'parcels'] loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      -- Permission sets per table
      if t = 'parcels' then
        v_ins := 'array[''SUPER_ADMIN'',''ADMIN'',''STAFF'',''USER'']'; -- User may submit parcels
        v_upd := 'array[''SUPER_ADMIN'',''ADMIN'',''STAFF'']';
        v_del := 'array[''SUPER_ADMIN'',''ADMIN'',''STAFF'']';
      else
        v_ins := 'array[''SUPER_ADMIN'',''ADMIN'',''STAFF'']';
        v_upd := 'array[''SUPER_ADMIN'',''ADMIN'',''STAFF'']';
        v_del := 'array[''SUPER_ADMIN'',''ADMIN'']';
      end if;

      execute format('alter table public.%I enable row level security', t);

      -- READ — any signed-in account
      execute format('drop policy if exists %I on public.%I', t || '_auth_select', t);
      execute format('create policy %I on public.%I for select to authenticated using (true)',
                     t || '_auth_select', t);

      -- INSERT
      execute format('drop policy if exists %I on public.%I', t || '_auth_insert', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(%s))',
                     t || '_auth_insert', t, v_ins);

      -- UPDATE
      execute format('drop policy if exists %I on public.%I', t || '_auth_update', t);
      execute format('create policy %I on public.%I for update to authenticated using (public.has_role(%s)) with check (public.has_role(%s))',
                     t || '_auth_update', t, v_upd, v_upd);

      -- DELETE
      execute format('drop policy if exists %I on public.%I', t || '_auth_delete', t);
      execute format('create policy %I on public.%I for delete to authenticated using (public.has_role(%s))',
                     t || '_auth_delete', t, v_del);

      -- Close any leftover wide-open anon policies from earlier setup
      execute format('drop policy if exists %I on public.%I', t || '_anon_select', t);
      execute format('drop policy if exists %I on public.%I', t || '_anon_insert', t);
      execute format('drop policy if exists %I on public.%I', t || '_anon_update', t);
      execute format('drop policy if exists %I on public.%I', t || '_anon_delete', t);

      raise notice 'RLS role policies applied on public.%', t;
    else
      raise notice 'public.% does not exist yet — skipped (re-run this file after creating it)', t;
    end if;
  end loop;
end $$;
-- ============================================================
