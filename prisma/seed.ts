import 'dotenv/config'
import { PrismaClient, Role } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/kanban_consultoria' })
const prisma = new PrismaClient({ adapter })

async function main() {
  const password = process.env.SEED_PASSWORD ?? 'CambiarEstaClave123!'
  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.user.upsert({
    where: { email: 'admin@kanban.local' },
    update: { name: 'Admin Kanban', role: Role.SUPERUSER, passwordHash },
    create: {
      email: 'admin@kanban.local',
      name: 'Admin Kanban',
      role: Role.SUPERUSER,
      passwordHash,
    },
  })
  await prisma.user.upsert({
    where: { email: 'usuario@kanban.local' },
    update: { name: 'Usuario Kanban', role: Role.USER, passwordHash },
    create: {
      email: 'usuario@kanban.local',
      name: 'Usuario Kanban',
      role: Role.USER,
      passwordHash,
    },
  })

  console.log('Development users created. Password is controlled by SEED_PASSWORD.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
