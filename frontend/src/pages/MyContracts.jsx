import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import {
  FileText, Search, Filter, Trash2, Eye, ChevronLeft,
  ChevronRight, AlertCircle, AlertTriangle, Info, CheckCircle2,
  Clock, Shield, FileSearch, BarChart2, X, ChevronDown
} from 'lucide-react'
import CodeEditor from '../components/CodeEditor.jsx'
import './MyContracts.css'

const API = 'http://localhost:5000/api'
const PER_PAGE = 10

const SEV = {
  critical: { color: 'var(--critical)',  bg: 'rgba(239,68,68,0.15)',   icon: AlertCircle },
  high:     { color: 'var(--high)',      bg: 'rgba(249,115,22,0.15)',  icon: AlertTriangle },
  medium:   { color: 'var(--medium)',    bg: 'rgba(234,179,8,0.15)',   icon: AlertTriangle },
  low:      { color: 'var(--low)',       bg: 'rgba(59,130,246,0.15)',  icon: Info },
}

const STATUS_CFG = {
  'Fixed':           { bg: 'rgba(34,197,94,0.15)',  color: 'var(--success)',  border: 'rgba(34,197,94,0.45)',  icon: CheckCircle2 },
  'Partially Fixed': { bg: 'rgba(234,179,8,0.15)',  color: 'var(--medium)',   border: 'rgba(234,179,8,0.45)',  icon: AlertTriangle },
  'Not Fixed':       { bg: 'rgba(239,68,68,0.15)',  color: 'var(--critical)', border: 'rgba(239,68,68,0.45)',  icon: AlertCircle },
}

const STATUS_OPTIONS = ['Not Fixed', 'Partially Fixed', 'Fixed']

// Simple static badge (used in the detail panel header)
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { bg: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', icon: Info }
  const Icon = cfg.icon
  return (
    <span className="status-badge" style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={11} /> {status}
    </span>
  )
}

/**
 * Clickable status dropdown.
 * The menu is rendered via React Portal into document.body so it is NEVER
 * clipped by any table overflow, transform, or stacking context.
 */
function StatusDropdown({ contractId, current, onChanged }) {
  const [open, setOpen]         = useState(false)
  const [saving, setSaving]     = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [menuPos, setMenuPos]   = useState({ top: 0, left: 0 })
  const btnRef                  = useRef(null)
  const menuRef                 = useRef(null)

  const cfg  = STATUS_CFG[current] || STATUS_CFG['Not Fixed']
  const Icon = cfg.icon

  // Position the portal menu below the trigger button
  const openMenu = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenuPos({ top: r.bottom + window.scrollY + 5, left: r.left + window.scrollX })
    }
    setOpen(true)
  }

  // Close when clicking outside both the button and the menu
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        btnRef.current  && !btnRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const choose = async (val) => {
    setOpen(false)
    if (val === current) return
    const prev = current
    onChanged(contractId, val)   // optimistic update
    setSaving(true)
    setErrorMsg('')
    try {
      await axios.patch(`${API}/contracts/${contractId}/status`, { rect_status: val })
    } catch {
      onChanged(contractId, prev) // rollback on failure
      setErrorMsg('Save failed')
      setTimeout(() => setErrorMsg(''), 3000)
    }
    setSaving(false)
  }

  return (
    <div className="status-dd-wrap">
      {/* Trigger button */}
      <button
        ref={btnRef}
        className={`status-dd-btn${saving ? ' saving' : ''}`}
        style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
        onClick={() => open ? setOpen(false) : openMenu()}
        disabled={saving}
        title="Click to change status"
      >
        <Icon size={11} />
        <span>{current}</span>
        <ChevronDown size={10} className={`status-dd-chevron${open ? ' open' : ''}`} />
      </button>

      {errorMsg && <span className="status-dd-error">{errorMsg}</span>}

      {/* Portal — renders directly in <body>, above everything */}
      {open && createPortal(
        <div
          ref={menuRef}
          className="status-dd-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {STATUS_OPTIONS.map(opt => {
            const c = STATUS_CFG[opt]
            const I = c.icon
            return (
              <button
                key={opt}
                className={`status-dd-item${opt === current ? ' active' : ''}`}
                style={{ color: c.color }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(opt)}
              >
                <I size={12} />
                <span>{opt}</span>
                {opt === current && <span className="status-dd-check">✓</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={e => e.stopPropagation()}>
        <div className="dialog-icon"><Trash2 size={22} style={{ color: 'var(--critical)' }} /></div>
        <p className="dialog-msg">{message}</p>
        <div className="dialog-actions">
          <button className="dialog-cancel" onClick={onCancel}>Cancel</button>
          <button className="dialog-confirm" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

export default function MyContracts({ onNavigate, viewId }) {
  const [contracts, setContracts]       = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSev, setFilterSev]       = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [selected, setSelected]         = useState(null)
  const [detailTab, setDetailTab]       = useState('overview')
  const [detailLoading, setDetailLoading] = useState(false)

  const totalPages = Math.ceil(total / PER_PAGE)

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, per_page: PER_PAGE }
      if (search)       params.search   = search
      if (filterStatus) params.status   = filterStatus
      if (filterSev)    params.severity = filterSev
      const res = await axios.get(`${API}/contracts`, { params })
      setContracts(res.data.contracts)
      setTotal(res.data.total)
    } catch { setContracts([]) }
    setLoading(false)
  }, [page, search, filterStatus, filterSev])

  useEffect(() => { fetchContracts() }, [fetchContracts])

  useEffect(() => { if (viewId) openDetail(viewId) }, [viewId])

  const openDetail = async (id) => {
    setDetailLoading(true)
    setSelected(null)
    setDetailTab('overview')
    try {
      const res = await axios.get(`${API}/contracts/${id}`)
      setSelected(res.data)
    } catch { setSelected({ error: 'Failed to load contract.' }) }
    setDetailLoading(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await axios.delete(`${API}/contracts/${deleteTarget}`)
      if (selected?.id === deleteTarget) setSelected(null)
      fetchContracts()
    } catch { /* silent */ }
    setDeleteTarget(null)
  }

  const handleGenerateReport = async (contractId) => {
    try {
      await axios.post(`${API}/reports/generate/${contractId}`)
      onNavigate('reports')
    } catch { /* silent */ }
  }

  // Instant local update — no refetch needed
  const handleStatusChange = (contractId, newStatus) => {
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, rect_status: newStatus } : c))
    setSelected(prev => prev && prev.id === contractId ? { ...prev, rect_status: newStatus } : prev)
  }

  return (
    <div className="mc-page">
      {/* ── Header ── */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="breadcrumb">
            <FileText size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>My Contracts</span>
          </div>
        </div>
        <div className="dash-header-right">
          <button className="ghost-btn" onClick={() => onNavigate('analyze')}>
            <FileSearch size={14} /> Analyze New
          </button>
        </div>
      </header>

      <div className="mc-body">
        {/* ── Toolbar ── */}
        <div className="mc-toolbar">
          <div>
            <h2 className="mc-title">Contract History</h2>
            <p className="mc-sub">All previously analyzed smart contracts — stored persistently.</p>
          </div>
          <div className="mc-filters">
            <div className="search-wrap">
              <Search size={14} className="search-icon" />
              <input className="search-input" placeholder="Search by filename…"
                value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
              {search && (
                <button className="search-clear" onClick={() => { setSearch(''); setPage(1) }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="filter-wrap">
              <Filter size={13} />
              <select className="filter-select" value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
                <option value="">All Statuses</option>
                <option value="Fixed">Fixed</option>
                <option value="Partially Fixed">Partially Fixed</option>
                <option value="Not Fixed">Not Fixed</option>
              </select>
            </div>
            <div className="filter-wrap">
              <AlertTriangle size={13} />
              <select className="filter-select" value={filterSev}
                onChange={e => { setFilterSev(e.target.value); setPage(1) }}>
                <option value="">All Severities</option>
                <option value="critical">Has Critical</option>
                <option value="high">Has High</option>
                <option value="medium">Has Medium</option>
                <option value="low">Has Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="mc-table-wrap">
          <div className="mc-table">
            <div className="mc-thead">
              <span>Contract</span>
              <span>Language</span>
              <span>Analyzed At</span>
              <span>Vulnerabilities</span>
              <span>Severity Breakdown</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {loading && (
              <div className="mc-empty">
                <span className="spinner-lg" />
                <p>Loading contract history…</p>
              </div>
            )}

            {!loading && contracts.length === 0 && (
              <div className="mc-empty">
                <Shield size={40} style={{ color: 'var(--accent-blue)', opacity: 0.3 }} />
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>No contracts yet</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Analyze a contract and it will appear here automatically.
                </p>
                <button className="analyze-btn-sm" onClick={() => onNavigate('analyze')}>
                  <FileSearch size={14} /> Analyze a Contract
                </button>
              </div>
            )}

            {!loading && contracts.map(c => (
              <div key={c.id} className="mc-row">
                <span className="mc-cell mc-filename">
                  <FileText size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <span title={c.filename}>{c.filename}</span>
                </span>
                <span className="mc-cell">
                  <span className="lang-tag">{c.language}</span>
                </span>
                <span className="mc-cell mc-date">
                  <Clock size={11} />
                  {new Date(c.analyzed_at).toLocaleString()}
                </span>
                <span className="mc-cell mc-total">
                  <span className={`vuln-count ${c.vuln_total > 0 ? 'has-vulns' : ''}`}>
                    {c.vuln_total}
                  </span>
                </span>
                <span className="mc-cell mc-sev">
                  {c.vuln_critical > 0 && <span className="sev-chip critical">{c.vuln_critical}C</span>}
                  {c.vuln_high > 0     && <span className="sev-chip high">{c.vuln_high}H</span>}
                  {c.vuln_medium > 0   && <span className="sev-chip medium">{c.vuln_medium}M</span>}
                  {c.vuln_low > 0      && <span className="sev-chip low">{c.vuln_low}L</span>}
                  {c.vuln_total === 0  && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>}
                </span>
                <span className="mc-cell mc-status">
                  <StatusDropdown contractId={c.id} current={c.rect_status} onChanged={handleStatusChange} />
                </span>
                <span className="mc-cell mc-actions">
                  <button className="act-btn view" onClick={() => openDetail(c.id)} title="View Details">
                    <Eye size={13} />
                  </button>
                  <button className="act-btn report" onClick={() => handleGenerateReport(c.id)} title="Generate Report">
                    <BarChart2 size={13} />
                  </button>
                  <button className="act-btn del" onClick={() => setDeleteTarget(c.id)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="pg-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span className="pg-info">Page {page} of {totalPages} ({total} records)</span>
              <button className="pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail side panel ── */}
      {(detailLoading || selected) && (
        <div className="detail-overlay" onClick={() => setSelected(null)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <div className="detail-header-left">
                <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
                <span className="detail-title">{selected?.filename || 'Loading…'}</span>
                {selected?.rect_status && <StatusBadge status={selected.rect_status} />}
              </div>
              <button className="detail-close" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>

            {detailLoading && <div className="detail-loading"><span className="spinner-lg" /></div>}

            {selected && !selected.error && (
              <>
                <div className="detail-tabs">
                  {['overview', 'vulnerabilities', 'original', 'fixed'].map(t => (
                    <button key={t} className={`dtab ${detailTab === t ? 'active' : ''}`}
                      onClick={() => setDetailTab(t)}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="detail-body">
                  {detailTab === 'overview' && (
                    <div className="detail-overview">
                      <div className="ov-grid">
                        <div className="ov-card">
                          <span className="ov-label">Language</span>
                          <span className="ov-val">{selected.language}</span>
                        </div>
                        <div className="ov-card">
                          <span className="ov-label">Analyzed</span>
                          <span className="ov-val">{new Date(selected.analyzed_at).toLocaleString()}</span>
                        </div>
                        <div className="ov-card">
                          <span className="ov-label">Total Vulnerabilities</span>
                          <span className="ov-val" style={{ color: selected.vuln_total > 0 ? 'var(--critical)' : 'var(--success)' }}>
                            {selected.vuln_total}
                          </span>
                        </div>
                        <div className="ov-card">
                          <span className="ov-label">Status</span>
                          <StatusDropdown contractId={selected.id} current={selected.rect_status} onChanged={handleStatusChange} />
                        </div>
                      </div>
                      <div className="sev-row-detail">
                        {['critical','high','medium','low'].map(k => (
                          <div key={k} className={`sev-card ${k}`}>
                            <span className="sev-num">{selected[`vuln_${k}`]}</span>
                            <span className="sev-lbl">{k.charAt(0).toUpperCase()+k.slice(1)}</span>
                          </div>
                        ))}
                      </div>
                      {selected.detection?.message && (
                        <div className="detection-msg"><Info size={13} /> {selected.detection.message}</div>
                      )}
                      <div className="detail-actions">
                        <button className="da-btn primary" onClick={() => handleGenerateReport(selected.id)}>
                          <BarChart2 size={14} /> Generate Report
                        </button>
                        <button className="da-btn danger" onClick={() => setDeleteTarget(selected.id)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {detailTab === 'vulnerabilities' && (
                    <div className="vuln-list">
                      {(!selected.issues || selected.issues.length === 0) && (
                        <div className="vuln-empty">
                          <CheckCircle2 size={28} style={{ color: 'var(--success)' }} />
                          <p>No vulnerabilities detected.</p>
                        </div>
                      )}
                      {(selected.issues || []).map(issue => {
                        const cfg = SEV[issue.severity] || SEV.low
                        const IIcon = cfg.icon
                        return (
                          <div key={issue.id} className="vuln-item" style={{ borderLeft: `3px solid ${cfg.color}` }}>
                            <div className="vuln-top">
                              <div className="vuln-icon" style={{ background: cfg.bg }}>
                                <IIcon size={14} style={{ color: cfg.color }} />
                              </div>
                              <div className="vuln-info">
                                <div className="vuln-title-row">
                                  <span className="vuln-title">{issue.title}</span>
                                  <span className="vuln-sev" style={{ background: cfg.bg, color: cfg.color }}>{issue.severity}</span>
                                  <span className="vuln-line">Line {issue.line}</span>
                                </div>
                                <p className="vuln-desc">{issue.description}</p>
                              </div>
                            </div>
                            <div className="vuln-detail">
                              <div><strong>Impact:</strong> {issue.impact}</div>
                              <div><strong>Mitigation:</strong> {issue.mitigation}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {detailTab === 'original' && (
                    <div className="code-panel">
                      <div className="code-label bad">Original (Vulnerable)</div>
                      <div className="code-wrap">
                        <CodeEditor value={selected.original_code || '// No source stored'} onChange={() => {}} readOnly highlight="red" />
                      </div>
                    </div>
                  )}

                  {detailTab === 'fixed' && (
                    <div className="code-panel">
                      <div className="code-label good">Repaired Code</div>
                      <div className="code-wrap">
                        <CodeEditor value={selected.repaired_code || '// No repair available'} onChange={() => {}} readOnly highlight="green" />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {selected?.error && (
              <div className="detail-loading" style={{ color: 'var(--critical)' }}>
                <AlertCircle size={24} /> {selected.error}
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message="Delete this contract and all its reports? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
