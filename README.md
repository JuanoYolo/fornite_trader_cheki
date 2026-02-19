# Fortnite Coins Market (MVP + Fundamentals)

MVP full-stack:
- Frontend: Vite + React + TypeScript + shadcn-ui + Tailwind (GitHub Pages SPA)
- Backend: Cloudflare Worker (REST)
- DB: Supabase Postgres (`supabase/schema.sql`)
- Fundamentals: Fortnite-API (server-side only, key never exposed in frontend)

## Mercados

Hay 2 libros paralelos (`market_type`):
- `season` (default): fundamentales de temporada actual
- `historical`: fundamentales all-time/lifetime

Cada market_type tiene cash/holdings/trades/prices separados.

## Endpoints Worker

- `GET /health`
- `POST /api/room/join`
- `GET /api/room/state?room_code=...&player_code=...&market_type=season|historical`
- `GET /api/market?room_code=...&market_type=season|historical`
- `POST /api/trade/buy`
- `POST /api/trade/sell`
- `GET /api/fortnite/stats?player=<name>&platform=<pc|xbl>&scope=<season|historical>` (debug)

## Fortnite-API usage (exacto)

Worker consulta:
- `GET https://fortnite-api.com/v2/stats/br/v2?name=<player>&accountType=epic&timeWindow=<season|lifetime>`
- Header: `Authorization: <FORTNITE_API_KEY>`

Mapeo (normalizado):
- `wins`, `kd`, `winRate`, `matches`, `kills`
- score fundamental: `0.5*kdNorm + 0.3*winRateNorm + 0.2*winsNorm`

## Variables y secretos

### Frontend
- `VITE_API_BASE=https://<tu-worker>.workers.dev`
- `VITE_BASE=/<repo-name>/`

### Worker secrets (Wrangler)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FORTNITE_API_KEY`

```bash
cd worker
npm ci
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put FORTNITE_API_KEY
npx wrangler deploy
```

## Deploy GitHub Pages

Workflow: `.github/workflows/deploy-pages.yml`
- build con:
  - `VITE_API_BASE: ${{ vars.VITE_API_BASE }}`
  - `VITE_BASE: /${{ github.event.repository.name }}/`
- publica `dist/` con `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`

## Smoke tests

```bash
curl -i <WORKER_URL>/health
```

```bash
curl -i "<WORKER_URL>/api/fortnite/stats?player=JuanoYoloXd&platform=pc&scope=season"
```

```bash
curl -i "<WORKER_URL>/api/market?room_code=JUANO-ROOM&market_type=season"
```

```bash
curl -i "<WORKER_URL>/api/market?room_code=JUANO-ROOM&market_type=historical"
```

```bash
curl -i -X POST <WORKER_URL>/api/room/join \
  -H "Content-Type: application/json" \
  -d '{"room_code":"JUANO-ROOM","display_name":"DemoUser","pin":"1234"}'
```

```bash
curl -i "<WORKER_URL>/api/room/state?room_code=JUANO-ROOM&player_code=<PLAYER_CODE_SEASON>&market_type=season"
```

```bash
curl -i -X POST <WORKER_URL>/api/trade/buy \
  -H "Content-Type: application/json" \
  -d '{"room_code":"JUANO-ROOM","player_code":"<PLAYER_CODE_SEASON>","coin":"JUANO","qty":1,"market_type":"season"}'
```

```bash
curl -i -X POST <WORKER_URL>/api/trade/buy \
  -H "Content-Type: application/json" \
  -d '{"room_code":"JUANO-ROOM","player_code":"<PLAYER_CODE_HIST>","coin":"JUANO","qty":1,"market_type":"historical"}'
```

## Notas MVP

- Si Fortnite-API falla o rate-limita, `/api/market` hace fallback a trading-only (`fundamental_status: "fallback"`) y la app sigue operativa.
- TTL cache stats: 10 minutos en `fortnite_stats_cache`.
