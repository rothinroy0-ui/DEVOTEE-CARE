module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || 'https://nghiqkgdrqxupxxrrlwb.supabase.co';
  const anonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_0l8tLvM3KaaXwpdfre-n2g_3uYUpNhy';

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.status(200).send(
    `window.ENV = window.ENV || {}; ` +
    `window.ENV.SUPABASE_URL = ${JSON.stringify(url)}; ` +
    `window.ENV.SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)}; ` +
    `window.SUPABASE_CONFIG = { url: ${JSON.stringify(url)}, anonKey: ${JSON.stringify(anonKey)} };`
  );
};
