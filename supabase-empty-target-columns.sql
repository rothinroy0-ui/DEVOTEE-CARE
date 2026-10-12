-- ============================================================================
-- ISKCON Durgapur — Devotee Care Portal
-- SCRIPT: Empty Target Columns (Marital Status, Address Verified, Mode of Delivery)
--
-- How to run:
--   1. Open https://supabase.com → Project: nghiqkgdrqxupxxrrlwb
--   2. SQL Editor → New query → Paste this script → Click "Run"
-- ============================================================================

-- 1. Reset target fields in public.devotees (if the table exists in your project)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'devotees'
  ) THEN
    -- Check and clear marital_status / MARITAL STATUS
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devotees' AND column_name='marital_status') THEN
      UPDATE public.devotees SET marital_status = NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devotees' AND column_name='MARITAL STATUS') THEN
      UPDATE public.devotees SET "MARITAL STATUS" = NULL;
    END IF;

    -- Check and clear address_verified / ADDRESS VERIFIED
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devotees' AND column_name='address_verified') THEN
      UPDATE public.devotees SET address_verified = NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devotees' AND column_name='ADDRESS VERIFIED') THEN
      UPDATE public.devotees SET "ADDRESS VERIFIED" = NULL;
    END IF;

    -- Check and clear delivery_mode
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devotees' AND column_name='delivery_mode') THEN
      UPDATE public.devotees SET delivery_mode = NULL;
    END IF;

    -- Check and clear courier_partner / COURIER PARTNER
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devotees' AND column_name='courier_partner') THEN
      UPDATE public.devotees SET courier_partner = NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='devotees' AND column_name='COURIER PARTNER') THEN
      UPDATE public.devotees SET "COURIER PARTNER" = NULL;
    END IF;
  END IF;
END $$;

-- 2. Reset target fields in public.parcels (if the table exists in your project)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'parcels'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parcels' AND column_name='address_verified') THEN
      UPDATE public.parcels SET address_verified = NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parcels' AND column_name='delivery_mode') THEN
      UPDATE public.parcels SET delivery_mode = NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parcels' AND column_name='courier_partner') THEN
      UPDATE public.parcels SET courier_partner = NULL;
    END IF;
  END IF;
END $$;

-- Output confirmation
SELECT 'Successfully cleared Marital Status, Address Verified, and Mode of Delivery columns.' AS status;
