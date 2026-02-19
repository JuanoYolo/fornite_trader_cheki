interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  FORTNITE_API_KEY: string;
}

type MarketType = "season" | "historical";
type ScopeType = "season" | "historical";
type FundamentalStatus = "live" | "cached" | "fallback";

type FortniteNormalized = {
  player: string;
  platform: "pc" | "xbl";
  scope: ScopeType;
  wins: number;
  kd: number;
  winRate: number;
  matches: number;
  kills: number;
  score: number;
  raw: unknown;
};

const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS = "content-type,authorization";
const DEFAULT_MARKET: MarketType = "season";
const STATS_TTL_MINUTES = 10;
const PRICE_BLEND_ALPHA = 0.7;
const FUNDAMENTAL_DELTA_CLAMP = 0.25;

const COIN_PROFILES: Record<string, { player: string; platform: "pc" | "xbl"; seedPrice: number }> = {
  JUANO: { player: "JuanoYoloXd", platform: "pc", seedPrice: 50000 },
  ZOM: { player: "ZomHeldD", platform: "pc", seedPrice: 60000 },
  CRIS: { player: "cristofprime", platform: "xbl", seedPrice: 55000 },
};

function normalizeMarketType(value: string | null): MarketType {
  return value === "historical" ? "historical" : DEFAULT_MARKET;
}

function resolveOrigin(origin: string | null): string {
  if (!origin) return "*";
  if (/^http:\/\/localhost(?::\d+)?$/.test(origin)) return origin;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) return origin;
  if (/^https:\/\//.test(origin)) return origin;
  return "*";
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(origin),
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

function err(message: string, status = 400, origin: string | null = null): Response {
  return json({ error: message }, status, origin);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asNumber(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function pickStatsBlock(raw: unknown, platform: "pc" | "xbl"): Record<string, unknown> {
  const root = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const data = (root.data && typeof root.data === "object") ? (root.data as Record<string, unknown>) : {};
  const stats = (data.stats && typeof data.stats === "object") ? (data.stats as Record<string, unknown>) : {};

  const platformBlock = (stats[platform] && typeof stats[platform] === "object")
    ? (stats[platform] as Record<string, unknown>)
    : {};

  const overallFromPlatform = (platformBlock.overall && typeof platformBlock.overall === "object")
    ? (platformBlock.overall as Record<string, unknown>)
    : {};

  const allBlock = (stats.all && typeof stats.all === "object") ? (stats.all as Record<string, unknown>) : {};
  const overallFromAll = (allBlock.overall && typeof allBlock.overall === "object")
    ? (allBlock.overall as Record<string, unknown>)
    : {};

  return Object.keys(overallFromPlatform).length ? overallFromPlatform : overallFromAll;
}

function computeFundamentalScore(stats: { kd: number; winRate: number; wins: number }): number {
  const kdNorm = clamp(stats.kd / 5, 0, 1);
  const winRateNorm = clamp(stats.winRate / 25, 0, 1);
  const winsNorm = clamp(stats.wins / 100, 0, 1);
  return 0.5 * kdNorm + 0.3 * winRateNorm + 0.2 * winsNorm;
}

function combinePrice(seedPrice: number, tradingPrice: number, score: number): number {
  const delta = clamp(score - 0.5, -FUNDAMENTAL_DELTA_CLAMP, FUNDAMENTAL_DELTA_CLAMP);
  const priceBase = seedPrice * (1 + delta);
  return PRICE_BLEND_ALPHA * tradingPrice + (1 - PRICE_BLEND_ALPHA) * priceBase;
}

async function supabase(env: Env, path: string, options?: RequestInit) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options?.headers || {}),
    },
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: response.ok, status: response.status, data: text as unknown };
  }
}

async function rpc(env: Env, fn: string, params: Record<string, unknown>) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: response.ok, status: response.status, data: text as unknown };
  }
}

async function fetchFortniteStats(
  env: Env,
  player: string,
  platform: "pc" | "xbl",
  scope: ScopeType
): Promise<FortniteNormalized> {
  const timeWindow = scope === "season" ? "season" : "lifetime";
  const url = `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(player)}&accountType=epic&timeWindow=${timeWindow}`;

  const response = await fetch(url, {
    headers: {
      Authorization: env.FORTNITE_API_KEY,
    },
  });

  if (response.status === 404) {
    throw new Error(`Fortnite player not found: ${player}`);
  }

  if (response.status === 429) {
    throw new Error("Fortnite-API rate limited (429)");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fortnite-API error ${response.status}: ${body.slice(0, 180)}`);
  }

  const raw = (await response.json()) as unknown;
  const block = pickStatsBlock(raw, platform);

  const wins = asNumber(block.wins);
  const kd = asNumber(block.kd);
  const winRate = asNumber(block.winRate);
  const matches = asNumber(block.matches);
  const kills = asNumber(block.kills);
  const score = computeFundamentalScore({ wins, kd, winRate });

  return {
    player,
    platform,
    scope,
    wins,
    kd,
    winRate,
    matches,
    kills,
    score,
    raw,
  };
}

async function getCachedOrLiveStats(
  env: Env,
  player: string,
  platform: "pc" | "xbl",
  scope: ScopeType
): Promise<{ stats: FortniteNormalized; status: FundamentalStatus }> {
  const nowIso = new Date().toISOString();
  const cacheRes = await supabase(
    env,
    `fortnite_stats_cache?player_name=eq.${encodeURIComponent(player)}&platform=eq.${platform}&scope=eq.${scope}&select=*`
  );

  if (cacheRes.ok && Array.isArray(cacheRes.data) && cacheRes.data.length) {
    const row = cacheRes.data[0] as Record<string, unknown>;
    const expiresAt = String(row.expires_at || "");
    if (expiresAt && expiresAt > nowIso) {
      return {
        stats: {
          player,
          platform,
          scope,
          wins: asNumber(row.wins),
          kd: asNumber(row.kd),
          winRate: asNumber(row.win_rate),
          matches: asNumber(row.matches),
          kills: asNumber(row.kills),
          score: asNumber(row.computed_score),
          raw: row.payload,
        },
        status: "cached",
      };
    }
  }

  const stats = await fetchFortniteStats(env, player, platform, scope);
  const expiresAt = new Date(Date.now() + STATS_TTL_MINUTES * 60 * 1000).toISOString();

  await supabase(env, "fortnite_stats_cache?on_conflict=player_name,platform,scope", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      player_name: player,
      platform,
      scope,
      wins: stats.wins,
      kd: stats.kd,
      win_rate: stats.winRate,
      matches: stats.matches,
      kills: stats.kills,
      computed_score: stats.score,
      payload: stats.raw,
      observed_at: nowIso,
      expires_at: expiresAt,
    }),
  });

  return { stats, status: "live" };
}

async function ensurePlayerForMarket(
  env: Env,
  roomCode: string,
  displayName: string,
  pin: string,
  marketType: MarketType,
  playerIdentity: string
): Promise<Record<string, unknown>> {
  const existing = await supabase(
    env,
    `room_players?room_code=eq.${roomCode}&display_name=eq.${encodeURIComponent(displayName)}&market_type=eq.${marketType}&limit=1`
  );

  if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
    const player = existing.data[0] as Record<string, unknown>;
    if (String(player.pin) !== pin) throw new Error("Invalid PIN");
    return player;
  }

  const playerCode = `${playerIdentity}-${marketType}`;
  const created = await supabase(env, "room_players", {
    method: "POST",
    body: JSON.stringify({
      room_code: roomCode,
      player_identity: playerIdentity,
      market_type: marketType,
      player_code: playerCode,
      display_name: displayName,
      pin,
      cash: 100000,
    }),
  });

  if (!created.ok || !Array.isArray(created.data) || !created.data.length) {
    throw new Error("Failed to create player");
  }

  const player = created.data[0] as Record<string, unknown>;
  for (const symbol of Object.keys(COIN_PROFILES)) {
    await supabase(env, "holdings", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({
        room_code: roomCode,
        player_id: player.id,
        coin_symbol: symbol,
        market_type: marketType,
        qty: 0,
      }),
    });
  }

  return player;
}


async function resolvePlayerCodeForMarket(env: Env, roomCode: string, playerCode: string, marketType: MarketType): Promise<string | null> {
  const exact = await supabase(env, `room_players?room_code=eq.${roomCode}&player_code=eq.${playerCode}&market_type=eq.${marketType}&limit=1`);
  if (exact.ok && Array.isArray(exact.data) && exact.data.length) return playerCode;

  const base = await supabase(env, `room_players?room_code=eq.${roomCode}&player_code=eq.${playerCode}&limit=1`);
  if (!base.ok || !Array.isArray(base.data) || !base.data.length) return null;

  const identity = String((base.data[0] as Record<string, unknown>).player_identity || "");
  if (!identity) return null;

  const mapped = await supabase(env, `room_players?room_code=eq.${roomCode}&player_identity=eq.${encodeURIComponent(identity)}&market_type=eq.${marketType}&limit=1`);
  if (!mapped.ok || !Array.isArray(mapped.data) || !mapped.data.length) return null;

  return String((mapped.data[0] as Record<string, unknown>).player_code || "");
}

async function handleHealth(origin: string | null) {
  return json({ status: "ok", ts: new Date().toISOString() }, 200, origin);
}

async function handleFortniteStatsDebug(env: Env, url: URL, origin: string | null) {
  const player = url.searchParams.get("player");
  const platform = url.searchParams.get("platform") as "pc" | "xbl" | null;
  const scope = (url.searchParams.get("scope") || "season") as ScopeType;

  if (!player || !platform || (platform !== "pc" && platform !== "xbl")) {
    return err("player and platform(pc|xbl) are required", 400, origin);
  }

  try {
    const { stats, status } = await getCachedOrLiveStats(env, player, platform, scope === "historical" ? "historical" : "season");
    return json({ ok: true, status, stats }, 200, origin);
  } catch (error) {
    return err(error instanceof Error ? error.message : "Failed to fetch stats", 502, origin);
  }
}

async function handleJoin(env: Env, body: unknown, origin: string | null) {
  const payload = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
  const roomCode = String(payload.room_code || "").trim();
  const displayName = String(payload.display_name || "").trim();
  const pin = String(payload.pin || "").trim();
  if (!roomCode || !displayName || !pin) return err("Missing fields", 400, origin);

  await supabase(env, "rooms", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ room_code: roomCode, spread_bps: 50 }),
  });

  for (const [coinSymbol, profile] of Object.entries(COIN_PROFILES)) {
    for (const marketType of ["season", "historical"] as const) {
      const existing = await supabase(
        env,
        `prices?room_code=eq.${roomCode}&coin_symbol=eq.${coinSymbol}&market_type=eq.${marketType}&limit=1`
      );
      if (existing.ok && Array.isArray(existing.data) && existing.data.length === 0) {
        await supabase(env, "prices", {
          method: "POST",
          body: JSON.stringify({
            room_code: roomCode,
            coin_symbol: coinSymbol,
            market_type: marketType,
            price: profile.seedPrice,
            source: "seed",
          }),
        });
      }
    }
  }

  const playerIdentity = `${roomCode}-${displayName.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`;
  let seasonPlayer: Record<string, unknown>;
  let historicalPlayer: Record<string, unknown>;
  try {
    seasonPlayer = await ensurePlayerForMarket(env, roomCode, displayName, pin, "season", playerIdentity);
    historicalPlayer = await ensurePlayerForMarket(env, roomCode, displayName, pin, "historical", playerIdentity);
  } catch (error) {
    return err(error instanceof Error ? error.message : "Join failed", 403, origin);
  }

  const room = await supabase(env, `rooms?room_code=eq.${roomCode}&limit=1`);
  const spread = room.ok && Array.isArray(room.data) ? asNumber((room.data[0] as Record<string, unknown>)?.spread_bps) || 50 : 50;

  return json(
    {
      ok: true,
      room_code: roomCode,
      player_code: String(seasonPlayer.player_code),
      display_name: displayName,
      cash: asNumber(seasonPlayer.cash),
      spread_bps: spread,
      player_codes: {
        season: String(seasonPlayer.player_code),
        historical: String(historicalPlayer.player_code),
      },
    },
    200,
    origin
  );
}

async function handleState(env: Env, url: URL, origin: string | null) {
  const roomCode = url.searchParams.get("room_code");
  const playerCode = url.searchParams.get("player_code");
  const marketType = normalizeMarketType(url.searchParams.get("market_type"));
  if (!roomCode || !playerCode) return err("Missing params", 400, origin);

  const resolvedCode = await resolvePlayerCodeForMarket(env, roomCode, playerCode, marketType);
  if (!resolvedCode) return err("Player not found", 404, origin);

  const playerRes = await supabase(
    env,
    `room_players?room_code=eq.${roomCode}&player_code=eq.${resolvedCode}&market_type=eq.${marketType}&limit=1`
  );

  if (!playerRes.ok || !Array.isArray(playerRes.data) || !playerRes.data.length) return err("Player not found", 404, origin);
  const player = playerRes.data[0] as Record<string, unknown>;

  const holdingsRes = await supabase(
    env,
    `holdings?room_code=eq.${roomCode}&player_id=eq.${player.id}&market_type=eq.${marketType}&select=coin_symbol,qty`
  );
  const holdings = holdingsRes.ok && Array.isArray(holdingsRes.data) ? holdingsRes.data : [];

  const roomRes = await supabase(env, `rooms?room_code=eq.${roomCode}&limit=1`);
  const spread = roomRes.ok && Array.isArray(roomRes.data)
    ? asNumber((roomRes.data[0] as Record<string, unknown>)?.spread_bps) || 50
    : 50;

  const coinsRes = await supabase(env, "coins?select=coin_symbol,player_label");
  const coins = coinsRes.ok && Array.isArray(coinsRes.data) ? coinsRes.data : [];

  return json(
    {
      market_type: marketType,
      cash: asNumber(player.cash),
      holdings: holdings.map((h) => {
        const row = h as Record<string, unknown>;
        return { coin_symbol: String(row.coin_symbol), qty: asNumber(row.qty) };
      }),
      spread_bps: spread,
      coins,
    },
    200,
    origin
  );
}

async function handleMarket(env: Env, url: URL, origin: string | null) {
  const roomCode = url.searchParams.get("room_code");
  const marketType = normalizeMarketType(url.searchParams.get("market_type"));
  if (!roomCode) return err("Missing room_code", 400, origin);

  const coinsRes = await supabase(env, "coins?select=coin_symbol,player_label");
  if (!coinsRes.ok || !Array.isArray(coinsRes.data)) return err("Failed to load coins", 500, origin);

  const now = Date.now();
  const h24Ago = now - 24 * 60 * 60 * 1000;
  const scope: ScopeType = marketType === "historical" ? "historical" : "season";

  const result: Record<string, unknown>[] = [];
  for (const coinRow of coinsRes.data) {
    const coin = coinRow as Record<string, unknown>;
    const symbol = String(coin.coin_symbol);
    const profile = COIN_PROFILES[symbol];
    if (!profile) continue;

    const pricesRes = await supabase(
      env,
      `prices?room_code=eq.${roomCode}&coin_symbol=eq.${symbol}&market_type=eq.${marketType}&order=created_at.desc&limit=200`
    );

    const rows = pricesRes.ok && Array.isArray(pricesRes.data) ? pricesRes.data : [];
    const tradingLatest = rows.length ? asNumber((rows[0] as Record<string, unknown>).price) : profile.seedPrice;

    let fundamentalScore = 0.5;
    let status: FundamentalStatus = "fallback";
    try {
      const statsResult = await getCachedOrLiveStats(env, profile.player, profile.platform, scope);
      fundamentalScore = statsResult.stats.score;
      status = statsResult.status;
    } catch {
      fundamentalScore = 0.5;
      status = "fallback";
    }

    const toCombinedPrice = (value: number) => combinePrice(profile.seedPrice, value, fundamentalScore);
    const combinedRows = rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        t: new Date(String(row.created_at)).getTime(),
        price: toCombinedPrice(asNumber(row.price)),
      };
    });

    const latestPrice = combinedRows.length ? combinedRows[0].price : toCombinedPrice(profile.seedPrice);
    const recent = combinedRows.filter((r) => r.t >= h24Ago);
    const prices24 = recent.map((r) => r.price);

    const open24 = recent.length ? recent[recent.length - 1].price : latestPrice;
    const high24 = prices24.length ? Math.max(...prices24) : latestPrice;
    const low24 = prices24.length ? Math.min(...prices24) : latestPrice;
    const change24 = open24 ? ((latestPrice - open24) / open24) * 100 : 0;

    result.push({
      coin_symbol: symbol,
      player_label: String(coin.player_label || symbol),
      market_type: marketType,
      price: Number(latestPrice.toFixed(2)),
      open24: Number(open24.toFixed(2)),
      high24: Number(high24.toFixed(2)),
      low24: Number(low24.toFixed(2)),
      change24_pct: Number(change24.toFixed(2)),
      trading_price_component: Number(tradingLatest.toFixed(2)),
      fundamental_component: Number((combinePrice(profile.seedPrice, profile.seedPrice, fundamentalScore)).toFixed(2)),
      fundamental_score: Number(fundamentalScore.toFixed(4)),
      fundamental_status: status,
      series: combinedRows.slice(0, 60).reverse(),
    });
  }

  return json({ market_type: marketType, coins: result }, 200, origin);
}

async function handleTrade(env: Env, body: unknown, side: "buy" | "sell", origin: string | null) {
  const payload = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
  const roomCode = String(payload.room_code || "");
  const playerCode = String(payload.player_code || "");
  const coin = String(payload.coin || "");
  const qty = asNumber(payload.qty);
  const marketType = normalizeMarketType(typeof payload.market_type === "string" ? payload.market_type : null);

  if (!roomCode || !playerCode || !coin || qty <= 0) return err("Missing fields", 400, origin);

  const resolvedCode = await resolvePlayerCodeForMarket(env, roomCode, playerCode, marketType);
  if (!resolvedCode) return err("Player not found", 404, origin);

  const rpcResult = await rpc(env, "rpc_trade", {
    p_room_code: roomCode,
    p_player_code: resolvedCode,
    p_market_type: marketType,
    p_side: side,
    p_coin_symbol: coin,
    p_qty: qty,
  });

  if (!rpcResult.ok) {
    const msg = (typeof rpcResult.data === "object" && rpcResult.data !== null && "message" in rpcResult.data)
      ? String((rpcResult.data as Record<string, unknown>).message)
      : "Trade failed";
    return err(msg, 400, origin);
  }

  const responsePayload = (rpcResult.data && typeof rpcResult.data === "object")
    ? { ...(rpcResult.data as Record<string, unknown>), market_type: marketType }
    : { market_type: marketType };

  return json(responsePayload, 200, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/health" && request.method === "GET") return handleHealth(origin);
      if (path === "/api/fortnite/stats" && request.method === "GET") return handleFortniteStatsDebug(env, url, origin);
      if (path === "/api/room/join" && request.method === "POST") return handleJoin(env, await request.json(), origin);
      if (path === "/api/room/state" && request.method === "GET") return handleState(env, url, origin);
      if (path === "/api/market" && request.method === "GET") return handleMarket(env, url, origin);
      if (path === "/api/trade/buy" && request.method === "POST") return handleTrade(env, await request.json(), "buy", origin);
      if (path === "/api/trade/sell" && request.method === "POST") return handleTrade(env, await request.json(), "sell", origin);
      return err("Not found", 404, origin);
    } catch (error) {
      return err(error instanceof Error ? error.message : "Internal error", 500, origin);
    }
  },
};
