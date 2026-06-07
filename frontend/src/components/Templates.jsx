import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Save, X, Layers, AlertCircle, Sparkles } from 'lucide-react';

export default function Templates({ token }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  
  // Form States
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([]);
  
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, [token]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/templates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartCreate = () => {
    setEditingTemplate({ id: 'new' });
    setName('');
    setDescription('');
    setFields([
      { name: 'insured_name', label: 'Insured Name', type: 'text', required: true },
      { name: 'policy_number', label: 'Policy Number', type: 'text', required: true }
    ]);
  };

  const handleStartEdit = (template) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description);
    setFields([...template.fields]);
  };

  const handleAddField = () => {
    setFields([...fields, { name: '', label: '', type: 'text', required: false }]);
  };

  const handleRemoveField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index, key, value) => {
    const updated = [...fields];
    updated[index][key] = value;
    
    // Auto-generate name slug if label is typed
    if (key === 'label' && !updated[index].name) {
      updated[index].name = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }
    
    setFields(updated);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    if (fields.length === 0) {
      setError('Template must contain at least one field');
      return;
    }

    // Validate fields
    const invalidField = fields.some(f => !f.name.trim() || !f.label.trim());
    if (invalidField) {
      setError('All fields must have a valid Name and Label');
      return;
    }

    try {
      const isNew = editingTemplate.id === 'new';
      const url = isNew ? '/api/templates' : `/api/templates/${editingTemplate.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, description, fields })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setEditingTemplate(null);
      fetchTemplates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template? Any document uploaded with this template will loose template definitions.')) {
      return;
    }

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        fetchTemplates();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && templates.length === 0) {
    return <div className="pulse" style={{ textAlign: 'center', padding: '40px' }}>Loading templates...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {editingTemplate ? (
        // EDIT / CREATE FORM CARD
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              {editingTemplate.id === 'new' ? 'Create Custom Extraction Template' : 'Edit Extraction Template'}
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditingTemplate(null)}>
              <X size={16} /> Cancel
            </button>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid var(--danger-border)',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Template Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Health Insurance Plan, Invoice Schema"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="What document layout is this for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Predefined Fields ({fields.length})</h4>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddField}>
                  <Plus size={14} /> Add Field Row
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {fields.map((field, index) => (
                  <div key={index} className="template-field-item">
                    <div style={{ flex: 2 }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Field Label (e.g. Policy Number)"
                        value={field.label}
                        onChange={(e) => handleFieldChange(index, 'label', e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ flex: 2 }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Database key slug (e.g. policy_no)"
                        value={field.name}
                        onChange={(e) => handleFieldChange(index, 'name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        required
                      />
                    </div>
                    <div style={{ flex: 1.5 }}>
                      <select
                        className="form-control"
                        value={field.type}
                        onChange={(e) => handleFieldChange(index, 'type', e.target.value)}
                      >
                        <option value="text">Text / String</option>
                        <option value="number">Numeric Value</option>
                        <option value="date">Date</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
                      <label className="checkbox-label" style={{ fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          className="checkbox-input"
                          checked={field.required}
                          onChange={(e) => handleFieldChange(index, 'required', e.target.checked)}
                        />
                        Required
                      </label>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ border: 'none', color: 'var(--danger)', padding: '8px' }}
                        onClick={() => handleRemoveField(index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button type="submit" className="btn btn-primary">
                <Save size={16} /> Save Template
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingTemplate(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        // TEMPLATE LIST VIEW
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Active Mapping Templates</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                Select or edit document definitions containing columns mapped during OCR/AI extraction.
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleStartCreate}>
              <Plus size={16} /> Create Template
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {templates.map((template) => (
              <div key={template.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{template.name}</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>{template.description || 'No description provided'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '6px' }}
                      title="Edit template fields"
                      onClick={() => handleStartEdit(template)}
                    >
                      <Edit size={14} />
                    </button>
                    {template.id !== 1 && ( // Restrict deleting seeded admin template
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px', color: 'var(--danger)' }}
                        title="Delete template"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Mapped Fields ({template.fields.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {template.fields.map((f, i) => (
                      <span key={i} className="badge-blue" style={{ fontSize: '11px' }}>
                        {f.label} {f.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
