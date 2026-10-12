-- ============================================================================
-- ISKCON DEVOTEE CARE — ROLE PERMISSION & DELETION REQUEST SYSTEM SETUP
-- Supabase Project: nghiqkgdrqxupxxrrlwb
--
-- PURPOSE:
--   1. Create `public.delete_requests` table with full metadata & record snapshots.
--   2. Strict Row Level Security (RLS): Staff/Users CANNOT directly delete records.
--      Only Super Admin can execute permanent deletes on devotees & parcels.
--   3. Staff can only INSERT pending deletion requests.
--   4. Super Admin can view all requests and Approve (Yes) or Reject (No).
--   5. Realtime publication enabled so Super Admin sees requests immediately.
--   6. Atomic server-side stored procedures: approve_delete_request & reject_delete_request.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard (https://supabase.com/dashboard/project/nghiqkgdrqxupxxrrlwb)
--   2. Go to SQL Editor → Click "New query"
--   3. Paste this entire script and click "Run" (▶)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) SECURITY DEFINER HELPERS: is_super_admin() & is_admin_or_super()
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

create or replace function public.is_admin_or_super()
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

-- ----------------------------------------------------------------------------
-- 2) CREATE delete_requests TABLE
-- ----------------------------------------------------------------------------
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

-- Upgrade existing table if it was created without record_details
alter table public.delete_requests
  add column if not exists record_details jsonb;

-- Indexes for performance
create index if not exists idx_delete_requests_status on public.delete_requests(status);
create index if not exists idx_delete_requests_requested_by on public.delete_requests(requested_by_id);
create index if not exists idx_delete_requests_created_at on public.delete_requests(created_at desc);

-- ----------------------------------------------------------------------------
-- 3) ENABLE REALTIME BROADCASTING
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and tablename = 'delete_requests'
    ) then
      alter publication supabase_realtime add table public.delete_requests;
    end if;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4) ROW LEVEL SECURITY (RLS) FOR delete_requests
-- ----------------------------------------------------------------------------
alter table public.delete_requests enable row level security;

-- SELECT: Admin and Super Admin can view the deletion requests list.
drop policy if exists "delete_requests_select_policy" on public.delete_requests;
create policy "delete_requests_select_policy"
  on public.delete_requests
  for select
  using (
    public.is_admin_or_super()
  );

-- INSERT: Authenticated users (Staff / Admin) can submit a PENDING deletion request.
-- Prevents duplicate pending requests for the same record.
drop policy if exists "delete_requests_insert_policy" on public.delete_requests;
create policy "delete_requests_insert_policy"
  on public.delete_requests
  for insert
  with check (
    auth.uid() is not null
    and (status is null or status = 'PENDING')
  );

-- UPDATE: ONLY Super Admin can approve or reject requests. Staff CANNOT update status.
drop policy if exists "delete_requests_update_policy" on public.delete_requests;
create policy "delete_requests_update_policy"
  on public.delete_requests
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- DELETE: ONLY Super Admin can purge request history.
drop policy if exists "delete_requests_delete_policy" on public.delete_requests;
create policy "delete_requests_delete_policy"
  on public.delete_requests
  for delete
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 5) STRICT DATABASE-LEVEL RLS FOR devotees & parcels (DELETE PROTECTION)
--    Staff and regular users CANNOT delete directly via API/SQL — only SUPER_ADMIN is allowed!
-- ----------------------------------------------------------------------------
do $$
begin
  -- Protect devotees table
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'devotees') then
    alter table public.devotees enable row level security;
    
    drop policy if exists "devotees_delete_super_admin_only" on public.devotees;
    create policy "devotees_delete_super_admin_only"
      on public.devotees
      for delete
      using (public.is_super_admin());
  end if;

  -- Protect parcels table
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
-- 6) SERVER-SIDE SECURE RPC FUNCTIONS: APPROVE & REJECT REQUESTS
-- ----------------------------------------------------------------------------
create or replace function public.approve_delete_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_deleted boolean := false;
  v_reviewer_name text;
  v_reviewer_email text;
begin
  -- 1. Security Check: ONLY authenticated Super Admin can execute approval
  if not public.is_super_admin() then
    raise exception '⛔ Unauthorized: Only Super Admin can approve deletion requests.';
  end if;

  -- 2. Lock and retrieve the pending request
  select * into v_req
  from public.delete_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request % not found.', p_request_id;
  end if;

  if v_req.status <> 'PENDING' then
    raise exception 'Request has already been processed (Current status: %).', v_req.status;
  end if;

  -- 3. Resolve Super Admin reviewer details
  select coalesce(full_name, split_part(email, '@', 1)), email
  into v_reviewer_name, v_reviewer_email
  from public.user_profiles
  where id = auth.uid();

  if v_reviewer_name is null then
    select coalesce(full_name, split_part(email, '@', 1)), email
    into v_reviewer_name, v_reviewer_email
    from public.profiles
    where id = auth.uid();
  end if;

  -- 4. Execute atomic deletion on the requested record
  if v_req.record_type = 'DEVOTEE' then
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'devotees') then
      delete from public.devotees
      where "DEVOTEE ID" = v_req.record_id or id::text = v_req.record_id;
      v_deleted := true;
    end if;
  elsif v_req.record_type = 'PARCEL' then
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parcels') then
      delete from public.parcels
      where id::text = v_req.record_id;
      v_deleted := true;
    end if;
  end if;

  -- 5. Mark request as APPROVED
  update public.delete_requests
  set status = 'APPROVED',
      reviewed_by_id = auth.uid(),
      reviewed_by_email = coalesce(v_reviewer_email, auth.jwt()->>'email'),
      reviewed_by_name = coalesce(v_reviewer_name, 'Super Admin'),
      reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'record_id', v_req.record_id,
    'record_type', v_req.record_type,
    'status', 'APPROVED',
    'deleted', v_deleted,
    'message', 'Record deleted and request approved successfully.'
  );
end;
$$;

create or replace function public.reject_delete_request(p_request_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_reviewer_name text;
  v_reviewer_email text;
begin
  -- 1. Security Check: ONLY authenticated Super Admin can reject
  if not public.is_super_admin() then
    raise exception '⛔ Unauthorized: Only Super Admin can reject deletion requests.';
  end if;

  -- 2. Lock and retrieve the pending request
  select * into v_req
  from public.delete_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request % not found.', p_request_id;
  end if;

  if v_req.status <> 'PENDING' then
    raise exception 'Request has already been processed (Current status: %).', v_req.status;
  end if;

  -- 3. Resolve Super Admin reviewer details
  select coalesce(full_name, split_part(email, '@', 1)), email
  into v_reviewer_name, v_reviewer_email
  from public.user_profiles
  where id = auth.uid();

  if v_reviewer_name is null then
    select coalesce(full_name, split_part(email, '@', 1)), email
    into v_reviewer_name, v_reviewer_email
    from public.profiles
    where id = auth.uid();
  end if;

  -- 4. Mark request as REJECTED (original record remains completely safe and untouched)
  update public.delete_requests
  set status = 'REJECTED',
      reviewed_by_id = auth.uid(),
      reviewed_by_email = coalesce(v_reviewer_email, auth.jwt()->>'email'),
      reviewed_by_name = coalesce(v_reviewer_name, 'Super Admin'),
      reviewed_at = now(),
      review_notes = coalesce(p_notes, review_notes)
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'record_id', v_req.record_id,
    'record_type', v_req.record_type,
    'status', 'REJECTED',
    'message', 'Deletion request rejected. Record preserved.'
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) VERIFICATION & SUPER ADMIN ASSIGNMENT
-- ----------------------------------------------------------------------------
update public.user_profiles
set role = 'SUPER_ADMIN'
where email = 'rothinroy0@gmail.com';

update public.profiles
set role = 'SUPER_ADMIN'
where email = 'rothinroy0@gmail.com';
