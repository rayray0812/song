create table if not exists public.songs (
  id uuid primary key,
  title text not null,
  arranger text default '' not null,
  composer text default '' not null,
  lyricist text default '' not null,
  lyrics text default '' not null,
  performers jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.songs add column if not exists arranger text default '' not null;
alter table public.songs add column if not exists composer text default '' not null;
alter table public.songs add column if not exists lyricist text default '' not null;

create table if not exists public.members (
  id integer primary key default 1,
  names text[] default '{}'::text[] not null,
  updated_at timestamptz default now() not null,
  constraint single_member_row check (id = 1)
);

alter table public.songs enable row level security;
alter table public.members enable row level security;

drop policy if exists "public read songs" on public.songs;
drop policy if exists "public write songs" on public.songs;
drop policy if exists "public read members" on public.members;
drop policy if exists "public write members" on public.members;

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

insert into public.members (id, names)
values (1, '{}')
on conflict (id) do nothing;
