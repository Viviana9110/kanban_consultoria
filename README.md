# Kanban Consultoria

Módulo inicial de operación: autenticación, dashboard y gestión de tickets.

## Requisitos

- Node.js 20+
- PostgreSQL 14+

## Configuración local

1. Copia `.env.example` a `.env` y ajusta `DATABASE_URL`.
2. Instala dependencias con `npm install`.
3. Genera el cliente y aplica la migración:

```bash
npm run db:generate
npx prisma migrate deploy
npm run db:seed
```

El seed crea usuarios únicamente para desarrollo. Usa `SEED_PASSWORD` para definir la contraseña de ambos usuarios:

- `admin@kanban.local` como `SUPERUSER`
- `usuario@kanban.local` como `USER`

## Desarrollo

Ejecuta la API y el frontend en terminales separadas:

```bash
npm run dev:api
npm run dev
```

El proxy de Vite envía `/api` a `http://localhost:4000`.

## Scripts

- `npm run typecheck`: valida frontend y backend.
- `npm run lint`: ejecuta ESLint.
- `npm test`: ejecuta pruebas de API y validaciones.
- `npm run build`: genera el build del frontend.

## API

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/users`, `POST /api/users`
- `GET /api/tickets`, `POST /api/tickets`, `GET /api/tickets/:id`
- `PATCH /api/tickets/:id`, `DELETE /api/tickets/:id`
- `GET /api/companies`, `POST /api/companies`, `GET /api/companies/:id`
- `PATCH /api/companies/:id`, `DELETE /api/companies/:id`
- `GET /api/dashboard`

Las sesiones usan cookies `HttpOnly` persistentes y el backend aplica autorización por rol, validación Zod, CORS restringido y rate limiting al login.
