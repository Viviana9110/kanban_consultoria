import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { createHash } from 'node:crypto'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import { Prisma, PrismaClient, Role, TicketPriority, TicketStatus } from '@prisma/client'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { authenticate, authorize, clearSessionCookie, createSession, publicUser } from './auth.js'
import { companyCreateSchema, companyQuerySchema, companyUpdateSchema, loginSchema, ticketCreateSchema, ticketQuerySchema, ticketUpdateSchema, userCreateSchema } from './validation.js'

const asyncHandler = (handler: RequestHandler): RequestHandler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

const userInclude = { createdBy: { select: { id: true, name: true, email: true } }, assignedTo: { select: { id: true, name: true, email: true } } } as const
const ticketView = (ticket: Prisma.TicketGetPayload<{ include: typeof userInclude }>) => ticket
const companyInclude = { consultant: { select: { id: true, name: true, email: true, role: true } } } as const
const companyView = (company: Prisma.CompanyGetPayload<{ include: typeof companyInclude }>) => company

const scopeForUser = (request: Request): Prisma.TicketWhereInput => request.user?.role === Role.SUPERUSER ? {} : { OR: [{ createdById: request.user?.id }, { assignedToId: request.user?.id }] }

const canAccessTicket = (request: Request, ticket: { createdById: string; assignedToId: string | null }) => request.user?.role === Role.SUPERUSER || ticket.createdById === request.user?.id || ticket.assignedToId === request.user?.id
const scopeForCompany = (request: Request): Prisma.CompanyWhereInput => request.user?.role === Role.SUPERUSER ? {} : { consultantId: request.user?.id }
const canAccessCompany = (request: Request, company: { consultantId: string | null }) => request.user?.role === Role.SUPERUSER || company.consultantId === request.user?.id

export const createApp = (db: PrismaClient = prisma) => {
  const app = express()
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  const authMiddleware = authenticate(db)
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts' } })

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

  app.post('/api/auth/login', loginLimiter, asyncHandler(async (request, response) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid credentials format' })
      return
    }
    const user = await db.user.findUnique({ where: { email: parsed.data.email } })
    const valid = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false
    if (!user || !valid) {
      response.status(401).json({ error: 'Invalid email or password' })
      return
    }
    await createSession(db, user.id, response)
    response.json({ user: publicUser(user) })
  }))

  app.post('/api/auth/logout', asyncHandler(async (request, response) => {
    const token = request.cookies?.[env.SESSION_COOKIE]
    if (token) {
      await db.session.deleteMany({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
    }
    clearSessionCookie(response)
    response.status(204).send()
  }))

  app.get('/api/auth/me', authMiddleware, (request, response) => response.json({ user: request.user }))

  app.get('/api/users', authMiddleware, asyncHandler(async (_request, response) => {
    const users = await db.user.findMany({ select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } })
    response.json({ users })
  }))

  app.post('/api/users', authMiddleware, authorize(Role.SUPERUSER), asyncHandler(async (request, response) => {
    const parsed = userCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid user data', details: parsed.error.issues })
      return
    }
    const { password, ...userData } = parsed.data
    const user = await db.user.create({ data: { ...userData, passwordHash: await bcrypt.hash(password, 12) }, select: { id: true, name: true, email: true, role: true } })
    response.status(201).json({ user })
  }))

  app.get('/api/companies', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = companyQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid company filters', details: parsed.error.issues })
      return
    }
    const where: Prisma.CompanyWhereInput = scopeForCompany(request)
    if (parsed.data.search) {
      where.OR = [
        { name: { contains: parsed.data.search, mode: 'insensitive' } },
        { identification: { contains: parsed.data.search, mode: 'insensitive' } },
        { industry: { contains: parsed.data.search, mode: 'insensitive' } },
      ]
    }
    const companies = await db.company.findMany({ where, include: companyInclude, orderBy: { updatedAt: 'desc' } })
    response.json({ companies: companies.map(companyView) })
  }))

  app.post('/api/companies', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = companyCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid company data', details: parsed.error.issues })
      return
    }
    if (request.user?.role !== Role.SUPERUSER && parsed.data.consultantId !== undefined && parsed.data.consultantId !== request.user?.id) {
      response.status(403).json({ error: 'You can only assign companies to yourself' })
      return
    }
    const consultantId = request.user?.role === Role.SUPERUSER ? parsed.data.consultantId ?? null : request.user!.id
    if (consultantId) {
      const consultant = await db.user.findUnique({ where: { id: consultantId }, select: { id: true } })
      if (!consultant) {
        response.status(400).json({ error: 'Consultant not found' })
        return
      }
    }
    const company = await db.company.create({
      data: { name: parsed.data.name, identification: parsed.data.identification, industry: parsed.data.industry, description: parsed.data.description, consultantId },
      include: companyInclude,
    })
    response.status(201).json({ company: companyView(company) })
  }))

  app.get('/api/companies/:id', authMiddleware, asyncHandler(async (request, response) => {
    const company = await db.company.findUnique({ where: { id: String(request.params.id) }, include: companyInclude })
    if (!company || !canAccessCompany(request, company)) {
      response.status(404).json({ error: 'Company not found' })
      return
    }
    response.json({ company: companyView(company) })
  }))

  app.patch('/api/companies/:id', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = companyUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid company data', details: parsed.error.issues })
      return
    }
    const existing = await db.company.findUnique({ where: { id: String(request.params.id) }, select: { id: true, consultantId: true } })
    if (!existing || !canAccessCompany(request, existing)) {
      response.status(404).json({ error: 'Company not found' })
      return
    }
    if (request.user?.role !== Role.SUPERUSER && parsed.data.consultantId !== undefined && parsed.data.consultantId !== request.user?.id) {
      response.status(403).json({ error: 'You can only assign companies to yourself' })
      return
    }
    if (parsed.data.consultantId) {
      const consultant = await db.user.findUnique({ where: { id: parsed.data.consultantId }, select: { id: true } })
      if (!consultant) {
        response.status(400).json({ error: 'Consultant not found' })
        return
      }
    }
    const company = await db.company.update({ where: { id: existing.id }, data: parsed.data, include: companyInclude })
    response.json({ company: companyView(company) })
  }))

  app.delete('/api/companies/:id', authMiddleware, asyncHandler(async (request, response) => {
    const existing = await db.company.findUnique({ where: { id: String(request.params.id) }, select: { id: true, consultantId: true } })
    if (!existing || !canAccessCompany(request, existing)) {
      response.status(404).json({ error: 'Company not found' })
      return
    }
    await db.company.delete({ where: { id: existing.id } })
    response.status(204).send()
  }))

  app.get('/api/tickets', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = ticketQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid filters', details: parsed.error.issues })
      return
    }
    const { status, priority, search } = parsed.data
    const where: Prisma.TicketWhereInput = { ...scopeForUser(request), ...(status ? { status } : {}), ...(priority ? { priority } : {}) }
    if (search) where.AND = [{ OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }]
    const tickets = await db.ticket.findMany({ where, include: userInclude, orderBy: { updatedAt: 'desc' } })
    response.json({ tickets: tickets.map(ticketView) })
  }))

  app.post('/api/tickets', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = ticketCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid ticket data', details: parsed.error.issues })
      return
    }
    if (parsed.data.assignedToId && request.user?.role !== Role.SUPERUSER) {
      response.status(403).json({ error: 'Only superusers can assign tickets' })
      return
    }
    if (parsed.data.assignedToId) {
      const assignee = await db.user.findUnique({ where: { id: parsed.data.assignedToId }, select: { id: true } })
      if (!assignee) {
        response.status(400).json({ error: 'Assigned user not found' })
        return
      }
    }
    const ticket = await db.ticket.create({ data: { title: parsed.data.title, description: parsed.data.description, status: parsed.data.status, priority: parsed.data.priority, createdById: request.user!.id, assignedToId: parsed.data.assignedToId }, include: userInclude })
    response.status(201).json({ ticket: ticketView(ticket) })
  }))

  app.get('/api/tickets/:id', authMiddleware, asyncHandler(async (request, response) => {
    const ticket = await db.ticket.findUnique({ where: { id: String(request.params.id) }, include: userInclude })
    if (!ticket || !canAccessTicket(request, ticket)) {
      response.status(404).json({ error: 'Ticket not found' })
      return
    }
    response.json({ ticket: ticketView(ticket) })
  }))

  app.patch('/api/tickets/:id', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = ticketUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid ticket data', details: parsed.error.issues })
      return
    }
    const existing = await db.ticket.findUnique({ where: { id: String(request.params.id) } })
    if (!existing || !canAccessTicket(request, existing)) {
      response.status(404).json({ error: 'Ticket not found' })
      return
    }
    if (parsed.data.assignedToId !== undefined && request.user?.role !== Role.SUPERUSER) {
      response.status(403).json({ error: 'Only superusers can assign tickets' })
      return
    }
    if (parsed.data.assignedToId) {
      const assignee = await db.user.findUnique({ where: { id: parsed.data.assignedToId }, select: { id: true } })
      if (!assignee) {
        response.status(400).json({ error: 'Assigned user not found' })
        return
      }
    }
    const ticket = await db.ticket.update({ where: { id: existing.id }, data: parsed.data, include: userInclude })
    response.json({ ticket: ticketView(ticket) })
  }))

  app.delete('/api/tickets/:id', authMiddleware, asyncHandler(async (request, response) => {
    const existing = await db.ticket.findUnique({ where: { id: String(request.params.id) }, select: { id: true, createdById: true, assignedToId: true } })
    if (!existing || !canAccessTicket(request, existing)) {
      response.status(404).json({ error: 'Ticket not found' })
      return
    }
    if (request.user?.role !== Role.SUPERUSER && existing.createdById !== request.user?.id) {
      response.status(403).json({ error: 'Only the creator or a superuser can delete a ticket' })
      return
    }
    await db.ticket.delete({ where: { id: existing.id } })
    response.status(204).send()
  }))

  app.get('/api/dashboard', authMiddleware, asyncHandler(async (request, response) => {
    const where = scopeForUser(request)
    const [total, open, inProgress, closed, priority, recentActivity] = await Promise.all([
      db.ticket.count({ where }),
      db.ticket.count({ where: { AND: [where, { status: TicketStatus.OPEN }] } }),
      db.ticket.count({ where: { AND: [where, { status: TicketStatus.IN_PROGRESS }] } }),
      db.ticket.count({ where: { AND: [where, { status: TicketStatus.CLOSED }] } }),
      db.ticket.count({ where: { AND: [where, { priority: { in: [TicketPriority.HIGH, TicketPriority.URGENT] } }] } }),
      db.ticket.findMany({ where, include: userInclude, orderBy: { updatedAt: 'desc' }, take: 5 }),
    ])
    response.json({ summary: { total, open, inProgress, closed, priority }, recentActivity: recentActivity.map(ticketView) })
  }))

  app.use((_request, response) => response.status(404).json({ error: 'Not found' }))
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      response.status(409).json({ error: 'A resource with that value already exists' })
      return
    }
    console.error(error)
    response.status(500).json({ error: 'Internal server error' })
  })
  return app
}
