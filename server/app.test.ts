import bcrypt from 'bcryptjs'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient, Role } from '@prisma/client'
import { createApp } from './app.js'
import { AIService, AIServiceError } from './ai-service.js'
import { aiAnalysisSchema, companyCreateSchema, companyUpdateSchema, diagnosticCreateSchema, diagnosticUpdateSchema, loginSchema, swotItemCreateSchema, swotItemUpdateSchema, ticketCreateSchema, ticketUpdateSchema } from './validation.js'

const admin = { id: 'cmadmin000000000000000001', email: 'admin@test.local', name: 'Admin Test', role: 'SUPERUSER' as Role }
const member = { id: 'cmmember00000000000000001', email: 'member@test.local', name: 'Member Test', role: 'USER' as Role }
const ticket = {
  id: 'cmticket00000000000000001', title: 'Revisar propuesta', description: 'Validar la propuesta comercial', status: 'OPEN' as const, priority: 'HIGH' as const,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), createdBy: member, assignedTo: null,
}
const company = {
  id: 'cmcompany00000000000000001', name: 'Acme Consultores', identification: '900123456-7', industry: 'Servicios', description: 'Empresa de consultoría estratégica',
  consultantId: member.id, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), consultant: member,
}
const diagnostic = {
  id: 'cmdiagnostic000000000000001', companyId: company.id, title: 'Diagnóstico inicial', description: 'Revisión general de la operación', status: 'DRAFT' as const, createdById: member.id,
  createdAt: new Date('2026-01-03'), updatedAt: new Date('2026-01-03'), company: { id: company.id, name: company.name, consultantId: member.id }, createdBy: member,
  swotAnalysis: { id: 'cmswot000000000000000001', diagnosticId: 'cmdiagnostic000000000000001', createdAt: new Date('2026-01-03'), updatedAt: new Date('2026-01-03'), items: [] },
}
const swotItem = { id: 'cmswotitem0000000000000001', swotId: diagnostic.swotAnalysis.id, type: 'STRENGTH' as const, description: 'Equipo comprometido', priority: 'HIGH' as const, impact: 'HIGH' as const, createdAt: new Date('2026-01-04') }
const aiResult = {
  executiveSummary: 'La empresa cuenta con capacidades internas sólidas y oportunidades de mejora.',
  diagnosis: 'La información indica una operación con fortalezas aprovechables.',
  keyFindings: [{ finding: 'Equipo comprometido', basis: 'FACT' as const }],
  foStrategies: ['Usar el compromiso del equipo para capturar oportunidades.'],
  doStrategies: ['Mejorar procesos para aprovechar oportunidades.'],
  faStrategies: ['Apoyarse en el equipo para mitigar amenazas.'],
  daStrategies: ['Reducir debilidades frente a amenazas identificadas.'],
  priorityRisks: ['Dependencia de procesos manuales.'],
  priorityOpportunities: ['Mejora de la operación.'],
  recommendations: [{ title: 'Priorizar procesos', description: 'Documentar el proceso principal.', priority: 'HIGH' as const, expectedImpact: 'Mayor consistencia operativa.', suggestedAction: 'Definir responsables y fechas.' }],
}
const persistedAIAnalysis = { id: 'cmaianalysis000000000000001', diagnosticId: diagnostic.id, ...aiResult, createdAt: new Date('2026-01-05'), updatedAt: new Date('2026-01-05') }

function makeDb(role: Role = 'SUPERUSER', ticketOwnerId = member.id, ticketAssigneeId: string | null = null, companyConsultantId: string | null = member.id) {
  const currentUser = role === 'SUPERUSER' ? admin : member
  const passwordHash = bcrypt.hashSync('Password123!', 4)
  let sessionActive = false
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string } }) => where.email ? { ...currentUser, passwordHash } : { id: member.id }),
      findMany: vi.fn(async () => [admin, member]),
      create: vi.fn(),
    },
    session: {
      create: vi.fn(async () => { sessionActive = true; return { id: 'session-1', expiresAt: new Date(Date.now() + 86400000) } }),
      findUnique: vi.fn(async () => sessionActive ? ({ id: 'session-1', expiresAt: new Date(Date.now() + 86400000), user: currentUser }) : null),
      delete: vi.fn(),
      deleteMany: vi.fn(async () => { sessionActive = false; return { count: 1 } }),
    },
    ticket: {
      create: vi.fn(async () => ticket),
      findUnique: vi.fn(async () => ({ ...ticket, createdById: ticketOwnerId, assignedToId: ticketAssigneeId })),
      findMany: vi.fn(async () => [ticket]),
      update: vi.fn(async () => ({ ...ticket, title: 'Propuesta actualizada' })),
      delete: vi.fn(),
      count: vi.fn(async () => 1),
    },
    company: {
      create: vi.fn(async () => ({ ...company, consultantId: companyConsultantId })),
      findUnique: vi.fn(async () => ({ ...company, consultantId: companyConsultantId })),
      findMany: vi.fn(async () => [{ ...company, consultantId: companyConsultantId }]),
      update: vi.fn(async () => ({ ...company, name: 'Acme Actualizada', consultantId: companyConsultantId })),
      delete: vi.fn(),
    },
    qualityDiagnostic: {
      create: vi.fn(async () => ({ ...diagnostic, company: { ...diagnostic.company, consultantId: companyConsultantId }, swotAnalysis: { ...diagnostic.swotAnalysis, items: [] } })),
      findUnique: vi.fn(async () => ({ ...diagnostic, company: { ...diagnostic.company, consultantId: companyConsultantId }, swotAnalysis: { ...diagnostic.swotAnalysis, items: [] } })),
      findMany: vi.fn(async () => [{ ...diagnostic, company: { ...diagnostic.company, consultantId: companyConsultantId }, swotAnalysis: { ...diagnostic.swotAnalysis, items: [] } }]),
      update: vi.fn(async () => ({ ...diagnostic, title: 'Diagnóstico actualizado', company: { ...diagnostic.company, consultantId: companyConsultantId }, swotAnalysis: { ...diagnostic.swotAnalysis, items: [] } })),
      delete: vi.fn(),
    },
    sWOTItem: {
      create: vi.fn(async () => ({ ...swotItem, swot: { diagnostic: { companyId: company.id, company: { consultantId: companyConsultantId } } } })),
      findUnique: vi.fn(async () => ({ ...swotItem, swot: { diagnostic: { companyId: company.id, company: { consultantId: companyConsultantId } } } })),
      update: vi.fn(async () => ({ ...swotItem, description: 'Factor actualizado', swot: { diagnostic: { companyId: company.id, company: { consultantId: companyConsultantId } } } })),
      delete: vi.fn(),
    },
    aIAnalysis: {
      upsert: vi.fn(async () => persistedAIAnalysis),
      findUnique: vi.fn(async () => persistedAIAnalysis),
    },
  }
  return db as unknown as PrismaClient
}

describe('validation schemas', () => {
  it('rejects short passwords and malformed tickets', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'short' }).success).toBe(false)
    expect(ticketCreateSchema.safeParse({ title: 'x', description: '' }).success).toBe(false)
    expect(ticketUpdateSchema.safeParse({}).success).toBe(false)
    expect(companyCreateSchema.safeParse({ name: 'A', identification: '', industry: 'x', description: '' }).success).toBe(false)
    expect(companyUpdateSchema.safeParse({}).success).toBe(false)
    expect(diagnosticCreateSchema.safeParse({ title: 'x', description: '' }).success).toBe(false)
    expect(diagnosticUpdateSchema.safeParse({}).success).toBe(false)
    expect(swotItemCreateSchema.safeParse({ type: 'UNKNOWN', description: '', priority: 'HIGH', impact: 'HIGH' }).success).toBe(false)
    expect(swotItemUpdateSchema.safeParse({}).success).toBe(false)
    expect(aiAnalysisSchema.safeParse(aiResult).success).toBe(true)
    expect(aiAnalysisSchema.safeParse({ ...aiResult, recommendations: [{ title: 'invalid' }] }).success).toBe(false)
  })
})

describe('authentication and authorization API', () => {
  it('logs in, persists the session cookie, and returns the current user', async () => {
    const agent = request.agent(createApp(makeDb()))
    const login = await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })
    expect(login.status).toBe(200)
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly')
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Lax')
    expect(login.headers['set-cookie'][0]).not.toContain('Secure')
    expect(login.body.user).toMatchObject({ id: admin.id, role: 'SUPERUSER' })

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe(admin.email)
  })

  it('does not reveal whether an account exists and blocks unauthorized roles', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    const invalid = await agent.post('/api/auth/login').send({ email: member.email, password: 'wrong-password' })
    expect(invalid.status).toBe(401)
    expect(invalid.body).toEqual({ error: 'Invalid email or password' })

    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const userCreate = await agent.post('/api/users').send({ name: 'New user', email: 'new@test.local', password: 'Password123!', role: 'USER' })
    expect(userCreate.status).toBe(403)
  })

  it('rejects protected resources without a session', async () => {
    const app = createApp(makeDb())
    const responses = await Promise.all([
      request(app).get('/api/auth/me'),
      request(app).get('/api/users'),
      request(app).get('/api/tickets'),
      request(app).get('/api/dashboard'),
      request(app).get('/api/companies'),
      request(app).get(`/api/companies/${company.id}/diagnostics`),
      request(app).get(`/api/diagnostics/${diagnostic.id}`),
      request(app).post(`/api/diagnostics/${diagnostic.id}/swot/items`),
      request(app).patch(`/api/swot/items/${swotItem.id}`),
      request(app).delete(`/api/swot/items/${swotItem.id}`),
      request(app).post(`/api/diagnostics/${diagnostic.id}/ai-analysis`),
      request(app).get(`/api/diagnostics/${diagnostic.id}/ai-analysis`),
    ])
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401])
  })

  it('invalidates the session and cookie on logout', async () => {
    const agent = request.agent(createApp(makeDb()))
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })
    expect((await agent.get('/api/auth/me')).status).toBe(200)

    const logout = await agent.post('/api/auth/logout')
    expect(logout.status).toBe(204)
    expect(logout.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970')
    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })
})

describe('tickets API', () => {
  it('creates and updates tickets for an authenticated user', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const created = await agent.post('/api/tickets').send({ title: ticket.title, description: ticket.description, priority: 'HIGH' })
    expect(created.status).toBe(201)
    expect(created.body.ticket.title).toBe(ticket.title)

    const updated = await agent.patch(`/api/tickets/${ticket.id}`).send({ status: 'IN_PROGRESS' })
    expect(updated.status).toBe(200)
  })

  it('only allows superusers to assign tickets', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const response = await agent.post('/api/tickets').send({ title: 'Assigned', description: 'Test assignment', assignedToId: admin.id })
    expect(response.status).toBe(403)
  })

  it('lets a superuser manage a ticket created by another user', async () => {
    const agent = request.agent(createApp(makeDb('SUPERUSER', member.id)))
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })
    expect((await agent.get(`/api/tickets/${ticket.id}`)).status).toBe(200)
    expect((await agent.patch(`/api/tickets/${ticket.id}`).send({ status: 'CLOSED' })).status).toBe(200)
    expect((await agent.delete(`/api/tickets/${ticket.id}`)).status).toBe(204)
  })

  it('denies a user access to another user ticket by manipulating its ID', async () => {
    const agent = request.agent(createApp(makeDb('USER', admin.id)))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    expect((await agent.get(`/api/tickets/${ticket.id}`)).status).toBe(404)
    expect((await agent.patch(`/api/tickets/${ticket.id}`).send({ title: 'Intrusión' })).status).toBe(404)
    expect((await agent.delete(`/api/tickets/${ticket.id}`)).status).toBe(404)
  })

  it('allows an assigned user to access and update an allowed ticket', async () => {
    const agent = request.agent(createApp(makeDb('USER', admin.id, member.id)))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    expect((await agent.get(`/api/tickets/${ticket.id}`)).status).toBe(200)
    expect((await agent.patch(`/api/tickets/${ticket.id}`).send({ status: 'IN_PROGRESS' })).status).toBe(200)
  })

  it('allows the creator to delete a ticket and protects inaccessible resources', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const deleted = await agent.delete(`/api/tickets/${ticket.id}`)
    expect(deleted.status).toBe(204)
  })

  it('returns the scoped ticket list and dashboard summary', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const list = await agent.get('/api/tickets?status=OPEN')
    expect(list.status).toBe(200)
    expect(list.body.tickets).toHaveLength(1)

    const dashboard = await agent.get('/api/dashboard')
    expect(dashboard.status).toBe(200)
    expect(dashboard.body.summary).toMatchObject({ total: 1, open: 1, inProgress: 1, closed: 1, priority: 1 })
    expect(dashboard.body.recentActivity).toHaveLength(1)
  })
})

describe('companies API', () => {
  it('supports the complete CRUD flow for a superuser', async () => {
    const agent = request.agent(createApp(makeDb()))
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })

    const created = await agent.post('/api/companies').send({ ...company, consultantId: member.id })
    expect(created.status).toBe(201)
    expect(created.body.company.name).toBe(company.name)
    expect((await agent.get('/api/companies')).status).toBe(200)
    expect((await agent.get(`/api/companies/${company.id}`)).status).toBe(200)
    const updated = await agent.patch(`/api/companies/${company.id}`).send({ name: 'Acme Actualizada' })
    expect(updated.status).toBe(200)
    expect(updated.body.company.name).toBe('Acme Actualizada')
    expect((await agent.delete(`/api/companies/${company.id}`)).status).toBe(204)
  })

  it('assigns companies created by a user to that authenticated user', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const created = await agent.post('/api/companies').send({ name: company.name, identification: company.identification, industry: company.industry, description: company.description })
    expect(created.status).toBe(201)
    expect(created.body.company.consultantId).toBe(member.id)
  })

  it('prevents users from assigning or accessing another user company', async () => {
    const agent = request.agent(createApp(makeDb('USER', member.id, null, admin.id)))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const assignedToOther = await agent.post('/api/companies').send({ name: company.name, identification: company.identification, industry: company.industry, description: company.description, consultantId: admin.id })
    expect(assignedToOther.status).toBe(403)
    expect((await agent.get(`/api/companies/${company.id}`)).status).toBe(404)
    expect((await agent.patch(`/api/companies/${company.id}`).send({ name: 'Intrusión' })).status).toBe(404)
    expect((await agent.delete(`/api/companies/${company.id}`)).status).toBe(404)
  })

  it('allows a user to manage an assigned company', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    expect((await agent.get(`/api/companies/${company.id}`)).status).toBe(200)
    expect((await agent.patch(`/api/companies/${company.id}`).send({ industry: 'Tecnología' })).status).toBe(200)
    expect((await agent.delete(`/api/companies/${company.id}`)).status).toBe(204)
  })
})

describe('diagnostics and SWOT API', () => {
  it('supports diagnostic CRUD for a superuser', async () => {
    const agent = request.agent(createApp(makeDb()))
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })

    const created = await agent.post(`/api/companies/${company.id}/diagnostics`).send({ title: diagnostic.title, description: diagnostic.description })
    expect(created.status).toBe(201)
    expect(created.body.diagnostic.swotAnalysis).toBeTruthy()
    expect((await agent.get(`/api/companies/${company.id}/diagnostics`)).status).toBe(200)
    expect((await agent.get(`/api/diagnostics/${diagnostic.id}`)).status).toBe(200)
    const updated = await agent.patch(`/api/diagnostics/${diagnostic.id}`).send({ status: 'COMPLETED' })
    expect(updated.status).toBe(200)
    expect((await agent.delete(`/api/diagnostics/${diagnostic.id}`)).status).toBe(204)
  })

  it('supports adding, editing and deleting SWOT items', async () => {
    const agent = request.agent(createApp(makeDb()))
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })

    const created = await agent.post(`/api/diagnostics/${diagnostic.id}/swot/items`).send({ type: 'STRENGTH', description: swotItem.description, priority: 'HIGH', impact: 'HIGH' })
    expect(created.status).toBe(201)
    expect(created.body.item.type).toBe('STRENGTH')
    const updated = await agent.patch(`/api/swot/items/${swotItem.id}`).send({ type: 'OPPORTUNITY', priority: 'MEDIUM' })
    expect(updated.status).toBe(200)
    expect((await agent.delete(`/api/swot/items/${swotItem.id}`)).status).toBe(204)
  })

  it('allows a user to manage diagnostics in an assigned company', async () => {
    const agent = request.agent(createApp(makeDb('USER')))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    const created = await agent.post(`/api/companies/${company.id}/diagnostics`).send({ title: diagnostic.title, description: diagnostic.description })
    expect(created.status).toBe(201)
    expect((await agent.patch(`/api/diagnostics/${diagnostic.id}`).send({ title: 'Actualizado' })).status).toBe(200)
    expect((await agent.post(`/api/diagnostics/${diagnostic.id}/swot/items`).send({ type: 'WEAKNESS', description: 'Proceso manual', priority: 'MEDIUM', impact: 'LOW' })).status).toBe(201)
  })

  it('blocks a user from another company using diagnostic and SWOT IDs', async () => {
    const agent = request.agent(createApp(makeDb('USER', member.id, null, admin.id)))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    expect((await agent.get(`/api/companies/${company.id}/diagnostics`)).status).toBe(404)
    expect((await agent.post(`/api/companies/${company.id}/diagnostics`).send({ title: diagnostic.title, description: diagnostic.description })).status).toBe(404)
    expect((await agent.get(`/api/diagnostics/${diagnostic.id}`)).status).toBe(404)
    expect((await agent.patch(`/api/diagnostics/${diagnostic.id}`).send({ title: 'Intrusión' })).status).toBe(404)
    expect((await agent.delete(`/api/diagnostics/${diagnostic.id}`)).status).toBe(404)
    expect((await agent.post(`/api/diagnostics/${diagnostic.id}/swot/items`).send({ type: 'THREAT', description: 'Intrusión', priority: 'LOW', impact: 'LOW' })).status).toBe(404)
    expect((await agent.patch(`/api/swot/items/${swotItem.id}`).send({ description: 'Intrusión' })).status).toBe(404)
    expect((await agent.delete(`/api/swot/items/${swotItem.id}`)).status).toBe(404)
  })
})

describe('AI analysis service and API', () => {
  it('validates a mocked OpenAI response before returning it', async () => {
    const client = { responses: { create: vi.fn(async () => ({ output_text: JSON.stringify(aiResult) })) } }
    const service = new AIService(client)
    const result = await service.analyze({ title: diagnostic.title, description: diagnostic.description, status: diagnostic.status, swotItems: [swotItem] })
    expect(result).toEqual(aiResult)
    expect(client.responses.create).toHaveBeenCalledOnce()
  })

  it('rejects an invalid mocked OpenAI response without producing a result', async () => {
    const client = { responses: { create: vi.fn(async () => ({ output_text: JSON.stringify({ executiveSummary: 'incompleto' }) })) } }
    const service = new AIService(client)
    await expect(service.analyze({ title: diagnostic.title, description: diagnostic.description, status: diagnostic.status, swotItems: [] })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('persists and retrieves an authorized AI analysis', async () => {
    const aiService = { analyze: vi.fn(async () => aiResult) } as unknown as AIService
    const agent = request.agent(createApp(makeDb('SUPERUSER'), aiService))
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })
    const created = await agent.post(`/api/diagnostics/${diagnostic.id}/ai-analysis`)
    expect(created.status).toBe(200)
    expect(created.body.analysis.executiveSummary).toBe(aiResult.executiveSummary)
    expect((await agent.get(`/api/diagnostics/${diagnostic.id}/ai-analysis`)).status).toBe(200)
    expect(aiService.analyze).toHaveBeenCalledOnce()
  })

  it('returns a controlled error for missing configuration and invalid service output', async () => {
    const unconfigured = request.agent(createApp(makeDb('SUPERUSER'), new AIService()))
    await unconfigured.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })
    const unavailable = await unconfigured.post(`/api/diagnostics/${diagnostic.id}/ai-analysis`)
    expect(unavailable.status).toBe(503)
    expect(unavailable.body).toEqual({ error: 'AI analysis is not configured' })

    const invalidService = { analyze: vi.fn(async () => { throw new AIServiceError('INVALID_RESPONSE') }) } as unknown as AIService
    const app = createApp(makeDb('SUPERUSER'), invalidService)
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })
    const invalid = await agent.post(`/api/diagnostics/${diagnostic.id}/ai-analysis`)
    expect(invalid.status).toBe(502)
    expect(invalid.body).toEqual({ error: 'AI returned an invalid analysis' })
  })

  it('blocks AI analysis access through a diagnostic ID from another company', async () => {
    const aiService = { analyze: vi.fn(async () => aiResult) } as unknown as AIService
    const agent = request.agent(createApp(makeDb('USER', member.id, null, admin.id), aiService))
    await agent.post('/api/auth/login').send({ email: member.email, password: 'Password123!' })
    expect((await agent.post(`/api/diagnostics/${diagnostic.id}/ai-analysis`)).status).toBe(404)
    expect((await agent.get(`/api/diagnostics/${diagnostic.id}/ai-analysis`)).status).toBe(404)
    expect(aiService.analyze).not.toHaveBeenCalled()
  })
})
