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
# Fortnite Coins Market (MVP)

MVP full-stack listo para correr con:
- **Frontend:** Vite + React + TypeScript + shadcn-ui + Tailwind (GitHub Pages SPA)
- **Backend:** Cloudflare Worker (TypeScript, REST API)
- **DB:** Supabase Postgres (`supabase/schema.sql` + seed + RPC transaccional `rpc_trade`)

## Arquitectura

- Frontend llama al Worker con `VITE_API_BASE` (sin secretos en cliente).
- Worker usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` como secretos de Wrangler.
- DB centraliza estado de room/players/holdings/trades/prices.
- Trading usa spread de **0.5%** (50 bps).

## Endpoints del Worker

- `GET /health`
- `POST /api/room/join`
- `GET /api/room/state?room_code=...&player_code=...`
- `GET /api/market?room_code=...`
- `POST /api/trade/buy`
- `POST /api/trade/sell`

CORS habilitado para `https://*`, `http://localhost:*` y `http://127.0.0.1:*`.

## Variables de entorno

### Frontend

- `VITE_API_BASE=https://<tu-worker>.workers.dev`
- `VITE_BASE=/<repo-name>/` (en local normalmente `/`)

### Worker (secrets)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Setup local (Windows PowerShell)

```powershell
# 1) Instalar dependencias del frontend
npm ci

# 2) Instalar dependencias del worker
cd worker
npm ci
cd ..

# 3) Ejecutar schema + seed en Supabase
# Copia y pega supabase/schema.sql en SQL Editor y ejecuta.

# 4) Variables frontend para local
$env:VITE_API_BASE="https://<tu-worker>.workers.dev"
$env:VITE_BASE="/"

# 5) Correr frontend
npm run dev
```

## Deploy frontend en GitHub Pages

Ya está incluido workflow en `.github/workflows/deploy-pages.yml`.

1. En GitHub repo -> **Settings -> Pages**:
   - Source: **GitHub Actions**.
2. En GitHub repo -> **Settings -> Secrets and variables -> Actions -> Variables**:
   - Crear `VITE_API_BASE` con URL del Worker.
3. Push a `main`.

Workflow usa:
- `VITE_API_BASE=${{ vars.VITE_API_BASE }}`
- `VITE_BASE="/${{ github.event.repository.name }}/"`

El build genera `dist/404.html` como copia de `index.html` para soportar refresh en SPA en GitHub Pages.

## Deploy Worker (Cloudflare)

```bash
cd worker
npm ci
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

## Smoke tests (curl)

> Reemplaza `<WORKER_URL>` por tu URL real, por ejemplo `https://fortnite-coins-market-api.<subdomain>.workers.dev`.

```bash
curl -i <WORKER_URL>/health
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
curl -i "<WORKER_URL>/api/market?room_code=JUANO-ROOM"
```

```bash
curl -i "<WORKER_URL>/api/room/state?room_code=JUANO-ROOM&player_code=<PLAYER_CODE>"
```

```bash
curl -i -X POST <WORKER_URL>/api/trade/buy \
  -H "Content-Type: application/json" \
  -d '{"room_code":"JUANO-ROOM","player_code":"<PLAYER_CODE_HIST>","coin":"JUANO","qty":1,"market_type":"historical"}'
```

## Notas MVP

- Si Fortnite-API falla o rate-limita, `/api/market` hace fallback a trading-only (`fundamental_status: "fallback"`) y la app sigue operativa.
- TTL cache stats: 10 minutos en `fortnite_stats_cache`.
  -d '{"room_code":"JUANO-ROOM","player_code":"<PLAYER_CODE>","coin":"JUANO","qty":1}'
```

```bash
curl -i -X POST <WORKER_URL>/api/trade/sell \
  -H "Content-Type: application/json" \
  -d '{"room_code":"JUANO-ROOM","player_code":"<PLAYER_CODE>","coin":"JUANO","qty":1}'
```
