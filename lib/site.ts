// Thin client for the TCC website's bot API (see tcc-web/src/app/api/bot/[action]).

const BASE = (process.env.TCC_SITE_URL ?? "https://site.tccmc.ir").replace(/\/+$/, "");
const TOKEN = process.env.BOT_API_TOKEN ?? "";

async function get<T>(action: string, params: Record<string, string | number> = {}): Promise<T | null> {
  if (!TOKEN) return null;
  const url = new URL(`${BASE}/api/bot/${action}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  try {
    const res = await fetch(url, { headers: { "x-bot-token": TOKEN }, cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; data?: T; error?: string };
    return json.ok ? (json.data ?? null) : null;
  } catch (err) {
    console.error(`[site] ${action} failed:`, (err as Error).message);
    return null;
  }
}

export type SiteStatus = {
  address: string;
  online: boolean;
  state: "online" | "offline" | "unknown";
  playersOnline: number | null;
  playersMax: number | null;
  version: string | null;
  motd: string[] | null;
  reportedAt: string;
  agentOnline: boolean;
  metrics: { tps: number | null; mspt: number | null; ramUsedMb: number | null; ramMaxMb: number | null; diskUsedGb: number | null; uptimeSec: number | null } | null;
};

export type SiteOverview = {
  online: boolean;
  players: string;
  version: string | null;
  linkedAccounts: number;
  paidOrders: number;
  revenueToman: number;
  latestNews: { title: string; slug: string } | null;
};

export type ConsoleLines = { lines: { level: string; message: string }[] };
export type Tiers = { categories: { key: string; name: string; tiers: string[] }[] };
export type Orders = {
  byStatus: { status: string; count: number }[];
  revenueToman: number;
  recent: { number: string; status: string; user: string; items: string; total: number; at: string }[];
};
export type News = { articles: { title: string; slug: string; excerpt: string | null; publishedAt: string | null }[] };
export type Players = { players: { username: string; uuid: string; linked: boolean; tiers: string[] }[] };

export const site = {
  status: () => get<SiteStatus>("status"),
  overview: () => get<SiteOverview>("overview"),
  console: (limit = 25) => get<ConsoleLines>("console", { limit }),
  tiers: () => get<Tiers>("tiers"),
  orders: () => get<Orders>("orders"),
  news: () => get<News>("news"),
  players: () => get<Players>("players"),
  async runCommand(command: string, actor: string): Promise<{ queued: boolean; note?: string; error?: string } | null> {
    if (!TOKEN) return null;
    try {
      const res = await fetch(`${BASE}/api/bot/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bot-token": TOKEN, "x-bot-actor": actor },
        cache: "no-store",
        body: JSON.stringify({ command }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { queued: boolean; note?: string }; error?: string };
      return json.ok ? (json.data ?? null) : { queued: false, error: json.error };
    } catch (err) {
      return { queued: false, error: (err as Error).message };
    }
  },

  /** Is this Telegram admin in AI-admin mode? (persisted on the site) */
  async adminMode(id: number | string): Promise<boolean> {
    const data = await get<{ on: boolean }>("adminmode", { id: String(id) });
    return Boolean(data?.on);
  },

  async setAdminMode(id: number | string, on: boolean): Promise<boolean | null> {
    if (!TOKEN) return null;
    try {
      const res = await fetch(`${BASE}/api/bot/adminmode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bot-token": TOKEN },
        cache: "no-store",
        body: JSON.stringify({ id: String(id), on }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { on: boolean }; error?: string };
      return json.ok ? Boolean(json.data?.on) : null;
    } catch {
      return null;
    }
  },
};
