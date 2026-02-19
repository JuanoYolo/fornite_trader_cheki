export type MarketType = "season" | "historical";

const KEY = "fn_market_type";

export function normalizeMarketType(value: string | null | undefined): MarketType {
  return value === "historical" ? "historical" : "season";
}

export function getMarketType(): MarketType {
  try {
    return normalizeMarketType(localStorage.getItem(KEY));
  } catch {
    return "season";
  }
}

export function setMarketType(value: MarketType) {
  localStorage.setItem(KEY, value);
}
