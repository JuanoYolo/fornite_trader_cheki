import type { MarketType } from "@/lib/marketType";

interface Session {
  room_code: string;
  player_code: string;
  display_name: string;
  player_codes?: Partial<Record<MarketType, string>>;
}

const KEY = "fn_market_session";

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPlayerCodeForMarket(session: Session, marketType: MarketType): string {
  return session.player_codes?.[marketType] || session.player_code;
}

export function setSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
