// supabase/functions/strava-auth/index.ts
//
// Edge Function : échange le code OAuth Strava contre un
// access_token / refresh_token, puis les stocke dans
// la table strava_accounts pour l'utilisateur courant.
//
// Déploiement :
//   supabase functions deploy strava-auth
//   supabase secrets set STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=xxx
//
// Le client_secret ne doit JAMAIS apparaître côté frontend.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID")!;
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const { code } = await req.json();
    if (!code) {
      return new Response(JSON.stringify({ error: "code manquant" }), { status: 400 });
    }

    // 1. Identifier l'utilisateur Supabase à partir du JWT envoyé par le client
    const authHeader = req.headers.get("Authorization");
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jwt = authHeader?.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "utilisateur non authentifié" }), { status: 401 });
    }
    const userId = userData.user.id;

    // 2. Échanger le code contre les tokens Strava
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new Response(JSON.stringify({ error: "échec échange Strava", details: errText }), { status: 502 });
    }

    const tokenData = await tokenRes.json();

    // 3. Stocker les tokens dans strava_accounts (upsert)
    const { error: upsertError } = await supabaseAuth.from("strava_accounts").upsert({
      user_id: userId,
      strava_athlete_id: tokenData.athlete.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    });

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, athlete: tokenData.athlete }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
