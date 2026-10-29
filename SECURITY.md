# Security policy

## Reporting

Do not open a public issue for a vulnerability. Use GitHub's
[private vulnerability reporting](https://github.com/pnbx/tcc-bot/security/advisories/new)
or message the maintainer on Discord / Telegram.

## What matters most here

The bot is a remote control for a game server, so these are the interesting
surfaces:

1. **Who may command.** Every privileged handler checks the Telegram user id
   against `BOT_ADMIN_IDS`. A missing check means anyone who finds the bot can
   ban players.
2. **Model output is untrusted.** The assistant returns one JSON action and code
   validates it (`lib/agent.ts`). Never let a raw model string become a console
   command, a channel post, or HTML sent to Telegram.
3. **Webhook authenticity.** Telegram's `X-Telegram-Bot-Api-Secret-Token` must
   match `TELEGRAM_WEBHOOK_SECRET`, and the endpoint should not be callable
   meaningfully without it.
4. **Shared secret with the site.** `BOT_API_TOKEN` is compared in constant time;
   it travels only server-to-server.
5. **Escaping.** User and model text is HTML-escaped before sending. Long answers
   are split without breaking tags.

## Hardening checklist for a deployment

- [ ] `BOT_ADMIN_IDS` is a short, explicit list — never "everyone".
- [ ] `TELEGRAM_WEBHOOK_SECRET` is random and set with `setWebhook`.
- [ ] `BOT_API_TOKEN` differs from every other secret and matches the site.
- [ ] Bot token and admin ids live only in the platform's secret store.
- [ ] `/aiadmin` is opt-in per admin, not on by default.

## Out of scope

- vulnerabilities in the website or game server (report those to their repos),
- anything requiring a leaked bot token or an already-compromised admin account.
