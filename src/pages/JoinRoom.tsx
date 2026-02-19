import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { setSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { TrendingUp, Users, Zap } from 'lucide-react';

const PRESETS = [
  { display_name: 'JuanoYoloXd', pin: '1111', emoji: '🔥' },
  { display_name: 'ZomHeldD', pin: '2222', emoji: '🧟' },
  { display_name: 'Cristofprime', pin: '3333', emoji: '💎' },
];

export default function JoinRoom() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('JUANO-ROOM');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin(name?: string, p?: string) {
    const dn = name || displayName;
    const pn = p || pin;
    if (!roomCode || !dn || !pn) {
      toast.error('Fill all fields');
      return;
    }

    setLoading(true);
    try {
      const res = await api.join(roomCode, dn, pn);
      setSession({
        room_code: res.room_code,
        player_code: res.player_code,
        display_name: res.display_name,
        player_codes: res.player_codes,
      });
      toast.success(`Welcome, ${res.display_name}!`);
      navigate('/');
    } catch (e: any) {
      toast.error(e.message || 'Failed to join');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <TrendingUp className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">
              <span className="text-foreground">FN</span>
              <span className="text-primary"> Market</span>
            </h1>
          </div>
          <p className="text-muted-foreground">Join a trading room to start</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4 animate-slide-up">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Room Code</label>
            <Input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ROOM-CODE"
              className="trading-input font-mono"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="trading-input"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">PIN</label>
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              maxLength={4}
              className="trading-input font-mono"
            />
          </div>

          <Button
            onClick={() => handleJoin()}
            disabled={loading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
          >
            <Zap className="w-4 h-4 mr-2" />
            {loading ? 'Joining...' : 'Join Room'}
          </Button>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Quick Join</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.display_name}
                onClick={() => handleJoin(p.display_name, p.pin)}
                disabled={loading}
                className="bg-card border border-border rounded-lg p-3 text-center hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                <span className="text-2xl block mb-1">{p.emoji}</span>
                <span className="text-xs text-foreground font-medium block truncate">{p.display_name}</span>
                <span className="text-xs text-muted-foreground font-mono">PIN: {p.pin}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
