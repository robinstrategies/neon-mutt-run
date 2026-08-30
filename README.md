# Grand Stock Auto

**Grand Stock Auto** is a neon parody memecoin landing page for the **GSA / TTWO** idea, paired with a free browser mini game called **Stocky Gator Sim**. The landing page introduces the ticker, long.xyz launch concept, community fee-drip/burn idea, upcoming open-source AI alert bot, and the playable leaderboard hook.

The game is set in **Bubble City**. You play as **Stocky Vermicelli**, a scrappy gator survivor navigating a scrolling, phone-friendly city playground full of wandering pedestrians, crooked-badge villains, rival crews, reckless traffic, ringing side hustles, lucky crates, and occasional loudmouth bosses.

This is an unofficial parody project for entertainment purposes only. It is not affiliated with, endorsed by, or sponsored by Take-Two Interactive, Rockstar Games, Grand Theft Auto, Long, or any related brand.

## Meme concept

- **Ticker:** GSA
- **Pair:** GSA / TTWO
- **Launch venue:** app.long.xyz
- **Goal:** to be the 1 BN runner on long.xyz
- **Community concept:** 25% of fees drip toward community holders and another 25% routes to burns
- **Upcoming utility:** an open-source AI Telegram bot that tracks GTA 6, Take-Two game news, TTWO price action, and posts alerts to Telegram and Twitter. Users can retarget the source to the stock of their choice.

## Controls

- **WASD / arrow keys:** move and steer
- **F or click/tap the game field:** fire the spark blaster
- **Space:** close-range bonk
- **E:** enter or leave a nearby vehicle
- **E near ringing phones:** start a side hustle
- **E in a car near a garage:** repair the ride and cool the heat

Keyboard and touch firing includes a light aim assist toward nearby threats. Mouse and field taps aim at the exact world point, including when the camera has scrolled. Buildings block people, cars, and shots. Follow the streets and use the short alleys to keep separation from the crowd.

## Difficulty

The city begins at Heat 01. Every 30 seconds, the heat rises, and loud play adds extra pressure. Enemies arrive more often, move faster, shoot more, and do more damage. Mob bosses appear over time, lucky crates hide temporary weapons and boosts, rare Bubble Frenzy pickups start short timed chaos runs, and phone hustles increase the score multiplier. The world is larger than the screen, but only the nearby 960 × 600 camera view is rendered, keeping play smooth on average phones.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static-file host.

The landing page uses three background art scenes behind the foreground content: `assets/gsa-gator-bg-large.jpg`, `assets/gsa-everglades-lion.jpg`, and `assets/gsa-moon-earth.jpg`. The smaller `assets/gsa-gator-bg.jpg` remains as the first image fallback.

## QA smoke test

Serve the folder and open `/?selftest=1`. The game runs a hidden self-test covering city generation, controls, projectiles, enemy shooting, drops, side hustles, bosses, garages, and scoreboard name escaping.

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
