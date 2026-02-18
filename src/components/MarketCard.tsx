import { Link } from 'react-router-dom';
import type { CoinMarket } from '@/lib/api';
import { formatPrice, formatPct } from '@/lib/format';
import MiniSparkline from './MiniSparkline';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const COIN_EMOJIS: Record<string, string> = {
  JUANO: '🔥',
  ZOM: '🧟',
  CRIS: '💎',
};

export default function MarketCard({ coin }: { coin: CoinMarket }) {
  const positive = coin.change24_pct >= 0;

  return (
    <Link
      to={`/coin/${coin.coin_symbol}`}
      className={`block rounded-lg border border-border bg-card p-4 transition-all hover:scale-[1.02] ${
        positive ? 'card-glow' : 'card-glow-loss'
      } animate-slide-up`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{COIN_EMOJIS[coin.coin_symbol] || '🪙'}</span>
            <span className="font-bold text-foreground">{coin.coin_symbol}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{coin.player_label}</p>
        </div>
        <div className={`flex items-center gap-1 text-sm font-mono px-2 py-0.5 rounded ${
          positive ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'
        }`}>
          {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {formatPct(coin.change24_pct)}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold font-mono text-foreground">
            ${formatPrice(coin.price)}
          </p>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground font-mono">
            <span>H ${formatPrice(coin.high24)}</span>
            <span>L ${formatPrice(coin.low24)}</span>
          </div>
        </div>
        <MiniSparkline data={coin.series} positive={positive} />
      </div>
    </Link>
  );
}
