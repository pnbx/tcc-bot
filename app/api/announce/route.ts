import { NextRequest, NextResponse } from "next/server";
import { callTelegram, escapeHtml, sendMessage } from "@/lib/tg";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

// POST /api/announce — the website (or a deploy hook) pushes an update to the
// channel, e.g. "bug fix shipped" or "new mode added". Token protected.
export async function POST(req: NextRequest) {
  const expected = process.env.BOT_API_TOKEN ?? "";
  const got = req.headers.get("x-bot-token") ?? "";
  const ok = expected.length > 0 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const channel = process.env.TELEGRAM_CHANNEL_ID;
  if (!channel) return NextResponse.json({ ok: false, error: "TELEGRAM_CHANNEL_ID is not set" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { title?: string; message?: string; kind?: string };
  const title = body.title?.slice(0, 120) ?? "اطلاعیه‌ی TCC";
  const message = body.message?.slice(0, 3000) ?? "";
  if (!message) return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });

  const emoji = body.kind === "fix" ? "🛠" : body.kind === "update" ? "🚀" : body.kind === "news" ? "📰" : "📢";
  const site = (process.env.TCC_SITE_URL ?? "https://site.tccmc.ir").replace(/\/+$/, "");
  await sendMessage(channel, `${emoji} <b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}\n\n🌐 ${site}`, { preview: true });
  return NextResponse.json({ ok: true });
}
