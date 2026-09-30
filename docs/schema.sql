-- HT: borrador estructural PostgreSQL. No ejecutar aún como migración de producción.
-- Invariantes transaccionales, validación de fechas y permisos: first-approach.md.
CREATE TABLE users (
  id uuid PRIMARY KEY, auth_subject text UNIQUE NOT NULL,
  name text NOT NULL, avatar_url text, timezone text NOT NULL DEFAULT 'Europe/Madrid',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE skills (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL, icon text NOT NULL, description text,
  curve_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
  UNIQUE(id,user_id)
);
CREATE TABLE events (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  skill_id uuid NOT NULL, title text NOT NULL, description text,
  occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK(source IN ('manual','github','calendar')),
  status text NOT NULL CHECK(status IN ('pending','confirmed','rejected')),
  proposed_xp integer NOT NULL CHECK(proposed_xp >= 0), evidence_url text,
  is_historical boolean NOT NULL DEFAULT false,
  xp_mode text NOT NULL DEFAULT 'award' CHECK(xp_mode IN ('award','evidence_only')),
  confirmed_at timestamptz, UNIQUE(id,user_id),
  FOREIGN KEY(skill_id,user_id) REFERENCES skills(id,user_id)
);
CREATE TABLE quests (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), skill_id uuid NOT NULL,
  name text NOT NULL, description text, started_at timestamptz NOT NULL,
  deadline timestamptz, target numeric NOT NULL CHECK(target > 0), unit text NOT NULL,
  progress numeric NOT NULL DEFAULT 0 CHECK(progress >= 0),
  reward_xp integer NOT NULL CHECK(reward_xp >= 0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','abandoned')),
  completed_at timestamptz, UNIQUE(id,user_id),
  FOREIGN KEY(skill_id,user_id) REFERENCES skills(id,user_id),
  CHECK(deadline IS NULL OR deadline >= started_at)
);
CREATE TABLE xp_transactions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), skill_id uuid NOT NULL,
  amount integer NOT NULL CHECK(amount >= 0),
  type text NOT NULL CHECK(type IN ('activity','quest_reward','initial_baseline')),
  reason text NOT NULL, event_id uuid, quest_id uuid,
  effective_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  curve_version integer NOT NULL, idempotency_key text NOT NULL,
  UNIQUE(user_id,idempotency_key), UNIQUE(id,user_id),
  FOREIGN KEY(skill_id,user_id) REFERENCES skills(id,user_id),
  FOREIGN KEY(event_id,user_id) REFERENCES events(id,user_id),
  FOREIGN KEY(quest_id,user_id) REFERENCES quests(id,user_id),
  CHECK((type='activity' AND event_id IS NOT NULL AND quest_id IS NULL)
     OR (type='quest_reward' AND quest_id IS NOT NULL AND event_id IS NULL)
     OR (type='initial_baseline' AND event_id IS NULL AND quest_id IS NULL))
);
CREATE UNIQUE INDEX event_xp_once ON xp_transactions(event_id) WHERE type='activity';
CREATE UNIQUE INDEX quest_reward_once ON xp_transactions(quest_id) WHERE type='quest_reward';
CREATE UNIQUE INDEX baseline_once ON xp_transactions(skill_id) WHERE type='initial_baseline';
CREATE TABLE historical_baselines (
  user_id uuid NOT NULL REFERENCES users(id), skill_id uuid NOT NULL,
  cutoff_at timestamptz NOT NULL, initial_level integer NOT NULL CHECK(initial_level BETWEEN 1 AND 100),
  transaction_id uuid NOT NULL UNIQUE, PRIMARY KEY(user_id,skill_id),
  FOREIGN KEY(skill_id,user_id) REFERENCES skills(id,user_id),
  FOREIGN KEY(transaction_id,user_id) REFERENCES xp_transactions(id,user_id)
);
CREATE TABLE quest_contributions (
  user_id uuid NOT NULL REFERENCES users(id), quest_id uuid NOT NULL, event_id uuid NOT NULL,
  delta numeric NOT NULL CHECK(delta > 0), PRIMARY KEY(quest_id,event_id),
  FOREIGN KEY(quest_id,user_id) REFERENCES quests(id,user_id),
  FOREIGN KEY(event_id,user_id) REFERENCES events(id,user_id)
);
CREATE TABLE milestones (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL, description text, type text NOT NULL, evidence_url text,
  is_historical boolean NOT NULL DEFAULT true,
  date_precision text NOT NULL CHECK(date_precision IN ('exact','month','year','unknown')),
  year integer, month integer CHECK(month BETWEEN 1 AND 12), day integer CHECK(day BETWEEN 1 AND 31),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id),
  CHECK((date_precision='exact' AND year IS NOT NULL AND month IS NOT NULL AND day IS NOT NULL)
     OR (date_precision='month' AND year IS NOT NULL AND month IS NOT NULL AND day IS NULL)
     OR (date_precision='year' AND year IS NOT NULL AND month IS NULL AND day IS NULL)
     OR (date_precision='unknown' AND year IS NULL AND month IS NULL AND day IS NULL))
);
CREATE TABLE milestone_skills (
  user_id uuid NOT NULL REFERENCES users(id), milestone_id uuid NOT NULL, skill_id uuid NOT NULL,
  PRIMARY KEY(milestone_id,skill_id),
  FOREIGN KEY(milestone_id,user_id) REFERENCES milestones(id,user_id),
  FOREIGN KEY(skill_id,user_id) REFERENCES skills(id,user_id)
);
CREATE TABLE achievements (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  description text NOT NULL, icon text NOT NULL,
  condition_type text NOT NULL CHECK(condition_type IN ('skill_level','confirmed_events','streak','github_commits','milestone')),
  condition_config jsonb NOT NULL
);
CREATE TABLE unlocked_achievements (
  user_id uuid NOT NULL REFERENCES users(id), achievement_id uuid NOT NULL REFERENCES achievements(id),
  unlocked_at timestamptz, date_precision text NOT NULL CHECK(date_precision IN ('exact','month','year','unknown')),
  historical_year integer, historical_month integer, historical_day integer,
  milestone_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,achievement_id),
  FOREIGN KEY(milestone_id,user_id) REFERENCES milestones(id,user_id)
);
CREATE TABLE weekly_reviews (
  user_id uuid NOT NULL REFERENCES users(id), week_start date NOT NULL,
  summary_snapshot jsonb NOT NULL, went_well text, went_wrong text, next_focus text,
  generated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,week_start)
);
CREATE TABLE integrations (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL CHECK(provider IN ('github','google_calendar')),
  external_account_id text NOT NULL, status text NOT NULL,
  credential_ref text, cursor jsonb, last_sync_at timestamptz,
  UNIQUE(user_id,provider,external_account_id), UNIQUE(id,user_id)
);
CREATE TABLE external_activities (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), integration_id uuid NOT NULL,
  external_key text NOT NULL, kind text NOT NULL, occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL, event_id uuid,
  UNIQUE(integration_id,external_key),
  FOREIGN KEY(integration_id,user_id) REFERENCES integrations(id,user_id),
  FOREIGN KEY(event_id,user_id) REFERENCES events(id,user_id)
);
CREATE INDEX event_history ON events(user_id,occurred_at DESC,id);
CREATE INDEX event_inbox ON events(user_id,created_at DESC) WHERE status='pending';
CREATE INDEX skill_ledger ON xp_transactions(user_id,skill_id,effective_at,created_at,id);
-- Además de estas restricciones: validar que event/quest y ledger comparten skill,
-- que una contribución pertenece a un evento confirmado, y que un baseline apunta
-- a una transacción initial_baseline con importe coherente y cutoff válido.
-- Validar fechas Gregorianas (31/02 no válido), timezone IANA, precisión de unlocks
-- y lunes como week_start. Añadir política de roles DB: ledger sin UPDATE/DELETE.
-- Idempotencia de mutaciones manuales y grupos históricos necesita tabla de requests
-- o claves de negocio persistidas al implementar; el índice de XP no basta por sí solo.
