-- ============================================================
-- Run42 — Schéma Supabase (Postgres)
-- À exécuter dans l'éditeur SQL de ton projet Supabase
--
-- v2 : le flux principal est la SAISIE MANUELLE des données
-- affichées gratuitement par Strava après chaque course
-- (distance, durée, dénivelé, temps au kilomètre). L'import
-- automatique via l'API Strava reste possible plus tard, si tu
-- passes sur un abonnement Strava (voir strava_accounts, optionnel).
-- ============================================================

-- Optionnel — uniquement si tu branches un jour l'API Strava
-- (nécessite un abonnement Strava depuis juin 2026, voir README)
create table if not exists strava_accounts (
  user_id uuid references auth.users(id) on delete cascade primary key,
  strava_athlete_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  connected_at timestamptz default now()
);

-- Activités — saisies manuellement par l'utilisateur
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  distance_m numeric not null,
  duree_s integer not null,           -- durée de déplacement (moving time)
  denivele_m numeric default 0,
  allure_moyenne numeric,             -- s/km, calculé côté client
  km_splits jsonb,                    -- ex: [245, 250, 248, ...] temps en s par km, optionnel
  source text default 'manuel',       -- 'manuel' ou 'strava' (si un jour branché)
  strava_activity_id bigint unique,   -- optionnel, uniquement si import Strava
  created_at timestamptz default now()
);

create index if not exists idx_activities_user on activities(user_id, date desc);

-- PR — un enregistrement par distance clé, mis à jour à chaque nouvelle course
create table if not exists personal_records (
  user_id uuid references auth.users(id) on delete cascade not null,
  distance_label text not null,        -- '1K','5K','10K','15K','20K','Semi','Marathon'
  meilleur_temps_s integer not null,
  activity_id uuid references activities(id),
  date_obtenu date,
  primary key (user_id, distance_label)
);

-- Programmes d'entraînement
create table if not exists training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  objectif text not null,
  niveau text not null,
  vdot_cible numeric,
  semaine_debut date not null,
  semaine_fin date not null,
  created_at timestamptz default now()
);

create table if not exists training_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references training_plans(id) on delete cascade not null,
  semaine integer not null,
  jour date not null,
  type_seance text not null,
  distance_cible_m numeric,
  allure_cible numeric,
  statut text default 'planifie'
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table strava_accounts enable row level security;
alter table activities enable row level security;
alter table personal_records enable row level security;
alter table training_plans enable row level security;
alter table training_sessions enable row level security;

create policy "own strava account" on strava_accounts
  for all using (auth.uid() = user_id);

create policy "own activities" on activities
  for all using (auth.uid() = user_id);

create policy "own personal records" on personal_records
  for all using (auth.uid() = user_id);

create policy "own training plans" on training_plans
  for all using (auth.uid() = user_id);

create policy "own training sessions" on training_sessions
  for all using (
    exists (
      select 1 from training_plans
      where training_plans.id = training_sessions.plan_id
      and training_plans.user_id = auth.uid()
    )
  );
