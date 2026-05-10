create extension if not exists pgcrypto with schema extensions;

create table if not exists public.songs (
  id uuid primary key,
  title text not null,
  arranger text default '' not null,
  composer text default '' not null,
  lyricist text default '' not null,
  lyrics text default '' not null,
  performers jsonb default '{}'::jsonb not null,
  is_eliminated boolean default false not null,
  eliminated_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.songs add column if not exists arranger text default '' not null;
alter table public.songs add column if not exists composer text default '' not null;
alter table public.songs add column if not exists lyricist text default '' not null;
alter table public.songs add column if not exists is_eliminated boolean default false not null;
alter table public.songs add column if not exists eliminated_at timestamptz;

create table if not exists public.members (
  id integer primary key default 1,
  names text[] default '{}'::text[] not null,
  updated_at timestamptz default now() not null,
  constraint single_member_row check (id = 1)
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.cull_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  author text default '' not null,
  content text not null,
  created_at timestamptz default now() not null
);

create index if not exists cull_notes_song_id_idx on public.cull_notes(song_id, created_at);

alter table public.songs enable row level security;
alter table public.members enable row level security;
alter table public.app_settings enable row level security;
alter table public.cull_notes enable row level security;

drop policy if exists "public read songs" on public.songs;
drop policy if exists "public write songs" on public.songs;
drop policy if exists "public insert songs" on public.songs;
drop policy if exists "public update songs" on public.songs;
drop policy if exists "public delete songs" on public.songs;
drop policy if exists "public read members" on public.members;
drop policy if exists "public write members" on public.members;
drop policy if exists "public insert members" on public.members;
drop policy if exists "public update members" on public.members;
drop policy if exists "public read app settings" on public.app_settings;
drop policy if exists "public read cull notes" on public.cull_notes;

create policy "public read songs"
on public.songs for select
to anon
using (true);

create policy "public insert songs"
on public.songs for insert
to anon
with check (true);

create policy "public update songs"
on public.songs for update
to anon
using (true)
with check (true);

create policy "public delete songs"
on public.songs for delete
to anon
using (true);

-- Restrict anon to non-elimination columns. is_eliminated and eliminated_at
-- can only be changed via set_song_eliminated() (passphrase required).
-- id and created_at must stay grantable so PostgREST's upsert path (which
-- emits ON CONFLICT DO UPDATE SET col=EXCLUDED.col for every payload column)
-- doesn't get rejected at parse time.
revoke update on public.songs from anon;
grant update (id, title, arranger, composer, lyricist, lyrics, performers, created_at, updated_at)
  on public.songs to anon;

create policy "public read members"
on public.members for select
to anon
using (true);

create policy "public insert members"
on public.members for insert
to anon
with check (true);

create policy "public update members"
on public.members for update
to anon
using (true)
with check (true);

-- app_settings: no anon access — only accessible via RPC (security definer)

-- cull_notes: anon can read (so live mode + post-discussion can fetch),
-- but inserts go through add_cull_note() which requires the passphrase.
create policy "public read cull notes"
on public.cull_notes for select
to anon
using (true);

revoke insert, update, delete on public.cull_notes from anon;

-- Server-side passphrase verification using bcrypt (pgcrypto). The stored hash
-- must be a bcrypt string starting with "$2"; any other value (including the
-- placeholder set on first install) is rejected.
create or replace function public.verify_cull_passphrase(input_passphrase text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash text;
begin
  select value into stored_hash
  from public.app_settings
  where key = 'cull_passphrase_hash';

  if stored_hash is null or stored_hash not like '$2%' then
    return false;
  end if;

  return stored_hash = extensions.crypt(input_passphrase, stored_hash);
end;
$$;

-- Toggle a song's elimination state. Requires the passphrase so that anyone
-- holding the anon key cannot bypass the gate by calling update directly.
create or replace function public.set_song_eliminated(
  input_passphrase text,
  song_id uuid,
  eliminated boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash text;
begin
  select value into stored_hash
  from public.app_settings
  where key = 'cull_passphrase_hash';

  if stored_hash is null or stored_hash not like '$2%' then
    return false;
  end if;

  if stored_hash <> extensions.crypt(input_passphrase, stored_hash) then
    return false;
  end if;

  update public.songs
  set is_eliminated = eliminated,
      eliminated_at = case when eliminated then now() else null end,
      updated_at = now()
  where id = song_id;

  return true;
end;
$$;

-- Append a note for a song. Passphrase-gated like the elimination toggle.
create or replace function public.add_cull_note(
  input_passphrase text,
  song_id uuid,
  author text,
  content text
)
returns public.cull_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash text;
  note_row public.cull_notes;
  trimmed_content text;
begin
  trimmed_content := btrim(coalesce(content, ''));
  if length(trimmed_content) = 0 then
    return null;
  end if;

  select value into stored_hash
  from public.app_settings
  where key = 'cull_passphrase_hash';

  if stored_hash is null or stored_hash not like '$2%' then
    return null;
  end if;

  if stored_hash <> extensions.crypt(input_passphrase, stored_hash) then
    return null;
  end if;

  insert into public.cull_notes (song_id, author, content)
  values (song_id, btrim(coalesce(author, '')), trimmed_content)
  returning * into note_row;

  return note_row;
end;
$$;

-- Remove a note. Same passphrase gate as add_cull_note.
create or replace function public.delete_cull_note(
  input_passphrase text,
  note_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash text;
begin
  select value into stored_hash
  from public.app_settings
  where key = 'cull_passphrase_hash';

  if stored_hash is null or stored_hash not like '$2%' then
    return false;
  end if;

  if stored_hash <> extensions.crypt(input_passphrase, stored_hash) then
    return false;
  end if;

  delete from public.cull_notes where id = note_id;
  return true;
end;
$$;

revoke all on function public.verify_cull_passphrase(text) from public;
revoke all on function public.set_song_eliminated(text, uuid, boolean) from public;
revoke all on function public.add_cull_note(text, uuid, text, text) from public;
revoke all on function public.delete_cull_note(text, uuid) from public;
grant execute on function public.verify_cull_passphrase(text) to anon;
grant execute on function public.set_song_eliminated(text, uuid, boolean) to anon;
grant execute on function public.add_cull_note(text, uuid, text, text) to anon;
grant execute on function public.delete_cull_note(text, uuid) to anon;

insert into public.members (id, names)
values (1, '{}')
on conflict (id) do nothing;

-- Placeholder passphrase hash. Replace before going live, e.g.:
--   update public.app_settings
--   set value = extensions.crypt('your-passphrase', extensions.gen_salt('bf', 10))
--   where key = 'cull_passphrase_hash';
insert into public.app_settings (key, value)
values ('cull_passphrase_hash', 'CHANGE_ME')
on conflict (key) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.songs;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cull_notes;
exception
  when duplicate_object then null;
end $$;
