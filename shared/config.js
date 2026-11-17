/* config.js: PUBLIC settings only. The publishable (anon) key is designed to be public,
   but it is only safe because Row Level Security (RLS) protects every table.
   NEVER put the secret key or database password in this file. */
window.HB_CONFIG = {
  backend: 'supabase',
  supabase: {
    url: 'https://hrimempocwunsmtvtfnl.supabase.co',
    anonKey: 'sb_publishable_Rtz4sX5pAXLrQDNCg6s2ew_LtpRhEGR'
  },
  branch: 'darman',
  app: 'app'
};
