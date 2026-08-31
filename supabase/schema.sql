-- Boys at the Back - Full Schema
-- Safe to re-run

-- Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  avatar_url text,
  status text default 'offline',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists status text default 'offline';
alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by authenticated users" on public.profiles;
create policy "Public profiles are viewable by authenticated users" on public.profiles for select to authenticated using (true);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Groups
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Boys at the Back',
  invite_code text unique not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.groups enable row level security;
drop policy if exists "Authenticated users can view groups" on public.groups;
create policy "Authenticated users can view groups" on public.groups for select to authenticated using (true);
drop policy if exists "Authenticated users can create groups" on public.groups;
create policy "Authenticated users can create groups" on public.groups for insert to authenticated with check (true);

-- Group members
create table if not exists public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'member',
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;
drop policy if exists "Members can see group members" on public.group_members;
create policy "Members can see group members" on public.group_members for select to authenticated using (true);
drop policy if exists "Users can join groups" on public.group_members;
create policy "Users can join groups" on public.group_members for insert to authenticated with check (auth.uid() = user_id);

-- Channels
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade not null,
  name text not null,
  type text default 'text',
  position int default 0,
  created_at timestamptz default now()
);
alter table public.channels enable row level security;
drop policy if exists "Authenticated can view channels" on public.channels;
create policy "Authenticated can view channels" on public.channels for select to authenticated using (true);
drop policy if exists "Authenticated can create channels" on public.channels;
create policy "Authenticated can create channels" on public.channels for insert to authenticated with check (true);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete set null,
  content text,
  image_url text,
  reply_to uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz default now()
);
alter table public.messages add column if not exists image_url text;
alter table public.messages enable row level security;
drop policy if exists "Authenticated can view messages" on public.messages;
create policy "Authenticated can view messages" on public.messages for select to authenticated using (true);
drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert to authenticated with check (auth.uid() = author_id);
drop policy if exists "Users can update own messages" on public.messages;
create policy "Users can update own messages" on public.messages for update to authenticated using (auth.uid() = author_id);
drop policy if exists "Users can delete own messages" on public.messages;
create policy "Users can delete own messages" on public.messages for delete to authenticated using (auth.uid() = author_id);

-- Reactions
create table if not exists public.reactions (
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.reactions enable row level security;
drop policy if exists "Authenticated can view reactions" on public.reactions;
create policy "Authenticated can view reactions" on public.reactions for select to authenticated using (true);
drop policy if exists "Users can add reactions" on public.reactions;
create policy "Users can add reactions" on public.reactions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can remove own reactions" on public.reactions;
create policy "Users can remove own reactions" on public.reactions for delete to authenticated using (auth.uid() = user_id);

-- Channel read receipts (for unread badges)
create table if not exists public.channel_reads (
  user_id uuid references public.profiles(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (user_id, channel_id)
);
alter table public.channel_reads enable row level security;
drop policy if exists "Users manage own reads" on public.channel_reads;
create policy "Users manage own reads" on public.channel_reads for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Direct Messages
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);
alter table public.dm_conversations enable row level security;
drop policy if exists "Authenticated can view dm convos" on public.dm_conversations;
create policy "Authenticated can view dm convos" on public.dm_conversations for select to authenticated using (true);
drop policy if exists "Authenticated can create dm convos" on public.dm_conversations;
create policy "Authenticated can create dm convos" on public.dm_conversations for insert to authenticated with check (true);

create table if not exists public.dm_participants (
  conversation_id uuid references public.dm_conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);
alter table public.dm_participants enable row level security;
drop policy if exists "Users see own dm participation" on public.dm_participants;
create policy "Users see own dm participation" on public.dm_participants for select to authenticated using (true);
drop policy if exists "Users can join dms" on public.dm_participants;
create policy "Users can join dms" on public.dm_participants for insert to authenticated with check (true);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.dm_conversations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text,
  image_url text,
  created_at timestamptz default now()
);
alter table public.dm_messages enable row level security;
drop policy if exists "Authenticated can view dm messages" on public.dm_messages;
create policy "Authenticated can view dm messages" on public.dm_messages for select to authenticated using (true);
drop policy if exists "Users can send dm messages" on public.dm_messages;
create policy "Users can send dm messages" on public.dm_messages for insert to authenticated with check (auth.uid() = author_id);

-- Realtime
do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.dm_messages; exception when duplicate_object then null; end $$;

-- Storage buckets
insert into storage.buckets (id, name, public) values ('chat-images', 'chat-images', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

drop policy if exists "Anyone can view chat images" on storage.objects;
create policy "Anyone can view chat images" on storage.objects for select using (bucket_id = 'chat-images');
drop policy if exists "Authenticated can upload chat images" on storage.objects;
create policy "Authenticated can upload chat images" on storage.objects for insert to authenticated with check (bucket_id = 'chat-images');

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars');
