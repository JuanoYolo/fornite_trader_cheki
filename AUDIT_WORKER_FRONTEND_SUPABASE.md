# Auditoría E2E (Frontend + Cloudflare Worker + Supabase)

## Resumen ejecutivo

1. **Entrypoint canónico del Worker en el repo:** `worker/wrangler.toml` define `name = "fortnite-coins-market-api"` y `main = "src/index.ts"`.
2. **Router actual en el código local:** `worker/src/index.ts` sí expone `GET /api/fortnite/stats` y `GET /health`, además de `/api/room/*`, `/api/market`, `/api/trade/*`.
3. **Diagnóstico de tu 404 actual:** el síntoma `{"error":"Not found"}` en `/api/fortnite/stats` es coherente con un Worker desplegado con router viejo (sin esa ruta) o con despliegue al Worker equivocado.
4. **Evidencia histórica:** en el commit `acb7ce8` (merge de PR #4, rama master en ese punto) **no** existe `/api/fortnite/stats`; en `b672829` sí aparece.
5. **Conclusión práctica:** hay drift entre lo que corre en Cloudflare y el código que hoy tienes en `worker/src/index.ts`.
6. **Frontend:** usa `VITE_API_BASE` (no hay URL hardcodeada en `src/lib/api.ts`); si `VITE_API_BASE` apunta al Worker incorrecto, toda la app pegará al destino equivocado.
7. **Canónico recomendado para evitar confusiones:** usar solo `fortnite-coins-market-api` (nombre de `wrangler.toml`) como único objetivo de deploy/secret.

---

## 1) Entrypoint real y rutas actuales del router

### Config de Wrangler (canónico)
- Archivo: `worker/wrangler.toml`
- `name = "fortnite-coins-market-api"`
- `main = "src/index.ts"`
- No hay bloques `[env.*]` definidos en este archivo.

### Rutas que existen hoy en `worker/src/index.ts`
- `GET /health`
- `GET /api/fortnite/stats`
- `POST /api/room/join`
- `GET /api/room/state`
- `GET /api/market`
- `POST /api/trade/buy`
- `POST /api/trade/sell`
- Fallback: `{"error":"Not found"}` con 404.

---

## 2) ¿`/api/fortnite/stats` existe en master actualmente?

### Evidencia en historial
- En commit `acb7ce8` (`Merge pull request #4 ...`), el router **no** contiene `/api/fortnite/stats`.
- En commit `b672829` (`Add Fortnite fundamentals with season/historical market books`), el router **sí** contiene `/api/fortnite/stats`.

### Diagnóstico temporal
- La ruta **sí fue agregada** (no es “nunca agregada”).
- Tu 404 coincide con tener desplegado un commit equivalente al estado pre-`b672829` o desplegar otro Worker distinto.

---

## 3) Por qué `/health` responde pero `/api/fortnite/stats` no

Con este repo, la explicación técnica consistente es:

1. `/health` existe tanto en versiones antiguas como nuevas del Worker.
2. `/api/fortnite/stats` solo existe en versiones nuevas (desde `b672829`).
3. Si en Cloudflare `/health` da 200 pero `/api/fortnite/stats` da 404 `Not found`, entonces:
   - se desplegó código antiguo en el Worker objetivo, **o**
   - el frontend/curl pega al Worker `fortnite-coins-worker` mientras el código nuevo está en `fortnite-coins-market-api` (o viceversa), **o**
   - se desplegó con otro `wrangler.toml`/directorio distinto.

No hay evidencia en este repo de que el router actual omita esa ruta: **la ruta está presente**.

---

## 4) Pasos exactos para dejarlo funcionando

## A. Alinear local con master y traer la ruta correcta

```bash
git fetch origin
git checkout master
git pull --ff-only

# Verificar que la ruta esté en tu master local
rg -n '/api/fortnite/stats|/health' worker/src/index.ts
```

Si no aparece `/api/fortnite/stats` en `master`, intégrala desde el commit que la introdujo:

```bash
git cherry-pick b6728297449b0fe0022f71cc16bc5282f5917f52
```

## B. Desplegar explícitamente al Worker correcto

Desde la carpeta `worker/`:

```bash
cd worker
npx wrangler whoami
npx wrangler deploy --name fortnite-coins-market-api
npx wrangler deployments list --name fortnite-coins-market-api
```

Opcional (para eliminar confusión):
- Evitar deploys a `fortnite-coins-worker`.
- En equipo, documentar que el nombre canónico es `fortnite-coins-market-api`.

## C. Verificar secrets en el Worker correcto

```bash
cd worker
npx wrangler secret list --name fortnite-coins-market-api
```

Debes ver (al menos):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FORTNITE_API_KEY`

Si falta alguno:

```bash
npx wrangler secret put SUPABASE_URL --name fortnite-coins-market-api
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name fortnite-coins-market-api
npx wrangler secret put FORTNITE_API_KEY --name fortnite-coins-market-api
```

## D. Validación por curl

```bash
export WORKER_URL="https://fortnite-coins-market-api.<tu-subdominio>.workers.dev"

curl -i "$WORKER_URL/health"
curl -i "$WORKER_URL/api/fortnite/stats?player=JuanoYoloXd&platform=pc&scope=season"
```

Resultado esperado:
- `/health` → `200` con `{"status":"ok",...}`
- `/api/fortnite/stats` → `200` con `{ ok: true, status: ... }` (o `502` si falla proveedor externo), pero **no** `404 Not found`.

---

## 5) Revisión del frontend (base URL)

- `src/lib/api.ts` construye todas las llamadas con `VITE_API_BASE` + path.
- No hay hardcode de host en ese archivo.
- Si el frontend apunta al Worker equivocado, se corrige cambiando el valor de `VITE_API_BASE` en el entorno de build/deploy de GitHub Pages.

Checklist rápido:

```bash
# En local
printenv VITE_API_BASE

# En GitHub Pages (Settings/Secrets+Variables)
# Confirmar VITE_API_BASE = URL del worker canónico
# https://fortnite-coins-market-api.<tu-subdominio>.workers.dev
```

---

## 6) Tabla: Comprobación → Cómo verificar → Resultado esperado

| Comprobación | Cómo verificar | Resultado esperado |
|---|---|---|
| Worker canónico en repo | `cat worker/wrangler.toml` | `name = "fortnite-coins-market-api"`, `main = "src/index.ts"` |
| Ruta `/api/fortnite/stats` en código actual | `rg -n '/api/fortnite/stats' worker/src/index.ts` | 1 match en el router |
| Ruta ausente en estado master antiguo | `git show acb7ce8:worker/src/index.ts | rg -n '/api/fortnite/stats|/health'` | aparece `/health`, no aparece `/api/fortnite/stats` |
| Ruta presente desde commit nuevo | `git show b672829:worker/src/index.ts | rg -n '/api/fortnite/stats|/health'` | aparecen ambas rutas |
| Secrets en worker correcto | `npx wrangler secret list --name fortnite-coins-market-api` | incluye `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FORTNITE_API_KEY` |
| Frontend apunta al worker canónico | revisar `VITE_API_BASE` en build de Pages | URL de `fortnite-coins-market-api` |
| Endpoint health en producción | `curl -i "$WORKER_URL/health"` | HTTP 200 |
| Endpoint stats en producción | `curl -i "$WORKER_URL/api/fortnite/stats?..."` | HTTP 200/502, no 404 |

---

## 7) Archivos clave y snippets

### `worker/wrangler.toml`
```toml
name = "fortnite-coins-market-api"
main = "src/index.ts"
```

### `worker/src/index.ts` (router)
```ts
if (path === "/health" && request.method === "GET") return handleHealth(origin);
if (path === "/api/fortnite/stats" && request.method === "GET") return handleFortniteStatsDebug(env, url, origin);
...
return err("Not found", 404, origin);
```

### `src/lib/api.ts` (frontend base URL)
```ts
const rawApiBase = import.meta.env.VITE_API_BASE || "";
const API_BASE = rawApiBase.replace(/\/+$/, "");
```
