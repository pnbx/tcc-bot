# TCC Bot — Telegram assistant for the network

**English** · [فارسی](README.fa.md)

[![CI](https://github.com/pnbx/tcc-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/pnbx/tcc-bot/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000?logo=nextdotjs)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

One Telegram bot for the whole team: live server status, sales reports, staff
actions, the rank/prefix designer and an AI admin — plus a phone-sized Mini App
that mirrors the website dashboard.

It has no database of its own. Everything comes from the website's bot API
([`tcc-web`](https://github.com/pnbx/tcc-web)), which is the single source of truth.

---

## What it does

**For players**
- `/start` — link a Telegram account with a code from the website (`/connect-telegram`)
- `/me`, `/ranks` — your ranks and days left
- `/status` — live player count, MOTD, version
- `/tiers` — the competitive tier table
- `/news` — latest articles
- `/prefix` — describe the tag you want, get an AI design, a price and a buy button
- `/ask` — free-form question answered with live network context

**For staff** (owner, admin, developer — checked against `BOT_ADMIN_IDS`)
- `/console [n]`, `/orders`, `/players`
- `/ban`, `/unban`, `/kick`, `/say`, `/post`
- `/aiadmin` — an AI that can read status and run those actions, per-admin opt-in

**For the website**
- `POST /api/announce` with `x-bot-token` — pushes a post to the channel

---

## How the AI is wired

Free-tier models do not call tools reliably, so the assistant never gets a tool
belt. Instead it must answer with **one strict JSON action**
(`lib/agent.ts`), for example:

```json
{ "action": "command", "command": "ban Steve griefing" }
```

Then **code — not the model — decides what is allowed** and performs the side
effect. A hallucinated or malformed action is dropped by `parseAction`, so model
output can never reach the game console or the channel on its own.

Allowed actions: `answer`, `status`, `console`, `orders`, `players`, `tiers`,
`news`, `command`, `post`.

---

## Architecture

```
Telegram  ──webhook──▶  app/api/telegram/webhook  ──▶  lib/agent (planner)
                              │                          │
                              │                          ▼
                              │                     lib/site  ──x-bot-token──▶  tcc-web /api/bot/<action>
                              ▼
                        lib/tg (Bot API: messages, keyboards, Web App buttons)
```

| File | Role |
|---|---|
| `app/api/telegram/webhook/route.ts` | single webhook, command router, permissions |
| `app/api/announce/route.ts` | token-protected channel posts for the website |
| `lib/agent.ts` | JSON planner + action parser + guards |
| `lib/ai.ts` | OpenRouter client with a model fallback chain |
| `lib/site.ts` | typed client for the website's bot API |
| `lib/tg.ts` | Bot API helpers: HTML escaping, message splitting, inline keyboards |

---

## Setup

```bash
git clone https://github.com/pnbx/tcc-bot.git
cd tcc-bot
npm install
cp .env.example .env.local
npm run dev
```

Then point Telegram at the deployment:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<your-bot-domain>/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

`BOT_API_TOKEN` must match the website's `BOT_API_TOKEN`; without it every call
to the site API returns nothing and the bot answers "unavailable".

---

## Environment

| Key | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `TELEGRAM_WEBHOOK_SECRET` | verified against Telegram's `X-Telegram-Bot-Api-Secret-Token` |
| `TELEGRAM_CHANNEL_ID` | channel for `/post` and `/api/announce` |
| `BOT_ADMIN_IDS` | comma-separated Telegram user ids allowed to use staff commands |
| `TCC_SITE_URL` | website base URL (default `https://site.tccmc.ir`) |
| `BOT_API_TOKEN` | shared secret with the website |
| `OPENROUTER_API_KEYS` | one or more keys, tried in order |
| `OPENROUTER_MODELS` | model fallback chain |

Deployed to Vercel in `fra1` (`vercel.json`), which is close to both Telegram and
the Iranian host.

---

## Security notes

- Every staff command checks the sender against `BOT_ADMIN_IDS`; being in the
  channel is not enough.
- The webhook verifies Telegram's secret header.
- `x-bot-token` comparisons are constant-time (`timingSafeEqual`).
- User-supplied text is HTML-escaped before sending, and long answers are split
  without breaking tags.
- The bot never holds Minecraft credentials; it only asks the website to act.

Found a problem? See [SECURITY.md](SECURITY.md).

---

## License

[MIT](LICENSE) © TCC Minecraft
