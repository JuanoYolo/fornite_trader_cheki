import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getSession, clearSession } from '@/lib/session';
import { TrendingUp, LogOut } from 'lucide-react';

export default function Layout({ children }: { children: ReactNode }) {
  const session = getSession();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-foreground">FN</span>
            <span className="text-primary">Market</span>
          </Link>

          {session && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground font-mono">
                {session.display_name}
              </span>
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded font-mono">
                {session.room_code}
              </span>
              <button
                onClick={() => {
                  clearSession();
                  window.location.href = import.meta.env.BASE_URL + 'join';
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Leave room"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}
