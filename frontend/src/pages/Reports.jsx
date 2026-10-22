import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  BarChart2, FileText, Download, Trash2, RefreshCw,
  ChevronLeft, ChevronRight, Search, Filter,
  CheckCircle2, AlertCircle, AlertTriangle, Info,
  FileBarChart, Shield, X, Loader
} from 'lucide-react'
import './Reports.css'

const API = 'http://localhost:5000/api'
const PER_PAGE = 10

function StatusBadge({ status }) {
  const map = {
    'Fixed':           { bg: 'rgba(34,197,94,0.15)',  color: 'var(--success)',  Icon: CheckCircle2 },
    'Partially Fixed': { bg: 'rgba(234,179,8,0.15)',  color: 'var(--medium)',   Icon: AlertTriangle },
    'Not Fixed':       { bg: 'rgba(239,68,68,0.15)',  color: 'var(--critical)', Icon: AlertCircle },
  }
  const cfg = map[status] || { bg: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', Icon: Info }
  const Icon = cfg.Icon
  return (
    <span className="rep-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={11} /> {status}
    </span>
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

export default function Reports({ onNavigate }) {
  const [reports, setReports]           = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [generating, setGenerating]     = useState({})
  const [toast, setToast]               = useState(null)
  const [stats, setStats]               = useState(null)

  const totalPages = Math.ceil(total / PER_PAGE)

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/reports/stats`)
      setStats(res.data)
    } catch { /* silent */ }
  }, [])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, per_page: PER_PAGE }
      if (search)       params.search = search
      if (filterStatus) params.status = filterStatus
      const res = await axios.get(`${API}/reports`, { params })
      setReports(res.data.reports)
      setTotal(res.data.total)
    } catch {
      setReports([])
    }
    setLoading(false)
  }, [page, search, filterStatus])

  useEffect(() => { fetchReports(); fetchStats() }, [fetchReports, fetchStats])

  const handleDownload = (reportId, filename) => {
    const a = document.createElement('a')
    a.href = `${API}/reports/${reportId}/download`
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleRegenerate = async (contractId) => {
    setGenerating(g => ({ ...g, [contractId]: true }))
    try {
      await axios.post(`${API}/reports/generate/${contractId}?force=true`)
      showToast('success', 'Report regenerated successfully.')
      fetchReports()
      fetchStats()
    } catch {
      showToast('error', 'Failed to regenerate report.')
    }
    setGenerating(g => { const n = { ...g }; delete n[contractId]; return n })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await axios.delete(`${API}/reports/${deleteTarget}`)
      showToast('success', 'Report deleted.')
      fetchReports()
      fetchStats()
    } catch {
      showToast('error', 'Failed to delete report.')
    }
    setDeleteTarget(null)
  }

  return (
    <div className="rep-page">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="breadcrumb">
            <BarChart2 size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Reports</span>
          </div>
        </div>
        <div className="dash-header-right">
          <button className="ghost-btn" onClick={() => onNavigate('contracts')}>
            <FileText size={14} /> My Contracts
          </button>
        </div>
      </header>

      <div className="rep-body">
        {/* Summary cards */}
        {stats && (
          <div className="rep-stats">
            <div className="rep-stat-card">
              <div className="rsc-icon purple"><FileBarChart size={20} /></div>
              <div><div className="rsc-val">{stats.total_reports}</div><div className="rsc-lbl">Total Reports</div></div>
            </div>
            <div className="rep-stat-card">
              <div className="rsc-icon blue"><FileText size={20} /></div>
              <div><div className="rsc-val">{stats.total_contracts}</div><div className="rsc-lbl">Contracts Analyzed</div></div>
            </div>
            <div className="rep-stat-card">
              <div className="rsc-icon red"><AlertCircle size={20} /></div>
              <div><div className="rsc-val">{stats.total_vulns}</div><div className="rsc-lbl">Total Vulnerabilities</div></div>
            </div>
            <div className="rep-stat-card">
              <div className="rsc-icon green"><Shield size={20} /></div>
              <div><div className="rsc-val">{stats.total_fixed}</div><div className="rsc-lbl">Successfully Rectified</div></div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="rep-toolbar">
          <div>
            <h2 className="rep-title">Analysis Reports</h2>
            <p className="rep-sub">Generated PDF reports — persistent across sessions.</p>
          </div>
          <div className="rep-filters">
            <div className="search-wrap">
              <Search size={13} className="search-icon" />
              <input className="search-input" placeholder="Search by contract name…"
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
          </div>
        </div>

        {/* Table */}
        <div className="rep-table-wrap">
          <div className="rep-table">
            <div className="rep-thead">
              <span>Report ID</span>
              <span>Contract</span>
              <span>Analysis Date</span>
              <span>Vulns</span>
              <span>Severity</span>
              <span>Status</span>
              <span>Generated</span>
              <span>Actions</span>
            </div>

            {loading && (
              <div className="rep-empty">
                <span className="spinner-lg" />
                <p>Loading reports…</p>
              </div>
            )}

            {!loading && reports.length === 0 && (
              <div className="rep-empty">
                <FileBarChart size={40} style={{ color: 'var(--accent-blue)', opacity: 0.3 }} />
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>No reports yet</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Analyze a contract, then click "Generate PDF Report" to create one.
                </p>
                <button className="ghost-btn" onClick={() => onNavigate('analyze')}>
                  <FileBarChart size={13} /> Analyze a Contract
                </button>
              </div>
            )}

            {!loading && reports.map(r => (
              <div key={r.id} className="rep-row">
                <span className="rep-cell rep-id" title={r.id}>{r.id.slice(0, 8)}…</span>
                <span className="rep-cell rep-contract">
                  <FileText size={12} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <span title={r.contract_filename}>{r.contract_filename}</span>
                </span>
                <span className="rep-cell rep-date">{r.analyzed_at?.slice(0, 10)}</span>
                <span className="rep-cell">
                  <span className={`vuln-num ${r.vuln_total > 0 ? 'has' : ''}`}>{r.vuln_total}</span>
                </span>
                <span className="rep-cell rep-sev">
                  {r.vuln_critical > 0 && <span className="sev-chip critical">{r.vuln_critical}C</span>}
                  {r.vuln_high > 0     && <span className="sev-chip high">{r.vuln_high}H</span>}
                  {r.vuln_medium > 0   && <span className="sev-chip medium">{r.vuln_medium}M</span>}
                  {r.vuln_low > 0      && <span className="sev-chip low">{r.vuln_low}L</span>}
                  {r.vuln_total === 0  && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>}
                </span>
                <span className="rep-cell"><StatusBadge status={r.rect_status} /></span>
                <span className="rep-cell rep-date">{r.generated_at?.slice(0, 10)}</span>
                <span className="rep-cell rep-actions">
                  <button
                    className={`act-btn dl ${!r.has_pdf ? 'disabled' : ''}`}
                    title={r.has_pdf ? 'Download PDF' : 'PDF missing — regenerate'}
                    disabled={!r.has_pdf}
                    onClick={() => r.has_pdf && handleDownload(r.id, r.report_filename)}>
                    <Download size={13} />
                  </button>
                  <button className="act-btn regen" title="Regenerate"
                    disabled={!!generating[r.contract_id]}
                    onClick={() => handleRegenerate(r.contract_id)}>
                    {generating[r.contract_id]
                      ? <Loader size={13} className="spin" />
                      : <RefreshCw size={13} />}
                  </button>
                  <button className="act-btn del" title="Delete"
                    onClick={() => setDeleteTarget(r.id)}>
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
              <span className="pg-info">Page {page} of {totalPages} ({total} reports)</span>
              <button className="pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          message="Delete this report and its PDF file? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
