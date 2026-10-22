import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  Upload, Copy, Play, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, AlertCircle, Info, CheckCircle2, Clock,
  Zap, WrenchIcon, Download, Bell, Sun, FileCode,
  ChevronRight, BarChart2, Loader, FileText
} from 'lucide-react'
import CodeEditor from '../components/CodeEditor.jsx'
import './AnalyzeContract.css'

const EXAMPLE_CODE = `// Example vulnerable contract
pragma solidity ^0.8.0;

contract Bank {
    mapping(address => uint) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint amount) public {
        require(balances[msg.sender] >= amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] -= amount;
    }
}`

const SEVERITY_CONFIG = {
  critical: { color: 'var(--critical)',  bg: 'rgba(239,68,68,0.12)',   icon: AlertCircle,   label: 'Critical' },
  high:     { color: 'var(--high)',      bg: 'rgba(249,115,22,0.12)',  icon: AlertTriangle, label: 'High' },
  medium:   { color: 'var(--medium)',    bg: 'rgba(234,179,8,0.12)',   icon: AlertTriangle, label: 'Medium' },
  low:      { color: 'var(--low)',       bg: 'rgba(59,130,246,0.12)',  icon: Info,          label: 'Low' },
}

export default function AnalyzeContract({ onNavigate }) {
  const [code, setCode]               = useState(EXAMPLE_CODE)
  const [activeTab, setActiveTab]     = useState('solidity')
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState(null)
  const [expandedIssue, setExpandedIssue] = useState(1)
  const [detailTab, setDetailTab]     = useState('explanation')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportDone, setReportDone]   = useState(false)
  // Apply Fix state
  const [applyState, setApplyState]   = useState('idle') // 'idle'|'loading'|'done'|'error'
  const [applyMsg, setApplyMsg]       = useState('')
  const fileRef = useRef()
  const uploadedFilename = useRef('contract.sol')

  useEffect(() => {
    axios.get('http://localhost:5000/api/sample-contract')
      .then(r => setCode(r.data.code))
      .catch(() => {})
  }, [])

  const handleAnalyze = async () => {
    setLoading(true)
    setResult(null)
    setReportDone(false)
    try {
      const blob = new Blob([code], { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', blob, uploadedFilename.current)
      const res = await axios.post('http://localhost:5000/api/analyze', formData)
      setResult(res.data)
    } catch (e) {
      setResult({ success: false, message: 'API error: ' + (e.message || 'Unknown') })
    }
    setLoading(false)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    uploadedFilename.current = file.name
    const reader = new FileReader()
    reader.onload = ev => setCode(ev.target.result)
    reader.readAsText(file)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
  }

  const handleClear = () => { setCode(''); setResult(null); setReportDone(false) }

  const handleGenerateReport = async () => {
    if (!result?.contract_id) return
    setReportLoading(true)
    try {
      await axios.post(`http://localhost:5000/api/reports/generate/${result.contract_id}`)
      setReportDone(true)
    } catch { /* silent */ }
    setReportLoading(false)
  }

  // ── Apply Fix: download the real repaired .sol file ──────────────────────
  const handleApplyFix = () => {
    const repairedCode = repair?.repaired_code
    if (!repairedCode || !repairedCode.trim()) {
      setApplyState('error')
      setApplyMsg('No corrected code is available. Run analysis first.')
      setTimeout(() => setApplyState('idle'), 3500)
      return
    }

    setApplyState('loading')

    try {
      // Derive filename: VulnerableBank.sol → VulnerableBank_fixed.sol
      const base     = uploadedFilename.current || 'contract.sol'
      const dotIdx   = base.lastIndexOf('.')
      const fixedName = dotIdx !== -1
        ? base.slice(0, dotIdx) + '_fixed' + base.slice(dotIdx)
        : base + '_fixed.sol'

      const blob = new Blob([repairedCode], { type: 'text/plain;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = fixedName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setApplyState('done')
      setApplyMsg(`Downloaded: ${fixedName}`)
      setTimeout(() => setApplyState('idle'), 4000)
    } catch (err) {
      setApplyState('error')
      setApplyMsg('Download failed: ' + err.message)
      setTimeout(() => setApplyState('idle'), 4000)
    }
  }

  const detection  = result?.detection  || {}
  const repair     = result?.repair     || {}
  const verification = result?.verification || {}
  const hasResult  = !!result

  // Use real severity counts from API response, fallback to 0
  const severityCounts = result?.severity_counts
    ? { critical: result.severity_counts.critical, high: result.severity_counts.high,
        medium: result.severity_counts.medium,     low:  result.severity_counts.low }
    : { critical: 0, high: 0, medium: 0, low: 0 }

  const issues = result?.issues || (hasResult && detection.detected ? [] : [])

  return (
    <div className="analyze-page">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="breadcrumb">
            <span className="bc-icon"><FileCode size={14} /></span>
            <span className="bc-sep">Analyze Contract</span>
          </div>
        </div>
        <div className="dash-header-right">
          <button className="icon-btn"><Sun size={18} /></button>
          <button className="icon-btn notif">
            <Bell size={18} />
            <span className="notif-dot" />
          </button>
          <div className="user-avatar">
            <div className="avatar-circle">JK</div>
            <div className="user-info">
              <span className="user-name">Jay Keshur</span>
              <span className="user-role">Developer</span>
            </div>
            <ChevronRight size={14} className="chevron" />
          </div>
        </div>
      </header>

      <div className="analyze-body">
        {/* TOP ROW: Input + Results */}
        <div className="top-row">
          {/* Panel 1 — Input */}
          <div className="panel input-panel">
            <div className="panel-header">
              <div className="panel-title">
                <span className="panel-num">{'</>'}</span>
                <span>1. Input Smart Contract</span>
              </div>
              <div className="panel-actions">
                <button className="ghost-btn" onClick={() => fileRef.current.click()}>
                  <Upload size={14} /> Upload File
                </button>
                <button className="ghost-btn icon-only" onClick={handleCopy} title="Copy">
                  <Copy size={14} />
                </button>
                <input ref={fileRef} type="file" accept=".sol" hidden onChange={handleFileUpload} />
              </div>
            </div>

            <div className="lang-tabs">
              {['solidity', 'vyper', 'other'].map(t => (
                <button key={t}
                  className={`lang-tab ${activeTab === t ? 'active' : ''}`}
                  onClick={() => setActiveTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
              <span className="example-badge">Example ▾</span>
            </div>

            <div className="editor-wrap">
              <CodeEditor value={code} onChange={setCode} />
            </div>

            <div className="panel-footer">
              <button
                className={`analyze-btn ${loading ? 'loading' : ''}`}
                onClick={handleAnalyze}
                disabled={loading}
              >
                {loading
                  ? <><span className="spinner" /> Analyzing...</>
                  : <><Play size={16} fill="white" /> Analyze Contract <ChevronRight size={16} /></>}
              </button>
              <button className="clear-btn" onClick={handleClear}>
                <Trash2 size={14} /> Clear
              </button>
            </div>
          </div>

          {/* Panel 2 — Results */}
          <div className="panel results-panel">
            <div className="panel-header">
              <div className="panel-title">
                <span className="panel-num">2.</span>
                <span>Analysis Results</span>
              </div>
              <div className="results-meta">
                {hasResult
                  ? <>
                      <span className="meta-time"><Clock size={12} /> Analysis saved to history</span>
                      <span className={`status-pill ${result.success ? 'success' : detection.detected ? 'warning' : 'info'}`}>
                        {result.success ? '✓ Analysis Complete' : detection.detected ? '⚠ Issues Found' : '✓ Done'}
                      </span>
                    </>
                  : <span className="meta-time">Run analysis to see results</span>
                }
              </div>
            </div>

            {hasResult && (
              <div className="severity-row">
                {Object.entries(severityCounts).map(([sev, count]) => {
                  const cfg = SEVERITY_CONFIG[sev]
                  const Icon = cfg.icon
                  return (
                    <div key={sev} className="sev-badge"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}>
                      <span className="sev-count" style={{ color: cfg.color }}>{count}</span>
                      <Icon size={14} style={{ color: cfg.color }} />
                      <span className="sev-label" style={{ color: cfg.color }}>{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="issue-list">
              {!hasResult && (
                <div className="empty-state">
                  <Zap size={32} style={{ color: 'var(--accent-blue)', opacity: 0.4 }} />
                  <p>Analyze a contract to see vulnerability results here.</p>
                </div>
              )}
              {issues.map(issue => {
                const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.low
                const Icon = cfg.icon
                const isOpen = expandedIssue === issue.id
                return (
                  <div key={issue.id} className="issue-item"
                    style={{ borderLeft: `3px solid ${cfg.color}` }}>
                    <div className="issue-row" onClick={() => setExpandedIssue(isOpen ? null : issue.id)}>
                      <div className="issue-icon" style={{ background: cfg.bg }}>
                        <Icon size={16} style={{ color: cfg.color }} />
                      </div>
                      <div className="issue-info">
                        <div className="issue-title-row">
                          <span className="issue-title">{issue.title}</span>
                          <span className="issue-sev-pill" style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </div>
                        <span className="issue-desc">{issue.description}</span>
                        <span className="issue-line">Line {issue.line}</span>
                      </div>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                    {isOpen && (
                      <div className="issue-detail">
                        <p>
                          The <code>{issue.title}</code> vulnerability can be exploited by an attacker
                          to drain funds or manipulate contract state. Apply the suggested fix to resolve this issue.
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Generate Report + View History buttons */}
              {hasResult && result.contract_id && (
                <div className="post-analysis-actions">
                  <button
                    className={`gen-report-btn ${reportDone ? 'done' : ''}`}
                    onClick={handleGenerateReport}
                    disabled={reportLoading || reportDone}
                  >
                    {reportLoading
                      ? <><Loader size={14} className="spin-icon" /> Generating PDF...</>
                      : reportDone
                        ? <><CheckCircle2 size={14} /> Report Generated</>
                        : <><BarChart2 size={14} /> Generate PDF Report</>}
                  </button>
                  {reportDone && (
                    <button className="view-reports-btn" onClick={() => onNavigate('reports')}>
                      <FileText size={14} /> View in Reports
                    </button>
                  )}
                  <button className="view-history-btn" onClick={() => onNavigate('contracts')}>
                    <FileCode size={14} /> View in My Contracts
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: Details + Fix */}
        {hasResult && (
          <div className="bottom-row">
            {/* Panel 3 — Details */}
            <div className="panel detail-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <span className="panel-num">3.</span>
                  <span>Vulnerability Details</span>
                </div>
                <div className="detail-tabs">
                  {['explanation', 'impact', 'references'].map(t => (
                    <button key={t}
                      className={`detail-tab ${detailTab === t ? 'active' : ''}`}
                      onClick={() => setDetailTab(t)}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="detail-body">
                <div className="detail-issue-title">
                  <div className="issue-icon" style={{ background: 'rgba(239,68,68,0.15)' }}>
                    <AlertCircle size={16} style={{ color: 'var(--critical)' }} />
                  </div>
                  <span>Reentrancy Vulnerability</span>
                  <span className="issue-sev-pill"
                    style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--critical)' }}>
                    Critical Severity
                  </span>
                </div>
                {detailTab === 'explanation' && (
                  <p className="detail-text">
                    The contract makes an external call to <code>msg.sender</code> before
                    updating the state <code>balances[msg.sender] -= amount</code>. An attacker
                    can create a malicious contract that re-enters the withdraw function and drain
                    funds multiple times.
                  </p>
                )}
                {detailTab === 'impact' && (
                  <p className="detail-text">
                    This vulnerability can result in complete drain of the contract's ETH balance.
                    The attacker repeatedly calls withdraw before the balance is decremented,
                    receiving more funds than they deposited.
                  </p>
                )}
                {detailTab === 'references' && (
                  <ul className="detail-text" style={{ paddingLeft: '16px' }}>
                    <li>SWC-107: Reentrancy</li>
                    <li>Checks-Effects-Interactions Pattern</li>
                    <li>OpenZeppelin ReentrancyGuard</li>
                  </ul>
                )}
                {result?.message && (
                  <div className={`pipeline-status ${result.success ? 'success' : 'warning'}`}>
                    {result.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {result.message}
                  </div>
                )}
              </div>
            </div>

            {/* Panel 4 — Fix */}
            <div className="panel fix-panel">
              <div className="panel-header">
                <div className="panel-title">
                  <span className="panel-num">4.</span>
                  <span>Suggested Fix (Auto-Rectification)</span>
                </div>
                <div className="panel-actions">
                  <span className="ai-badge"><Zap size={11} /> AI Suggestion</span>

                  {/* ── Apply Fix button ── */}
                  <button
                    className={`apply-btn ${applyState}`}
                    onClick={handleApplyFix}
                    disabled={!repair.repaired_code || applyState === 'loading'}
                    title={repair.repaired_code ? 'Download corrected .sol file' : 'No fix available yet'}
                  >
                    {applyState === 'loading' && <><Loader size={13} className="spin-icon" /> Preparing...</>}
                    {applyState === 'done'    && <><CheckCircle2 size={13} /> Downloaded!</>}
                    {applyState === 'error'   && <><AlertCircle size={13} /> Failed</>}
                    {applyState === 'idle'    && <><WrenchIcon size={13} /> Apply Fix</>}
                  </button>

                  <button className="ghost-btn icon-only"
                    onClick={() => repair.repaired_code && navigator.clipboard.writeText(repair.repaired_code)}
                    title="Copy fixed code">
                    <Copy size={13} />
                  </button>
                </div>
              </div>

              {/* Apply Fix feedback message */}
              {applyState !== 'idle' && applyMsg && (
                <div className={`apply-feedback ${applyState}`}>
                  {applyState === 'done'  && <CheckCircle2 size={13} />}
                  {applyState === 'error' && <AlertCircle size={13} />}
                  {applyMsg}
                </div>
              )}

              {/* Compilation warning */}
              {repair.repaired_code && !verification.success && (
                <div className="apply-warning">
                  <AlertTriangle size={13} />
                  Applying the fix downloads the corrected code. This does not guarantee the contract is vulnerability-free. Always review and test before deployment.
                </div>
              )}

              {/* ── Side-by-side diff ── */}
              <div className="diff-row">
                {/* Left — Vulnerable */}
                <div className="diff-col vulnerable">
                  <div className="diff-col-header">
                    <span className="diff-label bad">Vulnerable Code</span>
                    <span className="diff-linecount">
                      {(result?.original_code || code).split('\n').length} lines
                    </span>
                  </div>
                  <div className="diff-editor-wrap">
                    <CodeEditor
                      value={result?.original_code || code}
                      onChange={() => {}}
                      readOnly
                      highlight="red"
                      showCopy
                      maxHeight="360px"
                    />
                  </div>
                </div>

                {/* Right — Fixed */}
                <div className="diff-col fixed">
                  <div className="diff-col-header">
                    <span className="diff-label good">Fixed Code (Recommended)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {repair.repaired_code && (
                        <span className="diff-linecount">
                          {repair.repaired_code.split('\n').length} lines
                        </span>
                      )}
                      {repair.repaired_code && (
                        <a className="download-link"
                          href={`data:text/plain;charset=utf-8,${encodeURIComponent(repair.repaired_code)}`}
                          download={
                            (() => {
                              const b = uploadedFilename.current || 'contract.sol'
                              const d = b.lastIndexOf('.')
                              return d !== -1 ? b.slice(0, d) + '_fixed' + b.slice(d) : b + '_fixed.sol'
                            })()
                          }>
                          <Download size={12} /> Download
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="diff-editor-wrap">
                    <CodeEditor
                      value={repair.repaired_code || '// Run analysis to generate the fix'}
                      onChange={() => {}}
                      readOnly
                      highlight="green"
                      showCopy
                      maxHeight="360px"
                    />
                  </div>
                </div>
              </div>

              {verification.success !== undefined && (
                <div className={`compile-status ${verification.success ? 'success' : 'error'}`}>
                  {verification.success
                    ? <><CheckCircle2 size={14} /> Compilation successful — contract is syntactically valid.</>
                    : <><AlertCircle size={14} /> Compilation failed. Review the repaired code.</>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
