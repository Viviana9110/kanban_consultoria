import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Company, DashboardData, Ticket, TicketPriority, TicketStatus, User } from './types'
import './App.css'

type View = 'dashboard' | 'tickets' | 'companies'
type TicketDraft = { title: string; description: string; priority: TicketPriority; status: TicketStatus; assignedToId: string }
type CompanyDraft = { name: string; identification: string; industry: string; description: string; consultantId: string }

const statuses: Array<{ value: TicketStatus; label: string }> = [
  { value: 'OPEN', label: 'Abierto' },
  { value: 'IN_PROGRESS', label: 'En progreso' },
  { value: 'RESOLVED', label: 'Resuelto' },
  { value: 'CLOSED', label: 'Cerrado' },
]
const priorities: Array<{ value: TicketPriority; label: string }> = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'URGENT', label: 'Urgente' },
]
const statusLabel = Object.fromEntries(statuses.map((item) => [item.value, item.label])) as Record<TicketStatus, string>
const priorityLabel = Object.fromEntries(priorities.map((item) => [item.value, item.label])) as Record<TicketPriority, string>

const emptyDraft: TicketDraft = { title: '', description: '', priority: 'MEDIUM', status: 'OPEN', assignedToId: '' }
const emptyCompanyDraft: CompanyDraft = { name: '', identification: '', industry: '', description: '', consultantId: '' }

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false))
  }, [])

  if (checkingSession) return <div className="screen-center"><span className="loader" />Cargando espacio de trabajo...</div>
  if (!user) return <Login onLogin={setUser} />
  return <Workspace user={user} onLogout={() => setUser(null)} />
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      onLogin(result.user)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-art">
        <div className="brand-mark">K</div>
        <p className="eyebrow light">KANBAN CONSULTORIA</p>
        <h1>Ordena el trabajo.<br /><em>Hazlo avanzar.</em></h1>
        <p className="art-copy">El centro operativo para convertir cada solicitud en progreso medible.</p>
        <div className="art-line" />
        <span className="art-note">Soporte y mejora continua, en un solo lugar.</span>
      </section>
      <section className="login-card-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand"><span className="brand-mark small">K</span><strong>Kanban</strong></div>
          <p className="eyebrow">ESPACIO DE TRABAJO</p>
          <h2>Bienvenido de nuevo</h2>
          <p className="muted">Ingresa para continuar con tu operación.</p>
          <label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@empresa.com" autoComplete="email" required /></label>
          <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" minLength={8} required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button primary full" disabled={loading}>{loading ? <><span className="button-loader" /> Verificando...</> : 'Entrar al espacio'}</button>
          <p className="security-note"><span>✦</span> Sesión protegida y cifrada</p>
        </form>
      </section>
    </main>
  )
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<View>('dashboard')
  const [mobileMenu, setMobileMenu] = useState(false)

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    onLogout()
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-top"><div className="brand"><span className="brand-mark small">K</span><span>Kanban <b>Consultoria</b></span></div><button className="icon-button mobile-only" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú">×</button></div>
        <div className="workspace-chip"><span className="workspace-dot" /><div><small>ESPACIO ACTIVO</small><strong>Operaciones</strong></div><span className="chevron">⌄</span></div>
        <nav>
          <p className="nav-heading">MENÚ PRINCIPAL</p>
          <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => { setView('dashboard'); setMobileMenu(false) }}><span className="nav-icon">⌂</span> Resumen</button>
          <button className={`nav-item ${view === 'tickets' ? 'active' : ''}`} onClick={() => { setView('tickets'); setMobileMenu(false) }}><span className="nav-icon">▤</span> Tickets</button>
          <button className={`nav-item ${view === 'companies' ? 'active' : ''}`} onClick={() => { setView('companies'); setMobileMenu(false) }}><span className="nav-icon">▥</span> Empresas</button>
          <p className="nav-heading second">GESTIÓN</p>
          <button className="nav-item disabled" disabled><span className="nav-icon">◌</span> Reportes <span className="soon">Pronto</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><div><strong>¿Necesitas ayuda?</strong><small>Habla con soporte</small></div><span>›</span></div><div className="profile"><div className="avatar">{initials(user.name)}</div><div className="profile-text"><strong>{user.name}</strong><small>{user.role === 'SUPERUSER' ? 'Administrador' : 'Colaborador'}</small></div><button className="icon-button" onClick={logout} aria-label="Cerrar sesión">↗</button></div></div>
      </aside>
      {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú" />}
      <main className="main-content">
        <header className="topbar"><button className="icon-button mobile-only menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menú">☰</button><div className="breadcrumb"><span>Operaciones</span><b>/</b><strong>{view === 'dashboard' ? 'Resumen' : view === 'tickets' ? 'Tickets' : 'Empresas'}</strong></div><div className="topbar-actions"><span className="date-label">{new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date())}</span><button className="notification" aria-label="Notificaciones">♧<i /></button><div className="avatar top-avatar">{initials(user.name)}</div></div></header>
        {view === 'dashboard' ? <Dashboard user={user} onViewTickets={() => setView('tickets')} onViewCompanies={() => setView('companies')} /> : view === 'tickets' ? <Tickets user={user} /> : <Companies user={user} />}
      </main>
    </div>
  )
}

function Dashboard({ user, onViewTickets, onViewCompanies }: { user: User; onViewTickets: () => void; onViewCompanies: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<DashboardData>('/dashboard').then(setData).catch(() => setError('No pudimos cargar el resumen. Intenta de nuevo.')) }, [])
  if (error) return <PageError message={error} />
  if (!data) return <LoadingPage />
  const { summary } = data
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">VISTA GENERAL</p><h1>Buenos días, {firstName(user.name)} <span className="wave">✦</span></h1><p className="muted">Aquí tienes lo que está pasando en tu espacio de trabajo.</p></div><div className="page-actions"><button className="button secondary" onClick={onViewCompanies}>Empresas</button><button className="button primary" onClick={onViewTickets}>+ Nuevo ticket</button></div></div><section className="metric-grid"><Metric icon="◫" label="Tickets totales" value={summary.total} tone="blue" /><Metric icon="◷" label="Abiertos" value={summary.open} tone="amber" /><Metric icon="↗" label="En progreso" value={summary.inProgress} tone="purple" /><Metric icon="✓" label="Cerrados" value={summary.closed} tone="green" /><Metric icon="!" label="Prioritarios" value={summary.priority} tone="red" /></section><div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p className="muted">Últimos movimientos en tus tickets</p></div><button className="text-button" onClick={onViewTickets}>Ver todos <span>→</span></button></div>{data.recentActivity.length ? <div className="activity-list">{data.recentActivity.map((ticket) => <Activity key={ticket.id} ticket={ticket} />)}</div> : <EmptyState compact title="Aún no hay actividad" text="Los tickets recientes aparecerán aquí." />}</section><section className="panel snapshot-panel"><div className="panel-heading"><div><h2>Estado del trabajo</h2><p className="muted">Distribución actual</p></div></div><div className="donut-wrap"><div className="donut"><div><strong>{summary.total}</strong><small>tickets</small></div></div></div><div className="legend"><Legend color="blue" label="Abiertos" value={summary.open} /><Legend color="purple" label="En progreso" value={summary.inProgress} /><Legend color="green" label="Cerrados" value={summary.closed} /></div></section></div></div>
}

function Companies({ user }: { user: User }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [draft, setDraft] = useState<CompanyDraft>(emptyCompanyDraft)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const loadCompanies = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const result = await api<{ companies: Company[] }>(`/companies?${params}`)
      setCompanies(result.companies)
    } catch { setError('No pudimos cargar las empresas.') } finally { setLoading(false) }
  }, [search])
  useEffect(() => { const timer = window.setTimeout(() => { void loadCompanies() }, 0); return () => window.clearTimeout(timer) }, [loadCompanies])
  useEffect(() => { if (user.role === 'SUPERUSER') api<{ users: User[] }>('/users').then((result) => setUsers(result.users)).catch(() => undefined) }, [user.role])

  function startCreate() { setSelected(null); setDraft(emptyCompanyDraft); setShowForm(true) }
  function startEdit(companyToEdit: Company) { setSelected(companyToEdit); setDraft({ name: companyToEdit.name, identification: companyToEdit.identification, industry: companyToEdit.industry, description: companyToEdit.description, consultantId: companyToEdit.consultantId ?? '' }); setShowForm(true) }
  async function saveCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const basePayload = { name: draft.name, identification: draft.identification, industry: draft.industry, description: draft.description }
      const payload = user.role === 'SUPERUSER' ? { ...basePayload, consultantId: draft.consultantId || null } : basePayload
      const result = selected ? await api<{ company: Company }>(`/companies/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) }) : await api<{ company: Company }>('/companies', { method: 'POST', body: JSON.stringify(payload) })
      setShowForm(false); setSelected(result.company); await loadCompanies()
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo guardar la empresa.') } finally { setSaving(false) }
  }
  async function removeCompany(companyToRemove: Company) { if (!window.confirm('¿Eliminar esta empresa?')) return; try { await api(`/companies/${companyToRemove.id}`, { method: 'DELETE' }); setSelected(null); await loadCompanies() } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo eliminar la empresa.') } }

  return <div className="page companies-page"><div className="page-heading"><div><p className="eyebrow">GESTIÓN DE CLIENTES</p><h1>Empresas</h1><p className="muted">Consulta y organiza las empresas a tu cargo.</p></div><button className="button primary" onClick={startCreate}>+ Crear empresa</button></div>{error && <div className="form-error page-alert">{error}</div>}<section className="panel companies-panel"><div className="filters"><div className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, identificación o industria..." /></div></div>{loading ? <LoadingPage /> : companies.length === 0 ? <EmptyState title="No encontramos empresas" text="Crea una empresa o cambia los filtros de búsqueda." action={<button className="button secondary" onClick={startCreate}>Crear empresa</button>} /> : <div className="company-table-wrap"><table><thead><tr><th>Empresa</th><th>Identificación</th><th>Industria</th><th>Consultor</th><th>Actualizada</th><th /></tr></thead><tbody>{companies.map((companyToShow) => <tr key={companyToShow.id} className={selected?.id === companyToShow.id ? 'selected-row' : ''} onClick={() => setSelected(companyToShow)}><td><div className="ticket-title"><strong>{companyToShow.name}</strong><small>#{companyToShow.id.slice(-6).toUpperCase()}</small></div></td><td>{companyToShow.identification}</td><td><span className="industry-chip">{companyToShow.industry}</span></td><td>{companyToShow.consultant ? <div className="assignee"><span className="avatar tiny">{initials(companyToShow.consultant.name)}</span>{companyToShow.consultant.name}</div> : <span className="unassigned">Sin asignar</span>}</td><td className="date-cell">{relativeDate(companyToShow.updatedAt)}</td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); startEdit(companyToShow) }}>⋯</button></td></tr>)}</tbody></table></div>}</section>{selected && !showForm && <CompanyDetail company={selected} onEdit={() => startEdit(selected)} onDelete={() => removeCompany(selected)} onClose={() => setSelected(null)} />}{showForm && <CompanyForm draft={draft} setDraft={setDraft} users={users} isEdit={Boolean(selected)} saving={saving} canAssign={user.role === 'SUPERUSER'} onSubmit={saveCompany} onClose={() => setShowForm(false)} />}</div>
}

function CompanyForm({ draft, setDraft, users, isEdit, saving, canAssign, onSubmit, onClose }: { draft: CompanyDraft; setDraft: React.Dispatch<React.SetStateAction<CompanyDraft>>; users: User[]; isEdit: boolean; saving: boolean; canAssign: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) { return <div className="drawer-backdrop"><form className="drawer" onSubmit={onSubmit}><div className="drawer-heading"><div><p className="eyebrow">{isEdit ? 'EDITAR EMPRESA' : 'NUEVA EMPRESA'}</p><h2>{isEdit ? 'Actualizar empresa' : 'Crear empresa'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Nombre de la empresa<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Acme Consultores" minLength={2} required /></label><div className="form-grid"><label>Identificación<input value={draft.identification} onChange={(event) => setDraft({ ...draft, identification: event.target.value })} placeholder="NIT o identificación" minLength={3} required /></label><label>Industria<input value={draft.industry} onChange={(event) => setDraft({ ...draft, industry: event.target.value })} placeholder="Ej. Tecnología" minLength={2} required /></label></div><label>Descripción<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Añade contexto sobre la empresa..." rows={6} minLength={3} required /></label>{canAssign && <label>Consultor responsable<select value={draft.consultantId} onChange={(event) => setDraft({ ...draft, consultantId: event.target.value })}><option value="">Sin asignar</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<div className="drawer-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear empresa'}</button></div></form></div> }

function CompanyDetail({ company: companyToShow, onEdit, onDelete, onClose }: { company: Company; onEdit: () => void; onDelete: () => void; onClose: () => void }) { return <div className="drawer-backdrop"><aside className="drawer detail-drawer"><div className="drawer-heading"><div><p className="eyebrow">DETALLE DE EMPRESA</p><h2>{companyToShow.name}</h2><small>#{companyToShow.id.slice(-6).toUpperCase()}</small></div><button className="icon-button" onClick={onClose}>×</button></div><div className="company-detail-label"><span className="industry-chip">{companyToShow.industry}</span><strong>{companyToShow.identification}</strong></div><div className="detail-section"><p className="detail-label">Descripción</p><p className="detail-description">{companyToShow.description}</p></div><div className="detail-meta"><div><span>Consultor responsable</span><strong>{companyToShow.consultant?.name ?? 'Sin asignar'}</strong></div><div><span>Creada</span><strong>{relativeDate(companyToShow.createdAt)}</strong></div><div><span>Última actualización</span><strong>{relativeDate(companyToShow.updatedAt)}</strong></div></div><div className="drawer-actions"><button className="button secondary" onClick={onEdit}>Editar</button><button className="button danger" onClick={onDelete}>Eliminar</button></div></aside></div> }

function Tickets({ user }: { user: User }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const loadTickets = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      const result = await api<{ tickets: Ticket[] }>(`/tickets?${params}`)
      setTickets(result.tickets)
    } catch { setError('No pudimos cargar los tickets.') } finally { setLoading(false) }
  }, [search, statusFilter, priorityFilter])
  useEffect(() => { const timer = window.setTimeout(() => { void loadTickets() }, 0); return () => window.clearTimeout(timer) }, [loadTickets])
  useEffect(() => { api<{ users: User[] }>('/users').then((result) => setUsers(result.users)).catch(() => undefined) }, [])

  function startCreate() { setSelected(null); setDraft(emptyDraft); setShowForm(true) }
  function startEdit(ticket: Ticket) { setSelected(ticket); setDraft({ title: ticket.title, description: ticket.description, priority: ticket.priority, status: ticket.status, assignedToId: ticket.assignedTo?.id ?? '' }); setShowForm(true) }
  async function saveTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const payload = { ...draft, assignedToId: draft.assignedToId || null }
      const result = selected ? await api<{ ticket: Ticket }>(`/tickets/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) }) : await api<{ ticket: Ticket }>('/tickets', { method: 'POST', body: JSON.stringify(payload) })
      setShowForm(false); setSelected(result.ticket); await loadTickets()
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo guardar el ticket.') } finally { setSaving(false) }
  }
  async function removeTicket(ticket: Ticket) { if (!window.confirm('¿Eliminar este ticket?')) return; try { await api(`/tickets/${ticket.id}`, { method: 'DELETE' }); setSelected(null); await loadTickets() } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo eliminar el ticket.') } }

  return <div className="page tickets-page"><div className="page-heading"><div><p className="eyebrow">GESTIÓN OPERATIVA</p><h1>Tickets</h1><p className="muted">Gestiona solicitudes y mantén el trabajo en movimiento.</p></div><button className="button primary" onClick={startCreate}>+ Crear ticket</button></div>{error && <div className="form-error page-alert">{error}</div>}<section className="panel tickets-panel"><div className="filters"><div className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tickets..." /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos los estados</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">Todas las prioridades</option>{priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>{loading ? <LoadingPage /> : tickets.length === 0 ? <EmptyState title="No encontramos tickets" text="Crea el primer ticket o cambia los filtros de búsqueda." action={<button className="button secondary" onClick={startCreate}>Crear ticket</button>} /> : <div className="ticket-table-wrap"><table><thead><tr><th>Ticket</th><th>Estado</th><th>Prioridad</th><th>Responsable</th><th>Actualizado</th><th /></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id} className={selected?.id === ticket.id ? 'selected-row' : ''} onClick={() => setSelected(ticket)}><td><div className="ticket-title"><strong>{ticket.title}</strong><small>#{ticket.id.slice(-6).toUpperCase()}</small></div></td><td><Badge type="status" value={ticket.status} /></td><td><Badge type="priority" value={ticket.priority} /></td><td>{ticket.assignedTo ? <div className="assignee"><span className="avatar tiny">{initials(ticket.assignedTo.name)}</span>{ticket.assignedTo.name}</div> : <span className="unassigned">Sin asignar</span>}</td><td className="date-cell">{relativeDate(ticket.updatedAt)}</td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); startEdit(ticket) }}>⋯</button></td></tr>)}</tbody></table></div>}</section>{selected && !showForm && <TicketDetail ticket={selected} user={user} onEdit={() => startEdit(selected)} onDelete={() => removeTicket(selected)} onClose={() => setSelected(null)} />}{showForm && <TicketForm draft={draft} setDraft={setDraft} users={users} isEdit={Boolean(selected)} saving={saving} canAssign={user.role === 'SUPERUSER'} onSubmit={saveTicket} onClose={() => setShowForm(false)} />}</div>
}

function TicketForm({ draft, setDraft, users, isEdit, saving, canAssign, onSubmit, onClose }: { draft: TicketDraft; setDraft: React.Dispatch<React.SetStateAction<TicketDraft>>; users: User[]; isEdit: boolean; saving: boolean; canAssign: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) { return <div className="drawer-backdrop"><form className="drawer" onSubmit={onSubmit}><div className="drawer-heading"><div><p className="eyebrow">{isEdit ? 'EDITAR TICKET' : 'NUEVO TICKET'}</p><h2>{isEdit ? 'Actualizar solicitud' : 'Crear ticket'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Describe brevemente la solicitud" minLength={3} required /></label><label>Descripción<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Añade el contexto necesario..." rows={6} minLength={3} required /></label><div className="form-grid"><label>Prioridad<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TicketPriority })}>{priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Estado<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TicketStatus })}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>{canAssign && <label>Asignar a<select value={draft.assignedToId} onChange={(event) => setDraft({ ...draft, assignedToId: event.target.value })}><option value="">Sin asignar</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<div className="drawer-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear ticket'}</button></div></form></div> }

function TicketDetail({ ticket, user, onEdit, onDelete, onClose }: { ticket: Ticket; user: User; onEdit: () => void; onDelete: () => void; onClose: () => void }) { return <div className="drawer-backdrop"><aside className="drawer detail-drawer"><div className="drawer-heading"><div><p className="eyebrow">DETALLE DEL TICKET</p><h2>{ticket.title}</h2><small>#{ticket.id.slice(-6).toUpperCase()}</small></div><button className="icon-button" onClick={onClose}>×</button></div><div className="detail-badges"><Badge type="status" value={ticket.status} /><Badge type="priority" value={ticket.priority} /></div><div className="detail-section"><p className="detail-label">Descripción</p><p className="detail-description">{ticket.description}</p></div><div className="detail-meta"><div><span>Creado por</span><strong>{ticket.createdBy.name}</strong></div><div><span>Asignado a</span><strong>{ticket.assignedTo?.name ?? 'Sin asignar'}</strong></div><div><span>Última actualización</span><strong>{relativeDate(ticket.updatedAt)}</strong></div></div><div className="drawer-actions"><button className="button secondary" onClick={onEdit}>Editar</button>{(user.role === 'SUPERUSER' || ticket.createdBy.id === user.id) && <button className="button danger" onClick={onDelete}>Eliminar</button>}</div></aside></div> }

function Metric({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) { return <div className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div><span className={`metric-trend ${tone}`}>↗</span></div> }
function Activity({ ticket }: { ticket: Ticket }) { return <div className="activity-item"><div className={`activity-dot ${ticket.status.toLowerCase()}`} /> <div className="activity-content"><strong>{ticket.title}</strong><p>{ticket.status === 'CLOSED' ? 'Ticket cerrado' : `Ticket ${statusLabel[ticket.status].toLowerCase()}`} <span>·</span> {ticket.createdBy.name}</p></div><span className="activity-date">{relativeDate(ticket.updatedAt)}</span></div> }
function Badge({ type, value }: { type: 'status' | 'priority'; value: TicketStatus | TicketPriority }) { return <span className={`badge ${type} ${value.toLowerCase()}`}><i />{type === 'status' ? statusLabel[value as TicketStatus] : priorityLabel[value as TicketPriority]}</span> }
function Legend({ color, label, value }: { color: string; label: string; value: number }) { return <div className="legend-row"><span><i className={color} />{label}</span><strong>{value}</strong></div> }
function EmptyState({ title, text, action, compact = false }: { title: string; text: string; action?: React.ReactNode; compact?: boolean }) { return <div className={`empty-state ${compact ? 'compact' : ''}`}><div className="empty-icon">□</div><h3>{title}</h3><p>{text}</p>{action}</div> }
function LoadingPage() { return <div className="loading-state"><span className="loader" />Cargando...</div> }
function PageError({ message }: { message: string }) { return <div className="page"><div className="error-state"><div>!</div><h2>Algo salió mal</h2><p>{message}</p></div></div> }
function initials(name: string) { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() }
function firstName(name: string) { return name.split(' ')[0] }
function relativeDate(date: string) { const value = new Date(date); const days = Math.floor((Date.now() - value.getTime()) / 86400000); if (days === 0) return 'Hoy'; if (days === 1) return 'Ayer'; if (days < 7) return `Hace ${days} días`; return value.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) }

export default App
