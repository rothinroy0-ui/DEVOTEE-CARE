-- ============================================================================
-- ISKCON DEVOTEE CARE — ISOLATE USER ACTIVITY LOG (RLS MIGRATION)
-- Project: nghiqkgdrqxupxxrrlwb
--
-- PURPOSE:
--   1. Individual staff can ONLY view their own personal activity log (user_id = auth.uid()).
--   2. No staff member can see another staff member's activity log.
--   3. ONLY Super Admin can view all activities across all accounts together.
--   4. Prohibits tampering (updates disallowed, only Super Admin can delete).
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard (https://supabase.com/dashboard/project/nghiqkgdrqxupxxrrlwb)
--   2. SQL Editor -> New Query -> Paste this script -> Run (▶)
-- ============================================================================

-- 1. Helper function: is_super_admin()
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

-- 2. Ensure public.activity_log table exists with all columns
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

create index if not exists idx_activity_log_user_id on public.activity_log(user_id);
create index if not exists idx_activity_log_created_at on public.activity_log(created_at desc);

-- 3. Enable Row Level Security
alter table public.activity_log enable row level security;

-- 4. Drop any open, permissive, or outdated SELECT policies
drop policy if exists "activity_log_select_policy" on public.activity_log;
drop policy if exists "activity_log_auth_select" on public.activity_log;
drop policy if exists "allow_read_activity" on public.activity_log;
drop policy if exists "allow_read_all" on public.activity_log;
drop policy if exists "activity_log_select" on public.activity_log;
drop policy if exists "Enable read access for all users" on public.activity_log;
drop policy if exists "Enable read access for authenticated users" on public.activity_log;

-- 5. Strict SELECT policy: Super Admin sees ALL; Staff sees ONLY their own rows
create policy "activity_log_select_policy" on public.activity_log
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
  );

-- 6. INSERT policy: Authenticated staff can insert audit logs for their own actions
drop policy if exists "activity_log_insert_policy" on public.activity_log;
drop policy if exists "activity_log_auth_insert" on public.activity_log;
create policy "activity_log_insert_policy" on public.activity_log
  for insert to authenticated
  with check (
    user_id = auth.uid() or user_id is null or public.is_super_admin()
  );

-- 7. UPDATE policy: Disallowed for everyone (tamper-proof audit trail)
drop policy if exists "activity_log_update_policy" on public.activity_log;
create policy "activity_log_update_policy" on public.activity_log
  for update to authenticated
  using (false);

-- 8. DELETE policy: Only Super Admin can purge audit logs
drop policy if exists "activity_log_delete_policy" on public.activity_log;
create policy "activity_log_delete_policy" on public.activity_log
  for delete to authenticated
  using (public.is_super_admin());

-- 9. Realtime publication
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and tablename = 'activity_log'
    ) then
      alter publication supabase_realtime add table public.activity_log;
    end if;
  end if;
end $$;
