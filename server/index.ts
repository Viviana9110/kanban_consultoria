import { createApp } from './app.js'
import { env } from './env.js'
import { prisma } from './prisma.js'

const server = createApp().listen(env.PORT, () => console.log(`API listening on port ${env.PORT}`))

const shutdown = async () => {
  server.close()
  await prisma.$disconnect()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
