import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AnalyzeContract from './pages/AnalyzeContract.jsx'
import MyContracts from './pages/MyContracts.jsx'
import Reports from './pages/Reports.jsx'
import './App.css'

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [viewContractId, setViewContractId] = useState(null)

  const handleNavigate = (page, extra) => {
    if (page === 'view-contract' && extra) {
      setViewContractId(extra)
      setActivePage('contracts')
    } else {
      setViewContractId(null)
      setActivePage(page)
    }
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':  return <Dashboard onNavigate={handleNavigate} />
      case 'analyze':    return <AnalyzeContract onNavigate={handleNavigate} />
      case 'contracts':  return <MyContracts onNavigate={handleNavigate} viewId={viewContractId} />
      case 'reports':    return <Reports onNavigate={handleNavigate} />
      default:           return <Dashboard onNavigate={handleNavigate} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <div className="main-area">{renderPage()}</div>
    </div>
  )
}
