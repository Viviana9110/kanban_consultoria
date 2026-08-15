# Desarrollo

Guía de instalación, configuración y flujo de trabajo de **Kanban Consultoria**.

## Requisitos

- Node.js 20+ (probado con Node 24)
- PostgreSQL 14+
- npm

## Instalación

```bash
git clone <url-del-repositorio>
cd kanban-consultoria
npm install
```

## PostgreSQL

Crea la base de datos local (ajusta credenciales a tu entorno):

```bash
createdb kanban_consultoria
```

Alternativa con `psql`:

```bash
psql -U postgres -c "CREATE DATABASE kanban_consultoria;"
```

## Variables de entorno

```bash
cp .env.example .env
```

| Variable | Descripción | Default |
|---|---|---|
| `NODE_ENV` | `development`, `test` o `production` | `development` |
| `PORT` | Puerto de la API | `4000` |
| `DATABASE_URL` | Conexión PostgreSQL (`postgresql://usuario:password@host:puerto/bd`) | valor local de desarrollo |
| `FRONTEND_URL` | Origen permitido por CORS | `http://localhost:5173` |
| `SESSION_COOKIE` | Nombre de la cookie de sesión | `kanban_session` |
| `SESSION_DAYS` | Días de vida de la sesión | `30` |
| `TRUST_PROXY_HOPS` | Niveles de proxy reverso (0 si no hay) | `0` |
| `SEED_PASSWORD` | Contraseña de los usuarios del seed | — |
| `OPENAI_API_KEY` | Clave de OpenAI (opcional; sin ella la IA responde 503) | — |
| `OPENAI_MODEL` | Modelo para el análisis IA | `gpt-4o-mini` |

> No se incluyen secretos reales en el repositorio. `.env` está en `.gitignore`.

## Prisma

```bash
npm run db:generate          # Genera el cliente Prisma
npx prisma migrate dev       # Crea/aplica migraciones (desarrollo)
npx prisma migrate deploy    # Aplica migraciones existentes (producción)
npx prisma migrate status    # Estado de las migraciones
npx prisma validate          # Valida schema y configuración
```

Los modelos viven en `prisma/schema.prisma`; las migraciones, en `prisma/migrations/`.

## Seed

```bash
npm run db:seed
```

Crea dos usuarios con la contraseña de `SEED_PASSWORD`:

- `admin@kanban.local` — rol `SUPERUSER`
- `usuario@kanban.local` — rol `USER`

El seed rechaza `SEED_PASSWORD` por defecto en producción.

## Desarrollo local

```bash
npm run dev:api   # API en http://localhost:4000 (tsx watch)
npm run dev       # Frontend en http://localhost:5173 (proxy /api)
```

## Tests

```bash
npm test          # Vitest (una ejecución)
npm run test:watch
```

**45 tests** cubren schemas de validación, autenticación/autorización, CRUD, alcances por rol, protección IDOR, respuestas de IA (con cliente simulado), rate limiting, importación de recomendaciones y planes de acción. Los tests no hacen llamadas reales a OpenAI.

**E2E real (verificado, 36/36)**: flujo completo contra PostgreSQL y OpenAI reales (login, empresa, diagnóstico, DOFA, análisis IA, persistencia, importación, plan de acción, logout, permisos).

## Lint y typecheck

```bash
npm run lint
npm run typecheck
```

`typecheck` valida frontend (`tsconfig.app.json`), tooling (`tsconfig.node.json`) y backend (`tsconfig.server.json`).

## Build

```bash
npm run build        # Frontend (dist/) + Backend (dist-server/)
npm run build:server # Solo backend
```

- Frontend: `tsc -b && vite build`.
- Backend: `tsc -p tsconfig.server.build.json` emite `server/` a `dist-server/` (excluye `*.test.ts`).
- `dist/` y `dist-server/` están en `.gitignore`.

## Producción

1. Configura `.env` con `NODE_ENV=production`, `DATABASE_URL`, `FRONTEND_URL` y el resto de variables reales.
2. Aplica migraciones y construye:

```bash
npx prisma migrate deploy
npm run build
```

3. Arranca el backend compilado:

```bash
npm run start   # node dist-server/index.js
```

Consideraciones:

- En producción el backend no arranca si `DATABASE_URL` o `FRONTEND_URL` son los valores de desarrollo.
- Detrás de un proxy reverso, ajusta `TRUST_PROXY_HOPS` para que el rate limiting use la IP real del cliente.
- En producción la cookie de sesión usa `Secure` y se envía HSTS.

## Flujo de trabajo sugerido

1. `npm run db:migrate` tras cambiar `schema.prisma`.
2. `npm run db:seed` en bases de desarrollo vacías.
3. `npm run typecheck && npm run lint && npm test` antes de abrir un cambio.
4. `npm run build` y `npm run start` para validar el despliegue.
