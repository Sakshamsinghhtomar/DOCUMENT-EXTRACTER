import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileSpreadsheet, Layers, Settings, LogOut, Sun, Moon, BrainCircuit, User } from 'lucide-react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import DataReviewTable from './components/DataReviewTable';
import Templates from './components/Templates';
import SettingsView from './components/Settings';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [activeView, setActiveView] = useState('dashboard'); // dashboard, history, templates, settings
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleLogin = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    setActiveView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
  };

  // Render correct sub-view
  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard token={token} onViewChange={setActiveView} />;
      case 'history':
        return <DataReviewTable token={token} />;
      case 'templates':
        return <Templates token={token} />;
      case 'settings':
        return <SettingsView token={token} />;
      default:
        return <Dashboard token={token} onViewChange={setActiveView} />;
    }
  };

  const getViewTitle = () => {
    switch (activeView) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'history':
        return 'Extracted Mapped Records';
      case 'templates':
        return 'Custom Schema Definitions';
      case 'settings':
        return 'System & AI Settings';
      default:
        return 'DocExtract AI';
    }
  };

  const getViewDescription = () => {
    switch (activeView) {
      case 'dashboard':
        return 'Upload documents to run OCR/AI extraction pipelines.';
      case 'history':
        return 'Review, edit, and bulk export compiled entities.';
      case 'templates':
        return 'Configure columns and custom fields mapping layouts.';
      case 'settings':
        return 'Select extraction providers, update API keys, and monitor storage.';
      default:
        return '';
    }
  };

  // Guard routing for authorization
  if (!token) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      {/* 1. Navigation Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <BrainCircuit size={20} />
          </div>
          <span className="logo-text">DocExtract AI</span>
        </div>

        <ul className="sidebar-menu">
          <li
            className={`menu-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            <LayoutDashboard />
            <span>Dashboard</span>
          </li>
          <li
            className={`menu-item ${activeView === 'history' ? 'active' : ''}`}
            onClick={() => setActiveView('history')}
          >
            <FileSpreadsheet />
            <span>Data Review</span>
          </li>
          <li
            className={`menu-item ${activeView === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveView('templates')}
          >
            <Layers />
            <span>Templates</span>
          </li>
          <li
            className={`menu-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveView('settings')}
          >
            <Settings />
            <span>Settings</span>
          </li>
        </ul>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              <User size={18} />
            </div>
            <div className="user-details">
              <div className="user-name">{user?.username || 'Admin'}</div>
              <div className="user-role">{user?.role || 'User'}</div>
            </div>
          </div>
          
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
            style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'var(--bg-tertiary)' }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Work Panel */}
      <main className="main-content">
        <header className="top-bar">
          <div className="page-header">
            <h1>{getViewTitle()}</h1>
            <p>{getViewDescription()}</p>
          </div>

          <div className="top-actions">
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle Dark/Light Mode">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        {/* 3. Panel Render */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {renderView()}
        </section>
      </main>
    </div>
  );
}
