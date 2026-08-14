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
