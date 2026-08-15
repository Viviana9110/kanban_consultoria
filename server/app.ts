import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { createHash } from 'node:crypto'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import { Prisma, PrismaClient, Role } from '@prisma/client'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { authenticate, authorize, clearSessionCookie, createSession, publicUser } from './auth.js'
import { AIService, AIServiceError } from './ai-service.js'
import { getDashboardData } from './dashboard-service.js'
import { actionItemCreateSchema, actionItemUpdateSchema, actionPlanCreateSchema, actionPlanUpdateSchema, aiAnalysisSchema, companyCreateSchema, companyQuerySchema, companyUpdateSchema, diagnosticCreateSchema, diagnosticUpdateSchema, loginSchema, recommendationUpdateSchema, swotItemCreateSchema, swotItemUpdateSchema, ticketCreateSchema, ticketQuerySchema, ticketUpdateSchema, userCreateSchema } from './validation.js'

const asyncHandler = (handler: RequestHandler): RequestHandler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

const DUMMY_PASSWORD_HASH = '$2b$12$UjBgyzK627Qyclju5Vdtne3rVrXxGDHxvGqnZahRh5D9geupYld9y'

const userInclude = { createdBy: { select: { id: true, name: true, email: true } }, assignedTo: { select: { id: true, name: true, email: true } } } as const
const ticketView = (ticket: Prisma.TicketGetPayload<{ include: typeof userInclude }>) => ticket
const companyInclude = { consultant: { select: { id: true, name: true, email: true, role: true } } } as const
const companyView = (company: Prisma.CompanyGetPayload<{ include: typeof companyInclude }>) => company
const diagnosticInclude = { company: { select: { id: true, name: true, consultantId: true } }, createdBy: { select: { id: true, name: true, email: true } }, swotAnalysis: { include: { items: { orderBy: { createdAt: 'asc' } } } } } as const
const diagnosticView = (diagnostic: Prisma.QualityDiagnosticGetPayload<{ include: typeof diagnosticInclude }>) => diagnostic
const swotItemAccessInclude = { swot: { include: { diagnostic: { select: { companyId: true, company: { select: { consultantId: true } } } } } } } as const
const swotItemView = (item: Prisma.SWOTItemGetPayload<{ include: typeof swotItemAccessInclude }>) => ({ id: item.id, swotId: item.swotId, type: item.type, description: item.description, priority: item.priority, impact: item.impact, createdAt: item.createdAt })
const aiAnalysisView = (analysis: { id: string; diagnosticId: string; executiveSummary: string; diagnosis: string; keyFindings: unknown; foStrategies: unknown; doStrategies: unknown; faStrategies: unknown; daStrategies: unknown; priorityRisks: unknown; priorityOpportunities: unknown; recommendations: unknown; createdAt: Date; updatedAt: Date }) => ({ id: analysis.id, diagnosticId: analysis.diagnosticId, ...aiAnalysisSchema.parse({ executiveSummary: analysis.executiveSummary, diagnosis: analysis.diagnosis, keyFindings: analysis.keyFindings, foStrategies: analysis.foStrategies, doStrategies: analysis.doStrategies, faStrategies: analysis.faStrategies, daStrategies: analysis.daStrategies, priorityRisks: analysis.priorityRisks, priorityOpportunities: analysis.priorityOpportunities, recommendations: analysis.recommendations }), createdAt: analysis.createdAt, updatedAt: analysis.updatedAt })
const recommendationView = (recommendation: { id: string; diagnosticId: string; title: string; description: string; priority: string; expectedImpact: string; suggestedAction: string; status: string; createdAt: Date; updatedAt: Date }) => recommendation
const actionItemInclude = { recommendation: { select: { id: true, title: true, priority: true, status: true } }, responsible: { select: { id: true, name: true, email: true } } } as const
const actionItemView = (item: Prisma.ActionItemGetPayload<{ include: typeof actionItemInclude }>) => item
const actionPlanInclude = { createdBy: { select: { id: true, name: true, email: true } }, items: { include: actionItemInclude, orderBy: { createdAt: 'asc' as const } } } as const
const actionPlanView = (plan: Prisma.ActionPlanGetPayload<{ include: typeof actionPlanInclude }>) => plan

const scopeForUser = (request: Request): Prisma.TicketWhereInput => request.user?.role === Role.SUPERUSER ? {} : { OR: [{ createdById: request.user?.id }, { assignedToId: request.user?.id }] }

const canAccessTicket = (request: Request, ticket: { createdById: string; assignedToId: string | null }) => request.user?.role === Role.SUPERUSER || ticket.createdById === request.user?.id || ticket.assignedToId === request.user?.id
const scopeForCompany = (request: Request): Prisma.CompanyWhereInput => request.user?.role === Role.SUPERUSER ? {} : { consultantId: request.user?.id }
const canAccessCompany = (request: Request, company: { consultantId: string | null }) => request.user?.role === Role.SUPERUSER || company.consultantId === request.user?.id

export const createApp = (db: PrismaClient = prisma, aiService: AIService = new AIService()) => {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', env.TRUST_PROXY_HOPS)
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    response.setHeader('Cache-Control', 'no-store')
    if (env.NODE_ENV === 'production') response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    next()
  })

  const authMiddleware = authenticate(db)
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts' } })
  const aiAnalysisLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many AI analysis requests' } })

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

  app.post('/api/auth/login', loginLimiter, asyncHandler(async (request, response) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid credentials format' })
      return
    }
    const user = await db.user.findUnique({ where: { email: parsed.data.email } })
    const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
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
    const users = await db.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } })
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

  app.get('/api/companies/:companyId/diagnostics', authMiddleware, asyncHandler(async (request, response) => {
    const company = await db.company.findUnique({ where: { id: String(request.params.companyId) }, select: { id: true, consultantId: true } })
    if (!company || !canAccessCompany(request, company)) {
      response.status(404).json({ error: 'Company not found' })
      return
    }
    const diagnostics = await db.qualityDiagnostic.findMany({ where: { companyId: company.id }, include: diagnosticInclude, orderBy: { updatedAt: 'desc' } })
    response.json({ diagnostics: diagnostics.map(diagnosticView) })
  }))

  app.post('/api/companies/:companyId/diagnostics', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = diagnosticCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid diagnostic data', details: parsed.error.issues })
      return
    }
    const company = await db.company.findUnique({ where: { id: String(request.params.companyId) }, select: { id: true, consultantId: true } })
    if (!company || !canAccessCompany(request, company)) {
      response.status(404).json({ error: 'Company not found' })
      return
    }
    const diagnostic = await db.qualityDiagnostic.create({
      data: { companyId: company.id, title: parsed.data.title, description: parsed.data.description, status: parsed.data.status, createdById: request.user!.id, swotAnalysis: { create: {} } },
      include: diagnosticInclude,
    })
    response.status(201).json({ diagnostic: diagnosticView(diagnostic) })
  }))

  app.get('/api/diagnostics/:id', authMiddleware, asyncHandler(async (request, response) => {
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: diagnosticInclude })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    response.json({ diagnostic: diagnosticView(diagnostic) })
  }))

  app.patch('/api/diagnostics/:id', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = diagnosticUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid diagnostic data', details: parsed.error.issues })
      return
    }
    const existing = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { id: true, consultantId: true } } } })
    if (!existing || !canAccessCompany(request, existing.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    const diagnostic = await db.qualityDiagnostic.update({ where: { id: existing.id }, data: parsed.data, include: diagnosticInclude })
    response.json({ diagnostic: diagnosticView(diagnostic) })
  }))

  app.delete('/api/diagnostics/:id', authMiddleware, asyncHandler(async (request, response) => {
    const existing = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { id: true, consultantId: true } } } })
    if (!existing || !canAccessCompany(request, existing.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    await db.qualityDiagnostic.delete({ where: { id: existing.id } })
    response.status(204).send()
  }))

  app.post('/api/diagnostics/:id/swot/items', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = swotItemCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid SWOT item data', details: parsed.error.issues })
      return
    }
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { consultantId: true } }, swotAnalysis: { select: { id: true } } } })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    if (!diagnostic.swotAnalysis) {
      response.status(409).json({ error: 'Diagnostic SWOT analysis is unavailable' })
      return
    }
    const item = await db.sWOTItem.create({ data: { ...parsed.data, swotId: diagnostic.swotAnalysis.id }, include: swotItemAccessInclude })
    response.status(201).json({ item: swotItemView(item) })
  }))

  app.patch('/api/swot/items/:id', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = swotItemUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid SWOT item data', details: parsed.error.issues })
      return
    }
    const existing = await db.sWOTItem.findUnique({ where: { id: String(request.params.id) }, include: swotItemAccessInclude })
    if (!existing || !canAccessCompany(request, existing.swot.diagnostic.company)) {
      response.status(404).json({ error: 'SWOT item not found' })
      return
    }
    const item = await db.sWOTItem.update({ where: { id: existing.id }, data: parsed.data, include: swotItemAccessInclude })
    response.json({ item: swotItemView(item) })
  }))

  app.delete('/api/swot/items/:id', authMiddleware, asyncHandler(async (request, response) => {
    const existing = await db.sWOTItem.findUnique({ where: { id: String(request.params.id) }, include: swotItemAccessInclude })
    if (!existing || !canAccessCompany(request, existing.swot.diagnostic.company)) {
      response.status(404).json({ error: 'SWOT item not found' })
      return
    }
    await db.sWOTItem.delete({ where: { id: existing.id } })
    response.status(204).send()
  }))

  app.post('/api/diagnostics/:id/ai-analysis', authMiddleware, aiAnalysisLimiter, asyncHandler(async (request, response) => {
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: diagnosticInclude })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    let result
    try {
      result = await aiService.analyze({
        title: diagnostic.title,
        description: diagnostic.description,
        status: diagnostic.status,
        swotItems: diagnostic.swotAnalysis?.items.map((item) => ({ type: item.type, description: item.description, priority: item.priority, impact: item.impact })) ?? [],
      })
    } catch (error) {
      if (error instanceof AIServiceError) {
        if (error.code === 'NOT_CONFIGURED') {
          response.status(503).json({ error: 'AI analysis is not configured' })
          return
        }
        if (error.code === 'INVALID_RESPONSE') {
          response.status(502).json({ error: 'AI returned an invalid analysis' })
          return
        }
        response.status(502).json({ error: 'AI analysis is temporarily unavailable' })
        return
      }
      throw error
    }
    const analysis = await db.aIAnalysis.upsert({
      where: { diagnosticId: diagnostic.id },
      create: { diagnosticId: diagnostic.id, ...result },
      update: { ...result },
    })
    response.json({ analysis: aiAnalysisView(analysis) })
  }))

  app.get('/api/diagnostics/:id/ai-analysis', authMiddleware, asyncHandler(async (request, response) => {
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { consultantId: true } } } })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    const analysis = await db.aIAnalysis.findUnique({ where: { diagnosticId: diagnostic.id } })
    if (!analysis) {
      response.status(404).json({ error: 'AI analysis not found' })
      return
    }
    response.json({ analysis: aiAnalysisView(analysis) })
  }))

  app.get('/api/diagnostics/:id/recommendations', authMiddleware, asyncHandler(async (request, response) => {
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { consultantId: true } } } })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    const recommendations = await db.recommendation.findMany({ where: { diagnosticId: diagnostic.id }, orderBy: { createdAt: 'desc' } })
    response.json({ recommendations: recommendations.map(recommendationView) })
  }))

  app.post('/api/diagnostics/:id/recommendations/import', authMiddleware, asyncHandler(async (request, response) => {
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { consultantId: true } } } })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    const analysis = await db.aIAnalysis.findUnique({ where: { diagnosticId: diagnostic.id } })
    if (!analysis) {
      response.status(404).json({ error: 'AI analysis not found' })
      return
    }
    const aiRecommendations = aiAnalysisSchema.parse({ executiveSummary: analysis.executiveSummary, diagnosis: analysis.diagnosis, keyFindings: analysis.keyFindings, foStrategies: analysis.foStrategies, doStrategies: analysis.doStrategies, faStrategies: analysis.faStrategies, daStrategies: analysis.daStrategies, priorityRisks: analysis.priorityRisks, priorityOpportunities: analysis.priorityOpportunities, recommendations: analysis.recommendations }).recommendations
    const existing = await db.recommendation.findMany({ where: { diagnosticId: diagnostic.id }, select: { title: true } })
    const existingTitles = new Set(existing.map((item) => item.title))
    const toImport = aiRecommendations.filter((recommendation) => !existingTitles.has(recommendation.title))
    const imported = await Promise.all(toImport.map((recommendation) => db.recommendation.create({ data: { diagnosticId: diagnostic.id, ...recommendation } })))
    response.json({ imported: imported.map(recommendationView), skipped: aiRecommendations.length - imported.length })
  }))

  app.patch('/api/recommendations/:id', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = recommendationUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid recommendation data', details: parsed.error.issues })
      return
    }
    const existing = await db.recommendation.findUnique({ where: { id: String(request.params.id) }, include: { diagnostic: { include: { company: { select: { consultantId: true } } } } } })
    if (!existing || !canAccessCompany(request, existing.diagnostic.company)) {
      response.status(404).json({ error: 'Recommendation not found' })
      return
    }
    const recommendation = await db.recommendation.update({ where: { id: existing.id }, data: parsed.data })
    response.json({ recommendation: recommendationView(recommendation) })
  }))

  app.get('/api/diagnostics/:id/action-plans', authMiddleware, asyncHandler(async (request, response) => {
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { consultantId: true } } } })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    const actionPlans = await db.actionPlan.findMany({ where: { diagnosticId: diagnostic.id }, include: actionPlanInclude, orderBy: { updatedAt: 'desc' } })
    response.json({ actionPlans: actionPlans.map(actionPlanView) })
  }))

  app.post('/api/diagnostics/:id/action-plans', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = actionPlanCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid action plan data', details: parsed.error.issues })
      return
    }
    const diagnostic = await db.qualityDiagnostic.findUnique({ where: { id: String(request.params.id) }, include: { company: { select: { consultantId: true } } } })
    if (!diagnostic || !canAccessCompany(request, diagnostic.company)) {
      response.status(404).json({ error: 'Diagnostic not found' })
      return
    }
    const actionPlan = await db.actionPlan.create({ data: { diagnosticId: diagnostic.id, title: parsed.data.title, description: parsed.data.description, status: parsed.data.status, createdById: request.user!.id }, include: actionPlanInclude })
    response.status(201).json({ actionPlan: actionPlanView(actionPlan) })
  }))

  app.get('/api/action-plans/:id', authMiddleware, asyncHandler(async (request, response) => {
    const actionPlan = await db.actionPlan.findUnique({ where: { id: String(request.params.id) }, include: { ...actionPlanInclude, diagnostic: { include: { company: { select: { consultantId: true } } } } } })
    if (!actionPlan || !canAccessCompany(request, actionPlan.diagnostic.company)) {
      response.status(404).json({ error: 'Action plan not found' })
      return
    }
    response.json({ actionPlan: actionPlanView(actionPlan) })
  }))

  app.patch('/api/action-plans/:id', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = actionPlanUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid action plan data', details: parsed.error.issues })
      return
    }
    const existing = await db.actionPlan.findUnique({ where: { id: String(request.params.id) }, include: { diagnostic: { include: { company: { select: { consultantId: true } } } } } })
    if (!existing || !canAccessCompany(request, existing.diagnostic.company)) {
      response.status(404).json({ error: 'Action plan not found' })
      return
    }
    const actionPlan = await db.actionPlan.update({ where: { id: existing.id }, data: parsed.data, include: actionPlanInclude })
    response.json({ actionPlan: actionPlanView(actionPlan) })
  }))

  app.post('/api/action-plans/:id/items', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = actionItemCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid action item data', details: parsed.error.issues })
      return
    }
    const actionPlan = await db.actionPlan.findUnique({ where: { id: String(request.params.id) }, select: { id: true, diagnosticId: true, diagnostic: { select: { company: { select: { consultantId: true } } } } } })
    if (!actionPlan || !canAccessCompany(request, actionPlan.diagnostic.company)) {
      response.status(404).json({ error: 'Action plan not found' })
      return
    }
    if (parsed.data.recommendationId) {
      const recommendation = await db.recommendation.findUnique({ where: { id: parsed.data.recommendationId }, select: { diagnosticId: true } })
      if (!recommendation || recommendation.diagnosticId !== actionPlan.diagnosticId) {
        response.status(400).json({ error: 'Recommendation not found for this diagnostic' })
        return
      }
    }
    if (parsed.data.responsibleId) {
      const responsible = await db.user.findUnique({ where: { id: parsed.data.responsibleId }, select: { id: true } })
      if (!responsible) {
        response.status(400).json({ error: 'Responsible user not found' })
        return
      }
    }
    const item = await db.actionItem.create({ data: { actionPlanId: actionPlan.id, ...parsed.data }, include: actionItemInclude })
    response.status(201).json({ item: actionItemView(item) })
  }))

  app.patch('/api/action-items/:id', authMiddleware, asyncHandler(async (request, response) => {
    const parsed = actionItemUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid action item data', details: parsed.error.issues })
      return
    }
    const existing = await db.actionItem.findUnique({ where: { id: String(request.params.id) }, include: { actionPlan: { include: { diagnostic: { include: { company: { select: { consultantId: true } } } } } } } })
    if (!existing || !canAccessCompany(request, existing.actionPlan.diagnostic.company)) {
      response.status(404).json({ error: 'Action item not found' })
      return
    }
    if (parsed.data.recommendationId) {
      const recommendation = await db.recommendation.findUnique({ where: { id: parsed.data.recommendationId }, select: { diagnosticId: true } })
      if (!recommendation || recommendation.diagnosticId !== existing.actionPlan.diagnosticId) {
        response.status(400).json({ error: 'Recommendation not found for this diagnostic' })
        return
      }
    }
    if (parsed.data.responsibleId) {
      const responsible = await db.user.findUnique({ where: { id: parsed.data.responsibleId }, select: { id: true } })
      if (!responsible) {
        response.status(400).json({ error: 'Responsible user not found' })
        return
      }
    }
    const item = await db.actionItem.update({ where: { id: existing.id }, data: parsed.data, include: actionItemInclude })
    response.json({ item: actionItemView(item) })
  }))

  app.delete('/api/action-items/:id', authMiddleware, asyncHandler(async (request, response) => {
    const existing = await db.actionItem.findUnique({ where: { id: String(request.params.id) }, include: { actionPlan: { include: { diagnostic: { include: { company: { select: { consultantId: true } } } } } } } })
    if (!existing || !canAccessCompany(request, existing.actionPlan.diagnostic.company)) {
      response.status(404).json({ error: 'Action item not found' })
      return
    }
    await db.actionItem.delete({ where: { id: existing.id } })
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
    const dashboard = await getDashboardData(db, request)
    response.json(dashboard)
  }))

  app.use((_request, response) => response.status(404).json({ error: 'Not found' }))
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    void next
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: 'Invalid JSON body' })
      return
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      response.status(409).json({ error: 'A resource with that value already exists' })
      return
    }
    console.error(error instanceof Error ? error.message : error)
    response.status(500).json({ error: 'Internal server error' })
  })
  return app
}
