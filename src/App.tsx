import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { ActionItem, ActionItemStatus, ActionPlan, ActionPlanStatus, AIAnalysis, Company, DashboardData, Diagnostic, DiagnosticStatus, Level, Recommendation, RecommendationStatus, SWOTItem, SWOTType, Ticket, TicketPriority, TicketStatus, User } from './types'
import { Badge } from './components/ui/Badge'
import { KPICard } from './components/ui/KPICard'
import { EmptyState } from './components/ui/EmptyState'
import { LoadingState } from './components/ui/LoadingState'
import { DiagnosticStatusChart } from './components/charts/DiagnosticStatusChart'
import { ActionStatusChart } from './components/charts/ActionStatusChart'
import { RecommendationChart } from './components/charts/RecommendationChart'
import './App.css'

type View = 'dashboard' | 'tickets' | 'companies'
type CompaniesIntent = { kind: 'create-company' } | { kind: 'create-diagnostic' } | { kind: 'open-company'; companyId: string } | { kind: 'open-first-diagnostic' } | { kind: 'open-diagnostic'; companyId: string; diagnosticId: string }
type DetailIntent = { kind: 'create-diagnostic' } | { kind: 'open-first-diagnostic' } | { kind: 'open-diagnostic'; diagnosticId: string }
type TicketDraft = { title: string; description: string; priority: TicketPriority; status: TicketStatus; assignedToId: string }
type CompanyDraft = { name: string; identification: string; industry: string; description: string; consultantId: string }
type DiagnosticDraft = { title: string; description: string; status: DiagnosticStatus }
type SWOTDraft = { type: SWOTType; description: string; priority: Level; impact: Level }
type PlanDraft = { title: string; description: string; status: ActionPlanStatus }
type ItemDraft = { title: string; description: string; priority: Level; status: ActionItemStatus; recommendationId: string; responsibleId: string; dueDate: string }

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

const emptyDraft: TicketDraft = { title: '', description: '', priority: 'MEDIUM', status: 'OPEN', assignedToId: '' }
const emptyCompanyDraft: CompanyDraft = { name: '', identification: '', industry: '', description: '', consultantId: '' }
const emptyDiagnosticDraft: DiagnosticDraft = { title: '', description: '', status: 'DRAFT' }
const emptySWOTDraft: SWOTDraft = { type: 'STRENGTH', description: '', priority: 'MEDIUM', impact: 'MEDIUM' }
const emptyPlanDraft: PlanDraft = { title: '', description: '', status: 'DRAFT' }
const emptyItemDraft: ItemDraft = { title: '', description: '', priority: 'MEDIUM', status: 'PENDING', recommendationId: '', responsibleId: '', dueDate: '' }
const diagnosticStatuses: Array<{ value: DiagnosticStatus; label: string }> = [{ value: 'DRAFT', label: 'Borrador' }, { value: 'IN_PROGRESS', label: 'En progreso' }, { value: 'COMPLETED', label: 'Completado' }]
const swotTypes: Array<{ value: SWOTType; label: string; short: string }> = [{ value: 'STRENGTH', label: 'Fortaleza', short: 'FORTALEZAS' }, { value: 'WEAKNESS', label: 'Debilidad', short: 'DEBILIDADES' }, { value: 'OPPORTUNITY', label: 'Oportunidad', short: 'OPORTUNIDADES' }, { value: 'THREAT', label: 'Amenaza', short: 'AMENAZAS' }]
const levels: Array<{ value: Level; label: string }> = [{ value: 'LOW', label: 'Baja' }, { value: 'MEDIUM', label: 'Media' }, { value: 'HIGH', label: 'Alta' }]
const diagnosticStatusLabel = Object.fromEntries(diagnosticStatuses.map((item) => [item.value, item.label])) as Record<DiagnosticStatus, string>
const actionPlanStatuses: Array<{ value: ActionPlanStatus; label: string }> = [{ value: 'DRAFT', label: 'Borrador' }, { value: 'ACTIVE', label: 'Activo' }, { value: 'COMPLETED', label: 'Completado' }]
const actionItemStatuses: Array<{ value: ActionItemStatus; label: string }> = [{ value: 'PENDING', label: 'Pendiente' }, { value: 'IN_PROGRESS', label: 'En progreso' }, { value: 'COMPLETED', label: 'Completada' }, { value: 'CANCELLED', label: 'Cancelada' }]
const planStatusLabel = Object.fromEntries(actionPlanStatuses.map((item) => [item.value, item.label])) as Record<ActionPlanStatus, string>
const recommendationStatusLabel = { PENDING: 'Pendiente', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada' } as const

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('app:unauthorized', onUnauthorized)
    return () => window.removeEventListener('app:unauthorized', onUnauthorized)
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
  const [companiesIntent, setCompaniesIntent] = useState<CompaniesIntent | null>(null)
  const consumeCompaniesIntent = useCallback(() => setCompaniesIntent(null), [])

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
        <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><div><strong>¿Necesitas ayuda?</strong><small>Habla con soporte</small></div></div><div className="profile"><div className="avatar">{initials(user.name)}</div><div className="profile-text"><strong>{user.name}</strong><small>{user.role === 'SUPERUSER' ? 'Administrador' : 'Colaborador'}</small></div><button className="icon-button" onClick={logout} aria-label="Cerrar sesión">↗</button></div></div>
      </aside>
      {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú" />}
      <main className="main-content">
        <header className="topbar"><button className="icon-button mobile-only menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menú">☰</button><div className="breadcrumb"><span>Operaciones</span><b>/</b><strong>{view === 'dashboard' ? 'Resumen' : view === 'tickets' ? 'Tickets' : 'Empresas'}</strong></div><div className="topbar-actions"><span className="date-label">{new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date())}</span><span className="notification" title="Notificaciones próximamente">♧<i /></span><div className="avatar top-avatar">{initials(user.name)}</div></div></header>
        {view === 'dashboard' ? <Dashboard user={user} onViewTickets={() => setView('tickets')} onNavigate={(intent) => { setCompaniesIntent(intent); setView('companies') }} /> : view === 'tickets' ? <Tickets user={user} /> : <Companies user={user} intent={companiesIntent} onConsumeIntent={consumeCompaniesIntent} />}
      </main>
    </div>
  )
}

function Dashboard({ user, onViewTickets, onNavigate }: { user: User; onViewTickets: () => void; onNavigate: (intent: CompaniesIntent) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<DashboardData>('/dashboard').then(setData).catch(() => setError('No pudimos cargar el resumen. Intenta de nuevo.')) }, [])
  if (error) return <PageError message={error} />
  if (!data) return <LoadingState />
  const { summary } = data
  const greeting = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches'
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">VISTA GENERAL</p><h1>{greeting}, {firstName(user.name)} <span className="wave">✦</span></h1><p className="muted">Métricas de calidad y seguimiento de tu gestión.</p></div><div className="page-actions"><button className="button secondary" onClick={onViewTickets}>Tickets</button></div></div><section className="quick-access"><QuickAccess icon="+" label="Nueva empresa" hint="Registrar cliente" onClick={() => onNavigate({ kind: 'create-company' })} /><QuickAccess icon="◈" label="Nuevo diagnóstico" hint="Iniciar evaluación" onClick={() => onNavigate({ kind: 'create-diagnostic' })} /><QuickAccess icon="◆" label="Ver recomendaciones" hint="Atender pendientes" onClick={() => onNavigate({ kind: 'open-first-diagnostic' })} /><QuickAccess icon="▤" label="Ver planes de acción" hint="Revisar ejecución" onClick={() => onNavigate({ kind: 'open-first-diagnostic' })} /></section><section className="metric-grid"><KPICard icon="▥" label="Empresas" value={summary.totalCompanies} tone="blue" /><KPICard icon="◫" label="Diagnósticos" value={summary.totalDiagnostics} tone="purple" /><KPICard icon="◷" label="En progreso" value={summary.inProgressDiagnostics} tone="amber" /><KPICard icon="✓" label="Completados" value={summary.completedDiagnostics} tone="green" /><KPICard icon="◆" label="Recomendaciones" value={summary.pendingRecommendations} tone="red" /></section><section className="metric-grid secondary"><KPICard icon="▤" label="Planes activos" value={summary.activeActionPlans} tone="blue" /><KPICard icon="↗" label="Acciones en curso" value={summary.pendingActionItems} tone="purple" /><KPICard icon="!" label="Acciones vencidas" value={summary.overdueActionItems} tone="red" /></section><div className="chart-grid"><DiagnosticStatusChart draft={summary.draftDiagnostics} inProgress={summary.inProgressDiagnostics} completed={summary.completedDiagnostics} /><ActionStatusChart pending={summary.pendingActionItems} overdue={summary.overdueActionItems} /><RecommendationChart recommendations={data.priorityRecommendations} /></div><div className="dashboard-grid quality-grid"><section className="panel"><div className="panel-heading"><div><h2>Diagnósticos recientes</h2><p className="muted">Última actualización</p></div></div>{data.recentDiagnostics.length ? <div className="quality-list">{data.recentDiagnostics.map((item) => <QualityRow key={item.id} title={item.title} subtitle={item.company.name} meta={diagnosticStatusLabel[item.status]} tone={item.status === 'COMPLETED' ? 'green' : item.status === 'IN_PROGRESS' ? 'amber' : 'blue'} onClick={() => onNavigate({ kind: 'open-diagnostic', companyId: item.company.id, diagnosticId: item.id })} />)}</div> : <EmptyState compact title="Sin diagnósticos" text="Crea un diagnóstico para comenzar." />}</section><section className="panel"><div className="panel-heading"><div><h2>Recomendaciones pendientes</h2><p className="muted">Por atender</p></div></div>{data.priorityRecommendations.length ? <div className="quality-list">{data.priorityRecommendations.map((item) => <QualityRow key={item.id} title={item.title} subtitle={item.diagnostic.title} meta={item.diagnostic.company.name} tone={item.priority === 'HIGH' ? 'red' : item.priority === 'MEDIUM' ? 'amber' : 'blue'} onClick={() => onNavigate({ kind: 'open-company', companyId: item.diagnostic.company.id })} />)}</div> : <EmptyState compact title="Sin recomendaciones" text="Importa recomendaciones desde un análisis IA." />}</section><section className="panel"><div className="panel-heading"><div><h2>Próximas acciones</h2><p className="muted">Por fecha límite</p></div></div>{data.upcomingActions.length ? <div className="quality-list">{data.upcomingActions.map((item) => <QualityRow key={item.id} title={item.title} subtitle={item.actionPlan.diagnostic.company.name} meta={item.dueDate ? `Vence ${relativeDate(item.dueDate)}` : 'Sin fecha'} tone={item.status === 'IN_PROGRESS' ? 'amber' : 'blue'} onClick={() => onNavigate({ kind: 'open-company', companyId: item.actionPlan.diagnostic.company.id })} />)}</div> : <EmptyState compact title="Sin acciones próximas" text="Las acciones con fecha límite aparecerán aquí." />}</section><section className="panel"><div className="panel-heading"><div><h2>Empresas recientes</h2><p className="muted">Última actualización</p></div></div>{data.recentCompanies.length ? <div className="quality-list">{data.recentCompanies.map((item) => <QualityRow key={item.id} title={item.name} subtitle={item.industry} meta={item.consultant?.name ?? 'Sin asignar'} tone="blue" onClick={() => onNavigate({ kind: 'open-company', companyId: item.id })} />)}</div> : <EmptyState compact title="Sin empresas" text="Registra la primera empresa." />}</section></div></div>
}

function QuickAccess({ icon, label, hint, onClick }: { icon: string; label: string; hint: string; onClick: () => void }) { return <button className="quick-access-card" onClick={onClick}><span className="quick-access-icon">{icon}</span><div><strong>{label}</strong><small>{hint}</small></div><span className="quick-access-arrow">→</span></button> }

function QualityRow({ title, subtitle, meta, tone, onClick }: { title: string; subtitle: string; meta: string; tone: string; onClick: () => void }) { return <button className="quality-row" onClick={onClick}><span className={`quality-dot ${tone}`} /><div><strong>{title}</strong><small>{subtitle}</small></div><span className="quality-meta">{meta}</span></button> }

function Companies({ user, intent, onConsumeIntent }: { user: User; intent: CompaniesIntent | null; onConsumeIntent: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [draft, setDraft] = useState<CompanyDraft>(emptyCompanyDraft)
  const [detailIntent, setDetailIntent] = useState<DetailIntent | null>(null)
  const consumeDetailIntent = useCallback(() => setDetailIntent(null), [])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const loadCompanies = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      const result = await api<{ companies: Company[] }>(`/companies?${params}`)
      setCompanies(result.companies)
    } catch { setError('No pudimos cargar las empresas.') } finally { setLoading(false) }
  }, [debouncedSearch])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 350); return () => window.clearTimeout(timer) }, [search])
  useEffect(() => { const timer = window.setTimeout(() => { void loadCompanies() }, 0); return () => window.clearTimeout(timer) }, [loadCompanies])
  useEffect(() => { if (user.role === 'SUPERUSER') api<{ users: User[] }>('/users').then((result) => setUsers(result.users)).catch(() => undefined) }, [user.role])

  const applyIntent = useCallback((available: Company[], pending: CompaniesIntent | null) => {
    if (!pending) return
    setDetailIntent(null)
    if (pending.kind === 'create-company') { setSelected(null); setDraft(emptyCompanyDraft); setShowForm(true); onConsumeIntent(); return }
    const target = pending.kind === 'open-company' || pending.kind === 'open-diagnostic' ? available.find((item) => item.id === pending.companyId) : available[0]
    if (!target) { onConsumeIntent(); return }
    setSelected(target); setShowForm(false)
    if (pending.kind === 'create-diagnostic') setDetailIntent({ kind: 'create-diagnostic' })
    if (pending.kind === 'open-first-diagnostic') setDetailIntent({ kind: 'open-first-diagnostic' })
    if (pending.kind === 'open-diagnostic') setDetailIntent({ kind: 'open-diagnostic', diagnosticId: pending.diagnosticId })
    onConsumeIntent()
  }, [onConsumeIntent])
  useEffect(() => { if (!intent || companies.length === 0 || loading) return; const timer = window.setTimeout(() => { applyIntent(companies, intent) }, 0); return () => window.clearTimeout(timer) }, [intent, companies, loading, applyIntent])

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

  return <div className="page companies-page"><div className="page-heading"><div><p className="eyebrow">GESTIÓN DE CLIENTES</p><h1>Empresas</h1><p className="muted">Consulta y organiza las empresas a tu cargo.</p></div><button className="button primary" onClick={startCreate}>+ Crear empresa</button></div>{error && <div className="form-error page-alert">{error}</div>}<section className="panel companies-panel"><div className="filters"><div className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, identificación o industria..." /></div></div>{loading ? <LoadingState /> : companies.length === 0 ? <EmptyState title={search ? 'Sin resultados' : 'No encontramos empresas'} text={search ? 'Ninguna empresa coincide con tu búsqueda.' : 'Crea la primera empresa para comenzar.'} action={<button className="button secondary" onClick={startCreate}>Crear empresa</button>} /> : <div className="company-table-wrap"><table><thead><tr><th>Empresa</th><th>Identificación</th><th>Industria</th><th>Consultor</th><th>Actualizada</th><th /></tr></thead><tbody>{companies.map((companyToShow) => <tr key={companyToShow.id} className={selected?.id === companyToShow.id ? 'selected-row' : ''} onClick={() => setSelected(companyToShow)}><td><div className="ticket-title"><strong>{companyToShow.name}</strong><small>#{companyToShow.id.slice(-6).toUpperCase()}</small></div></td><td>{companyToShow.identification}</td><td><span className="industry-chip">{companyToShow.industry}</span></td><td>{companyToShow.consultant ? <div className="assignee"><span className="avatar tiny">{initials(companyToShow.consultant.name)}</span>{companyToShow.consultant.name}</div> : <span className="unassigned">Sin asignar</span>}</td><td className="date-cell">{relativeDate(companyToShow.updatedAt)}</td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); startEdit(companyToShow) }}>⋯</button></td></tr>)}</tbody></table></div>}</section>{selected && !showForm && <CompanyDetail company={selected} onEdit={() => startEdit(selected)} onDelete={() => removeCompany(selected)} onClose={() => setSelected(null)} detailIntent={detailIntent} onConsumeDetailIntent={consumeDetailIntent} />}{showForm && <CompanyForm draft={draft} setDraft={setDraft} users={users} isEdit={Boolean(selected)} saving={saving} canAssign={user.role === 'SUPERUSER'} onSubmit={saveCompany} onClose={() => setShowForm(false)} />}</div>
}

function CompanyForm({ draft, setDraft, users, isEdit, saving, canAssign, onSubmit, onClose }: { draft: CompanyDraft; setDraft: React.Dispatch<React.SetStateAction<CompanyDraft>>; users: User[]; isEdit: boolean; saving: boolean; canAssign: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) { return <div className="drawer-backdrop"><form className="drawer" onSubmit={onSubmit}><div className="drawer-heading"><div><p className="eyebrow">{isEdit ? 'EDITAR EMPRESA' : 'NUEVA EMPRESA'}</p><h2>{isEdit ? 'Actualizar empresa' : 'Crear empresa'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Nombre de la empresa<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Acme Consultores" minLength={2} required /></label><div className="form-grid"><label>Identificación<input value={draft.identification} onChange={(event) => setDraft({ ...draft, identification: event.target.value })} placeholder="NIT o identificación" minLength={3} required /></label><label>Industria<input value={draft.industry} onChange={(event) => setDraft({ ...draft, industry: event.target.value })} placeholder="Ej. Tecnología" minLength={2} required /></label></div><label>Descripción<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Añade contexto sobre la empresa..." rows={6} minLength={3} required /></label>{canAssign && <label>Consultor responsable<select value={draft.consultantId} onChange={(event) => setDraft({ ...draft, consultantId: event.target.value })}><option value="">Sin asignar</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<div className="drawer-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear empresa'}</button></div></form></div> }

function CompanyDetail({ company: companyToShow, onEdit, onDelete, onClose, detailIntent, onConsumeDetailIntent }: { company: Company; onEdit: () => void; onDelete: () => void; onClose: () => void; detailIntent: DetailIntent | null; onConsumeDetailIntent: () => void }) {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<Diagnostic | null>(null)
  const [diagnosticDraft, setDiagnosticDraft] = useState<DiagnosticDraft>(emptyDiagnosticDraft)
  const [showDiagnosticForm, setShowDiagnosticForm] = useState(false)
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(true)
  const [diagnosticError, setDiagnosticError] = useState('')
  const [savingDiagnostic, setSavingDiagnostic] = useState(false)

  const loadDiagnostics = useCallback(async () => {
    setLoadingDiagnostics(true); setDiagnosticError('')
    try {
      const result = await api<{ diagnostics: Diagnostic[] }>(`/companies/${companyToShow.id}/diagnostics`)
      setDiagnostics(result.diagnostics)
    } catch { setDiagnosticError('No pudimos cargar los diagnósticos.') } finally { setLoadingDiagnostics(false) }
  }, [companyToShow.id])
  useEffect(() => { const timer = window.setTimeout(() => { void loadDiagnostics() }, 0); return () => window.clearTimeout(timer) }, [loadDiagnostics])
  useEffect(() => { if (!detailIntent) return; const timer = window.setTimeout(() => { if (detailIntent.kind === 'create-diagnostic') { setSelectedDiagnostic(null); setDiagnosticDraft(emptyDiagnosticDraft); setShowDiagnosticForm(true); onConsumeDetailIntent(); return } if ((detailIntent.kind === 'open-first-diagnostic' || detailIntent.kind === 'open-diagnostic') && !loadingDiagnostics && diagnostics.length > 0) { const target = detailIntent.kind === 'open-diagnostic' ? diagnostics.find((item) => item.id === detailIntent.diagnosticId) : diagnostics[0]; if (target) setSelectedDiagnostic(target); onConsumeDetailIntent() } }, 0); return () => window.clearTimeout(timer) }, [detailIntent, diagnostics, loadingDiagnostics, onConsumeDetailIntent])

  function startDiagnosticCreate() { setSelectedDiagnostic(null); setDiagnosticDraft(emptyDiagnosticDraft); setShowDiagnosticForm(true) }
  function startDiagnosticEdit(diagnosticToEdit: Diagnostic) { setDiagnosticDraft({ title: diagnosticToEdit.title, description: diagnosticToEdit.description, status: diagnosticToEdit.status }); setShowDiagnosticForm(true) }
  async function saveDiagnostic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingDiagnostic(true); setDiagnosticError('')
    try {
      const result = selectedDiagnostic ? await api<{ diagnostic: Diagnostic }>(`/diagnostics/${selectedDiagnostic.id}`, { method: 'PATCH', body: JSON.stringify(diagnosticDraft) }) : await api<{ diagnostic: Diagnostic }>(`/companies/${companyToShow.id}/diagnostics`, { method: 'POST', body: JSON.stringify(diagnosticDraft) })
      setDiagnostics((current) => selectedDiagnostic ? current.map((item) => item.id === result.diagnostic.id ? result.diagnostic : item) : [result.diagnostic, ...current])
      setSelectedDiagnostic(result.diagnostic); setShowDiagnosticForm(false)
    } catch (requestError) { setDiagnosticError(requestError instanceof ApiError ? requestError.message : 'No se pudo guardar el diagnóstico.') } finally { setSavingDiagnostic(false) }
  }
  async function removeDiagnostic() { if (!selectedDiagnostic || !window.confirm('¿Eliminar este diagnóstico y su matriz DOFA?')) return; try { await api(`/diagnostics/${selectedDiagnostic.id}`, { method: 'DELETE' }); setSelectedDiagnostic(null); await loadDiagnostics() } catch { setDiagnosticError('No se pudo eliminar el diagnóstico.') } }

  return <><div className="drawer-backdrop"><aside className="drawer detail-drawer">{selectedDiagnostic ? <DiagnosticDetail diagnostic={selectedDiagnostic} onBack={() => setSelectedDiagnostic(null)} onEdit={() => startDiagnosticEdit(selectedDiagnostic)} onDelete={removeDiagnostic} /> : <><div className="drawer-heading"><div><p className="eyebrow">DETALLE DE EMPRESA</p><h2>{companyToShow.name}</h2><small>#{companyToShow.id.slice(-6).toUpperCase()}</small></div><button className="icon-button" onClick={onClose}>×</button></div><div className="company-detail-label"><span className="industry-chip">{companyToShow.industry}</span><strong>{companyToShow.identification}</strong></div><div className="detail-section"><p className="detail-label">Descripción</p><p className="detail-description">{companyToShow.description}</p></div><div className="detail-meta"><div><span>Consultor responsable</span><strong>{companyToShow.consultant?.name ?? 'Sin asignar'}</strong></div><div><span>Creada</span><strong>{relativeDate(companyToShow.createdAt)}</strong></div><div><span>Última actualización</span><strong>{relativeDate(companyToShow.updatedAt)}</strong></div></div><div className="drawer-actions"><button className="button secondary" onClick={onEdit}>Editar</button><button className="button danger" onClick={onDelete}>Eliminar</button></div><div className="diagnostics-section"><div className="section-heading"><div><p className="detail-label">Evaluación</p><h3>Diagnósticos</h3></div><button className="button primary small-button" onClick={startDiagnosticCreate}>+ Nuevo</button></div>{diagnosticError && <div className="form-error">{diagnosticError}</div>}{loadingDiagnostics ? <div className="inline-loading"><span className="loader" />Cargando diagnósticos...</div> : diagnostics.length === 0 ? <EmptyState compact title="Sin diagnósticos" text="Crea el primer diagnóstico de esta empresa." action={<button className="button secondary" onClick={startDiagnosticCreate}>Crear diagnóstico</button>} /> : <div className="diagnostic-list">{diagnostics.map((item) => <button className="diagnostic-row" key={item.id} onClick={() => setSelectedDiagnostic(item)}><span className="diagnostic-icon">◈</span><span className="diagnostic-row-content"><strong>{item.title}</strong><small>{diagnosticStatusLabel[item.status]} · {relativeDate(item.updatedAt)}</small></span><span>›</span></button>)}</div>}</div></>}</aside></div>{showDiagnosticForm && <DiagnosticForm draft={diagnosticDraft} setDraft={setDiagnosticDraft} isEdit={Boolean(selectedDiagnostic)} saving={savingDiagnostic} onSubmit={saveDiagnostic} onClose={() => setShowDiagnosticForm(false)} />}</>
}

function DiagnosticForm({ draft, setDraft, isEdit, saving, onSubmit, onClose }: { draft: DiagnosticDraft; setDraft: React.Dispatch<React.SetStateAction<DiagnosticDraft>>; isEdit: boolean; saving: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) { return <div className="drawer-backdrop nested-drawer"><form className="drawer" onSubmit={onSubmit}><div className="drawer-heading"><div><p className="eyebrow">{isEdit ? 'EDITAR DIAGNÓSTICO' : 'NUEVO DIAGNÓSTICO'}</p><h2>{isEdit ? 'Actualizar diagnóstico' : 'Crear diagnóstico'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ej. Diagnóstico operativo 2026" minLength={3} required /></label><label>Descripción<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Describe el alcance de la evaluación..." rows={7} minLength={3} required /></label><label>Estado<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as DiagnosticStatus })}>{diagnosticStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div className="drawer-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear diagnóstico'}</button></div></form></div> }

function DiagnosticDetailBase({ diagnostic, onBack, onEdit, onDelete }: { diagnostic: Diagnostic; onBack: () => void; onEdit: () => void; onDelete: () => void }) {
  const [items, setItems] = useState<SWOTItem[]>(diagnostic.swotAnalysis?.items ?? [])
  const [itemDraft, setItemDraft] = useState<SWOTDraft>(emptySWOTDraft)
  const [editingItem, setEditingItem] = useState<SWOTItem | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const [itemError, setItemError] = useState('')
  function startItemCreate(type: SWOTType) { setEditingItem(null); setItemDraft({ ...emptySWOTDraft, type }); setShowItemForm(true); setItemError('') }
  function startItemEdit(item: SWOTItem) { setEditingItem(item); setItemDraft({ type: item.type, description: item.description, priority: item.priority, impact: item.impact }); setShowItemForm(true); setItemError('') }
  async function saveItem(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSavingItem(true); setItemError(''); try { const result = editingItem ? await api<{ item: SWOTItem }>(`/swot/items/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(itemDraft) }) : await api<{ item: SWOTItem }>(`/diagnostics/${diagnostic.id}/swot/items`, { method: 'POST', body: JSON.stringify(itemDraft) }); setItems((current) => editingItem ? current.map((item) => item.id === result.item.id ? result.item : item) : [...current, result.item]); setEditingItem(null); setShowItemForm(false); setItemDraft(emptySWOTDraft) } catch (requestError) { setItemError(requestError instanceof ApiError ? requestError.message : 'No se pudo guardar el factor.') } finally { setSavingItem(false) } }
  async function removeItem(item: SWOTItem) { if (!window.confirm('¿Eliminar este factor?')) return; try { await api(`/swot/items/${item.id}`, { method: 'DELETE' }); setItems((current) => current.filter((currentItem) => currentItem.id !== item.id)) } catch { setItemError('No se pudo eliminar el factor.') } }
  return <><div className="drawer-heading diagnostic-drawer-heading"><div><button className="text-button back-button" onClick={onBack}>← Empresa</button><p className="eyebrow">DIAGNÓSTICO</p><h2>{diagnostic.title}</h2><small>Actualizado {relativeDate(diagnostic.updatedAt)}</small></div><button className="icon-button" onClick={onBack}>×</button></div><div className="diagnostic-toolbar"><span className={`diagnostic-status ${diagnostic.status.toLowerCase()}`}>{diagnosticStatusLabel[diagnostic.status]}</span><div><button className="button secondary small-button" onClick={onEdit}>Editar</button><button className="button danger small-button" onClick={onDelete}>Eliminar</button></div></div><p className="detail-description diagnostic-description">{diagnostic.description}</p><div className="swot-heading"><div><p className="detail-label">ANÁLISIS ESTRATÉGICO</p><h3>Matriz DOFA</h3></div><span className="muted">{items.length} factores</span></div>{itemError && <div className="form-error">{itemError}</div>}<div className="swot-grid">{swotTypes.map((type) => <section className={`swot-quadrant ${type.value.toLowerCase()}`} key={type.value}><div className="swot-quadrant-heading"><div><span className="swot-symbol">{type.value === 'STRENGTH' ? '+' : type.value === 'WEAKNESS' ? '−' : type.value === 'OPPORTUNITY' ? '↗' : '!'}</span><h3>{type.short}</h3></div><button className="icon-button add-factor" onClick={() => startItemCreate(type.value)} aria-label={`Agregar ${type.label}`}>+</button></div><div className="swot-items">{items.filter((item) => item.type === type.value).map((item) => <div className="swot-item" key={item.id}><p>{item.description}</p><div><span className={`level-pill ${item.priority.toLowerCase()}`}>P. {item.priority === 'HIGH' ? 'Alta' : item.priority === 'MEDIUM' ? 'Media' : 'Baja'}</span><span className={`level-pill impact-${item.impact.toLowerCase()}`}>I. {item.impact === 'HIGH' ? 'Alta' : item.impact === 'MEDIUM' ? 'Media' : 'Baja'}</span><button className="swot-edit" onClick={() => startItemEdit(item)}>Editar</button><button className="swot-edit delete-link" onClick={() => void removeItem(item)}>Eliminar</button></div></div>)}</div>{items.filter((item) => item.type === type.value).length === 0 && <p className="swot-empty">Sin factores todavía</p>}</section>)}</div>{showItemForm && <SWOTItemForm draft={itemDraft} setDraft={setItemDraft} isEdit={Boolean(editingItem)} saving={savingItem} onSubmit={saveItem} onClose={() => { setEditingItem(null); setShowItemForm(false); setItemDraft(emptySWOTDraft) }} />}</>
}

function SWOTItemForm({ draft, setDraft, isEdit, saving, onSubmit, onClose }: { draft: SWOTDraft; setDraft: React.Dispatch<React.SetStateAction<SWOTDraft>>; isEdit: boolean; saving: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) { return <form className="factor-form" onSubmit={onSubmit}><div className="factor-form-heading"><h3>{isEdit ? 'Editar factor' : 'Agregar factor'}</h3><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as SWOTType })}>{swotTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Descripción<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Describe el factor..." rows={3} minLength={3} required /></label><div className="form-grid"><label>Prioridad<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Level })}>{levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Impacto<select value={draft.impact} onChange={(event) => setDraft({ ...draft, impact: event.target.value as Level })}>{levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div className="drawer-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar factor' : 'Agregar factor'}</button></div></form> }

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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const loadTickets = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter) params.set('status', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      const result = await api<{ tickets: Ticket[] }>(`/tickets?${params}`)
      setTickets(result.tickets)
    } catch { setError('No pudimos cargar los tickets.') } finally { setLoading(false) }
  }, [debouncedSearch, statusFilter, priorityFilter])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 350); return () => window.clearTimeout(timer) }, [search])
  useEffect(() => { const timer = window.setTimeout(() => { void loadTickets() }, 0); return () => window.clearTimeout(timer) }, [loadTickets])
  useEffect(() => { api<{ users: User[] }>('/users').then((result) => setUsers(result.users)).catch(() => undefined) }, [])

  function startCreate() { setSelected(null); setDraft(emptyDraft); setShowForm(true) }
  function startEdit(ticket: Ticket) { setSelected(ticket); setDraft({ title: ticket.title, description: ticket.description, priority: ticket.priority, status: ticket.status, assignedToId: ticket.assignedTo?.id ?? '' }); setShowForm(true) }
  async function saveTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const { assignedToId, ...draftWithoutAssignment } = draft
      const payload = user.role === 'SUPERUSER' ? { ...draft, assignedToId: assignedToId || null } : draftWithoutAssignment
      const result = selected ? await api<{ ticket: Ticket }>(`/tickets/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) }) : await api<{ ticket: Ticket }>('/tickets', { method: 'POST', body: JSON.stringify(payload) })
      setShowForm(false); setSelected(result.ticket); await loadTickets()
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo guardar el ticket.') } finally { setSaving(false) }
  }
  async function removeTicket(ticket: Ticket) { if (!window.confirm('¿Eliminar este ticket?')) return; try { await api(`/tickets/${ticket.id}`, { method: 'DELETE' }); setSelected(null); await loadTickets() } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo eliminar el ticket.') } }

  return <div className="page tickets-page"><div className="page-heading"><div><p className="eyebrow">GESTIÓN OPERATIVA</p><h1>Tickets</h1><p className="muted">Gestiona solicitudes y mantén el trabajo en movimiento.</p></div><button className="button primary" onClick={startCreate}>+ Crear ticket</button></div>{error && <div className="form-error page-alert">{error}</div>}<section className="panel tickets-panel"><div className="filters"><div className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tickets..." /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos los estados</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">Todas las prioridades</option>{priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>{loading ? <LoadingState /> : tickets.length === 0 ? <EmptyState title={search || statusFilter || priorityFilter ? 'Sin resultados' : 'No encontramos tickets'} text={search || statusFilter || priorityFilter ? 'Ningún ticket coincide con tu búsqueda o filtros.' : 'Crea el primer ticket para comenzar.'} action={<button className="button secondary" onClick={startCreate}>Crear ticket</button>} /> : <div className="ticket-table-wrap"><table><thead><tr><th>Ticket</th><th>Estado</th><th>Prioridad</th><th>Responsable</th><th>Actualizado</th><th /></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id} className={selected?.id === ticket.id ? 'selected-row' : ''} onClick={() => setSelected(ticket)}><td><div className="ticket-title"><strong>{ticket.title}</strong><small>#{ticket.id.slice(-6).toUpperCase()}</small></div></td><td><Badge type="status" value={ticket.status} /></td><td><Badge type="priority" value={ticket.priority} /></td><td>{ticket.assignedTo ? <div className="assignee"><span className="avatar tiny">{initials(ticket.assignedTo.name)}</span>{ticket.assignedTo.name}</div> : <span className="unassigned">Sin asignar</span>}</td><td className="date-cell">{relativeDate(ticket.updatedAt)}</td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); startEdit(ticket) }}>⋯</button></td></tr>)}</tbody></table></div>}</section>{selected && !showForm && <TicketDetail ticket={selected} user={user} onEdit={() => startEdit(selected)} onDelete={() => removeTicket(selected)} onClose={() => setSelected(null)} />}{showForm && <TicketForm draft={draft} setDraft={setDraft} users={users} isEdit={Boolean(selected)} saving={saving} canAssign={user.role === 'SUPERUSER'} onSubmit={saveTicket} onClose={() => setShowForm(false)} />}</div>
}

function TicketForm({ draft, setDraft, users, isEdit, saving, canAssign, onSubmit, onClose }: { draft: TicketDraft; setDraft: React.Dispatch<React.SetStateAction<TicketDraft>>; users: User[]; isEdit: boolean; saving: boolean; canAssign: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onClose: () => void }) { return <div className="drawer-backdrop"><form className="drawer" onSubmit={onSubmit}><div className="drawer-heading"><div><p className="eyebrow">{isEdit ? 'EDITAR TICKET' : 'NUEVO TICKET'}</p><h2>{isEdit ? 'Actualizar solicitud' : 'Crear ticket'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Describe brevemente la solicitud" minLength={3} required /></label><label>Descripción<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Añade el contexto necesario..." rows={6} minLength={3} required /></label><div className="form-grid"><label>Prioridad<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TicketPriority })}>{priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Estado<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TicketStatus })}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>{canAssign && <label>Asignar a<select value={draft.assignedToId} onChange={(event) => setDraft({ ...draft, assignedToId: event.target.value })}><option value="">Sin asignar</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<div className="drawer-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear ticket'}</button></div></form></div> }

function TicketDetail({ ticket, user, onEdit, onDelete, onClose }: { ticket: Ticket; user: User; onEdit: () => void; onDelete: () => void; onClose: () => void }) { return <div className="drawer-backdrop"><aside className="drawer detail-drawer"><div className="drawer-heading"><div><p className="eyebrow">DETALLE DEL TICKET</p><h2>{ticket.title}</h2><small>#{ticket.id.slice(-6).toUpperCase()}</small></div><button className="icon-button" onClick={onClose}>×</button></div><div className="detail-badges"><Badge type="status" value={ticket.status} /><Badge type="priority" value={ticket.priority} /></div><div className="detail-section"><p className="detail-label">Descripción</p><p className="detail-description">{ticket.description}</p></div><div className="detail-meta"><div><span>Creado por</span><strong>{ticket.createdBy.name}</strong></div><div><span>Asignado a</span><strong>{ticket.assignedTo?.name ?? 'Sin asignar'}</strong></div><div><span>Última actualización</span><strong>{relativeDate(ticket.updatedAt)}</strong></div></div><div className="drawer-actions"><button className="button secondary" onClick={onEdit}>Editar</button>{(user.role === 'SUPERUSER' || ticket.createdBy.id === user.id) && <button className="button danger" onClick={onDelete}>Eliminar</button>}</div></aside></div> }

function PageError({ message }: { message: string }) { return <div className="page"><div className="error-state"><div>!</div><h2>Algo salió mal</h2><p>{message}</p></div></div> }
function initials(name: string) { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() }
function firstName(name: string) { return name.split(' ')[0] }
function relativeDate(date: string) { const value = new Date(date); const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const target = new Date(value.getFullYear(), value.getMonth(), value.getDate()); const days = Math.round((target.getTime() - today.getTime()) / 86400000); if (days === 0) return 'Hoy'; if (days === -1) return 'Ayer'; if (days === 1) return 'Mañana'; if (days < 0 && days > -7) return `Hace ${Math.abs(days)} días`; if (days > 1 && days < 7) return `En ${days} días`; return value.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) }

function DiagnosticDetail({ diagnostic, onBack, onEdit, onDelete }: { diagnostic: Diagnostic; onBack: () => void; onEdit: () => void; onDelete: () => void }) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true)
    try { const result = await api<{ analysis: AIAnalysis }>(`/diagnostics/${diagnostic.id}/ai-analysis`); setAnalysis(result.analysis) } catch (error) { if (!(error instanceof ApiError && error.status === 404)) setAnalysisError('No se pudo cargar el análisis guardado.') } finally { setAnalysisLoading(false) }
  }, [diagnostic.id])
  useEffect(() => { const timer = window.setTimeout(() => { void loadAnalysis() }, 0); return () => window.clearTimeout(timer) }, [loadAnalysis])
  async function runAnalysis() { if (processing) return; setProcessing(true); setAnalysisError(''); try { const result = await api<{ analysis: AIAnalysis }>(`/diagnostics/${diagnostic.id}/ai-analysis`, { method: 'POST' }); setAnalysis(result.analysis) } catch (error) { setAnalysisError(error instanceof ApiError && error.status === 503 ? 'El análisis IA no está configurado todavía. Añade OPENAI_API_KEY en el backend.' : error instanceof ApiError ? error.message : 'No se pudo generar el análisis IA.') } finally { setProcessing(false) } }
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [importing, setImporting] = useState(false)
  const [recError, setRecError] = useState('')
  const loadRecommendations = useCallback(async () => {
    try { const result = await api<{ recommendations: Recommendation[] }>(`/diagnostics/${diagnostic.id}/recommendations`); setRecommendations(result.recommendations) } catch { setRecError('No pudimos cargar las recomendaciones.') }
  }, [diagnostic.id])
  useEffect(() => { const timer = window.setTimeout(() => { void loadRecommendations() }, 0); return () => window.clearTimeout(timer) }, [loadRecommendations])
  async function importRecommendations() { if (importing) return; setImporting(true); setRecError(''); try { await api(`/diagnostics/${diagnostic.id}/recommendations/import`, { method: 'POST' }); await loadRecommendations() } catch (requestError) { setRecError(requestError instanceof ApiError ? requestError.message : 'No se pudo importar.') } finally { setImporting(false) } }
  async function setRecommendationStatus(recommendation: Recommendation, status: RecommendationStatus) { setRecError(''); try { const result = await api<{ recommendation: Recommendation }>(`/recommendations/${recommendation.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setRecommendations((current) => current.map((item) => item.id === result.recommendation.id ? result.recommendation : item)) } catch (requestError) { setRecError(requestError instanceof ApiError ? requestError.message : 'No se pudo actualizar.') } }
  return <><div className="ai-trigger"><div><p className="detail-label">ANÁLISIS ASISTIDO</p><strong>Lectura estratégica con IA</strong><small>Basada únicamente en la información de esta DOFA.</small></div><button className="button primary small-button" onClick={() => void runAnalysis()} disabled={processing}>{processing ? <><span className="button-loader" />Procesando...</> : analysis ? 'Regenerar análisis' : 'Analizar con IA'}</button></div>{analysisError && <div className="form-error ai-error">{analysisError}</div>}<DiagnosticDetailBase diagnostic={diagnostic} onBack={onBack} onEdit={onEdit} onDelete={onDelete} />{analysis && <AIAnalysisPanel analysis={analysis} loading={analysisLoading} />}{!analysis && analysisLoading && <div className="ai-loading"><span className="loader" />Buscando análisis guardado...</div>}{recError && <div className="form-error">{recError}</div>}<RecommendationsPanel analysis={analysis} recommendations={recommendations} onImport={importRecommendations} onSetStatus={setRecommendationStatus} importing={importing} /><ActionPlansPanel diagnostic={diagnostic} recommendations={recommendations} /></>
}

function RecommendationsPanel({ analysis, recommendations, onImport, onSetStatus, importing }: { analysis: AIAnalysis | null; recommendations: Recommendation[]; onImport: () => Promise<void>; onSetStatus: (recommendation: Recommendation, status: RecommendationStatus) => Promise<void>; importing: boolean }) {
  const aiRecommendations = analysis?.recommendations ?? []
  return <section className="ai-analysis-panel recommendations-panel"><div className="ai-panel-heading"><div><p className="detail-label">GESTIÓN</p><h3>Recomendaciones IA</h3></div><span className="ai-badge">IA</span></div>{!analysis ? <EmptyState compact title="Sin análisis IA" text="Genera primero el análisis con IA para importar recomendaciones." /> : aiRecommendations.length === 0 ? <EmptyState compact title="Sin recomendaciones" text="El análisis IA no incluyó recomendaciones." /> : <div className="rec-list">{aiRecommendations.map((ai) => { const rec = recommendations.find((item) => item.title === ai.title); return <article className="ai-recommendation rec-card" key={ai.title}><div><strong>{ai.title}</strong><span className={`level-pill ${ai.priority.toLowerCase()}`}>{ai.priority === 'HIGH' ? 'Prioridad alta' : ai.priority === 'MEDIUM' ? 'Prioridad media' : 'Prioridad baja'}</span></div><p>{ai.description}</p><small><b>Impacto esperado:</b> {ai.expectedImpact}</small><small><b>Acción sugerida:</b> {ai.suggestedAction}</small><div className="rec-actions">{rec ? <><span className={`rec-status ${rec.status.toLowerCase()}`}>{recommendationStatusLabel[rec.status]}</span><button className="button secondary small-button" onClick={() => void onSetStatus(rec, 'ACCEPTED')}>Aceptar</button><button className="button danger small-button" onClick={() => void onSetStatus(rec, 'REJECTED')}>Rechazar</button></> : <button className="button primary small-button" onClick={() => void onImport()} disabled={importing}>{importing ? 'Importando...' : 'Importar'}</button>}</div></article> })}</div>}{recommendations.length > 0 && <div className="rec-summary"><strong>{recommendations.length} importada{recommendations.length === 1 ? '' : 's'}</strong><small>{recommendations.filter((item) => item.status === 'ACCEPTED').length} aceptadas · {recommendations.filter((item) => item.status === 'REJECTED').length} rechazadas</small></div>}</section> }

function ActionPlansPanel({ diagnostic, recommendations }: { diagnostic: Diagnostic; recommendations: Recommendation[] }) {
  const [plans, setPlans] = useState<ActionPlan[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [planDraft, setPlanDraft] = useState<PlanDraft>(emptyPlanDraft)
  const [itemFormFor, setItemFormFor] = useState<string | null>(null)
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft)
  const loadPlans = useCallback(async () => {
    setLoading(true); setError('')
    try { const result = await api<{ actionPlans: ActionPlan[] }>(`/diagnostics/${diagnostic.id}/action-plans`); setPlans(result.actionPlans) } catch { setError('No pudimos cargar los planes de acción.') } finally { setLoading(false) }
  }, [diagnostic.id])
  useEffect(() => { const timer = window.setTimeout(() => { void loadPlans() }, 0); return () => window.clearTimeout(timer) }, [loadPlans])
  useEffect(() => { api<{ users: User[] }>('/users').then((result) => setUsers(result.users)).catch(() => undefined) }, [])
  async function savePlan(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSavingPlan(true); setError(''); try { await api(`/diagnostics/${diagnostic.id}/action-plans`, { method: 'POST', body: JSON.stringify(planDraft) }); setShowPlanForm(false); setPlanDraft(emptyPlanDraft); await loadPlans() } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo crear el plan.') } finally { setSavingPlan(false) } }
  async function saveItem(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!itemFormFor) return; setSavingItem(true); setError(''); try { const payload = { ...itemDraft, recommendationId: itemDraft.recommendationId || null, responsibleId: itemDraft.responsibleId || null, dueDate: itemDraft.dueDate || null }; await api(`/action-plans/${itemFormFor}/items`, { method: 'POST', body: JSON.stringify(payload) }); setItemFormFor(null); setItemDraft(emptyItemDraft); await loadPlans() } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo agregar la acción.') } finally { setSavingItem(false) } }
  async function updateItem(item: ActionItem, patch: { status?: ActionItemStatus; responsibleId?: string | null; priority?: Level }) { setError(''); try { const payload = patch.responsibleId !== undefined ? { ...patch, responsibleId: patch.responsibleId || null } : patch; await api(`/action-items/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) }); await loadPlans() } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo actualizar la acción.') } }
  async function removeItem(item: ActionItem) { if (!window.confirm('¿Eliminar esta acción?')) return; try { await api(`/action-items/${item.id}`, { method: 'DELETE' }); await loadPlans() } catch { setError('No se pudo eliminar la acción.') } }
  async function updatePlan(plan: ActionPlan, status: ActionPlanStatus) { setError(''); try { await api(`/action-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadPlans() } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'No se pudo actualizar el plan.') } }
  return <section className="ai-analysis-panel plans-panel"><div className="ai-panel-heading"><div><p className="detail-label">EJECUCIÓN</p><h3>Planes de Acción</h3></div><button className="button primary small-button" onClick={() => { setPlanDraft(emptyPlanDraft); setShowPlanForm(!showPlanForm) }}>{showPlanForm ? 'Cerrar' : '+ Nuevo plan'}</button></div>{error && <div className="form-error">{error}</div>}{showPlanForm && <form className="factor-form plan-form" onSubmit={savePlan}><div className="factor-form-heading"><h3>Nuevo plan de acción</h3><button type="button" className="icon-button" onClick={() => setShowPlanForm(false)}>×</button></div><label>Título<input value={planDraft.title} onChange={(event) => setPlanDraft({ ...planDraft, title: event.target.value })} placeholder="Ej. Plan de mejora 2026" minLength={3} required /></label><label>Descripción<textarea value={planDraft.description} onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })} rows={3} minLength={3} required /></label><div className="drawer-actions"><button type="button" className="button secondary" onClick={() => setShowPlanForm(false)}>Cancelar</button><button className="button primary" disabled={savingPlan}>{savingPlan ? 'Creando...' : 'Crear plan'}</button></div></form>}{loading ? <div className="ai-loading"><span className="loader" />Cargando planes...</div> : plans.length === 0 ? <EmptyState compact title="Sin planes de acción" text="Crea el primer plan para organizar la ejecución." /> : <div className="plans-list">{plans.map((plan) => <article className="plan-card" key={plan.id}><div className="plan-heading"><div><h4>{plan.title}</h4><p>{plan.description}</p><small>Creado por {plan.createdBy.name}</small></div><div className="plan-status"><span className={`plan-pill ${plan.status.toLowerCase()}`}>{planStatusLabel[plan.status]}</span><select value={plan.status} onChange={(event) => void updatePlan(plan, event.target.value as ActionPlanStatus)} aria-label="Estado del plan">{actionPlanStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>{itemFormFor === plan.id && <form className="factor-form item-form" onSubmit={saveItem}><div className="factor-form-heading"><h3>Nueva acción</h3><button type="button" className="icon-button" onClick={() => setItemFormFor(null)}>×</button></div><label>Título<input value={itemDraft.title} onChange={(event) => setItemDraft({ ...itemDraft, title: event.target.value })} placeholder="¿Qué se hará?" minLength={3} required /></label><label>Descripción<textarea value={itemDraft.description} onChange={(event) => setItemDraft({ ...itemDraft, description: event.target.value })} rows={2} minLength={3} required /></label><div className="form-grid"><label>Prioridad<select value={itemDraft.priority} onChange={(event) => setItemDraft({ ...itemDraft, priority: event.target.value as Level })}>{levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Recomendación<select value={itemDraft.recommendationId} onChange={(event) => setItemDraft({ ...itemDraft, recommendationId: event.target.value })}><option value="">Sin relacionar</option>{recommendations.filter((item) => item.status !== 'REJECTED').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><div className="form-grid"><label>Responsable<select value={itemDraft.responsibleId} onChange={(event) => setItemDraft({ ...itemDraft, responsibleId: event.target.value })}><option value="">Sin asignar</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Fecha límite<input type="date" value={itemDraft.dueDate} onChange={(event) => setItemDraft({ ...itemDraft, dueDate: event.target.value })} /></label></div><div className="drawer-actions"><button type="button" className="button secondary" onClick={() => setItemFormFor(null)}>Cancelar</button><button className="button primary" disabled={savingItem}>{savingItem ? 'Agregando...' : 'Agregar acción'}</button></div></form>}<div className="plan-items">{plan.items.length === 0 ? <p className="ai-empty">Sin acciones todavía.</p> : plan.items.map((item) => <div className="plan-item" key={item.id}><div className="plan-item-head"><strong>{item.title}</strong><div className="plan-item-controls"><select value={item.status} onChange={(event) => void updateItem(item, { status: event.target.value as ActionItemStatus })} aria-label="Estado de la acción">{actionItemStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select><button className="row-action" onClick={() => void removeItem(item)} aria-label="Eliminar">×</button></div></div><p>{item.description}</p><div className="plan-item-meta"><span className={`level-pill ${item.priority.toLowerCase()}`}>P. {item.priority === 'HIGH' ? 'Alta' : item.priority === 'MEDIUM' ? 'Media' : 'Baja'}</span>{item.responsible && <span className="assignee"><span className="avatar tiny">{initials(item.responsible.name)}</span>{item.responsible.name}</span>}{item.dueDate && <small>Vence {relativeDate(item.dueDate)}</small>}{item.recommendation && <small>↳ {item.recommendation.title}</small>}</div></div>)}</div><button className="text-button" onClick={() => { setItemDraft(emptyItemDraft); setItemFormFor(itemFormFor === plan.id ? null : plan.id) }}>{itemFormFor === plan.id ? 'Cerrar formulario' : '+ Agregar acción'}</button></article>)}</div>}</section> }

function AIAnalysisPanel({ analysis, loading }: { analysis: AIAnalysis; loading: boolean }) { return <section className="ai-analysis-panel"><div className="ai-panel-heading"><div><p className="detail-label">RESULTADO ESTRUCTURADO</p><h3>Análisis IA</h3></div><span className="ai-badge">IA</span></div>{loading && <div className="ai-loading"><span className="loader" />Actualizando análisis...</div>}<div className="ai-summary-grid"><article><h4>Resumen ejecutivo</h4><p>{analysis.executiveSummary}</p></article><article><h4>Diagnóstico</h4><p>{analysis.diagnosis}</p></article></div><AISection title="Hallazgos" items={analysis.keyFindings.map((item) => `${item.basis === 'FACT' ? 'Hecho' : 'Inferencia'}: ${item.finding}`)} /><div className="ai-strategy-grid"><AISection title="Estrategias FO" items={analysis.foStrategies} /><AISection title="Estrategias DO" items={analysis.doStrategies} /><AISection title="Estrategias FA" items={analysis.faStrategies} /><AISection title="Estrategias DA" items={analysis.daStrategies} /></div><div className="ai-summary-grid"><AISection title="Riesgos prioritarios" items={analysis.priorityRisks} /><AISection title="Oportunidades prioritarias" items={analysis.priorityOpportunities} /></div><div className="ai-recommendations"><h4>Recomendaciones</h4>{analysis.recommendations.map((recommendation) => <article className="ai-recommendation" key={recommendation.title}><div><strong>{recommendation.title}</strong><span className={`level-pill ${recommendation.priority.toLowerCase()}`}>{recommendation.priority === 'HIGH' ? 'Alta' : recommendation.priority === 'MEDIUM' ? 'Media' : 'Baja'}</span></div><p>{recommendation.description}</p><small><b>Impacto esperado:</b> {recommendation.expectedImpact}</small><small><b>Acción sugerida:</b> {recommendation.suggestedAction}</small></article>)}</div></section> }
function AISection({ title, items }: { title: string; items: string[] }) { return <article className="ai-section"><h4>{title}</h4>{items.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="ai-empty">Sin elementos.</p>}</article> }

export default App
