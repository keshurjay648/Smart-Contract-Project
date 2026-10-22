import { LayoutDashboard, FileSearch, FileText, BarChart2, Shield, ChevronRight } from 'lucide-react'
import './Sidebar.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',        icon: LayoutDashboard },
  { id: 'analyze',   label: 'Analyze Contract', icon: FileSearch },
  { id: 'contracts', label: 'My Contracts',     icon: FileText },
  { id: 'reports',   label: 'Reports',          icon: BarChart2 },
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon"><Shield size={20} /></div>
        <div className="logo-text">
          <span className="logo-title">SCRE</span>
          <span className="logo-sub">Smart Contract<br />Rectification Engine</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${activePage === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-cta">
        <div className="cta-content">
          <div className="cta-glow" />
          <span className="cta-title">Safer Contracts</span>
          <span className="cta-sub">A Safer Web3</span>
        </div>
        <button className="cta-btn" onClick={() => onNavigate('analyze')}>
          <ChevronRight size={16} />
        </button>
      </div>
    </aside>
  )
}
