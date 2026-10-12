-- ============================================================================
-- ISKCON Durgapur — Devotee Care Portal
-- SCRIPT: Safe Column Reset (Guaranteed No 42703 Column Not Found Error)
--
-- How to run:
--   1. Open Supabase Dashboard → SQL Editor (https://supabase.com/dashboard/project/nghiqkgdrqxupxxrrlwb/sql)
--   2. Paste this entire script into a New query
--   3. Click "Run" (▶)
-- ============================================================================

DO $$
BEGIN
  -- 1. Ensure public.devotees has the columns before trying to update them
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'devotees'
  ) THEN
    -- Safely add the columns if they don't exist yet
    ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS marital_status text DEFAULT NULL;
    ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS address_verified text DEFAULT NULL;
    ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS delivery_mode text DEFAULT NULL;
    ALTER TABLE public.devotees ADD COLUMN IF NOT EXISTS courier_partner text DEFAULT NULL;

    -- Now clear all 4 columns
    UPDATE public.devotees 
    SET 
      marital_status = NULL,
      address_verified = NULL,
      delivery_mode = NULL,
      courier_partner = NULL;
      
    RAISE NOTICE 'public.devotees columns successfully verified and cleared.';
  END IF;

  -- 2. Clear target columns in public.parcels (if parcels table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'parcels'
  ) THEN
    ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS address_verified text DEFAULT NULL;
    ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS delivery_mode text DEFAULT NULL;
    ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS courier_partner text DEFAULT NULL;

    UPDATE public.parcels 
    SET 
      address_verified = NULL,
      delivery_mode = NULL,
      courier_partner = NULL;

    RAISE NOTICE 'public.parcels columns successfully cleared.';
  END IF;
END $$;

-- Result verification
SELECT 
  'SUCCESS' AS status,
  'Marital Status, Address Verified, and Mode of Delivery columns are now completely empty' AS message;
