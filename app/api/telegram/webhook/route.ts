import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/ai";
import { planAdminAction } from "@/lib/agent";
import { site, type SiteStatus } from "@/lib/site";
import { escapeHtml, sendLong, sendMessage, sendTyping, type InlineButton } from "@/lib/tg";

export const dynamic = "force-dynamic";

// ── TCC Telegram assistant ──────────────────────────────────────────────────
// One webhook: staff ask about the server, run moderation, post to the channel,
// and everyone can chat with the AI (which answers with live server context).

type Update = {
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
    message_thread_id?: number;
  };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
};

const SITE = (process.env.TCC_SITE_URL ?? "https://site.tccmc.ir").replace(/\/+$/, "");

function adminIds(): string[] {
  return (process.env.BOT_ADMIN_IDS ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function isStaff(userId?: number): boolean {
  if (!userId) return false;
  return adminIds().includes(String(userId));
}

function miniAppKeyboard(): InlineButton[][] {
  return [
    [{ text: "🎮 مینی‌اپ شبکه TCC", web_app: { url: `${SITE}/tg` } }],
    [
      { text: "🛒 استور", url: `${SITE}/store` },
      { text: "🏆 جدول تیر", url: `${SITE}/tiers` },
    ],
    [
      { text: "📰 اخبار", url: `${SITE}/news` },
      { text: "🌐 سایت", url: SITE },
    ],
  ];
}

const HELP = `🤖 <b>دستیار TCC</b>

<b>همه</b>
/status — وضعیت زنده سرور و مشخصات
/tiers — حالت‌ها و تیرهای هر حالت
/news — آخرین اخبار
/players — بازیکنان اخیر و تیرهایشان
/id — شناسه‌ی تلگرام تو
و هر سؤال آزاد: مستقیم برای دستیار بنویس 🙂

<b>فقط برای تیم</b> (مالک، ادمین، دولوپر)
/console [تعداد] — خطوط اخیر کنسول
/orders — گزارش فروش و سفارش‌ها
/ban &lt;بازیکن&gt; [دلیل] — بن کردن
/unban &lt;بازیکن&gt; — رفع بن
/kick &lt;بازیکن&gt; — اخراج
/say &lt;متن&gt; — پیام همگانی در بازی
/post &lt;متن&gt; — ارسال به کانال
/ask &lt;سؤال&gt; — پرسش از دستیار
/aiadmin — مدیر هوشمند: هر چه بگویی انجام می‌دهد (وضعیت، بن، پست در کانال)`;

function fmtStatus(s: SiteStatus): string {
  const state =
    s.state === "online" ? "🟢 آنلاین" : s.state === "unknown" ? "🟡 نامشخص" : "🔴 آفلاین";
  const m = s.metrics;
  const lines = [
    `📡 <b>${escapeHtml(s.address)}</b> — ${state}`,
    `👥 بازیکنان: <b>${s.playersOnline ?? "—"}</b>${s.playersMax != null ? ` از ${s.playersMax}` : ""}`,
    s.version ? `🧩 نسخه: ${escapeHtml(s.version)}` : "",
    m?.tps != null ? `⚙️ TPS: <b>${m.tps.toFixed(1)}</b> · MSPT: ${m.mspt?.toFixed(1) ?? "—"}` : "",
    m?.ramUsedMb != null ? `💾 رم: ${Math.round(m.ramUsedMb)}${m.ramMaxMb ? ` / ${Math.round(m.ramMaxMb)}` : ""} MB` : "",
    m?.diskUsedGb != null ? `🗄 دیسک: ${m.diskUsedGb.toFixed(2)} GB` : "",
    `🔗 ایجنت: ${s.agentOnline ? "متصل ✅" : "قطع ❌"}`,
  ].filter(Boolean);
  if (s.motd?.length) lines.push(`\n> ${escapeHtml(s.motd[0])}`);
  return lines.join("\n");
}

async function liveContext(): Promise<string> {
  const s = await site.status();
  if (!s) return "اطلاعات زنده در دسترس نیست.";
  return [
    `آدرس سرور: ${s.address}`,
    `وضعیت: ${s.state} (بازیکنان ${s.playersOnline ?? "?"} از ${s.playersMax ?? "?"})`,
    s.version ? `نسخه: ${s.version}` : "",
    s.metrics?.tps != null ? `TPS: ${s.metrics.tps}` : "",
    `ایجنت: ${s.agentOnline ? "فعال" : "غیرفعال"}`,
    s.motd?.length ? `MOTD: ${s.motd[0]}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

const SYSTEM_PROMPT = `تو «دستیار TCC» هستی، دستیار رسمی شبکه‌ی ماینکرفت TCC (آدرس tccmc.ir، سایت site.tccmc.ir).
همیشه فارسی، کوتاه، دقیق و دوستانه جواب بده. از ایموجی کم و بجا استفاده کن.
اتکا کن به اطلاعات زنده‌ای که در پیام سیستم می‌آید؛ اگر چیزی را نمی‌دانی صادقانه بگو و کاربر را به سایت یا تیم ارجاع بده.
درباره‌ی سیستم تیر: شش حالت (سورد، پات، نث‌پات، اکس، UHC، میس) و در هر حالت ده تیر از ht1 (بهترین) تا lt5.
ورود به سرور رایگان است؛ رنک‌ها و پریفیکس‌ها از استور سایت قابل خریدند و بعد از پرداخت خودکار روی سرور اعمال می‌شوند.
دستورهای بازی: /site connect <کد> برای اتصال حساب به سایت، /mytiers برای دیدن تیرها.`;

async function handleText(chatId: number, userId: number | undefined, text: string, replyTo: number, who: string): Promise<void> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, "");
  const args = rest.join(" ").trim();
  const staff = isStaff(userId);

  switch (cmd) {
    case "/start":
    case "/help": {
      await sendMessage(
        chatId,
        `👋 سلام ${escapeHtml(who)}!\n\n${HELP}`,
        { keyboard: miniAppKeyboard(), replyTo },
      );
      return;
    }

    case "/id":
      await sendMessage(chatId, `🆔 شناسه‌ی تلگرام تو: <code>${userId ?? "?"}</code>\n\nاین را برای مدیر بفرست تا دسترسی تیم بگیری.`, { replyTo });
      return;

    case "/status": {
      const s = await site.status();
      await sendMessage(chatId, s ? fmtStatus(s) : "⚠️ نتوانستم وضعیت را بگیرم.", { keyboard: miniAppKeyboard(), replyTo });
      return;
    }

    case "/tiers": {
      const t = await site.tiers();
      if (!t) return void (await sendMessage(chatId, "⚠️ فهرست تیرها در دسترس نیست.", { replyTo }));
      const body = t.categories.map((c) => `▫️ <b>${escapeHtml(c.name)}</b>\n   ${c.tiers.join(" · ")}`).join("\n");
      await sendLong(chatId, `🏆 <b>حالت‌ها و تیرها</b>\n\n${body}`, {});
      return;
    }

    case "/news": {
      const n = await site.news();
      if (!n || n.articles.length === 0) return void (await sendMessage(chatId, "📰 خبر تازه‌ای نیست.", { replyTo }));
      const body = n.articles.map((a) => `• <a href="${SITE}/news/${a.slug}">${escapeHtml(a.title)}</a>`).join("\n");
      await sendMessage(chatId, `📰 <b>آخرین اخبار</b>\n\n${body}`, { replyTo });
      return;
    }

    case "/players": {
      const p = await site.players();
      if (!p) return void (await sendMessage(chatId, "⚠️ در دسترس نیست.", { replyTo }));
      const body = p.players
        .slice(0, 10)
        .map((x) => `• <code>${escapeHtml(x.username)}</code> ${x.tiers.length ? `— ${escapeHtml(x.tiers.join(", "))}` : "— بدون تیر"}${x.linked ? " 🔗" : ""}`)
        .join("\n");
      await sendMessage(chatId, `👥 <b>بازیکنان اخیر</b>\n\n${body}`, { replyTo });
      return;
    }

    case "/console": {
      if (!staff) return void (await sendMessage(chatId, "⛔️ این دستور مخصوص تیم است. برای گرفتن دسترسی /id را بزن و به مدیر بده.", { replyTo }));
      const limit = Math.min(60, Math.max(5, Number(args) || 20));
      const c = await site.console(limit);
      if (!c) return void (await sendMessage(chatId, "⚠️ کنسول در دسترس نیست.", { replyTo }));
      const body = c.lines.map((l) => {
        const icon = l.level === "ERROR" ? "🔴" : l.level === "WARN" ? "🟡" : "▫️";
        return `${icon} <code>${escapeHtml(l.message.slice(0, 160))}</code>`;
      });
      await sendLong(chatId, `🖥 <b>کنسول سرور</b> (${c.lines.length} خط آخر)\n\n${body.join("\n")}`);
      return;
    }

    case "/orders": {
      if (!staff) return void (await sendMessage(chatId, "⛔️ دسترسی ندارید.", { replyTo }));
      const o = await site.orders();
      if (!o) return void (await sendMessage(chatId, "⚠️ گزارش فروش در دسترس نیست.", { replyTo }));
      const byStatus = o.byStatus.map((b) => `${b.status}: ${b.count}`).join(" · ");
      const recent = o.recent
        .map((r) => `• <code>${escapeHtml(r.number)}</code> ${r.status} — ${escapeHtml(r.user)} (${escapeHtml(r.items)})`)
        .join("\n");
      await sendLong(chatId, `🧾 <b>فروش</b>\n\nمجموع پرداخت‌شده: <b>${o.revenueToman.toLocaleString("en-US")}</b> تومان\nسفارش‌ها: ${byStatus}\n\n<b>آخرین‌ها</b>\n${recent}`);
      return;
    }

    case "/ban":
    case "/unban":
    case "/kick": {
      if (!staff) return void (await sendMessage(chatId, "⛔️ دسترسی ندارید.", { replyTo }));
      if (!args) return void (await sendMessage(chatId, `استفاده: <code>${cmd} &lt;بازیکن&gt; [دلیل]</code>`, { replyTo }));
      const [player, ...reasonParts] = args.split(/\s+/);
      const reason = reasonParts.join(" ") || "by staff";
      const mcCommand =
        cmd === "/ban" ? `ban ${player} ${reason}` : cmd === "/unban" ? `pardon ${player}` : `kick ${player} ${reason}`;
      const res = await site.runCommand(mcCommand, `tg:${userId}`);
      await sendMessage(chatId, res?.queued ? `✅ دستور اجرا شد:\n<code>${escapeHtml(mcCommand)}</code>\n\n${escapeHtml(res.note ?? "")}` : `⚠️ اجرا نشد: ${escapeHtml(res?.error ?? "خطای نامشخص")}`, { replyTo });
      return;
    }

    case "/say": {
      if (!staff) return void (await sendMessage(chatId, "⛔️ دسترسی ندارید.", { replyTo }));
      if (!args) return void (await sendMessage(chatId, "استفاده: <code>/say متن پیام</code>", { replyTo }));
      const res = await site.runCommand(`say ${args}`, `tg:${userId}`);
      await sendMessage(chatId, res?.queued ? "📣 پیام همگانی در صف اجرا قرار گرفت." : `⚠️ اجرا نشد: ${escapeHtml(res?.error ?? "خطا")}`, { replyTo });
      return;
    }

    case "/post": {
      if (!staff) return void (await sendMessage(chatId, "⛔️ دسترسی ندارید.", { replyTo }));
      const channel = process.env.TELEGRAM_CHANNEL_ID;
      if (!channel) return void (await sendMessage(chatId, "⚠️ TELEGRAM_CHANNEL_ID تنظیم نشده است.", { replyTo }));
      if (!args) return void (await sendMessage(chatId, "استفاده: <code>/post متن خبر</code>", { replyTo }));
      await sendMessage(channel, `📢 <b>اطلاعیه‌ی TCC</b>\n\n${escapeHtml(args)}\n\n🌐 ${SITE}`, { preview: true });
      await sendMessage(chatId, "✅ به کانال ارسال شد.", { replyTo });
      return;
    }

    case "/ask": {
      const question = args || text;
      await answerWithAI(chatId, question, replyTo);
      return;
    }
  }

  if (cmd === "/aiadmin") {
    if (!staff || !userId) return void (await sendMessage(chatId, "⛔️ این دستور فقط برای مالک/ادمین/دولوپر است.", { replyTo }));
    if (!args || /^(on|روشن|فعال)$/i.test(args)) {
      await site.setAdminMode(userId, true);
      await sendMessage(
        chatId,
        "🧠 <b>مدیر هوشمند فعال شد</b>\n\nاز این پس هر چه بدون اسلش بنویسی، همان را انجام می‌دهم. مثلاً:\n• وضعیت سرور چطوره؟\n• ۱۰ خط آخر کنسول\n• فلانی را به دلیل تقلب بن کن\n• در کانال بنویس مسابقه‌ی فردا برگزار می‌شود\n\nبرای خروج: <code>/aiadmin off</code>",
        { replyTo },
      );
      return;
    }
    if (/^(off|خاموش|غیرفعال)$/i.test(args)) {
      await site.setAdminMode(userId, false);
      await sendMessage(chatId, "🧠 حالت مدیر هوشمند خاموش شد.", { replyTo });
      return;
    }
    await runAdminAI(chatId, userId, args, replyTo);
    return;
  }

  if (cmd.startsWith("/")) {
    await sendMessage(chatId, `❓ دستور ناشناخته: <code>${escapeHtml(cmd)}</code>\n\n${HELP}`, { keyboard: miniAppKeyboard(), replyTo });
    return;
  }

  if (staff && userId && (await site.adminMode(userId))) {
    await runAdminAI(chatId, userId, text, replyTo);
    return;
  }
  await answerWithAI(chatId, text, replyTo);
}

async function runAdminAI(chatId: number, userId: number, request: string, replyTo: number): Promise<void> {
  await sendTyping(chatId);
  const context = await liveContext();
  const { action, error } = await planAdminAction(request, context);
  if (!action) {
    await sendMessage(chatId, "😕 نتوانستم درخواست را به عمل تبدیل کنم." + (error ? "\n<code>" + escapeHtml(error.slice(0, 160)) + "</code>" : ""), { replyTo });
    return;
  }
  const fmt = (t: string) => escapeHtml(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

  switch (action.action) {
    case "answer":
      await sendLong(chatId, fmt(action.text), { keyboard: miniAppKeyboard() });
      return;

    case "status": {
      const st = await site.status();
      await sendMessage(chatId, st ? "🔧 <b>وضعیت زنده</b>\n\n" + fmtStatus(st) : "⚠️ وضعیت در دسترس نیست.", { keyboard: miniAppKeyboard(), replyTo });
      return;
    }

    case "console": {
      const c = await site.console(action.limit ?? 20);
      if (!c) return void (await sendMessage(chatId, "⚠️ کنسول در دسترس نیست.", { replyTo }));
      const body = c.lines.map((l) => (l.level === "ERROR" ? "🔴" : l.level === "WARN" ? "🟡" : "▫️") + " <code>" + escapeHtml(l.message.slice(0, 160)) + "</code>");
      await sendLong(chatId, "🔧 <b>کنسول</b> (" + c.lines.length + " خط آخر)\n\n" + body.join("\n"));
      return;
    }

    case "orders": {
      const o = await site.orders();
      if (!o) return void (await sendMessage(chatId, "⚠️ گزارش فروش در دسترس نیست.", { replyTo }));
      const recent = o.recent.map((r) => "• <code>" + escapeHtml(r.number) + "</code> " + r.status + " — " + escapeHtml(r.user)).join("\n");
      await sendLong(chatId, "🔧 <b>فروش</b>\n\nمجموع: <b>" + o.revenueToman.toLocaleString("en-US") + "</b> تومان\n\n" + recent);
      return;
    }

    case "players": {
      const p = await site.players();
      if (!p) return void (await sendMessage(chatId, "⚠️ در دسترس نیست.", { replyTo }));
      const body = p.players.slice(0, 10).map((x) => "• <code>" + escapeHtml(x.username) + "</code> " + (x.tiers.length ? "— " + escapeHtml(x.tiers.join(", ")) : "— بدون تیر")).join("\n");
      await sendMessage(chatId, "🔧 <b>بازیکنان</b>\n\n" + body, { replyTo });
      return;
    }

    case "tiers": {
      const t = await site.tiers();
      if (!t) return void (await sendMessage(chatId, "⚠️ در دسترس نیست.", { replyTo }));
      const body = t.categories.map((c) => "▫️ <b>" + escapeHtml(c.name) + "</b>\n   " + c.tiers.join(" · ")).join("\n");
      await sendLong(chatId, "🔧 <b>حالت‌ها و تیرها</b>\n\n" + body);
      return;
    }

    case "news": {
      const n = await site.news();
      if (!n || n.articles.length === 0) return void (await sendMessage(chatId, "📰 خبری نیست.", { replyTo }));
      const body = n.articles.map((a) => '• <a href="' + SITE + "/news/" + a.slug + '">' + escapeHtml(a.title) + "</a>").join("\n");
      await sendMessage(chatId, "🔧 <b>آخرین اخبار</b>\n\n" + body, { replyTo });
      return;
    }

    case "command": {
      if (!action.command) return void (await sendMessage(chatId, "⚠️ دستور خالی بود.", { replyTo }));
      const res = await site.runCommand(action.command, "tg:" + userId);
      await sendMessage(chatId, res?.queued ? "🔧 دستور اجرا شد:\n<code>" + escapeHtml(action.command) + "</code>\n\n" + escapeHtml(res.note ?? "") : "⚠️ اجرا نشد: " + escapeHtml(res?.error ?? "خطای نامشخص"), { replyTo });
      return;
    }

    case "post": {
      const channel = process.env.TELEGRAM_CHANNEL_ID;
      if (!channel) return void (await sendMessage(chatId, "⚠️ TELEGRAM_CHANNEL_ID تنظیم نشده است.", { replyTo }));
      await sendMessage(channel, "📢 <b>اطلاعیه‌ی TCC</b>\n\n" + escapeHtml(action.text) + "\n\n🌐 " + SITE, { preview: true });
      await sendMessage(chatId, "🔧 در کانال منتشر شد ✅", { replyTo });
      return;
    }
  }
}

async function answerWithAI(chatId: number, question: string, replyTo?: number): Promise<void> {
  await sendTyping(chatId);
  const context = await liveContext();
  const result = await chat([
    { role: "system", content: `${SYSTEM_PROMPT}\n\nاطلاعات زنده‌ی همین لحظه: ${context}` },
    { role: "user", content: question },
  ]);
  if (!result.ok) {
    await sendMessage(chatId, `😕 الان نتوانستم جواب بدهم.\n<code>${escapeHtml(result.error.slice(0, 200))}</code>`, { replyTo });
    return;
  }
  // The model sometimes emits angle brackets (e.g. a Persian placeholder like
  // «<کد_شما>»), which Telegram rejects as an unsupported tag — escape first and
  // only then re-enable **bold** as real HTML.
  const safe = escapeHtml(result.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  await sendLong(chatId, safe, { keyboard: miniAppKeyboard() });
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (msg?.text) {
    const who = msg.from?.first_name ?? msg.from?.username ?? "دوست من";
    await handleText(msg.chat.id, msg.from?.id, msg.text, msg.message_id, who);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "tcc-bot", site: SITE });
}
