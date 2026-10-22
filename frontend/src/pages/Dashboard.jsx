import { useEffect, useState } from 'react'
import {
  Bell, Sun, Bug, ShieldCheck, FileCode, TrendingUp,
  ChevronRight, Cpu, Zap, Globe, Lock
} from 'lucide-react'
import axios from 'axios'
import './Dashboard.css'

const FEATURE_BADGES = [
  { icon: Cpu, label: 'AI Powered Analysis' },
  { icon: Zap, label: 'Automatic Fix Suggestions' },
  { icon: Lock, label: 'Best Security Practices' },
  { icon: Globe, label: 'Supports Solidity & Vyper' },
]

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState({
    vulnerabilities_found: 12,
    auto_fixes_available: 8,
    contracts_analyzed: 46,
    fix_success_rate: 95,
  })

  useEffect(() => {
    axios.get('http://localhost:5000/api/stats')
      .then(r => setStats(r.data))
      .catch(() => {})
  }, [])

  return (
    <div className="dashboard">
      {/* Top bar */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="breadcrumb">
            <span className="bc-icon"><FileCode size={14} /></span>
            <span className="bc-sep">+</span>
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

      <div className="dash-body">
        {/* Hero section */}
        <div className="hero-section">
          <div className="hero-text">
            <h1 className="hero-title">
              Smart Contract<br />
              <span className="gradient-text">Vulnerability Rectification Engine</span>
            </h1>
            <p className="hero-sub">
              Detect, analyze and automatically fix vulnerabilities in your smart contracts using AI.
            </p>
            <div className="feature-badges">
              {FEATURE_BADGES.map(({ icon: Icon, label }) => (
                <span key={label} className="feature-badge">
                  <Icon size={12} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-graphic">
              <div className="eth-glow" />
              <div className="eth-icon">⬡</div>
            </div>
            <div className="deploy-card">
              <div className="deploy-card-text">
                <span className="deploy-title">Deploy Safer<br />Smart Contracts</span>
                <span className="deploy-sub">Detect risks. Get fixes. Build with confidence.</span>
              </div>
              <button className="deploy-btn" onClick={() => onNavigate('analyze')}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="stats-row">
          <StatCard
            icon={<Bug size={28} />}
            iconClass="stat-icon-red"
            value={stats.vulnerabilities_found}
            delta="+2"
            label="Vulnerabilities Found"
            trend="up"
            trendColor="var(--critical)"
          />
          <StatCard
            icon={<ShieldCheck size={28} />}
            iconClass="stat-icon-green"
            value={stats.auto_fixes_available}
            delta="+3"
            label="Auto-fixes Available"
            trend="up"
            trendColor="var(--success)"
          />
          <StatCard
            icon={<FileCode size={28} />}
            iconClass="stat-icon-blue"
            value={stats.contracts_analyzed}
            label="Contracts Analyzed"
            trend="neutral"
            trendColor="var(--accent-cyan)"
          />
          <StatCard
            icon={<TrendingUp size={28} />}
            iconClass="stat-icon-purple"
            value={`${stats.fix_success_rate}%`}
            label="Fix Success Rate"
            trend="neutral"
            trendColor="var(--accent-purple)"
          />
        </div>

        {/* CTA to full analyzer */}
        <div className="dash-cta-row">
          <button className="analyze-cta-btn" onClick={() => onNavigate('analyze')}>
            <Zap size={16} />
            Start Analyzing a Contract
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, iconClass, value, delta, label, trend, trendColor }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconClass}`}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value-row">
          <span className="stat-value">{value}</span>
          {delta && (
            <span className="stat-delta" style={{ color: trendColor }}>
              ▲ {delta}
            </span>
          )}
        </div>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-sparkline">
        <svg width="60" height="30" viewBox="0 0 60 30">
          <polyline
            points={trend === 'up' ? '0,25 15,20 30,15 45,8 60,5' : '0,20 15,18 30,15 45,15 60,14'}
            fill="none"
            stroke={trendColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />
        </svg>
      </div>
    </div>
  )
}
