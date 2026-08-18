import 'dotenv/config'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/kanban_consultoria'

const pool = new Pool({
  connectionString,
  max: 3,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  ssl: connectionString.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
})

const UPSERT_USER = `
  INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now(), now())
  ON CONFLICT ("email")
  DO UPDATE SET
    "name"         = EXCLUDED."name",
    "passwordHash" = EXCLUDED."passwordHash",
    "role"         = EXCLUDED."role",
    "updatedAt"    = now()
`

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
    throw new Error('SEED_PASSWORD must be set to seed users in production')
  }

  const password = process.env.SEED_PASSWORD ?? 'CambiarEstaClave123!'
  if (!process.env.SEED_PASSWORD) {
    console.warn(
      'Using the default SEED_PASSWORD. Set SEED_PASSWORD before seeding real environments.',
    )
  }
  const passwordHash = await bcrypt.hash(password, 12)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(UPSERT_USER, [
      'admin@kanban.local',
      'Admin Kanban',
      passwordHash,
      'SUPERUSER',
    ])
    await client.query(UPSERT_USER, [
      'usuario@kanban.local',
      'Usuario Kanban',
      passwordHash,
      'USER',
    ])

    await client.query('COMMIT')
    console.log('Development users created. Password is controlled by SEED_PASSWORD.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
