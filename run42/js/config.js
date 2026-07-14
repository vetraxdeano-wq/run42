// ============================================================
// Run42 — Configuration
// Remplis ces valeurs avant de déployer. Ne commit JAMAIS
// un client_secret Strava ici : il ne doit vivre QUE côté
// Edge Function Supabase (voir supabase/functions/strava-auth).
// ============================================================

export const CONFIG = {
  SUPABASE_URL: "https://TON-PROJET.supabase.co",
  SUPABASE_ANON_KEY: "TON_ANON_KEY",

  STRAVA_CLIENT_ID: "TON_STRAVA_CLIENT_ID",
  // L'URL doit être EXACTEMENT celle enregistrée sur
  // https://www.strava.com/settings/api
  STRAVA_REDIRECT_URI: window.location.origin + "/callback.html",
  STRAVA_SCOPE: "read,activity:read_all",

  // Nom de l'Edge Function qui échange le code OAuth
  // contre un access_token (voir supabase/functions/strava-auth)
  EDGE_FUNCTION_STRAVA_AUTH: "strava-auth",
};
