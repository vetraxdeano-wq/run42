import { CONFIG } from "./config.js";
import { supabase } from "./supabase-client.js";

const statusEl = document.getElementById("status");

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    statusEl.textContent = "Connexion Strava annulée.";
    return;
  }

  if (!code) {
    statusEl.textContent = "Code Strava manquant. Réessaie depuis l'accueil.";
    return;
  }

  try {
    // L'échange code -> access_token se fait côté Edge Function,
    // car il nécessite le client_secret Strava (jamais côté client).
    const { data, error: fnError } = await supabase.functions.invoke(
      CONFIG.EDGE_FUNCTION_STRAVA_AUTH,
      { body: { code } }
    );

    if (fnError) throw fnError;

    localStorage.setItem("run42_strava_connected", "true");
    statusEl.textContent = "Connecté ! Redirection…";
    window.location.href = "/index.html";
  } catch (e) {
    statusEl.textContent = "Erreur pendant la connexion Strava. Vérifie que l'Edge Function 'strava-auth' est bien déployée.";
    console.error(e);
  }
}

handleCallback();
