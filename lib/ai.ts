// OpenRouter with a fallback chain: every configured key is tried, and for each
// key every configured model — so one exhausted free key or a temporarily
// unavailable free model never takes the assistant down.

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const DEFAULT_MODELS = [
  "z-ai/glm-5.2:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "inclusionai/ling-3.0-flash-vl:free",
  "qwen/qwen3.8-27b:free",
  "dots-studio/dots-3-note-preview:free",
];

function keys(): string[] {
  return (process.env.OPENROUTER_API_KEYS ?? "")
    .split(/[,\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function models(): string[] {
  const configured = (process.env.OPENROUTER_MODELS ?? "")
    .split(/[,\s]+/)
    .map((m) => m.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_MODELS;
}

export type AiResult = { ok: true; text: string; model: string; keyIndex: number } | { ok: false; error: string };

export async function chat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<AiResult> {
  const allKeys = keys();
  if (allKeys.length === 0) return { ok: false, error: "no OpenRouter key configured" };

  let lastError = "unknown error";
  for (const [keyIndex, key] of allKeys.entries()) {
    for (const model of models()) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.TCC_SITE_URL ?? "https://site.tccmc.ir",
            "X-Title": "TCC Telegram Assistant",
          },
          cache: "no-store",
          body: JSON.stringify({
            model,
            messages,
            max_tokens: opts.maxTokens ?? 700,
            temperature: opts.temperature ?? 0.6,
          }),
        });
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          error?: { message?: string; code?: number };
        };
        if (json.error) {
          lastError = `${model}: ${json.error.message ?? "error"}`;
          continue; // next model, then next key
        }
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) return { ok: true, text, model, keyIndex };
        lastError = `${model}: empty answer`;
      } catch (err) {
        lastError = `${model}: ${(err as Error).message}`;
      }
    }
  }
  return { ok: false, error: lastError };
}
