# Neon Mutt Run

An original, free browser arcade survival game set in **Bubble City**. You play as **Stocky Vermicelli**, a wiry survivor navigating a scrolling, phone-friendly city playground full of wandering pedestrians, crooked-badge villains, rival crews, reckless traffic, and occasional loudmouth bosses. Its setting, visual language, characters, vehicle names, and mechanics are independent from any existing game franchise.

## Controls

- **WASD / arrow keys:** move and steer
- **F or click/tap the game field:** fire the spark blaster
- **Space:** close-range bonk
- **E:** enter or leave a nearby vehicle

Keyboard and touch firing includes a light aim assist toward nearby threats. Mouse and field taps aim at the exact world point, including when the camera has scrolled. Buildings block people, cars, and shots. Follow the streets and use the short alleys to keep separation from the crowd.

## Difficulty

The city begins at Heat 01. Every 30 seconds, the heat rises: enemies arrive more often, move faster, shoot more, and do more damage. Mob bosses appear over time, and rare pickups temporarily swap Stocky's weapon to fireballs or rockets. The world is larger than the screen, but only the nearby 960 × 600 camera view is rendered, keeping play smooth on average phones.

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
