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
  } catch (error) {
    throw new ApiError(
      `No se pudo conectar con la API (${target}). Revisa VITE_API_BASE y el Worker.`,
      0
    );
  }

  const payload = await response.text();
  let data: any = null;
  if (payload) {
    try {
      data = JSON.parse(payload);
    } catch {
      data = { message: payload };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText || "API request failed";
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
}

export interface MarketResponse {
  coins: CoinMarket[];
}

export interface Holding {
  coin_symbol: string;
  qty: number;
}

export interface RoomState {
  cash: number;
  holdings: Holding[];
  spread_bps: number;
  coins: { coin_symbol: string; player_label: string }[];
}

export interface TradeResult {
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

  market(room_code: string) {
    return request<MarketResponse>(`/api/market?room_code=${encodeURIComponent(room_code)}`);
  },

  state(room_code: string, player_code: string) {
    return request<RoomState>(
      `/api/room/state?room_code=${encodeURIComponent(room_code)}&player_code=${encodeURIComponent(player_code)}`
    );
  },

  buy(room_code: string, player_code: string, coin: string, qty: number) {
    return request<TradeResult>("/api/trade/buy", {
      method: "POST",
      body: JSON.stringify({ room_code, player_code, coin, qty }),
    });
  },

  sell(room_code: string, player_code: string, coin: string, qty: number) {
    return request<TradeResult>("/api/trade/sell", {
      method: "POST",
      body: JSON.stringify({ room_code, player_code, coin, qty }),
    });
  },
};
