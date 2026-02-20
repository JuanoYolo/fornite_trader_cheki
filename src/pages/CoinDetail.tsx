import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ChartRange, CoinMarket, FortniteSummary, RoomState } from "@/lib/api";
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
import { ArrowLeft, ArrowUpRight, ArrowDownRight, TrendingUp, Swords, Trophy } from "lucide-react";

const RANGE_OPTIONS: ChartRange[] = ["24h", "7d", "30d", "90d", "all"];

export default function CoinDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const session = getSession();
  const [marketType, setSelectedMarketType] = useState<MarketType>(getMarketType());
  const [chartRange, setChartRange] = useState<ChartRange>("24h");
  const [coin, setCoin] = useState<CoinMarket | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [summary, setSummary] = useState<FortniteSummary | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      navigate("/join");
      return;
    }
    fetchData(marketType, chartRange);
  }, [symbol, marketType, chartRange]);

  async function fetchData(targetMarketType = marketType, targetRange = chartRange) {
    if (!session || !symbol) return;
    setLoading(true);
    try {
      const playerCode = getPlayerCodeForMarket(session, targetMarketType);
      const [market, roomState, fundamentals] = await Promise.all([
        api.market(session.room_code, targetMarketType, targetRange),
        api.state(session.room_code, playerCode, targetMarketType),
        api.summary(symbol, targetMarketType),
      ]);
      const found = market.coins.find((c) => c.coin_symbol === symbol);
      setCoin(found || null);
      setState(roomState);
      setSummary(fundamentals);
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
  const rangeLabel = chartRange === "all" ? "All-time" : chartRange;

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
                {formatPct(coin.change24_pct)} ({rangeLabel})
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Price Chart</span>
              </div>
              <div className="bg-background border border-border rounded-md p-1 flex gap-1">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    className={`px-2 py-1 text-xs rounded ${chartRange === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    onClick={() => setChartRange(option)}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={coin.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(228, 14%, 18%)" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) => chartRange === "24h" ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : new Date(v).toLocaleDateString()}
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
              { label: `${rangeLabel} High`, value: `$${formatPrice(coin.high24)}` },
              { label: `${rangeLabel} Low`, value: `$${formatPrice(coin.low24)}` },
              { label: "Your Holdings", value: `${holdingQty}` },
              { label: "Value", value: `$${formatPrice(coin.price * holdingQty)}` },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold font-mono text-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          {summary && (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-foreground">Fortnite Metrics ({summary.scope})</h3>
                <span className="text-xs text-muted-foreground">status: {summary.status}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">K/D</p>
                  <p className="font-mono font-bold">{summary.current.kd.toFixed(2)}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="font-mono font-bold">{summary.current.winRate.toFixed(2)}%</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Wins</p>
                  <p className="font-mono font-bold">{summary.current.wins}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Fundamental Score</p>
                  <p className="font-mono font-bold">{summary.current.score.toFixed(4)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border border-border p-3">
                  <p className="text-muted-foreground flex items-center gap-2"><Swords className="w-4 h-4" />Kills</p>
                  <p className="font-mono">24h: +{summary.deltas.kills_24h}</p>
                  <p className="font-mono">7d: +{summary.deltas.kills_7d}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-muted-foreground flex items-center gap-2"><Trophy className="w-4 h-4" />Wins</p>
                  <p className="font-mono">24h: +{summary.deltas.wins_24h}</p>
                  <p className="font-mono">7d: +{summary.deltas.wins_7d}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-muted-foreground">Matches</p>
                  <p className="font-mono">24h: +{summary.deltas.matches_24h}</p>
                  <p className="font-mono">7d: +{summary.deltas.matches_7d}</p>
                  {summary.season_window_days && (
                    <p className="text-xs text-muted-foreground mt-1">Season snapshots keep last {summary.season_window_days} days (~3 months).</p>
                  )}
                </div>
              </div>
            </div>
          )}

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
              onTradeComplete={() => fetchData(marketType, chartRange)}
            />
          )}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">Coin not found</div>
      )}
    </Layout>
  );
}
