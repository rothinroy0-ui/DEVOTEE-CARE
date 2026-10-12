-- ============================================================================
-- ISKCON DEVOTEE CARE — FIX DELETE REQUESTS ROW LEVEL SECURITY (RLS)
-- Project: nghiqkgdrqxupxxrrlwb
--
-- PURPOSE:
--   Resolves "ERROR: new row violates row-level security policy for table delete_requests"
--   Allows staff to submit PENDING deletion requests while ensuring only Super Admin
--   can approve, reject, or execute permanent deletions.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard (https://supabase.com/dashboard/project/nghiqkgdrqxupxxrrlwb)
--   2. SQL Editor -> New Query -> Paste this script -> Run (▶)
-- ============================================================================

-- 1. Ensure public.delete_requests table exists with all required columns
create table if not exists public.delete_requests (
  id                  uuid primary key default gen_random_uuid(),
  record_id           text not null,
  record_type         text not null default 'DEVOTEE' check (record_type in ('DEVOTEE', 'PARCEL')),
  record_title        text not null,
  record_details      jsonb,
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
  created_at          timestamptz not null default now()
);

alter table public.delete_requests add column if not exists record_details jsonb;

-- 2. Enable Row Level Security
alter table public.delete_requests enable row level security;

-- 3. SELECT policy: Super Admin views all requests; staff can view requests
drop policy if exists "delete_requests_select_policy" on public.delete_requests;
drop policy if exists "delete_requests_select" on public.delete_requests;
drop policy if exists "delete_requests_auth_select" on public.delete_requests;
create policy "delete_requests_select_policy" on public.delete_requests
  for select
  using (true);

-- 4. INSERT policy: Any logged-in staff member or portal session can insert PENDING requests
drop policy if exists "delete_requests_insert_policy" on public.delete_requests;
drop policy if exists "delete_requests_insert" on public.delete_requests;
drop policy if exists "delete_requests_auth_insert" on public.delete_requests;
create policy "delete_requests_insert_policy" on public.delete_requests
  for insert
  with check (
    status is null or status = 'PENDING'
  );

-- 5. UPDATE policy: ONLY Super Admin can approve or reject (change status)
drop policy if exists "delete_requests_update_policy" on public.delete_requests;
drop policy if exists "delete_requests_update" on public.delete_requests;
drop policy if exists "delete_requests_auth_update" on public.delete_requests;
create policy "delete_requests_update_policy" on public.delete_requests
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 6. DELETE policy: ONLY Super Admin can delete request records
drop policy if exists "delete_requests_delete_policy" on public.delete_requests;
drop policy if exists "delete_requests_delete" on public.delete_requests;
drop policy if exists "delete_requests_auth_delete" on public.delete_requests;
create policy "delete_requests_delete_policy" on public.delete_requests
  for delete
  using (public.is_super_admin());

-- 7. Ensure realtime publication includes delete_requests
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and tablename = 'delete_requests'
    ) then
      alter publication supabase_realtime add table public.delete_requests;
    end if;
  end if;
end $$;
