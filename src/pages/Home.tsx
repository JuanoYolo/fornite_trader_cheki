import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, CoinMarket, RoomState } from "@/lib/api";
import { getPlayerCodeForMarket, getSession } from "@/lib/session";
import { getMarketType, MarketType, setMarketType } from "@/lib/marketType";
import { formatPrice } from "@/lib/format";
import Layout from "@/components/Layout";
import MarketCard from "@/components/MarketCard";
import { RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const navigate = useNavigate();
  const session = getSession();
  const [marketType, setSelectedMarketType] = useState<MarketType>(getMarketType());
  const [coins, setCoins] = useState<CoinMarket[]>([]);
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      navigate("/join");
      return;
    }
    fetchData(marketType);
  }, [marketType]);

  async function fetchData(targetMarketType = marketType) {
    if (!session) return;
    setLoading(true);
    try {
      const playerCode = getPlayerCodeForMarket(session, targetMarketType);
      const [market, roomState] = await Promise.all([
        api.market(session.room_code, targetMarketType),
        api.state(session.room_code, playerCode, targetMarketType),
      ]);
      setCoins(market.coins);
      setState(roomState);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function changeMarket(next: MarketType) {
    setSelectedMarketType(next);
    setMarketType(next);
  }

  if (!session) return null;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Book: {marketType}</p>
          {state && (
            <div className="flex items-center gap-2 mt-1">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="font-mono text-primary font-bold">${formatPrice(state.cash)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-card border border-border rounded-md p-1 flex">
            <button
              className={`px-3 py-1 text-sm rounded ${marketType === "season" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => changeMarket("season")}
            >
              Season
            </button>
            <button
              className={`px-3 py-1 text-sm rounded ${marketType === "historical" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => changeMarket("historical")}
            >
              Historical
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={loading} className="text-muted-foreground">
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !coins.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg h-36 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {coins.map((coin) => (
            <MarketCard key={`${coin.coin_symbol}-${coin.market_type}`} coin={coin} />
          ))}
        </div>
      )}

      {state && state.holdings.some((h) => h.qty > 0) && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-foreground mb-3">Your Holdings ({marketType})</h2>
          <div className="bg-card border border-border rounded-lg divide-y divide-border">
            {state.holdings
              .filter((h) => h.qty > 0)
              .map((h) => {
                const coin = coins.find((c) => c.coin_symbol === h.coin_symbol);
                const value = coin ? coin.price * h.qty : 0;
                return (
                  <div key={h.coin_symbol} className="flex items-center justify-between p-3">
                    <div>
                      <span className="font-bold text-foreground">{h.coin_symbol}</span>
                      <span className="text-muted-foreground text-sm ml-2 font-mono">{h.qty} units</span>
                    </div>
                    <span className="font-mono text-foreground">${formatPrice(value)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </Layout>
  );
}
