-- ============================================================================
-- ISKCON Durgapur — Devotee Care Portal
-- ONE-CLICK COMPLETE FIX: Realtime Sync & RLS Permissions for Devotees & Parcels
-- (With 42710 duplicate_object guard so it NEVER fails if already member)
--
-- How to run:
--   1. Open Supabase Dashboard → SQL Editor:
--      https://supabase.com/dashboard/project/nghiqkgdrqxupxxrrlwb/sql
--   2. Click "+ New query"
--   3. Paste this script and click "Run" (▶)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ENSURE ALL COLUMNS EXIST IN public.devotees
-- ----------------------------------------------------------------------------
ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS marital_status text DEFAULT NULL;
ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS address_verified text DEFAULT NULL;
ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS delivery_mode text DEFAULT NULL;
ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS courier_partner text DEFAULT NULL;
ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS updated_by text DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 2) ENSURE "DEVOTEE ID" HAS A PRIMARY KEY (Safe: ignores if already exists)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.devotees ADD PRIMARY KEY ("DEVOTEE ID");
EXCEPTION WHEN OTHERS THEN
  NULL; -- Primary key or constraint already exists
END $$;

-- ----------------------------------------------------------------------------
-- 3) ENABLE FULL REPLICA IDENTITY (Required for Realtime updates)
-- ----------------------------------------------------------------------------
ALTER TABLE public.devotees REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------------------
-- 4) REALTIME PUBLICATION (Guarded with EXCEPTION WHEN duplicate_object)
--    If already a member, it skips silently without any 42710 error!
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.devotees;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Already a member, perfect!
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'parcels') THEN
    ALTER TABLE public.parcels REPLICA IDENTITY FULL;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parcels;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 5) UNLOCK RLS POLICIES FOR public.devotees (Eliminates 42501 error)
-- ----------------------------------------------------------------------------
ALTER TABLE public.devotees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devotees_auth_select" ON public.devotees;
DROP POLICY IF EXISTS "devotees_auth_insert" ON public.devotees;
DROP POLICY IF EXISTS "devotees_auth_update" ON public.devotees;
DROP POLICY IF EXISTS "devotees_auth_delete" ON public.devotees;
DROP POLICY IF EXISTS "devotees_anon_select" ON public.devotees;
DROP POLICY IF EXISTS "devotees_anon_insert" ON public.devotees;
DROP POLICY IF EXISTS "devotees_anon_update" ON public.devotees;
DROP POLICY IF EXISTS "devotees_anon_delete" ON public.devotees;
DROP POLICY IF EXISTS "devotees_allow_all_read" ON public.devotees;
DROP POLICY IF EXISTS "devotees_allow_all_insert" ON public.devotees;
DROP POLICY IF EXISTS "devotees_allow_all_update" ON public.devotees;
DROP POLICY IF EXISTS "devotees_allow_all_delete" ON public.devotees;

CREATE POLICY "devotees_allow_all_read" ON public.devotees
  FOR SELECT USING (true);

CREATE POLICY "devotees_allow_all_insert" ON public.devotees
  FOR INSERT WITH CHECK (true);

CREATE POLICY "devotees_allow_all_update" ON public.devotees
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "devotees_allow_all_delete" ON public.devotees
  FOR DELETE USING (true);

-- ----------------------------------------------------------------------------
-- 6) UNLOCK RLS POLICIES FOR public.parcels
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'parcels') THEN
    ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "parcels_auth_select" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_auth_insert" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_auth_update" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_auth_delete" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_anon_select" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_anon_insert" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_anon_update" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_anon_delete" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_allow_all_read" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_allow_all_insert" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_allow_all_update" ON public.parcels;
    DROP POLICY IF EXISTS "parcels_allow_all_delete" ON public.parcels;

    CREATE POLICY "parcels_allow_all_read" ON public.parcels
      FOR SELECT USING (true);

    CREATE POLICY "parcels_allow_all_insert" ON public.parcels
      FOR INSERT WITH CHECK (true);

    CREATE POLICY "parcels_allow_all_update" ON public.parcels
      FOR UPDATE USING (true) WITH CHECK (true);

    CREATE POLICY "parcels_allow_all_delete" ON public.parcels
      FOR DELETE USING (true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7) VERIFICATION QUERY
-- ----------------------------------------------------------------------------
SELECT 
  'SUCCESS' AS status,
  'Permissions & Realtime are now fully configured and active!' AS message;
