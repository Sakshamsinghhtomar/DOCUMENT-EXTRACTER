import React, { useState, useEffect } from 'react';
import { Search, Download, Trash2, Edit2, Check, Eye, X, Filter, AlertTriangle, FileSpreadsheet, FileText } from 'lucide-react';

export default function DataReviewTable({ token }) {
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(true);

  // Editing Cell State
  const [editingCell, setEditingCell] = useState(null); // { docId, fieldName, value }

  // Detail Modal State
  const [activeDoc, setActiveDoc] = useState(null); // Document details object
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchDocuments();
  }, [token]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
        if (data.length > 0) {
          // Default to the first template filter (e.g. Auto Insurance)
          setSelectedTemplateId(data[0].id.toString());
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Inline Cell Editing Handler
  const handleCellClick = (docId, fieldName, value) => {
    setEditingCell({ docId, fieldName, value });
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    const { docId, fieldName, value } = editingCell;

    try {
      // Find document in state
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;

      const response = await fetch(`/api/documents/${docId}/fields`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fields: [{ field_name: fieldName, value }]
        })
      });

      if (response.ok) {
        // Update local state
        setDocuments(documents.map(d => {
          if (d.id === docId) {
            const updatedFields = { ...d.fields };
            if (updatedFields[fieldName]) {
              updatedFields[fieldName].value = value;
              updatedFields[fieldName].confidence = 1.0; // Mark as verified
              updatedFields[fieldName].isEdited = true;
            } else {
              updatedFields[fieldName] = { value, confidence: 1.0, isEdited: true };
            }
            return { ...d, fields: updatedFields };
          }
          return d;
        }));
      }
    } catch (err) {
      console.error('Error saving field edit:', err);
    } finally {
      setEditingCell(null);
    }
  };

  const handleCellKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCellSave();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Detail Modal view handler
  const handleViewDetail = async (docId) => {
    try {
      const response = await fetch(`/api/documents/${docId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setActiveDoc(data);
        setModalOpen(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleModalFieldChange = (fieldName, val) => {
    if (!activeDoc) return;
    const updatedExtractions = activeDoc.extractions.map(ext => {
      if (ext.field_name === fieldName) {
        return { ...ext, extracted_value: val, confidence: 1.0, is_edited: 1 };
      }
      return ext;
    });
    setActiveDoc({ ...activeDoc, extractions: updatedExtractions });
  };

  const handleModalSaveFields = async () => {
    if (!activeDoc) return;
    
    try {
      const fieldsPayload = activeDoc.extractions.map(ext => ({
        field_name: ext.field_name,
        value: ext.extracted_value
      }));

      const response = await fetch(`/api/documents/${activeDoc.id}/fields`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fields: fieldsPayload })
      });

      if (response.ok) {
        setModalOpen(false);
        fetchDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Deletions
  const handleDeleteDoc = async (id) => {
    if (!window.confirm('Delete this record and all associated extractions?')) return;
    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setDocuments(documents.filter(d => d.id !== id));
        setSelectedDocs(selectedDocs.filter(docId => docId !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDocs.length === 0) return;
    if (!window.confirm(`Delete the ${selectedDocs.length} selected documents?`)) return;

    try {
      for (const docId of selectedDocs) {
        await fetch(`/api/documents/${docId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      fetchDocuments();
      setSelectedDocs([]);
    } catch (err) {
      console.error(err);
    }
  };

  // Bulk Exports
  const handleExport = async (format) => {
    if (selectedDocs.length === 0) {
      alert('Please select at least one document to export.');
      return;
    }

    try {
      const response = await fetch('/api/documents/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          documentIds: selectedDocs,
          format
        })
      });

      if (!response.ok) {
        throw new Error('Export generation failed');
      }

      // Read as blob and trigger browser download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `docextract_export_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  };

  // Selection toggles
  const handleSelectAll = (checked, filteredDocs) => {
    if (checked) {
      setSelectedDocs(filteredDocs.map(d => d.id));
    } else {
      setSelectedDocs([]);
    }
  };

  const handleSelectDoc = (docId, checked) => {
    if (checked) {
      setSelectedDocs([...selectedDocs, docId]);
    } else {
      setSelectedDocs(selectedDocs.filter(id => id !== docId));
    }
  };

  // Sorting
  const requestSort = (field) => {
    let order = 'asc';
    if (sortField === field && sortOrder === 'asc') {
      order = 'desc';
    }
    setSortField(field);
    setSortOrder(order);
  };

  // Confidence Styling Helper
  const getConfidenceClass = (score) => {
    if (score >= 0.9) return 'confidence-badge confidence-high';
    if (score >= 0.7) return 'confidence-badge confidence-medium';
    return 'confidence-badge confidence-low';
  };

  // Get active fields for selected template filter
  const currentTemplate = templates.find(t => t.id.toString() === selectedTemplateId);
  const activeFields = currentTemplate ? currentTemplate.fields : [];

  // Filter & Sort Logic
  const filteredDocuments = documents
    .filter(doc => {
      // 1. Filter by selected template type
      if (selectedTemplateId && doc.template_id?.toString() !== selectedTemplateId) {
        return false;
      }
      // 2. Search query matches filename
      if (searchQuery && !doc.filename.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle nested or date sorting
      if (sortField === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Filtering & Action Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
        
        <div style={{ display: 'flex', gap: '12px', flex: '1', minWidth: '300px' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search by filename..."
              style={{ paddingLeft: '38px', height: '40px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Template Filter */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Filter size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
            <select
              className="form-control"
              style={{ paddingLeft: '36px', height: '40px', cursor: 'pointer' }}
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                setSelectedDocs([]); // Reset selections on filter change
              }}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {selectedDocs.length > 0 && (
            <>
              <button className="btn btn-secondary" onClick={() => handleExport('xlsx')} style={{ height: '40px' }}>
                <FileSpreadsheet size={16} /> Export Selected (.xlsx)
              </button>
              <button className="btn btn-secondary" onClick={() => handleExport('csv')} style={{ height: '40px' }}>
                <FileText size={16} /> Export CSV
              </button>
              <button className="btn btn-danger" onClick={handleBulkDelete} style={{ height: '40px' }}>
                <Trash2 size={16} /> Delete Selected ({selectedDocs.length})
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Main Data Table Container */}
      <div className="table-container">
        {loading ? (
          <div className="pulse" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading document extractions...
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No records found. Try uploading a document with the active template first.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={selectedDocs.length > 0 && selectedDocs.length === filteredDocuments.length}
                    onChange={(e) => handleSelectAll(e.target.checked, filteredDocuments)}
                  />
                </th>
                <th onClick={() => requestSort('filename')} style={{ cursor: 'pointer' }}>
                  Filename {sortField === 'filename' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th onClick={() => requestSort('created_at')} style={{ cursor: 'pointer' }}>
                  Upload Date {sortField === 'created_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th>Status</th>
                {/* Render dynamic headers based on selected template definition */}
                {activeFields.map((field) => (
                  <th key={field.name}>{field.label}</th>
                ))}
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      className="checkbox-input"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={(e) => handleSelectDoc(doc.id, e.target.checked)}
                    />
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{doc.filename}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span className={`status-badge status-${doc.status.toLowerCase()}`}>
                      {doc.status}
                    </span>
                  </td>
                  {/* Render dynamic cells */}
                  {activeFields.map((field) => {
                    const fieldValObj = doc.fields[field.name] || { value: '', confidence: 0 };
                    const isEditing = editingCell && editingCell.docId === doc.id && editingCell.fieldName === field.name;

                    return (
                      <td key={field.name}>
                        {doc.status !== 'Completed' ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                        ) : isEditing ? (
                          <input
                            type="text"
                            className="cell-edit-input"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleCellSave}
                            onKeyDown={handleCellKeyDown}
                            autoFocus
                          />
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div
                              className="editable-cell"
                              onClick={() => handleCellClick(doc.id, field.name, fieldValObj.value)}
                              title="Click to correct value inline"
                            >
                              {fieldValObj.value || <span style={{ color: 'var(--danger)', fontStyle: 'italic', fontSize: '12px' }}>Missing</span>}
                            </div>
                            {fieldValObj.value && fieldValObj.confidence < 1.0 && (
                              <div>
                                <span className={getConfidenceClass(fieldValObj.confidence)}>
                                  {Math.round(fieldValObj.confidence * 100)}% Match
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px' }}
                        title="View visual OCR split pane"
                        onClick={() => handleViewDetail(doc.id)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px', color: 'var(--danger)' }}
                        title="Delete record"
                        onClick={() => handleDeleteDoc(doc.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Detail Splitted Modal Overlay */}
      {modalOpen && activeDoc && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '1000px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            
            {/* Left Column: Visual Document Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid var(--border-color)', paddingRight: '24px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Source File Preview</h4>
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                height: '480px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative'
              }}>
                {activeDoc.file_type.includes('image') ? (
                  <img
                    src={`/uploads/${path.basename(activeDoc.file_path)}`}
                    alt="Document preview"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : activeDoc.file_type.includes('pdf') ? (
                  <iframe
                    src={`/uploads/${path.basename(activeDoc.file_path)}`}
                    title="PDF viewer"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    <AlertTriangle size={32} style={{ color: 'var(--warning)', marginBottom: '8px' }} />
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Visual preview unavailable</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>For Word and Excel files, verify fields directly.</div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Editable Mappings Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>

              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Review Extracted Entities</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                Verify and edit mapped fields extracted by the {activeDoc.status === 'Completed' ? 'OCR/AI pipeline' : 'system'}. Saving will re-validate structural database fields.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '380px', paddingRight: '8px' }}>
                {activeDoc.extractions.map((ext) => (
                  <div key={ext.id} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{ext.field_name.replace(/_/g, ' ').toUpperCase()}</span>
                      <span className={getConfidenceClass(ext.confidence)}>
                        {ext.confidence === 1.0 ? 'Verified' : `${Math.round(ext.confidence * 100)}% Match`}
                      </span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={ext.extracted_value || ''}
                      onChange={(e) => handleModalFieldChange(ext.field_name, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button className="btn btn-primary" onClick={handleModalSaveFields}>
                  <Check size={16} /> Save Changes
                </button>
                <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
