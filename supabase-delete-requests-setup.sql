-- ============================================================================
-- ISKCON DEVOTEE CARE — ROLE PERMISSION & DELETION REQUEST SYSTEM SETUP
-- Supabase Project: nghiqkgdrqxupxxrrlwb
--
-- PURPOSE:
--   1. Create `public.delete_requests` table so Staff can submit deletion requests.
--   2. Strict Row Level Security (RLS): ONLY Super Admin can DELETE devotees & parcels.
--   3. Staff can only INSERT requests and view their own requests.
--   4. Super Admin can review, approve, and reject deletion requests.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Click "New query", paste this script, and click "Run" (▶)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) HELPER: is_super_admin() (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and role = 'SUPER_ADMIN'
  ) or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'SUPER_ADMIN'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2) CREATE delete_requests TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.delete_requests (
  id                  uuid primary key default gen_random_uuid(),
  record_id           text not null,
  record_type         text not null default 'DEVOTEE', -- 'DEVOTEE' or 'PARCEL'
  record_title        text not null,
  reason              text not null,
  requested_by_id     uuid references auth.users(id) on delete set null,
  requested_by_email  text,
  requested_by_name   text,
  status              text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by_id      uuid references auth.users(id) on delete set null,
  reviewed_by_email   text,
  reviewed_by_name    text,
  reviewed_at         timestamptz,
  review_notes        text,
  created_at          timestamptz default now()
);

-- Index for speedy lookups
create index if not exists idx_delete_requests_status on public.delete_requests(status);
create index if not exists idx_delete_requests_requested_by on public.delete_requests(requested_by_id);

-- ----------------------------------------------------------------------------
-- 3) ROW LEVEL SECURITY (RLS) FOR delete_requests
-- ----------------------------------------------------------------------------
alter table public.delete_requests enable row level security;

-- SELECT: Staff can read their own requests; Admins/Super Admins can read all
drop policy if exists "delete_requests_select_policy" on public.delete_requests;
create policy "delete_requests_select_policy"
  on public.delete_requests
  for select
  using (
    auth.uid() = requested_by_id 
    or public.is_admin() 
    or public.is_super_admin()
  );

-- INSERT: Any authenticated user (Staff / Admin) can submit a deletion request
drop policy if exists "delete_requests_insert_policy" on public.delete_requests;
create policy "delete_requests_insert_policy"
  on public.delete_requests
  for insert
  with check (
    auth.uid() is not null
  );

-- UPDATE: Only Super Admin (and Admin) can approve or reject requests
drop policy if exists "delete_requests_update_policy" on public.delete_requests;
create policy "delete_requests_update_policy"
  on public.delete_requests
  for update
  using (public.is_admin() or public.is_super_admin())
  with check (public.is_admin() or public.is_super_admin());

-- DELETE: Only Super Admin can purge historical request records
drop policy if exists "delete_requests_delete_policy" on public.delete_requests;
create policy "delete_requests_delete_policy"
  on public.delete_requests
  for delete
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 4) STRICT DATABASE-LEVEL RLS FOR devotees & parcels (DELETE PROTECTION)
--    Staff CANNOT delete directly via API/SQL — only SUPER_ADMIN is allowed!
-- ----------------------------------------------------------------------------
do $$
begin
  -- Apply strict delete policy to devotees table if it exists
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'devotees') then
    alter table public.devotees enable row level security;
    
    drop policy if exists "devotees_delete_super_admin_only" on public.devotees;
    create policy "devotees_delete_super_admin_only"
      on public.devotees
      for delete
      using (public.is_super_admin());
  end if;

  -- Apply strict delete policy to parcels table if it exists
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parcels') then
    alter table public.parcels enable row level security;
    
    drop policy if exists "parcels_delete_super_admin_only" on public.parcels;
    create policy "parcels_delete_super_admin_only"
      on public.parcels
      for delete
      using (public.is_super_admin());
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5) VERIFICATION: Super Admin identity check
-- ----------------------------------------------------------------------------
-- Ensure rothinroy0@gmail.com is SUPER_ADMIN
update public.user_profiles
set role = 'SUPER_ADMIN'
where email = 'rothinroy0@gmail.com';
