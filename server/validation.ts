import { z } from 'zod'

export const roleSchema = z.enum(['SUPERUSER', 'USER'])
export const statusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
export const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
})

export const ticketCreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(5000),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  assignedToId: z.string().cuid().nullable().optional(),
})

export const ticketUpdateSchema = ticketCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
)

export const ticketQuerySchema = z.object({
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  search: z.string().trim().max(120).optional(),
})

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: roleSchema.default('USER'),
})

export const companyCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  identification: z.string().trim().min(3).max(40),
  industry: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(5000),
  consultantId: z.string().cuid().nullable().optional(),
})

export const companyUpdateSchema = companyCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
)

export const companyQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
})

export const diagnosticStatusSchema = z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED'])
export const swotTypeSchema = z.enum(['STRENGTH', 'WEAKNESS', 'OPPORTUNITY', 'THREAT'])
export const priorityLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])
export const impactSchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])

export const diagnosticCreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(5000),
  status: diagnosticStatusSchema.optional(),
})

export const diagnosticUpdateSchema = diagnosticCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
)

export const swotItemCreateSchema = z.object({
  type: swotTypeSchema,
  description: z.string().trim().min(3).max(2000),
  priority: priorityLevelSchema,
  impact: impactSchema,
})

export const swotItemUpdateSchema = swotItemCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
)

export const aiFindingSchema = z.object({
  finding: z.string().trim().min(1).max(2000),
  basis: z.enum(['FACT', 'INFERENCE']),
})

export const aiRecommendationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(3000),
  priority: priorityLevelSchema,
  expectedImpact: z.string().trim().min(1).max(1000),
  suggestedAction: z.string().trim().min(1).max(2000),
})

export const aiAnalysisSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(5000),
  diagnosis: z.string().trim().min(1).max(5000),
  keyFindings: z.array(aiFindingSchema).max(30),
  foStrategies: z.array(z.string().trim().min(1).max(3000)).max(30),
  doStrategies: z.array(z.string().trim().min(1).max(3000)).max(30),
  faStrategies: z.array(z.string().trim().min(1).max(3000)).max(30),
  daStrategies: z.array(z.string().trim().min(1).max(3000)).max(30),
  priorityRisks: z.array(z.string().trim().min(1).max(2000)).max(30),
  priorityOpportunities: z.array(z.string().trim().min(1).max(2000)).max(30),
  recommendations: z.array(aiRecommendationSchema).max(30),
})
