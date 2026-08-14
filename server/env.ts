import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/kanban_consultoria'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  SESSION_COOKIE: z.string().min(1).default('kanban_session'),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
})

export const env = envSchema.parse(process.env)
