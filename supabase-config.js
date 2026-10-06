/**
 * Supabase Configuration
 * Dynamically loaded for the client-side portal
 * Values mirrored from .env.local
 */
window.ENV = window.ENV || {
  SUPABASE_URL: "https://nghiqkgdrqxupxxrrlwb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_0l8tLvM3KaaXwpdfre-n2g_3uYUpNhy"
};

window.SUPABASE_CONFIG = {
  url: window.ENV.SUPABASE_URL,
  anonKey: window.ENV.SUPABASE_ANON_KEY
};
