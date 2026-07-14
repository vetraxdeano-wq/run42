// ============================================================
// Run42 — Configuration
// Remplis ces valeurs avant de déployer. Ne commit JAMAIS
// un client_secret Strava ici : il ne doit vivre QUE côté
// Edge Function Supabase (voir supabase/functions/strava-auth).
// ============================================================

export const CONFIG = {
  SUPABASE_URL: "https://wbljbtwstcxqfqsnlusn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndibGpidHdzdGN4cWZxc25sdXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTkwNTksImV4cCI6MjA5OTU5NTA1OX0.9_iNJhGyVTl2IuXcbxsRzYHsYzp-VebOG2aohWwfogs",

  STRAVA_CLIENT_ID: "TON_STRAVA_CLIENT_ID",
  // L'URL doit être EXACTEMENT celle enregistrée sur
  // https://www.strava.com/settings/api
  STRAVA_REDIRECT_URI: window.location.origin + "/callback.html",
  STRAVA_SCOPE: "read,activity:read_all",

  // Nom de l'Edge Function qui échange le code OAuth
  // contre un access_token (voir supabase/functions/strava-auth)
  EDGE_FUNCTION_STRAVA_AUTH: "strava-auth",
};
