-- ============================================================================
-- ISKCON DEVOTEE CARE — AUDIT LOGGING & DATABASE CENTRALIZATION UPGRADE
-- Project: nghiqkgdrqxupxxrrlwb
--
-- SELF-CONTAINED & BULLETPROOF MIGRATION:
--   - Safe to run on any state of your Supabase database.
--   - Automatically ensures helper functions exist (is_super_admin).
--   - Automatically ensures delete_requests and activity_log tables exist.
--   - Uses conditional DO $$ blocks for triggers so it never fails if a table is missing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER: is_super_admin() (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_is_super boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Check user_profiles if it exists
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_profiles') then
    select exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role::text = 'SUPER_ADMIN'
    ) into v_is_super;
    if v_is_super then return true; end if;
  end if;

  -- Check profiles if it exists
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    select exists (
      select 1 from public.profiles
      where id = auth.uid() and role::text = 'SUPER_ADMIN'
    ) into v_is_super;
    if v_is_super then return true; end if;
  end if;

  return false;
exception when others then
  return false;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. ENSURE public.delete_requests TABLE EXISTS
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

-- Ensure record_details column exists if table was previously created
alter table public.delete_requests add column if not exists record_details jsonb;

-- Indexes for delete_requests
create index if not exists idx_delete_requests_status on public.delete_requests(status);
create index if not exists idx_delete_requests_requested_by on public.delete_requests(requested_by_id);

-- ----------------------------------------------------------------------------
-- 3. UPGRADE public.activity_log TABLE SCHEMA
-- ----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  staff_name          text,
  staff_email         text,
  action              text not null,
  module              text not null default 'general',
  record_id           text,
  summary             text,
  result              text not null default 'SUCCESS' check (result in ('SUCCESS', 'DENIED', 'FAILED')),
  old_values          jsonb,
  new_values          jsonb,
  change_details      jsonb,
  actor_role          text,
  created_at          timestamptz not null default now()
);

-- Ensure all required columns exist even if table was created earlier with text id
alter table public.activity_log add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.activity_log add column if not exists staff_name text;
alter table public.activity_log add column if not exists staff_email text;
alter table public.activity_log add column if not exists module text default 'general';
alter table public.activity_log add column if not exists record_id text;
alter table public.activity_log add column if not exists result text default 'SUCCESS';
alter table public.activity_log add column if not exists old_values jsonb;
alter table public.activity_log add column if not exists new_values jsonb;
alter table public.activity_log add column if not exists change_details jsonb;
alter table public.activity_log add column if not exists actor_role text;

-- Indexes for performance
create index if not exists idx_activity_log_user_id on public.activity_log(user_id);
create index if not exists idx_activity_log_module on public.activity_log(module);
create index if not exists idx_activity_log_action on public.activity_log(action);
create index if not exists idx_activity_log_created_at on public.activity_log(created_at desc);

-- ----------------------------------------------------------------------------
-- 4. ENABLE REALTIME ON activity_log & delete_requests
-- ----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and tablename = 'activity_log'
    ) then
      alter publication supabase_realtime add table public.activity_log;
    end if;

    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and tablename = 'delete_requests'
    ) then
      alter publication supabase_realtime add table public.delete_requests;
    end if;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. STRICT ROW LEVEL SECURITY (RLS) FOR activity_log
-- ----------------------------------------------------------------------------
alter table public.activity_log enable row level security;

-- SELECT: Super Admin views ALL activity; Staff views ONLY their own activity
drop policy if exists "activity_log_select_policy" on public.activity_log;
drop policy if exists "activity_log_auth_select" on public.activity_log;
create policy "activity_log_select_policy" on public.activity_log
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
  );

-- INSERT: Authenticated users can insert their own actions
drop policy if exists "activity_log_insert_policy" on public.activity_log;
drop policy if exists "activity_log_auth_insert" on public.activity_log;
create policy "activity_log_insert_policy" on public.activity_log
  for insert to authenticated
  with check (
    user_id = auth.uid() or user_id is null or public.is_super_admin()
  );

-- UPDATE: Prohibit modifying audit logs completely (tamper-proof)
drop policy if exists "activity_log_update_policy" on public.activity_log;
create policy "activity_log_update_policy" on public.activity_log
  for update to authenticated
  using (false);

-- DELETE: Only Super Admin can purge audit logs
drop policy if exists "activity_log_delete_policy" on public.activity_log;
create policy "activity_log_delete_policy" on public.activity_log
  for delete to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 6. SECURE SERVER-SIDE RPC: record_audit_event
-- ----------------------------------------------------------------------------
create or replace function public.record_audit_event(
  p_action text,
  p_module text,
  p_record_id text default null,
  p_summary text default null,
  p_result text default 'SUCCESS',
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_change_details jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_name text;
  v_role text;
  v_log_id uuid;
  v_clean_old jsonb;
  v_clean_new jsonb;
begin
  v_uid := auth.uid();
  
  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_profiles') then
      select full_name, role::text into v_name, v_role
      from public.user_profiles where id = v_uid;
    end if;

    if v_name is null and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
      select full_name, role::text into v_name, v_role
      from public.profiles where id = v_uid;
    end if;
  end if;

  if v_name is null then
    v_name := coalesce(v_email, 'System');
  end if;
  if v_role is null then
    v_role := 'STAFF';
  end if;

  -- Redact passwords, tokens, and secret keys from JSON snapshots
  v_clean_old := p_old_values - 'password' - 'token' - 'access_token' - 'refresh_token' - 'secret' - 'apiKey';
  v_clean_new := p_new_values - 'password' - 'token' - 'access_token' - 'refresh_token' - 'secret' - 'apiKey';

  insert into public.activity_log (
    user_id,
    staff_name,
    staff_email,
    action,
    module,
    record_id,
    summary,
    result,
    old_values,
    new_values,
    change_details,
    actor_role
  ) values (
    v_uid,
    v_name,
    v_email,
    p_action,
    p_module,
    p_record_id,
    p_summary,
    coalesce(p_result, 'SUCCESS'),
    v_clean_old,
    v_clean_new,
    p_change_details,
    v_role
  ) returning id into v_log_id;

  return v_log_id::text;
exception when others then
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. AUDIT TRIGGER FUNCTION
-- ----------------------------------------------------------------------------
create or replace function public.trg_log_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_record_id text;
  v_summary text;
  v_old jsonb := null;
  v_new jsonb := null;
begin
  if TG_OP = 'INSERT' then
    v_action := 'CREATE';
    v_record_id := coalesce(new.id::text, (to_jsonb(new)->>'id'), (to_jsonb(new)->>'DEVOTEE ID'), '');
    v_summary := 'Record created in ' || TG_TABLE_NAME;
    v_new := to_jsonb(new) - 'raw_data';
  elsif TG_OP = 'UPDATE' then
    v_action := 'UPDATE';
    v_record_id := coalesce(new.id::text, (to_jsonb(new)->>'id'), (to_jsonb(new)->>'DEVOTEE ID'), '');
    v_summary := 'Record updated in ' || TG_TABLE_NAME;
    v_old := to_jsonb(old) - 'raw_data';
    v_new := to_jsonb(new) - 'raw_data';
  elsif TG_OP = 'DELETE' then
    v_action := 'DELETE';
    v_record_id := coalesce(old.id::text, (to_jsonb(old)->>'id'), (to_jsonb(old)->>'DEVOTEE ID'), '');
    v_summary := 'Record deleted from ' || TG_TABLE_NAME;
    v_old := to_jsonb(old) - 'raw_data';
  end if;

  perform public.record_audit_event(
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_summary,
    'SUCCESS',
    v_old,
    v_new,
    null
  );

  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. CONDITIONALLY ATTACH TRIGGERS
--    Guaranteed never to crash if parcels or delete_requests do not exist
-- ----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parcels') then
    drop trigger if exists trg_audit_parcels on public.parcels;
    create trigger trg_audit_parcels
      after insert or update or delete on public.parcels
      for each row execute function public.trg_log_table_change();
    raise notice '✅ Audit trigger attached to public.parcels';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'delete_requests') then
    drop trigger if exists trg_audit_delete_requests on public.delete_requests;
    create trigger trg_audit_delete_requests
      after insert or update on public.delete_requests
      for each row execute function public.trg_log_table_change();
    raise notice '✅ Audit trigger attached to public.delete_requests';
  end if;
end $$;
