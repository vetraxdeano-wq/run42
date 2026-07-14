// supabase/functions/strava-webhook/index.ts
//
// Reçoit les notifications webhook de Strava à chaque nouvelle
// activité, va chercher le détail complet (avec best_efforts),
// l'insère dans `activities` / `best_efforts`, puis met à jour
// `personal_records` si un nouveau record est détecté.
//
// Déploiement :
//   supabase functions deploy strava-webhook --no-verify-jwt
//
// Configuration côté Strava (une seule fois, en local ou via curl) :
//   POST https://www.strava.com/api/v3/push_subscriptions
//   callback_url = https://TON-PROJET.supabase.co/functions/v1/strava-webhook
//   verify_token = une valeur secrète que tu choisis (STRAVA_VERIFY_TOKEN)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRAVA_VERIFY_TOKEN = Deno.env.get("STRAVA_VERIFY_TOKEN")!;
const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID")!;
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Distances officielles qu'on cherche parmi les best_efforts Strava
const DISTANCE_LABELS: Record<string, string> = {
  "400m": "400m",
  "1/2 mile": "800m",
  "1K": "1K",
  "1 mile": "Mile",
  "2 mile": "2 Mile",
  "5K": "5K",
  "10K": "10K",
  "15K": "15K",
  "10 mile": "10 Mile",
  "20K": "20K",
  "Half-Marathon": "Semi",
  "30K": "30K",
  "Marathon": "Marathon",
};

serve(async (req) => {
  const url = new URL(req.url);

  // --- Étape 1 : validation de l'abonnement (fait une seule fois par Strava) ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === STRAVA_VERIFY_TOKEN) {
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // --- Étape 2 : événement webhook réel ---
  if (req.method === "POST") {
    const event = await req.json();

    // On ne traite que la création de nouvelles activités
    if (event.aspect_type !== "create" || event.object_type !== "activity") {
      return new Response("ignored", { status: 200 });
    }

    const stravaAthleteId = event.owner_id;
    const stravaActivityId = event.object_id;

    // Retrouver l'utilisateur Supabase correspondant à cet athlète Strava
    const { data: account, error: accountError } = await supabase
      .from("strava_accounts")
      .select("*")
      .eq("strava_athlete_id", stravaAthleteId)
      .single();

    if (accountError || !account) {
      return new Response("compte introuvable", { status: 200 }); // 200 pour ne pas que Strava retry indéfiniment
    }

    const accessToken = await ensureFreshToken(account);

    // Récupérer le détail complet de l'activité (contient les best_efforts)
    const activityRes = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!activityRes.ok) {
      return new Response("échec fetch activité", { status: 200 });
    }

    const activity = await activityRes.json();

    // Ignorer les activités qui ne sont pas de la course à pied
    if (!["Run", "TrailRun", "VirtualRun"].includes(activity.type)) {
      return new Response("type ignoré", { status: 200 });
    }

    // Insérer l'activité
    const { data: inserted, error: insertError } = await supabase
      .from("activities")
      .upsert(
        {
          user_id: account.user_id,
          strava_activity_id: activity.id,
          type: activity.type,
          distance_m: activity.distance,
          duree_s: activity.moving_time,
          date: activity.start_date,
          allure_moyenne: activity.moving_time / (activity.distance / 1000),
          fc_moyenne: activity.average_heartrate ?? null,
          elevation_gain: activity.total_elevation_gain,
          raw_data: activity,
        },
        { onConflict: "strava_activity_id" }
      )
      .select()
      .single();

    if (insertError || !inserted) {
      return new Response("échec insertion activité", { status: 200 });
    }

    // Insérer les best_efforts et mettre à jour les PR
    for (const effort of activity.best_efforts ?? []) {
      const label = DISTANCE_LABELS[effort.name];
      if (!label) continue;

      await supabase.from("best_efforts").insert({
        activity_id: inserted.id,
        user_id: account.user_id,
        distance_label: label,
        temps_s: effort.elapsed_time,
        date: activity.start_date,
      });

      const { data: currentPR } = await supabase
        .from("personal_records")
        .select("meilleur_temps_s")
        .eq("user_id", account.user_id)
        .eq("distance_label", label)
        .maybeSingle();

      if (!currentPR || effort.elapsed_time < currentPR.meilleur_temps_s) {
        await supabase.from("personal_records").upsert({
          user_id: account.user_id,
          distance_label: label,
          meilleur_temps_s: effort.elapsed_time,
          activity_id: inserted.id,
          date_obtenu: activity.start_date,
        });
      }
    }

    return new Response("ok", { status: 200 });
  }

  return new Response("method not allowed", { status: 405 });
});

// Rafraîchit l'access_token si expiré (Strava : durée de vie 6h)
async function ensureFreshToken(account: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at > now + 60) {
    return account.access_token;
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const refreshed = await res.json();

  await supabase
    .from("strava_accounts")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
    })
    .eq("user_id", account.user_id);

  return refreshed.access_token;
}
