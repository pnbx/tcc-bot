// AI admin planner.
//
// Free chat models do not reliably support tool-calling, so the assistant is
// asked for ONE strict JSON action instead. Code — not the model — decides what
// is allowed and performs the side effect, so a hallucinated action can never
// reach the game server or the channel.

import { chat } from "./ai";

export type AdminAction =
  | { action: "answer"; text: string }
  | { action: "status" }
  | { action: "console"; limit?: number }
  | { action: "orders" }
  | { action: "players" }
  | { action: "tiers" }
  | { action: "news" }
  | { action: "command"; command: string }
  | { action: "post"; text: string };

const PLANNER_PROMPT = `تو «مدیر هوشمند» شبکه‌ی ماینکرفت TCC هستی و فقط به فارسی جواب می‌دهی.
وظیفه: درخواست مدیر را به **یک** عمل تبدیل کن و فقط یک JSON برگردان — بدون توضیح، بدون بلوک کد.

عمل‌های مجاز:
{"action":"answer","text":"..."}                      → فقط جواب یا توضیح
{"action":"status"}                                   → وضعیت زنده سرور
{"action":"console","limit":20}                        → خطوط اخیر کنسول
{"action":"orders"}                                    → گزارش فروش
{"action":"players"}                                   → بازیکنان و تیرها
{"action":"tiers"}                                     → جدول حالت‌ها و تیرها
{"action":"news"}                                      → آخرین اخبار
{"action":"command","command":"..."}                   → اجرای دستور کنسول ماینکرفت (بدون اسلش اول)
{"action":"post","text":"..."}                         → انتشار در کانال تلگرام

قواعد:
- بن کردن: command با «ban <player> <reason>»؛ رفع بن: «pardon <player>»؛ اخراج: «kick <player>»؛ پیام همگانی در بازی: «say <متن>».
- اگر کاربر می‌گوید «در کانال بگذار/منتشر کن» → action=post.
- اگر درخواست اجرایی نیست یا مطمئن نیستی → action=answer و توضیح بده.
- هیچ‌وقت عمل خطرناک را بدون درخواست صریح انتخاب نکن.`;

/** Parse the model's JSON answer defensively (models sometimes add prose or fences). */
export function parseAction(raw: string): AdminAction | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<AdminAction> & { action?: string };
    switch (parsed.action) {
      case "answer":
        return { action: "answer", text: String((parsed as { text?: string }).text ?? "").slice(0, 3500) || "چیزی برای گفتن ندارم." };
      case "status":
      case "orders":
      case "players":
      case "tiers":
      case "news":
        return { action: parsed.action } as AdminAction;
      case "console":
        return { action: "console", limit: Math.min(60, Math.max(5, Number((parsed as { limit?: number }).limit ?? 20))) };
      case "command":
        return { action: "command", command: String((parsed as { command?: string }).command ?? "").slice(0, 250) };
      case "post":
        return { action: "post", text: String((parsed as { text?: string }).text ?? "").slice(0, 3000) };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function planAdminAction(request: string, context: string): Promise<{ action: AdminAction | null; error?: string }> {
  const result = await chat([
    { role: "system", content: `${PLANNER_PROMPT}\n\nاطلاعات زنده‌ی همین لحظه (برای تصمیم‌گیری و پاسخ دقیق): ${context}` },
    { role: "user", content: request },
  ]);
  if (!result.ok) return { action: null, error: result.error };
  return { action: parseAction(result.text) };
}
