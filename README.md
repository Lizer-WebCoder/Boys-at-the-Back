# Boys at the Back

Private hangout for the boys.  
Original design. Real-time chat. Invite-only. Built for a small group of friends.

---

## Tech Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Supabase (Auth, Postgres, Realtime, Storage)
- **Hosting**: Vercel (frontend) + Supabase free tier

---

## Setup (First Time)

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) and create a free project
2. Name it something like `boys-at-the-back`
3. Wait for it to finish provisioning

### 2. Get your keys
In Supabase → Project Settings → API:
- Copy **Project URL**
- Copy **anon public** key

### 3. Add keys to the project
Create a file `.env.local` in the root:

```env
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. Run the database schema
In Supabase → SQL Editor, paste and run the contents of `supabase/schema.sql`

### 5. Install & run locally
```bash
npm install
npm run dev
```

---

## Features (Roadmap)

### Phase 1 (Current)
- [x] Project foundation
- [ ] Auth (sign up / log in)
- [ ] Profiles (username + avatar + status)
- [ ] Private group + invite system
- [ ] Text channels
- [ ] Real-time messages (send, edit, delete, reply, react, mention, typing, images)
- [ ] Online status
- [ ] Original dark UI + responsive layout

### Phase 2
- Direct Messages
- Unread counts + notifications

### Phase 3
- Voice rooms

---

## Design Principles
- Dark mode by default
- Clean, modern, fun, original branding (not Discord)
- Simple and fast for a small group
- Private by default — invite only

Made for the boys.