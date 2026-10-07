-- ============================================================================
-- ISKCON Durgapur — Devotee Care Portal
-- SUPABASE SETUP (run ONCE)
--
-- How to run:
--   1. Open https://supabase.com → project: nghiqkgdrqxupxxrrlwb
--   2. SQL Editor → New query → paste everything below → Run
--   3. Re-open the portal → the manual "Cloud Sync" button will then
--      push every local parcel to the live database.
--
-- What this creates:
--   • public.parcels  (the cloud parcel table — required for live sync)
--   • indexes + updated_at trigger
--   • Row Level Security so the portal can read/write parcels
--   • Realtime broadcast so every open session sees changes instantly
--   • (Optional) devotee write policies — enable ONLY if you want the
--     portal to seed the cloud `devotees` table from the master list.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PARCELS TABLE
--    Columns mirror the fields the portal pushes (see toSupabaseParcel).
-- ----------------------------------------------------------------------------
create table if not exists public.parcels (
  id text primary key,
  devotee_id text,
  devotee_name text,
  spiritual_name text,
  legal_name text,
  phone text,
  address text,
  city text,
  pincode text,
  address_verified text,
  status text default 'Packed',
  event_type text,
  courier_partner text,
  courier_tracking_no text,
  tracking_id text,
  delivery_mode text,
  pre_calling text,
  post_calling text,
  booking_date text,
  dispatch_date text,
  delivery_date text,
  expected_delivery_date text,
  delivered boolean default false,
  delivered_at text,
  remarks text,
  raw_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 2) INDEXES (fast lookups: search by devotee, tracking no, status, mode)
-- ----------------------------------------------------------------------------
create index if not exists parcels_devotee_id_idx on public.parcels (devotee_id);
create index if not exists parcels_courier_tracking_no_idx on public.parcels (courier_tracking_no);
create index if not exists parcels_tracking_id_idx on public.parcels (tracking_id);
create index if not exists parcels_status_idx on public.parcels (status);
create index if not exists parcels_delivery_mode_idx on public.parcels (delivery_mode);

-- ----------------------------------------------------------------------------
-- 3) updated_at TRIGGER
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists parcels_updated_at on public.parcels;
create trigger parcels_updated_at
  before update on public.parcels
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) ROW LEVEL SECURITY
--    The portal currently talks to Supabase with the public (anon) key for
--    parcels, so deliveries need anon read+write policies to work live.
--    TODO (security hardening): switch the client to the signed-in session
--    and tighten these to the `authenticated` role only.
-- ----------------------------------------------------------------------------
alter table public.parcels enable row level security;

drop policy if exists "parcels_anon_select" on public.parcels;
create policy "parcels_anon_select" on public.parcels
  for select using (true);

drop policy if exists "parcels_anon_insert" on public.parcels;
create policy "parcels_anon_insert" on public.parcels
  for insert with check (true);

drop policy if exists "parcels_anon_update" on public.parcels;
create policy "parcels_anon_update" on public.parcels
  for update using (true) with check (true);

drop policy if exists "parcels_anon_delete" on public.parcels;
create policy "parcels_anon_delete" on public.parcels
  for delete using (true);

-- Signed-in users also get full access (future-proofing / admin roles)
drop policy if exists "parcels_auth_select" on public.parcels;
create policy "parcels_auth_select" on public.parcels
  for select to authenticated using (true);

drop policy if exists "parcels_auth_insert" on public.parcels;
create policy "parcels_auth_insert" on public.parcels
  for insert to authenticated with check (true);

drop policy if exists "parcels_auth_update" on public.parcels;
create policy "parcels_auth_update" on public.parcels
  for update to authenticated using (true) with check (true);

drop policy if exists "parcels_auth_delete" on public.parcels;
create policy "parcels_auth_delete" on public.parcels
  for delete to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 5) REALTIME — broadcast parcel changes to every open portal session
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parcels'
  ) then
    alter publication supabase_realtime add table public.parcels;
  end if;
end $$;

-- ============================================================================
-- OPTIONAL SECTION — CLOUD MASTER DEVOTEE SEED
--
-- The portal ships with all 824 devotee records bundled (devotees_data.js),
-- so every site visitor already has the full directory locally. Pushing them
-- to the cloud is only needed if you want a single source of truth in the
-- database. The portal will attempt this during "Cloud Sync" — but only if
-- the RLS policies below exist (the table currently allows reads only).
--
-- ⚠️  Only run this if you WANT the portal's master list to be written to
--     the `devotees` table. It is optional; skip it and the portal keeps
--     working exactly as before (bundled data as fallback).
-- ----------------------------------------------------------------------------
-- create policy "devotees_anon_insert" on public.devotees
--   for insert to anon with check (true);
--
-- create policy "devotees_anon_update" on public.devotees
--   for update to anon using (true) with check (true);
--
-- create policy "devotees_auth_insert" on public.devotees
--   for insert to authenticated with check (true);
--
-- create policy "devotees_auth_update" on public.devotees
--   for update to authenticated using (true) with check (true);
-- ============================================================================

-- ✅ Done — verify with:  select count(*) from public.parcels;