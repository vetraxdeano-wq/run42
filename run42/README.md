# Run42

Une web app (PWA) pour suivre tes courses, tes records personnels, et
(bientôt) des prédictions de chrono et des plans d'entraînement.

**Depuis le 30 juin 2026, l'API Strava nécessite un abonnement Strava
payant pour les développeurs "Standard Tier".** Run42 fonctionne donc
en **saisie manuelle** : après chaque course, tu rentres toi-même les
données que Strava affiche gratuitement (distance, durée de déplacement,
dénivelé, temps au kilomètre). L'intégration Strava automatique
(OAuth + webhook) reste dans le projet, désactivée par défaut, au cas
où tu passes un jour sur un abonnement Strava.

## Structure du projet

```
run42/
├── index.html              → écran principal (login + dashboard + formulaire)
├── manifest.json            → config PWA (nom, icônes, couleurs)
├── sw.js                     → service worker (cache offline minimal)
├── css/style.css            → identité visuelle
├── js/
│   ├── config.js             → clés à renseigner (Supabase)
│   ├── supabase-client.js
│   └── app.js                → state/render, login, dashboard, saisie, calcul PR
├── icons/                    → icônes PWA (192, 512)
├── callback.html / js/callback.js   → OPTIONNEL, pour plus tard si tu payes Strava
└── supabase/
    ├── schema.sql             → toutes les tables + RLS
    └── functions/             → OPTIONNEL, Edge Functions pour l'API Strava
```

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un projet.
2. Dans l'éditeur SQL, colle et exécute `supabase/schema.sql`.
3. Récupère `Project URL` et `anon public key` (Settings → API) → mets-les
   dans `js/config.js`.
4. Dans Authentication → Providers, vérifie que "Email" est activé (c'est
   le cas par défaut). Run42 utilise un lien de connexion par email (magic
   link), pas de mot de passe à gérer.
5. Dans Authentication → URL Configuration, ajoute l'URL où tu vas héberger
   Run42 (ex: `https://run42.vercel.app`) dans "Redirect URLs", sinon le
   lien magique ne te ramènera pas au bon endroit.

## 2. Tester en local

```bash
cd run42
python3 -m http.server 8000
```

Ouvre `http://localhost:8000/`. Renseigne d'abord `js/config.js` avec tes
clés Supabase, sinon tu resteras bloqué sur l'écran de login.

## 3. Comment ça calcule les records

À chaque course enregistrée via le formulaire :

- Si tu renseignes les temps au kilomètre, Run42 cherche la **meilleure
  fenêtre glissante** correspondant à 1K, 5K, 10K, 15K, 20K (ex: ton
  meilleur 5K enchaîné dans un 10K).
- Il compare aussi la **distance totale** de la sortie aux distances
  officielles (1K à Marathon, tolérance 3%) — utile pour Semi/Marathon où
  les kilomètres ne "tombent pas rond".
- Si un temps trouvé est meilleur que le record existant pour cette
  distance, `personal_records` est mis à jour.

Tout ce calcul se fait **côté client**, aucune donnée n'est envoyée à un
tiers autre que ton propre projet Supabase.

## 4. Héberger l'app

N'importe quel hébergeur statique fonctionne (Vercel, Netlify, GitHub Pages).

```bash
npm install -g vercel
cd run42
vercel --prod
```

## 5. Générer un APK téléchargeable

1. Va sur [pwabuilder.com](https://www.pwabuilder.com).
2. Colle l'URL de ton app déployée.
3. Choisis "Android" → il génère un `.apk`/`.aab` téléchargeable, sans
   Android Studio.

## Option future : brancher l'API Strava

Si tu prends un jour un abonnement Strava, les fichiers pour l'import
automatique sont déjà présents (mais pas branchés) :

- `supabase/functions/strava-auth` — échange OAuth
- `supabase/functions/strava-webhook` — réception des nouvelles activités
- `callback.html` / `js/callback.js` — page de retour OAuth

Il faudrait alors : créer une app sur
[strava.com/settings/api](https://www.strava.com/settings/api), déployer
les deux Edge Functions avec `supabase functions deploy`, et remettre un
bouton "Connecter Strava" dans le dashboard (`js/app.js`).

## Où en est le MVP

- [x] Login par email (magic link)
- [x] Saisie manuelle d'une course (distance, durée, dénivelé, splits)
- [x] Détection automatique des PR (fenêtre glissante + distance totale)
- [x] Dashboard avec visualisation des records (split ladder) et historique
- [ ] Prédictions de chrono (Riegel / VDOT)
- [ ] Générateur de plans d'entraînement
- [ ] Ajustement dynamique du plan selon les séances réalisées
