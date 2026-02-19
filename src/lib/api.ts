import type { MarketType } from "@/lib/marketType";

const rawApiBase = import.meta.env.VITE_API_BASE || "";
const API_BASE = rawApiBase.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const target = `${API_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(target, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
  } catch {
    throw new ApiError(`No se pudo conectar con la API (${target}). Revisa VITE_API_BASE y el Worker.`, 0);
  }

  const payload = await response.text();
  let data: unknown = null;
  if (payload) {
    try {
      data = JSON.parse(payload);
    } catch {
      data = { message: payload };
    }
  }

  if (!response.ok) {
    const maybeObj = (data && typeof data === "object") ? (data as Record<string, unknown>) : undefined;
    const message = String(maybeObj?.error || maybeObj?.message || response.statusText || "API request failed");
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export interface JoinResponse {
  ok: boolean;
  room_code: string;
  player_code: string;
  display_name: string;
  cash: number;
  spread_bps: number;
  player_codes: Record<MarketType, string>;
}

export interface CoinMarket {
  coin_symbol: string;
  player_label: string;
  price: number;
  open24: number;
  high24: number;
  low24: number;
  change24_pct: number;
  series: { t: number; price: number }[];
  market_type: MarketType;
  trading_price_component: number;
  fundamental_component: number;
  fundamental_score: number;
  fundamental_status: "live" | "cached" | "fallback";
}

export interface MarketResponse {
  market_type: MarketType;
  coins: CoinMarket[];
}

export interface Holding {
  coin_symbol: string;
  qty: number;
}

export interface RoomState {
  market_type: MarketType;
  cash: number;
  holdings: Holding[];
  spread_bps: number;
  coins: { coin_symbol: string; player_label: string }[];
}

export interface TradeResult {
  market_type: MarketType;
  exec_price: number;
  new_mid: number;
  cash: number;
  holding_qty: number;
}

export const api = {
  join(room_code: string, display_name: string, pin: string) {
    return request<JoinResponse>("/api/room/join", {
      method: "POST",
      body: JSON.stringify({ room_code, display_name, pin }),
    });
  },

  market(room_code: string, marketType: MarketType) {
    return request<MarketResponse>(
      `/api/market?room_code=${encodeURIComponent(room_code)}&market_type=${encodeURIComponent(marketType)}`
    );
  },

  state(room_code: string, player_code: string, marketType: MarketType) {
    return request<RoomState>(
      `/api/room/state?room_code=${encodeURIComponent(room_code)}&player_code=${encodeURIComponent(player_code)}&market_type=${encodeURIComponent(marketType)}`
    );
  },

  buy(room_code: string, player_code: string, coin: string, qty: number, marketType: MarketType) {
    return request<TradeResult>("/api/trade/buy", {
      method: "POST",
      body: JSON.stringify({ room_code, player_code, coin, qty, market_type: marketType }),
    });
  },

  sell(room_code: string, player_code: string, coin: string, qty: number, marketType: MarketType) {
    return request<TradeResult>("/api/trade/sell", {
      method: "POST",
      body: JSON.stringify({ room_code, player_code, coin, qty, market_type: marketType }),
    });
  },
};
