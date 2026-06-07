import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Cpu, Key, Save, AlertCircle, Database, Check } from 'lucide-react';

export default function Settings({ token }) {
  const [provider, setProvider] = useState('local');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Fetch current setting configuration
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/documents/settings/api', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setProvider(data.provider);
          setHasKey(data.hasKey);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      }
    };
    fetchSettings();
  }, [token]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaveStatus('');

    try {
      const response = await fetch('/api/documents/settings/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          provider,
          apiKey: apiKey ? apiKey : undefined // Only send key if the user entered/changed it
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update API configurations');
      }

      setSaveStatus('success');
      setApiKey('');
      if (apiKey) setHasKey(true);
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setSaveStatus('error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={20} style={{ color: 'var(--primary)' }} />
          Extraction Engine Settings
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
          Choose between local heuristics & OCR or advanced LLM cloud models to handle text parsing and structural data mapping.
        </p>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group">
            <label className="form-label">Active Provider</label>
            <select
              className="form-control"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={loading}
              style={{ cursor: 'pointer' }}
            >
              <option value="local">Local Engine (Regex Heuristics & Local Tesseract.js OCR - 100% Free)</option>
              <option value="gemini">Google Gemini 1.5 Flash (Supports native PDF & Image OCR - Highly Recommended)</option>
              <option value="openai">OpenAI GPT-4o-mini (Supports Image OCR & text-based PDFs)</option>
            </select>
          </div>

          {provider !== 'local' && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', width: '100%' }}>
                <span>API Secret Key</span>
                {hasKey && (
                  <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: '600', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={12} /> Key Configured
                  </span>
                )}
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  className="form-control"
                  placeholder={hasKey ? "•••••••••••••••••••••••••••••••• (Leave blank to keep existing)" : "Enter your provider API key"}
                  style={{ paddingLeft: '40px' }}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={loading}
                />
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>
                {provider === 'gemini' ? (
                  <span>Obtain a Gemini API Key from the Google AI Studio console.</span>
                ) : (
                  <span>Obtain an OpenAI API Key from the OpenAI Developer platform dashboard.</span>
                )}
              </p>
            </div>
          )}

          {saveStatus === 'success' && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--success-bg)',
              color: 'var(--success)',
              border: '1px solid var(--success-border)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Check size={16} /> API configurations updated successfully!
            </div>
          )}

          {saveStatus === 'error' && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid var(--danger-border)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} /> Error saving API configurations.
            </div>
          )}

          <div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
              <Save size={16} />
              {loading ? 'Saving Settings...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={20} style={{ color: 'var(--primary)' }} />
          Local Database Overview
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Database statistics and status configurations.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', flex: '1 1 200px' }}>
            <div style={{ color: 'var(--text-muted)' }}>Database Type</div>
            <div style={{ fontWeight: '600', fontSize: '15px', marginTop: '4px' }}>SQLite 3 (Local File)</div>
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', flex: '1 1 200px' }}>
            <div style={{ color: 'var(--text-muted)' }}>Encryption</div>
            <div style={{ fontWeight: '600', fontSize: '15px', marginTop: '4px' }}>SHA-256 (Password Hashes)</div>
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', flex: '1 1 200px' }}>
            <div style={{ color: 'var(--text-muted)' }}>Storage Location</div>
            <div style={{ fontWeight: '600', fontSize: '15px', marginTop: '4px', fontFamily: 'monospace' }}>backend/docextract.db</div>
          </div>
        </div>
      </div>
    </div>
  );
}
