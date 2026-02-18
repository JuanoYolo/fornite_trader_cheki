const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
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
    return request<JoinResponse>('/api/room/join', {
      method: 'POST',
      body: JSON.stringify({ room_code, display_name, pin }),
    });
  },

  market(room_code: string) {
    return request<MarketResponse>(`/api/market?room_code=${encodeURIComponent(room_code)}`);
  },

  state(room_code: string, player_code: string) {
    return request<RoomState>(`/api/room/state?room_code=${encodeURIComponent(room_code)}&player_code=${encodeURIComponent(player_code)}`);
  },

  buy(room_code: string, player_code: string, coin: string, qty: number) {
    return request<TradeResult>('/api/trade/buy', {
      method: 'POST',
      body: JSON.stringify({ room_code, player_code, coin, qty }),
    });
  },

  sell(room_code: string, player_code: string, coin: string, qty: number) {
    return request<TradeResult>('/api/trade/sell', {
      method: 'POST',
      body: JSON.stringify({ room_code, player_code, coin, qty }),
    });
  },
};
