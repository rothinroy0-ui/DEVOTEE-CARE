-- ============================================================================
-- ISKCON DEVOTEE CARE PORTAL: RBAC & WORK ASSIGNMENT DATABASE SECURITY SETUP
-- ============================================================================
-- 1. Adds assigned_work (text[]) to public.user_profiles & public.profiles
-- 2. Permanent Lock on Super Admin: Prevents demoting, editing role, or deleting Super Admin
-- 3. Row Level Security (RLS): Enforces module permissions and role protection
-- ============================================================================

-- STEP 1: Add assigned_work column to user_profiles and profiles
alter table public.user_profiles 
  add column if not exists assigned_work text[] 
  default array['devotees', 'birthdays', 'anniversaries', 'parcels']::text[];

alter table public.profiles 
  add column if not exists assigned_work text[] 
  default array['devotees', 'birthdays', 'anniversaries', 'parcels']::text[];

-- STEP 2: Helper Functions for RBAC verification (Security Definer)
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

-- STEP 3: Database Trigger to Permanently Lock Super Admin
-- Prevents demoting, altering role, or deleting any Super Admin record
create or replace function public.protect_super_admin_account()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'UPDATE' then
    -- If existing role is SUPER_ADMIN, do not allow changing it
    if old.role = 'SUPER_ADMIN' and new.role <> 'SUPER_ADMIN' then
      raise exception '🔒 Super Admin is permanently locked and cannot be demoted or changed.';
    end if;

    -- Only an authenticated Super Admin can change other accounts' roles or work assignments
    if (old.role <> new.role or old.assigned_work <> new.assigned_work) and not public.is_super_admin() then
      raise exception '⛔ Permission Denied: Only Super Admin can change staff roles or assigned work.';
    end if;

    return new;
  elsif TG_OP = 'DELETE' then
    if old.role = 'SUPER_ADMIN' then
      raise exception '🔒 Super Admin account is permanently locked and cannot be deleted.';
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_protect_super_admin_user_profiles on public.user_profiles;
create trigger trg_protect_super_admin_user_profiles
  before update or delete on public.user_profiles
  for each row execute function public.protect_super_admin_account();

-- STEP 4: Update handle_new_auth_user trigger to save default assigned_work
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_display_name text;
  v_default_work text[];
begin
  v_display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  );

  v_role := upper(coalesce(
    new.raw_user_meta_data->>'role',
    'VIEWER'
  ));

  if v_role not in ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER', 'VIEWER') then
    v_role := 'VIEWER';
  end if;

  v_default_work := array['devotees', 'birthdays', 'anniversaries', 'parcels']::text[];

  begin
    insert into public.user_profiles (id, email, full_name, role, division, assigned_work)
    values (
      new.id,
      new.email,
      v_display_name,
      v_role::user_role_enum,
      coalesce(new.raw_user_meta_data->>'division', 'Devotee Care'),
      v_default_work
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = coalesce(excluded.full_name, user_profiles.full_name),
      updated_at = now();
  exception
    when others then
      raise warning 'user_profiles insert failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- STEP 5: Row Level Security Policies on public.user_profiles
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_policy" on public.user_profiles;
create policy "user_profiles_select_policy"
  on public.user_profiles
  for select
  using (
    id = auth.uid() 
    or public.is_admin_or_super()
  );

drop policy if exists "user_profiles_update_policy" on public.user_profiles;
create policy "user_profiles_update_policy"
  on public.user_profiles
  for update
  using (
    id = auth.uid() 
    or public.is_super_admin()
  )
  with check (
    id = auth.uid() 
    or public.is_super_admin()
  );

-- STEP 6: Ensure existing staff rows have default assigned_work populated
update public.user_profiles
set assigned_work = array['devotees', 'birthdays', 'anniversaries', 'parcels']::text[]
where assigned_work is null or cardinality(assigned_work) = 0;

-- ============================================================================
-- VERIFICATION:
-- To check all active user profiles and their roles / work assignments:
-- select id, email, full_name, role, division, assigned_work from public.user_profiles;
-- ============================================================================
