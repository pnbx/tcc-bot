// Telegram Bot API helpers — HTML parse mode, inline keyboards, channel posts.

const API = "https://api.telegram.org";

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

export type InlineButton = { text: string; url?: string; web_app?: { url: string }; callback_data?: string };

export async function callTelegram<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${API}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) console.error(`[telegram] ${method} failed: ${json.description}`);
    return json.ok ? (json.result ?? null) : null;
  } catch (err) {
    console.error(`[telegram] ${method} error:`, (err as Error).message);
    return null;
  }
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { keyboard?: InlineButton[][]; preview?: boolean; replyTo?: number; threadId?: number } = {},
): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: opts.preview === true ? false : true },
    ...(opts.keyboard ? { reply_markup: { inline_keyboard: opts.keyboard } } : {}),
    ...(opts.replyTo ? { reply_parameters: { message_id: opts.replyTo } } : {}),
    ...(opts.threadId ? { message_thread_id: opts.threadId } : {}),
  });
}

export async function sendTyping(chatId: number | string): Promise<void> {
  await callTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Long messages must be split: Telegram caps a message at 4096 characters. */
export async function sendLong(chatId: number | string, text: string, opts: { keyboard?: InlineButton[][] } = {}): Promise<void> {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 3800) {
    let cut = rest.lastIndexOf("\n", 3800);
    if (cut < 1000) cut = 3800;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  chunks.push(rest);
  for (const [i, chunk] of chunks.entries()) {
    await sendMessage(chatId, chunk, i === chunks.length - 1 ? opts : {});
  }
}
