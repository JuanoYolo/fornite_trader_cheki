import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, CoinMarket, RoomState } from "@/lib/api";
import { getPlayerCodeForMarket, getSession } from "@/lib/session";
import { formatPrice, formatPct } from "@/lib/format";
import Layout from "@/components/Layout";
import TradeModal from "@/components/TradeModal";
import { MarketType, getMarketType, setMarketType } from "@/lib/marketType";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";

export default function CoinDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const session = getSession();
  const [marketType, setSelectedMarketType] = useState<MarketType>(getMarketType());
  const [coin, setCoin] = useState<CoinMarket | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      navigate("/join");
      return;
    }
    fetchData(marketType);
  }, [symbol, marketType]);

  async function fetchData(targetMarketType = marketType) {
    if (!session || !symbol) return;
    setLoading(true);
    try {
      const playerCode = getPlayerCodeForMarket(session, targetMarketType);
      const [market, roomState] = await Promise.all([
        api.market(session.room_code, targetMarketType),
        api.state(session.room_code, playerCode, targetMarketType),
      ]);
      const found = market.coins.find((c) => c.coin_symbol === symbol);
      setCoin(found || null);
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

  const holding = state?.holdings.find((h) => h.coin_symbol === symbol);
  const holdingQty = holding?.qty || 0;
  const positive = coin ? coin.change24_pct >= 0 : true;
  const chartColor = positive ? "hsl(145, 72%, 46%)" : "hsl(0, 72%, 55%)";

  return (
    <Layout>
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to Market</span>
      </button>

      <div className="bg-card border border-border rounded-md p-1 inline-flex mb-4">
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

      {loading && !coin ? (
        <div className="bg-card border border-border rounded-lg h-96 animate-pulse" />
      ) : coin ? (
        <div className="space-y-6 animate-slide-up">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{coin.coin_symbol}</h1>
              <p className="text-muted-foreground">{coin.player_label} · {marketType}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold font-mono text-foreground">${formatPrice(coin.price)}</p>
              <div
                className={`inline-flex items-center gap-1 text-sm font-mono mt-1 px-2 py-0.5 rounded ${
                  positive ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                }`}
              >
                {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {formatPct(coin.change24_pct)}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Price Chart</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={coin.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(228, 14%, 18%)" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  stroke="hsl(215, 15%, 52%)"
                  fontSize={11}
                  tick={{ fill: "hsl(215, 15%, 52%)" }}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  stroke="hsl(215, 15%, 52%)"
                  fontSize={11}
                  tick={{ fill: "hsl(215, 15%, 52%)" }}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(228, 18%, 10%)",
                    borderColor: "hsl(228, 14%, 18%)",
                    color: "hsl(210, 20%, 92%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontFamily: "JetBrains Mono",
                  }}
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  formatter={(value: number) => [`$${formatPrice(value)}`, "Price"]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={chartColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: chartColor }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "24h High", value: `$${formatPrice(coin.high24)}` },
              { label: "24h Low", value: `$${formatPrice(coin.low24)}` },
              { label: "Your Holdings", value: `${holdingQty}` },
              { label: "Value", value: `$${formatPrice(coin.price * holdingQty)}` },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold font-mono text-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => setTradeOpen(true)}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-lg h-12 rounded-md"
          >
            Trade {coin.coin_symbol} ({marketType})
          </button>

          {state && (
            <TradeModal
              open={tradeOpen}
              onClose={() => setTradeOpen(false)}
              coinSymbol={coin.coin_symbol}
              playerLabel={coin.player_label}
              currentPrice={coin.price}
              holdingQty={holdingQty}
              cash={state.cash}
              spreadBps={state.spread_bps}
              marketType={marketType}
              onTradeComplete={() => fetchData(marketType)}
            />
          )}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">Coin not found</div>
      )}
    </Layout>
  );
}
