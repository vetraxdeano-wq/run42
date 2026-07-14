import { CONFIG } from "./config.js";
import { supabase } from "./supabase-client.js";

// ============================================================
// State management — pattern state / setState / render
// ============================================================

let state = {
  route: "login",       // 'login' | 'dashboard' | 'add-activity'
  session: null,
  loading: false,
  prs: [],
  activities: [],
  splitInputsCount: 0,
  error: null,
  info: null,
};

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

const root = document.getElementById("app");

// ============================================================
// Constantes distances
// ============================================================

const DISTANCE_ORDER = ["1K", "5K", "10K", "15K", "20K", "Semi", "Marathon"];
const DISTANCE_METERS = {
  "1K": 1000, "5K": 5000, "10K": 10000, "15K": 15000,
  "20K": 20000, "Semi": 21097, "Marathon": 42195,
};

function formatTemps(s) {
  if (!s && s !== 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Accepte "mm:ss" ou "hh:mm:ss" → secondes
function parseDuree(str) {
  if (!str) return null;
  const parts = str.trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

const DEMO_PRS = [
  { distance_label: "1K", meilleur_temps_s: 210 },
  { distance_label: "5K", meilleur_temps_s: 1145 },
  { distance_label: "10K", meilleur_temps_s: 2430 },
  { distance_label: "Semi", meilleur_temps_s: 5580 },
  { distance_label: "Marathon", meilleur_temps_s: null },
];

// ============================================================
// Auth — email magic link (pas de mot de passe à gérer)
// ============================================================

async function sendMagicLink(email) {
  setState({ loading: true, error: null, info: null });
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    setState({ loading: false, error: error.message });
  } else {
    setState({ loading: false, info: "Lien envoyé ! Vérifie ta boîte mail." });
  }
}

async function checkSession() {
  const { data } = await supabase.auth.getSession();
  setState({ session: data.session, route: data.session ? "dashboard" : "login" });
  if (data.session) loadDashboardData();

  supabase.auth.onAuthStateChange((_event, session) => {
    setState({ session, route: session ? "dashboard" : "login" });
    if (session) loadDashboardData();
  });
}

async function logout() {
  await supabase.auth.signOut();
  setState({ session: null, route: "login", prs: [], activities: [] });
}

// ============================================================
// Chargement des données
// ============================================================

async function loadDashboardData() {
  setState({ loading: true, error: null });
  try {
    const { data: prs, error } = await supabase
      .from("personal_records")
      .select("distance_label, meilleur_temps_s")
      .order("distance_label");
    if (error) throw error;

    const { data: activities } = await supabase
      .from("activities")
      .select("*")
      .order("date", { ascending: false })
      .limit(5);

    setState({
      prs: prs && prs.length ? prs : DEMO_PRS,
      activities: activities || [],
      loading: false,
    });
  } catch (e) {
    setState({ prs: DEMO_PRS, loading: false });
  }
}

// ============================================================
// Calcul des PR à partir d'une activité saisie manuellement
// ============================================================

function computeBestEfforts(distanceM, dureeS, kmSplits) {
  const results = [];

  // 1. À partir des temps au kilomètre : meilleure fenêtre glissante
  //    pour chaque distance "ronde" atteignable (1K, 5K, 10K, 15K, 20K)
  if (kmSplits && kmSplits.length) {
    const wholeKmTargets = [
      [1, "1K"], [5, "5K"], [10, "10K"], [15, "15K"], [20, "20K"],
    ];
    for (const [k, label] of wholeKmTargets) {
      if (kmSplits.length >= k) {
        let best = Infinity;
        for (let i = 0; i + k <= kmSplits.length; i++) {
          const sum = kmSplits.slice(i, i + k).reduce((a, b) => a + b, 0);
          if (sum < best) best = sum;
        }
        results.push({ distance_label: label, temps_s: best });
      }
    }
  }

  // 2. À partir de la distance totale de la sortie : utile pour
  //    Semi/Marathon (pas de splits ronds) ou si pas de splits saisis.
  //    Tolérance de 3% pour matcher une distance officielle.
  for (const label of DISTANCE_ORDER) {
    const target = DISTANCE_METERS[label];
    if (Math.abs(distanceM - target) / target < 0.03) {
      const existing = results.find((r) => r.distance_label === label);
      if (!existing || dureeS < existing.temps_s) {
        results.splice(results.indexOf(existing), existing ? 1 : 0);
        results.push({ distance_label: label, temps_s: dureeS });
      }
    }
  }

  return results;
}

async function saveActivity(formData) {
  setState({ loading: true, error: null });
  try {
    const userId = state.session.user.id;
    const distanceM = Math.round(formData.distanceKm * 1000);
    const dureeS = formData.dureeS;
    const kmSplits = formData.kmSplits.filter((s) => s != null);
    const allureMoyenne = dureeS / (distanceM / 1000);

    const { data: activity, error: insertError } = await supabase
      .from("activities")
      .insert({
        user_id: userId,
        date: formData.date,
        distance_m: distanceM,
        duree_s: dureeS,
        denivele_m: formData.deniveleM || 0,
        allure_moyenne: allureMoyenne,
        km_splits: kmSplits.length ? kmSplits : null,
        source: "manuel",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Mise à jour des PR
    const efforts = computeBestEfforts(distanceM, dureeS, kmSplits);
    for (const effort of efforts) {
      const { data: currentPR } = await supabase
        .from("personal_records")
        .select("meilleur_temps_s")
        .eq("user_id", userId)
        .eq("distance_label", effort.distance_label)
        .maybeSingle();

      if (!currentPR || effort.temps_s < currentPR.meilleur_temps_s) {
        await supabase.from("personal_records").upsert({
          user_id: userId,
          distance_label: effort.distance_label,
          meilleur_temps_s: effort.temps_s,
          activity_id: activity.id,
          date_obtenu: formData.date,
        });
      }
    }

    setState({ loading: false, route: "dashboard" });
    loadDashboardData();
  } catch (e) {
    setState({ loading: false, error: "Erreur lors de l'enregistrement : " + e.message });
  }
}

// ============================================================
// Vues
// ============================================================

function viewLogin() {
  return `
    <section class="login-screen">
      <div class="login-card">
        <div class="badge-42">42</div>
        <h1>Run42</h1>
        <p class="tagline">Tes stats de course, tes records, tes prédictions — sans compte payant.</p>

        ${state.info ? `<p class="info-msg">${state.info}</p>` : ""}
        ${state.error ? `<p class="error-msg">${state.error}</p>` : ""}

        <form id="login-form">
          <input type="email" id="login-email" placeholder="ton@email.com" required />
          <button type="submit" class="btn-primary" ${state.loading ? "disabled" : ""}>
            ${state.loading ? "Envoi…" : "Recevoir un lien de connexion"}
          </button>
        </form>
        <p class="fine-print">Pas de mot de passe : tu reçois un lien magique par email.</p>
      </div>
    </section>
  `;
}

function splitLadder(prs) {
  const withTime = prs.filter((p) => p.meilleur_temps_s);
  const maxSec = withTime.length ? Math.max(...withTime.map((p) => p.meilleur_temps_s)) : 1;

  const rows = ["1K", "5K", "10K", "Semi", "Marathon"].map((label) => {
    const pr = prs.find((p) => p.distance_label === label);
    const sec = pr ? pr.meilleur_temps_s : null;
    const widthPct = sec ? Math.max(12, (sec / maxSec) * 100) : 6;
    const empty = !sec;
    return `
      <div class="split-row ${empty ? "is-empty" : ""}">
        <span class="split-label">${label}</span>
        <div class="split-track">
          <div class="split-bar" style="width:${widthPct}%"></div>
        </div>
        <span class="split-bib">${formatTemps(sec)}</span>
      </div>
    `;
  }).join("");

  return `<div class="split-ladder">${rows}</div>`;
}

function activityRow(a) {
  const km = (a.distance_m / 1000).toFixed(2);
  const allure = formatTemps(a.allure_moyenne) + "/km";
  return `
    <div class="activity-row">
      <span class="activity-date">${a.date}</span>
      <span>${km} km</span>
      <span>${formatTemps(a.duree_s)}</span>
      <span class="muted">${allure}</span>
    </div>
  `;
}

function viewDashboard() {
  return `
    <header class="topbar">
      <span class="brand">Run42</span>
      <div class="topbar-actions">
        <button class="pill pill-action" id="btn-logout">Déconnexion</button>
      </div>
    </header>

    <main class="dashboard">
      <button class="btn-primary btn-add" id="btn-add-activity">+ Ajouter une course</button>

      <section class="panel">
        <h2>Tes records</h2>
        ${state.loading ? `<p class="muted">Chargement…</p>` : splitLadder(state.prs)}
      </section>

      <section class="panel">
        <h2>Dernières courses</h2>
        ${
          state.activities.length
            ? state.activities.map(activityRow).join("")
            : `<p class="muted">Aucune course enregistrée pour l'instant.</p>`
        }
      </section>

      <section class="panel panel-split">
        <div class="card">
          <h3>Prédictions</h3>
          <p class="muted">Bientôt : estimation de tes chronos sur chaque distance (Riegel + VDOT).</p>
        </div>
        <div class="card">
          <h3>Plan d'entraînement</h3>
          <p class="muted">Bientôt : un programme généré selon ton niveau et ton objectif.</p>
        </div>
      </section>
    </main>
  `;
}

function viewAddActivity() {
  const splitsHtml = Array.from({ length: state.splitInputsCount }, (_, i) => `
    <label class="split-input-label">
      Km ${i + 1}
      <input type="text" class="km-split-input" data-index="${i}" placeholder="mm:ss" />
    </label>
  `).join("");

  return `
    <header class="topbar">
      <span class="brand">Run42</span>
      <button class="pill pill-action" id="btn-cancel">Annuler</button>
    </header>

    <main class="dashboard">
      <section class="panel">
        <h2>Nouvelle course</h2>
        ${state.error ? `<p class="error-msg">${state.error}</p>` : ""}

        <form id="activity-form" class="activity-form">
          <label>Date
            <input type="date" id="f-date" value="${new Date().toISOString().slice(0, 10)}" required />
          </label>

          <label>Distance (km)
            <input type="number" id="f-distance" step="0.01" min="0" placeholder="10.00" required />
          </label>

          <label>Durée de déplacement (mm:ss ou hh:mm:ss)
            <input type="text" id="f-duree" placeholder="47:30" required />
          </label>

          <label>Dénivelé positif (m)
            <input type="number" id="f-denivele" step="1" min="0" placeholder="120" />
          </label>

          <div class="splits-section">
            <p class="muted">Temps intermédiaires au kilomètre (optionnel, améliore la détection de PR)</p>
            <div class="splits-grid">${splitsHtml}</div>
          </div>

          <button type="submit" class="btn-primary" ${state.loading ? "disabled" : ""}>
            ${state.loading ? "Enregistrement…" : "Enregistrer la course"}
          </button>
        </form>
      </section>
    </main>
  `;
}

// ============================================================
// Router / render
// ============================================================

function render() {
  if (state.route === "dashboard") root.innerHTML = viewDashboard();
  else if (state.route === "add-activity") root.innerHTML = viewAddActivity();
  else root.innerHTML = viewLogin();

  attachHandlers();
}

function attachHandlers() {
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMagicLink(document.getElementById("login-email").value);
    });
  }

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const addBtn = document.getElementById("btn-add-activity");
  if (addBtn) addBtn.addEventListener("click", () => setState({ route: "add-activity", error: null }));

  const cancelBtn = document.getElementById("btn-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => setState({ route: "dashboard", error: null }));

  const distanceInput = document.getElementById("f-distance");
  if (distanceInput) {
    distanceInput.addEventListener("change", () => {
      const km = Math.floor(parseFloat(distanceInput.value) || 0);
      setState({ splitInputsCount: Math.min(km, 50) });
    });
  }

  const activityForm = document.getElementById("activity-form");
  if (activityForm) {
    activityForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const dureeS = parseDuree(document.getElementById("f-duree").value);
      if (!dureeS) {
        setState({ error: "Format de durée invalide. Utilise mm:ss ou hh:mm:ss." });
        return;
      }

      const kmSplits = Array.from(document.querySelectorAll(".km-split-input")).map((input) =>
        parseDuree(input.value)
      );

      saveActivity({
        date: document.getElementById("f-date").value,
        distanceKm: parseFloat(document.getElementById("f-distance").value),
        dureeS,
        deniveleM: parseFloat(document.getElementById("f-denivele").value) || 0,
        kmSplits,
      });
    });
  }
}

checkSession();
