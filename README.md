# Neon Mutt Run

An original, free browser arcade survival game. It uses a top-down city playground and vehicle hijinks, but its setting, visual language, characters, vehicle names, and mechanics are independent from any existing game franchise.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static-file host.

## Global score board (Supabase)

1. Create a Supabase project and run this SQL in its SQL editor:

```sql
create table public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 14),
  score integer not null check (score >= 0),
  kills integer not null check (kills >= 0),
  survival_seconds integer not null check (survival_seconds >= 0),
  created_at timestamptz not null default now()
);
alter table public.scores enable row level security;
create policy "scores are readable" on public.scores for select using (true);
create policy "anyone can post a score" on public.scores for insert with check (true);
```

2. Copy `supabase-config.js`, add your project URL and anonymous key, then deploy. The game automatically switches from its local demo leaderboard to the global board.

For a production leaderboard, add a small server-side score validation endpoint or Supabase Edge Function. Browser-only clients can be tampered with, so direct inserts are best suited to a casual community game.

## Publish free/cheap

Push this repository to a public GitHub repository. GitHub Pages, Cloudflare Pages, and Netlify can all host the static files inexpensively. Point a custom domain at the host when you have one.

## License

MIT. You can freely use, alter, and share the game under the terms in `LICENSE`.
