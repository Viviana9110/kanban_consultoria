export function EmptyState({ title, text, action, compact = false }: { title: string; text: string; action?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <div className="empty-icon">{compact ? '○' : '□'}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}
