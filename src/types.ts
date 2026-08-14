export type Role = 'SUPERUSER' | 'USER'
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export type User = { id: string; name: string; email: string; role: Role }

export type Company = {
  id: string
  name: string
  identification: string
  industry: string
  description: string
  consultantId: string | null
  consultant: User | null
  createdAt: string
  updatedAt: string
}

export type DiagnosticStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED'
export type SWOTType = 'STRENGTH' | 'WEAKNESS' | 'OPPORTUNITY' | 'THREAT'
export type Level = 'LOW' | 'MEDIUM' | 'HIGH'

export type SWOTItem = {
  id: string
  swotId: string
  type: SWOTType
  description: string
  priority: Level
  impact: Level
  createdAt: string
}

export type Diagnostic = {
  id: string
  companyId: string
  title: string
  description: string
  status: DiagnosticStatus
  createdById: string
  createdAt: string
  updatedAt: string
  company: Pick<Company, 'id' | 'name' | 'consultantId'>
  createdBy: User
  swotAnalysis: { id: string; diagnosticId: string; createdAt: string; updatedAt: string; items: SWOTItem[] } | null
}

export type Ticket = {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  updatedAt: string
  createdBy: User
  assignedTo: User | null
}

export type DashboardData = {
  summary: { total: number; open: number; inProgress: number; closed: number; priority: number }
  recentActivity: Ticket[]
}
