-- =====================================================================
--  PDCA · Suivi terrain — Schéma Supabase partagé (multi-projets)
--  À exécuter une seule fois dans : Supabase → SQL Editor → New query → Run
--  Le script est ré-exécutable sans risque (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Administrateurs (seuls eux peuvent modifier / supprimer)
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins_read_self" on public.admins;
create policy "admins_read_self" on public.admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Anomalies ajoutées depuis le terrain
-- ---------------------------------------------------------------------
create table if not exists public.anomalies (
  id          uuid primary key default gen_random_uuid(),
  project     text not null check (project ~ '^[a-z0-9-]{1,60}$'),
  code        text not null check (char_length(code) between 1 and 40),
  title       text check (char_length(title) <= 120),
  supplier    text check (char_length(supplier) <= 80),
  problem     text not null check (char_length(problem) between 3 and 300),
  description text check (char_length(description) <= 5000),
  actions     text[] not null default '{}' check (coalesce(array_length(actions, 1), 0) <= 20),
  root_cause  text check (char_length(root_cause) <= 120),
  priority    text not null default 'MOYENNE' check (priority in ('HAUTE', 'MOYENNE')),
  pilot       text check (char_length(pilot) <= 120),
  opened      date,
  deadline    date,
  status      text not null default 'En cours' check (status in ('En cours', 'Résolu')),
  photos      text[] not null default '{}' check (coalesce(array_length(photos, 1), 0) <= 10),
  created_by  text not null check (char_length(created_by) between 2 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists anomalies_project_idx on public.anomalies (project, created_at);

-- ---------------------------------------------------------------------
-- 3. Interventions (journal technicien) — liées à une anomalie
--    anomaly_ref = "s-<id>" pour les anomalies de data.js,
--                  ou l'UUID d'une anomalie de la table ci-dessus
-- ---------------------------------------------------------------------
create table if not exists public.interventions (
  id           uuid primary key default gen_random_uuid(),
  project      text not null check (project ~ '^[a-z0-9-]{1,60}$'),
  anomaly_ref  text not null check (char_length(anomaly_ref) between 1 and 64),
  technician   text not null check (char_length(technician) between 2 and 80),
  performed_on date not null default current_date,
  kind         text not null default 'Corrective'
               check (kind in ('Diagnostic', 'Corrective', 'Réglage', 'Remplacement', 'Vérification', 'Préventive', 'Autre')),
  contrepartie text check (char_length(contrepartie) <= 80),
  details      text not null check (char_length(details) between 3 and 5000),
  parts        text check (char_length(parts) <= 500),
  duration_min integer check (duration_min between 0 and 1440),
  new_status   text check (new_status in ('En cours', 'Résolu')),
  photos       text[] not null default '{}' check (coalesce(array_length(photos, 1), 0) <= 10),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create index if not exists interventions_project_idx on public.interventions (project, anomaly_ref, performed_on);

-- Supprimer une anomalie supprime aussi ses interventions
create or replace function public.delete_anomaly_interventions()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from public.interventions where anomaly_ref = old.id::text;
  return old;
end;
$$;
drop trigger if exists anomalies_cascade_interventions on public.anomalies;
create trigger anomalies_cascade_interventions
  after delete on public.anomalies
  for each row execute function public.delete_anomaly_interventions();

-- ---------------------------------------------------------------------
-- 4. Règles d'accès (RLS)
--    Tout le monde : lire + ajouter.  Admin uniquement : modifier + supprimer.
-- ---------------------------------------------------------------------
alter table public.anomalies     enable row level security;
alter table public.interventions enable row level security;

grant select, insert                 on public.anomalies, public.interventions to anon;
grant select, insert, update, delete on public.anomalies, public.interventions to authenticated;

drop policy if exists "anomalies_read"   on public.anomalies;
drop policy if exists "anomalies_insert" on public.anomalies;
drop policy if exists "anomalies_update" on public.anomalies;
drop policy if exists "anomalies_delete" on public.anomalies;
create policy "anomalies_read"   on public.anomalies for select to anon, authenticated using (true);
create policy "anomalies_insert" on public.anomalies for insert to anon, authenticated with check (true);
create policy "anomalies_update" on public.anomalies for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "anomalies_delete" on public.anomalies for delete to authenticated using (public.is_admin());

drop policy if exists "interventions_read"   on public.interventions;
drop policy if exists "interventions_insert" on public.interventions;
drop policy if exists "interventions_update" on public.interventions;
drop policy if exists "interventions_delete" on public.interventions;
create policy "interventions_read"   on public.interventions for select to anon, authenticated using (true);
create policy "interventions_insert" on public.interventions for insert to anon, authenticated with check (true);
create policy "interventions_update" on public.interventions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "interventions_delete" on public.interventions for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Stockage des photos (bucket public, 5 Mo max, images uniquement)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdca-photos', 'pdca-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pdca_photos_upload"       on storage.objects;
drop policy if exists "pdca_photos_admin_select" on storage.objects;
drop policy if exists "pdca_photos_admin_delete" on storage.objects;
create policy "pdca_photos_upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'pdca-photos');
create policy "pdca_photos_admin_select" on storage.objects
  for select to authenticated using (bucket_id = 'pdca-photos' and public.is_admin());
create policy "pdca_photos_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'pdca-photos' and public.is_admin());

-- ---------------------------------------------------------------------
-- 6. Temps réel (mise à jour instantanée pour tous les utilisateurs)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.anomalies;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.interventions;
exception when duplicate_object then null;
end $$;

-- =====================================================================
--  7. DÉSIGNER L'ADMINISTRATEUR (à faire après avoir créé votre compte)
--     a) Authentication → Users → Add user → Create new user
--        (email + mot de passe, cocher "Auto Confirm User")
--     b) Remplacer l'email ci-dessous puis exécuter uniquement cette ligne :
--
--  insert into public.admins (user_id)
--  select id from auth.users where email = 'votre.email@exemple.com'
--  on conflict do nothing;
-- =====================================================================
