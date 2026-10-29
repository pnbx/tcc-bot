# ربات TCC

[English](README.md) · **فارسی**

**ربات تلگرام شبکه‌ی TCC** — یه ربات برای همه‌ی تیم: وضعیت زنده‌ی سرور، گزارش فروش، دستورهای مدیریتی، طراحی رنک و پرفیکس با هوش مصنوعی، و یه «ادمین هوشمند»؛ به‌علاوه یه مینی‌اپ گوشی‌پسند که همون داشبورد سایت رو نشون می‌ده.

دیتابیس جدا نداره. هر چی می‌خواد از API ربات سایت ([`tcc-web`](https://github.com/pnbx/tcc-web)) می‌گیره، که مرجع اصلی همه‌چیزه.

---

## چیکار می‌کنه؟

**برای بازیکن‌ها**
- `/start` — وصل کردن تلگرام با کدی که از سایت می‌گیری (`/connect-telegram`)
- `/me` و `/ranks` — رنک‌هات و چند روز مونده
- `/status` — تعداد بازیکن آنلاین، MOTD، ورژن
- `/tiers` — جدول تیرها
- `/news` — آخرین خبرها
- `/prefix` — بگو چه تگی می‌خوای، طرحش رو می‌ده، قیمت می‌خوره و دکمه‌ی خرید می‌ذاره
- `/ask` — سوال آزاد، با اطلاعات همون لحظه‌ی سرور جواب می‌ده

**برای تیم** (مالک، ادمین، دولوپر — از روی `BOT_ADMIN_IDS` چک می‌شه)
- `/console [n]`، `/orders`، `/players`
- `/ban`، `/unban`، `/kick`، `/say`، `/post`
- `/aiadmin` — یه هوش مصنوعی که وضعیت رو می‌خونه و همون کارها رو انجام می‌ده؛ برای هر ادمین جدا روشن می‌شه

**برای سایت**
- `POST /api/announce` با هدر `x-bot-token` — پست توی کانال

---

## هوش مصنوعیش چطور کار می‌کنه

مدل‌های رایگان ابزار (tool) رو درست صدا نمی‌زنن، پس بهش ابزار نمی‌دیم. مدل فقط باید **یک** JSON بده (`lib/agent.ts`)؛ مثلاً:

```json
{ "action": "command", "command": "ban Steve griefing" }
```

بعدش **کد** تصمیم می‌گیره این کار مجازه یا نه و خودش انجامش می‌ده. اگه مدل چرت بگه یا JSON خراب بده، `parseAction` دورش می‌ندازه — یعنی خروجی مدل هیچ‌وقت مستقیم به کنسول سرور یا کانال نمی‌رسه.

اکشن‌های مجاز: `answer`، `status`، `console`، `orders`، `players`، `tiers`، `news`، `command`، `post`.

---

## معماری

```
تلگرام ──webhook──▶ app/api/telegram/webhook ──▶ lib/agent (پلنر)
                          │                        │
                          │                        ▼
                          │                   lib/site ──x-bot-token──▶ tcc-web /api/bot/<action>
                          ▼
                  lib/tg (Bot API: پیام، کیبورد، دکمه‌ی Web App)
```

| فایل | کارش |
|---|---|
| `app/api/telegram/webhook/route.ts` | وب‌هوک، روتر دستورها، سطح دسترسی |
| `app/api/announce/route.ts` | پست کانال با توکن، برای سایت |
| `lib/agent.ts` | پلنر JSON، پارسر، گاردها |
| `lib/ai.ts` | کلاینت OpenRouter با زنجیره‌ی مدل |
| `lib/site.ts` | کلاینت API ربات سایت |
| `lib/tg.ts` | کمک‌کننده‌های Bot API: اسکیپ HTML، تکه‌کردن پیام بلند، دکمه |

---

## راه‌اندازی

```bash
git clone https://github.com/pnbx/tcc-bot.git
cd tcc-bot
npm install
cp .env.example .env.local
npm run dev
```

بعد وب‌هوک رو ست کن:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<دامنه-ربات>/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

`BOT_API_TOKEN` باید دقیقاً همون مقدار توکن سایت باشه. اگه نباشه، هر تماس به API سایت خالی برمی‌گرده و ربات می‌گه «در دسترس نیست».

---

## متغیرهای محیطی

| کلید | کار |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توکن BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | با هدر `X-Telegram-Bot-Api-Secret-Token` چک می‌شه |
| `TELEGRAM_CHANNEL_ID` | کانال برای `/post` و `/api/announce` |
| `BOT_ADMIN_IDS` | آیدی عددی ادمین‌ها، با کاما جدا |
| `TCC_SITE_URL` | آدرس سایت (پیش‌فرض `https://site.tccmc.ir`) |
| `BOT_API_TOKEN` | سکرت مشترک با سایت |
| `OPENROUTER_API_KEYS` | یک یا چند کلید، به ترتیب امتحان می‌شن |
| `OPENROUTER_MODELS` | زنجیره‌ی مدل‌ها |

روی Vercel و ریجن `fra1` دیپلوی می‌شه (`vercel.json`).

---

## نکته‌های امنیتی

- هر دستور مدیریتی فرستنده رو با `BOT_ADMIN_IDS` چک می‌کنه؛ عضو کانال بودن کافی نیست.
- وب‌هوک هدر سکرت تلگرام رو تایید می‌کنه.
- مقایسه‌ی `x-bot-token` به‌صورت constant-time انجام می‌شه.
- متن کاربر قبل از ارسال اسکیپ می‌شه و پیام‌های بلند بدون خراب‌شدن تگ‌ها تکه می‌شن.
- ربات هیچ پسورد ماینکرفتی نگه نمی‌داره؛ فقط به سایت می‌گه چه کاری بکنه.

مشکلی دیدی؟ [SECURITY.md](SECURITY.md)

---

## لایسنس

[MIT](LICENSE) © TCC Minecraft
