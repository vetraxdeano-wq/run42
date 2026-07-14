import { CONFIG } from "./config.js";

// Charge le SDK Supabase depuis le CDN (voir index.html)
// et expose un client prêt à l'emploi.
export const supabase = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);
