import OpenAI from 'openai'
import { env } from './env.js'
import { aiAnalysisSchema } from './validation.js'
import type { z } from 'zod'

export type AIAnalysisResult = z.infer<typeof aiAnalysisSchema>
export type DiagnosticForAI = {
  title: string
  description: string
  status: string
  swotItems: Array<{ type: string; description: string; priority: string; impact: string }>
}

type OpenAIClient = { responses: { create: (input: unknown) => Promise<{ output_text?: string }> } }

export class AIServiceError extends Error {
  code: 'NOT_CONFIGURED' | 'INVALID_RESPONSE' | 'PROVIDER_ERROR'

  constructor(code: AIServiceError['code']) {
    super(code)
    this.code = code
  }
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    executiveSummary: { type: 'string' },
    diagnosis: { type: 'string' },
    keyFindings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { finding: { type: 'string' }, basis: { type: 'string', enum: ['FACT', 'INFERENCE'] } }, required: ['finding', 'basis'] } },
    foStrategies: { type: 'array', items: { type: 'string' } },
    doStrategies: { type: 'array', items: { type: 'string' } },
    faStrategies: { type: 'array', items: { type: 'string' } },
    daStrategies: { type: 'array', items: { type: 'string' } },
    priorityRisks: { type: 'array', items: { type: 'string' } },
    priorityOpportunities: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, expectedImpact: { type: 'string' }, suggestedAction: { type: 'string' } }, required: ['title', 'description', 'priority', 'expectedImpact', 'suggestedAction'] } },
  },
  required: ['executiveSummary', 'diagnosis', 'keyFindings', 'foStrategies', 'doStrategies', 'faStrategies', 'daStrategies', 'priorityRisks', 'priorityOpportunities', 'recommendations'],
}

export class AIService {
  private readonly client: OpenAIClient | null

  constructor(client?: OpenAIClient) {
    this.client = client ?? (env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) as unknown as OpenAIClient : null)
  }

  async analyze(diagnostic: DiagnosticForAI): Promise<AIAnalysisResult> {
    if (!this.client) throw new AIServiceError('NOT_CONFIGURED')
    const prompt = [
      'Analiza exclusivamente el diagnóstico DOFA proporcionado a continuación.',
      'No inventes hechos, contexto, cifras ni información externa.',
      'En keyFindings marca cada elemento como FACT si está explícitamente en los datos o INFERENCE si es una inferencia razonable.',
      'Las estrategias y recomendaciones son propuestas, no hechos. Manténlas trazables a los factores recibidos.',
      'Devuelve únicamente JSON válido según el schema solicitado.',
      JSON.stringify(diagnostic),
    ].join('\n\n')
    try {
      const response = await this.client.responses.create({
        model: env.OPENAI_MODEL,
        input: prompt,
        text: { format: { type: 'json_schema', name: 'dofa_ai_analysis', strict: true, schema: responseSchema } },
      })
      if (!response.output_text) throw new AIServiceError('INVALID_RESPONSE')
      let candidate: unknown
      try { candidate = JSON.parse(response.output_text) } catch { throw new AIServiceError('INVALID_RESPONSE') }
      const parsed = aiAnalysisSchema.safeParse(candidate)
      if (!parsed.success) throw new AIServiceError('INVALID_RESPONSE')
      return parsed.data
    } catch (error) {
      if (error instanceof AIServiceError) throw error
      throw new AIServiceError('PROVIDER_ERROR')
    }
  }
}
