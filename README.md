# Grand Stock Auto

**Grand Stock Auto** is a neon parody memecoin landing page for the **GSA / TTWO** idea, paired with a free browser mini game called **Stocky Gator Sim**. The landing page introduces the ticker, robinhood chain goal, community fee-drip/burn idea, upcoming open-source AI alert bot, and the playable leaderboard hook.

The game is set in **Bubble City**. You play as **Stocky Vermicelli**, a scrappy gator survivor navigating a scrolling, phone-friendly city playground full of wandering pedestrians, crooked-badge villains, rival crews, reckless traffic, ringing side hustles, lucky crates, and occasional loudmouth bosses.

This is an unofficial parody project for entertainment purposes only. It is not affiliated with, endorsed by, or sponsored by Take-Two Interactive, Rockstar Games, Grand Theft Auto, Long, or any related brand.

## Meme concept

- **Ticker:** GSA
- **Pair:** GSA / TTWO
- **Goal:** to be the 1 BN runner on robinhood chain
- **Community concept:** fees drip towards the community in the form of stocks and burns encouraging community building
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

The landing page uses three background art scenes behind the foreground content: `assets/gsa-gator-bg-large.jpg`, `assets/gsa-everglades-lion.jpg`, and `assets/gsa-moon-earth.jpg`. Glowing neon horizontal dividers separate the scenes as visitors scroll. The smaller `assets/gsa-gator-bg.jpg` remains as the first image fallback.

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

2. The page is connected to the RobinStrategies Supabase project with a browser-safe publishable key. To use a different project, replace the public `GSA_BOARD` URL/key in `game.js` and run the SQL above.

For a production leaderboard, add a small server-side score validation endpoint or Supabase Edge Function. Browser-only clients can be tampered with, so direct inserts are best suited to a casual community game.

## GSA holder snapshot tool

The repo includes a simple Robinhood Chain holder snapshot tool for GSA:

```bash
node tools/robinhood-holder-snapshot.mjs
```

It creates a CSV in `snapshots/` using the GSA contract:

```text
0xb4396384569cf9b00058edb11d6bf12a626e1e18
```

Useful runs:

```bash
# Current indexed holder snapshot from Robinhood Chain Blockscout, only 100k+ GSA wallets
node tools/robinhood-holder-snapshot.mjs --min-balance 100000 --json snapshots/gsa-holders.json

# Add pro-rata planning weights for a stock-token budget, only 100k+ GSA wallets
node tools/robinhood-holder-snapshot.mjs --min-balance 100000 --airdrop-budget 1000 --json snapshots/gsa-airdrop-plan.json

# Exclude contract wallets too
node tools/robinhood-holder-snapshot.mjs --exclude-contracts --min-balance 100000 --airdrop-budget 1000

# Reproducible GSA snapshot from raw ERC-20 Transfer logs
node tools/robinhood-holder-snapshot.mjs --source rpc --to-block latest
```

The tool does not transfer tokens, stock tokens, or funds. It only exports addresses, GSA balances, and optional pro-rata allocation weights for review. Any real stock-token distribution should go through the proper platform/API, eligibility checks, and compliance flow.

If Node on Windows throws a certificate error, run the command from PowerShell like this:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
node tools/robinhood-holder-snapshot.mjs
```

## TTWO holder airdrop tool

The repo also includes a local admin tool that can split TTWO Robinhood stock-tokens across GSA holders:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm install
node tools/ttwo-airdrop.mjs --budget 10
```

That command is a dry run. It creates a CSV plan and sends nothing.

By default, this tool excludes anyone holding less than `100000` GSA. To change the cutoff:

```powershell
node tools/ttwo-airdrop.mjs --budget 10 --min-gsa-balance 250000
```

To split everything in a wallet, first preview with the wallet address:

```powershell
node tools/ttwo-airdrop.mjs --from 0xYourWalletAddress --budget all
```

Real TTWO movement should use the Rabby claim-vault flow below. Do not use private-key based senders for production.

The tool auto-finds TTWO on Robinhood Chain from Robinhood's public assets API. As of this version, TTWO resolves to:

```text
0x5e81213613b6B86EaB4c6c50d718d34359459786
```

Do not put private keys, seed phrases, passkeys, or wallet secrets into the public website. The public site only asks Rabby for wallet connection and transaction approvals.

## Browser Rabby snapshot page

Open `/airdrop.html` on the deployed site or local static server.

- Connect Rabby.
- Press **Snapshot**.
- Review all wallets holding at least `100000` GSA.
- Download the CSV if you want a record.
- Use `/claims-admin.html` for the daily claim-vault round.

The snapshot page never asks for a private key and cannot send TTWO directly. Real TTWO movement happens through the claim-vault admin page with Rabby approvals.

## Claimable TTWO rounds

The claim flow uses a small vault contract so holders can claim their own TTWO:

- Owner page: `/claims-admin.html`
- Holder page: `/claim.html`
- Contract source: `contracts/GsaTtwoDailyClaimVault.sol`

Daily owner flow:

1. Claim fees on long.xyz so TTWO lands in the owner wallet.
2. Open `/claims-admin.html` and connect Rabby.
3. Deploy the claim vault once, or paste the existing vault address.
4. Paste any known scam wallets into **Blocked wallets**.
5. Enter a **TTWO to fund** amount, or leave it blank to use the full connected wallet TTWO balance.
6. Press **Snapshot**.
7. Download the CSV and Manifest for your daily record.
8. Press **Create / Fund / Open Round**.
9. Share the generated `/claim.html?contract=...&round=...` link.

The holder flow is just connect Rabby, check claim, then claim TTWO. The vault prevents double-claims. The page excludes wallets under `100000` GSA by default.

For the main landing-page **Claim TTWO** button to work without a daily link, deploy the vault once and put that vault address in `claim-config.js`. After that, the claim page auto-loads the latest open round from the vault. Daily claim links can also include `?contract=...&round=...`; the claim page still checks the vault code and TTWO token before enabling a claim.

Security notes:

- The approved wallet list is stored on-chain in the claim vault as `allocations[roundId][wallet]`.
- Each wallet can claim only once per daily round/snapshot; the vault records `claimed[roundId][wallet]` before sending TTWO and rejects repeat claims.
- Each snapshot hash can only be used once, so the same snapshot cannot be republished under a second round ID.
- Each daily round stores its snapshot block, snapshot block hash, snapshot hash, and allocation count on-chain.
- The downloaded manifest records the same daily snapshot details plus the CSV hash and blocked wallets used.
- The browser snapshot uses the explorer holder list first to avoid wallet/RPC 403 blocks. The raw-log fallback uses a short block-confirmation buffer and verifies balances/contracts at the same block it records.
- The admin page checks that the pasted vault uses the official compiled claim-vault bytecode before asking Rabby to approve TTWO.
- The public holder claim page checks pasted or linked vaults against the official compiled claim-vault bytecode and expected TTWO token before it lets users claim.
- Never put a real private key, seed phrase, passkey, or service-role key in this public repo.
- `security-guard.js` is loaded on public pages to disable form autocomplete and wipe private-key/seed-phrase-looking values from local or session browser storage.
- The Supabase `sb_publishable_...` scoreboard key is public by design; keep Supabase RLS enabled and never publish a service-role key.
- The older direct-send airdrop page has been retired into snapshot-only mode so TTWO movement stays in the audited claim-vault path.
- Rabby should show every real deployment, approval, funding, and claim transaction before it is sent.
- The claim page checks that the vault points to the expected TTWO token before it lets users claim.
- Test with a tiny TTWO amount before funding a real round.

## Publish free/cheap

Push this repository to a public GitHub repository. GitHub Pages, Cloudflare Pages, and Netlify can all host the static files inexpensively. Point a custom domain at the host when you have one.

## License

MIT. You can freely use, alter, and share the game under the terms in `LICENSE`.
