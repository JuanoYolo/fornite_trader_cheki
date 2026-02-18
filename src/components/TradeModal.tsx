import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatPrice } from '@/lib/format';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  coinSymbol: string;
  playerLabel: string;
  currentPrice: number;
  holdingQty: number;
  cash: number;
  spreadBps: number;
  onTradeComplete: () => void;
}

export default function TradeModal({
  open,
  onClose,
  coinSymbol,
  playerLabel,
  currentPrice,
  holdingQty,
  cash,
  spreadBps,
  onTradeComplete,
}: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('');
  const [loading, setLoading] = useState(false);

  const spread = spreadBps / 10000;
  const execPrice = side === 'buy' ? currentPrice * (1 + spread) : currentPrice * (1 - spread);
  const total = execPrice * (parseFloat(qty) || 0);

  const maxBuy = Math.floor(cash / (currentPrice * (1 + spread)));
  const maxSell = holdingQty;

  async function handleTrade() {
    const session = getSession();
    if (!session) return;
    const q = parseFloat(qty);
    if (!q || q <= 0) return;

    setLoading(true);
    try {
      const fn = side === 'buy' ? api.buy : api.sell;
      const result = await fn(session.room_code, session.player_code, coinSymbol, q);
      toast.success(
        `${side === 'buy' ? 'Bought' : 'Sold'} ${q} ${coinSymbol} @ $${formatPrice(result.exec_price)}`
      );
      setQty('');
      onTradeComplete();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Trade failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Trade {coinSymbol} <span className="text-muted-foreground text-sm">({playerLabel})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={side === 'buy' ? 'default' : 'outline'}
            className={side === 'buy' ? 'flex-1 bg-gain text-primary-foreground hover:bg-gain/90' : 'flex-1'}
            onClick={() => setSide('buy')}
          >
            Buy
          </Button>
          <Button
            variant={side === 'sell' ? 'default' : 'outline'}
            className={side === 'sell' ? 'flex-1 bg-loss text-destructive-foreground hover:bg-loss/90' : 'flex-1'}
            onClick={() => setSide('sell')}
          >
            Sell
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Mid Price</span>
            <span className="font-mono text-foreground">${formatPrice(currentPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Exec Price ({spreadBps / 2}bps)</span>
            <span className="font-mono text-foreground">${formatPrice(execPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {side === 'buy' ? 'Cash Available' : 'Holdings'}
            </span>
            <span className="font-mono text-foreground">
              {side === 'buy' ? `$${formatPrice(cash)}` : `${holdingQty}`}
            </span>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Quantity</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="trading-input font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQty(String(side === 'buy' ? maxBuy : maxSell))}
                className="text-xs whitespace-nowrap"
              >
                Max
              </Button>
            </div>
          </div>

          {parseFloat(qty) > 0 && (
            <div className="flex justify-between text-sm border-t border-border pt-2">
              <span className="text-muted-foreground">Total</span>
              <span className={`font-mono font-bold ${side === 'buy' ? 'text-gain' : 'text-loss'}`}>
                ${formatPrice(total)}
              </span>
            </div>
          )}

          <Button
            onClick={handleTrade}
            disabled={loading || !parseFloat(qty)}
            className={`w-full font-bold ${
              side === 'buy'
                ? 'bg-gain text-primary-foreground hover:bg-gain/90'
                : 'bg-loss text-destructive-foreground hover:bg-loss/90'
            }`}
          >
            {loading ? 'Processing...' : `${side === 'buy' ? 'Buy' : 'Sell'} ${coinSymbol}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
