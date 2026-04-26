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

alter table public.songs enable row level security;
alter table public.members enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "public read songs" on public.songs;
drop policy if exists "public write songs" on public.songs;
drop policy if exists "public read members" on public.members;
drop policy if exists "public write members" on public.members;
drop policy if exists "public read app settings" on public.app_settings;

create policy "public read songs"
on public.songs for select
to anon
using (true);

create policy "public write songs"
on public.songs for all
to anon
using (true)
with check (true);

create policy "public read members"
on public.members for select
to anon
using (true);

create policy "public write members"
on public.members for all
to anon
using (true)
with check (true);

create policy "public read app settings"
on public.app_settings for select
to anon
using (true);

insert into public.members (id, names)
values (1, '{}')
on conflict (id) do nothing;

insert into public.app_settings (key, value)
values ('cull_passphrase_hash', 'CHANGE_ME_SHA256')
on conflict (key) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.songs;
exception
  when duplicate_object then null;
end $$;
