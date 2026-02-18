interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS = "content-type,authorization";

function resolveOrigin(origin: string | null): string {
  if (!origin) return "*";

  if (/^http:\/\/localhost(?::\d+)?$/.test(origin)) return origin;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) return origin;

  const isHttps = /^https:\/\//.test(origin);
  if (isHttps) return origin;

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
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: text };
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
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: text };
  }
}

async function handleHealth(origin: string | null) {
  return json({ status: "ok", ts: new Date().toISOString() }, 200, origin);
}

async function handleJoin(env: Env, body: any, origin: string | null) {
  const { room_code, display_name, pin } = body;
  if (!room_code || !display_name || !pin) return err("Missing fields", 400, origin);

  await supabase(env, "rooms", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" } as any,
    body: JSON.stringify({ room_code, spread_bps: 50 }),
  });

  const coins = ["JUANO", "ZOM", "CRIS"];
  const defaultPrices: Record<string, number> = { JUANO: 50000, ZOM: 60000, CRIS: 55000 };

  for (const symbol of coins) {
    const existing = await supabase(env, `prices?room_code=eq.${room_code}&coin_symbol=eq.${symbol}&limit=1`);
    if (existing.ok && Array.isArray(existing.data) && existing.data.length === 0) {
      await supabase(env, "prices", {
        method: "POST",
        body: JSON.stringify({ room_code, coin_symbol: symbol, price: defaultPrices[symbol] }),
      });
    }
  }

  const existingPlayer = await supabase(
    env,
    `room_players?room_code=eq.${room_code}&display_name=eq.${encodeURIComponent(display_name)}&limit=1`
  );

  if (existingPlayer.ok && Array.isArray(existingPlayer.data) && existingPlayer.data.length > 0) {
    const player = existingPlayer.data[0];
    if (player.pin !== pin) return err("Invalid PIN", 403, origin);

    const room = await supabase(env, `rooms?room_code=eq.${room_code}&limit=1`);
    const spread_bps = room.ok && Array.isArray(room.data) ? room.data[0]?.spread_bps || 50 : 50;

    return json(
      {
        ok: true,
        room_code,
        player_code: player.player_code,
        display_name: player.display_name,
        cash: Number(player.cash),
        spread_bps,
      },
      200,
      origin
    );
  }

  const player_code = `${room_code}-${Date.now().toString(36).toUpperCase()}`;
  const createRes = await supabase(env, "room_players", {
    method: "POST",
    body: JSON.stringify({ room_code, player_code, display_name, pin, cash: 100000 }),
  });

  if (!createRes.ok) {
    return err("Failed to create player", 500, origin);
  }

  const newPlayer = Array.isArray(createRes.data) ? createRes.data[0] : createRes.data;
  for (const symbol of coins) {
    await supabase(env, "holdings", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" } as any,
      body: JSON.stringify({ room_code, player_id: newPlayer.id, coin_symbol: symbol, qty: 0 }),
    });
  }

  const room = await supabase(env, `rooms?room_code=eq.${room_code}&limit=1`);
  const spread_bps = room.ok && Array.isArray(room.data) ? room.data[0]?.spread_bps || 50 : 50;

  return json(
    {
      ok: true,
      room_code,
      player_code,
      display_name,
      cash: 100000,
      spread_bps,
    },
    200,
    origin
  );
}

async function handleState(env: Env, url: URL, origin: string | null) {
  const room_code = url.searchParams.get("room_code");
  const player_code = url.searchParams.get("player_code");
  if (!room_code || !player_code) return err("Missing params", 400, origin);

  const playerRes = await supabase(
    env,
    `room_players?room_code=eq.${room_code}&player_code=eq.${player_code}&limit=1`
  );

  if (!playerRes.ok || !Array.isArray(playerRes.data) || playerRes.data.length === 0) {
    return err("Player not found", 404, origin);
  }

  const player = playerRes.data[0];
  const holdingsRes = await supabase(
    env,
    `holdings?room_code=eq.${room_code}&player_id=eq.${player.id}&select=coin_symbol,qty`
  );
  const roomRes = await supabase(env, `rooms?room_code=eq.${room_code}&limit=1`);
  const coinsRes = await supabase(env, "coins?select=coin_symbol,player_label");

  const holdings = holdingsRes.ok && Array.isArray(holdingsRes.data) ? holdingsRes.data : [];
  const spread_bps = roomRes.ok && Array.isArray(roomRes.data) ? roomRes.data[0]?.spread_bps || 50 : 50;
  const coins = coinsRes.ok && Array.isArray(coinsRes.data) ? coinsRes.data : [];

  return json(
    {
      cash: Number(player.cash),
      holdings: holdings.map((h: any) => ({ coin_symbol: h.coin_symbol, qty: Number(h.qty) })),
      spread_bps,
      coins,
    },
    200,
    origin
  );
}

async function handleMarket(env: Env, url: URL, origin: string | null) {
  const room_code = url.searchParams.get("room_code");
  if (!room_code) return err("Missing room_code", 400, origin);

  const coinsRes = await supabase(env, "coins?select=coin_symbol,player_label");
  if (!coinsRes.ok || !Array.isArray(coinsRes.data)) return err("Failed to load coins", 500, origin);

  const now = Date.now();
  const h24Ago = now - 24 * 60 * 60 * 1000;

  const market = [];
  for (const coin of coinsRes.data) {
    const symbol = coin.coin_symbol;
    const pricesRes = await supabase(
      env,
      `prices?room_code=eq.${room_code}&coin_symbol=eq.${symbol}&order=created_at.desc&limit=200`
    );

    const rows = pricesRes.ok && Array.isArray(pricesRes.data) ? pricesRes.data : [];
    const latestPrice = rows.length ? Number(rows[0].price) : 0;
    const recent = rows.filter((r: any) => new Date(r.created_at).getTime() >= h24Ago);
    const prices24 = recent.map((r: any) => Number(r.price));
    const open24 = recent.length ? Number(recent[recent.length - 1].price) : latestPrice;
    const high24 = prices24.length ? Math.max(...prices24) : latestPrice;
    const low24 = prices24.length ? Math.min(...prices24) : latestPrice;
    const change24_pct = open24 ? ((latestPrice - open24) / open24) * 100 : 0;

    market.push({
      coin_symbol: symbol,
      player_label: coin.player_label,
      price: latestPrice,
      open24,
      high24,
      low24,
      change24_pct: Math.round(change24_pct * 100) / 100,
      series: rows
        .slice(0, 60)
        .reverse()
        .map((r: any) => ({ t: new Date(r.created_at).getTime(), price: Number(r.price) })),
    });
  }

  return json({ coins: market }, 200, origin);
}

async function handleTrade(env: Env, body: any, side: "buy" | "sell", origin: string | null) {
  const { room_code, player_code, coin, qty } = body;
  if (!room_code || !player_code || !coin || qty === undefined) return err("Missing fields", 400, origin);

  const quantity = Number(qty);
  if (!Number.isFinite(quantity) || quantity <= 0) return err("Quantity must be positive", 400, origin);

  const result = await rpc(env, "rpc_trade", {
    p_room_code: room_code,
    p_player_code: player_code,
    p_side: side,
    p_coin_symbol: coin,
    p_qty: quantity,
  });

  if (!result.ok) {
    const message =
      (typeof result.data === "object" && (result.data as any)?.message) ||
      (typeof result.data === "string" ? result.data : "Trade failed");

    return err(message, 400, origin);
  }

  return json(result.data, 200, origin);
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
      if (path === "/api/room/join" && request.method === "POST") {
        return handleJoin(env, await request.json(), origin);
      }
      if (path === "/api/room/state" && request.method === "GET") return handleState(env, url, origin);
      if (path === "/api/market" && request.method === "GET") return handleMarket(env, url, origin);
      if (path === "/api/trade/buy" && request.method === "POST") {
        return handleTrade(env, await request.json(), "buy", origin);
      }
      if (path === "/api/trade/sell" && request.method === "POST") {
        return handleTrade(env, await request.json(), "sell", origin);
      }

      return err("Not found", 404, origin);
    } catch (error: any) {
      return err(error?.message || "Internal error", 500, origin);
    }
  },
};
