import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, CheckCircle, AlertCircle, Database, HelpCircle, Layers, Star, Play, Check } from 'lucide-react';

export default function Dashboard({ token, onViewChange }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [stats, setStats] = useState({ totalDocs: 0, avgConfidence: 91, activeTemplates: 0 });
  
  // Upload States
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]); // Array of { name, step, status }
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchTemplates();
    fetchStats();
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
          setSelectedTemplateId(data[0].id.toString());
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const completed = data.filter(d => d.status === 'Completed');
        
        let sumConf = 0;
        let countConf = 0;
        
        data.forEach(d => {
          Object.keys(d.fields).forEach(fieldName => {
            sumConf += d.fields[fieldName].confidence;
            countConf++;
          });
        });

        const avg = countConf > 0 ? Math.round((sumConf / countConf) * 100) : 92;

        setStats({
          totalDocs: data.length,
          avgConfidence: avg,
          activeTemplates: templates.length || 1
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Drag & Drop Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFilesUpload(e.target.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  // Main Upload and Processing Pipeline
  const handleFilesUpload = async (filesList) => {
    if (!selectedTemplateId) {
      alert('Please select or create an extraction template first.');
      return;
    }

    const files = Array.from(filesList);
    setUploading(true);
    
    // Initialize progress items
    const initialProgress = files.map(file => ({
      name: file.name,
      step: 1, // 1: Uploading, 2: OCR Parsing, 3: AI Extracting, 4: Finished
      status: 'pending' // pending, success, error
    }));
    setUploadProgress(initialProgress);

    // If single file, we will wait and show dynamic steps
    if (files.length === 1) {
      const file = files[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('templateId', selectedTemplateId);

      try {
        // Step 1: Uploading
        setUploadProgress([{ name: file.name, step: 1, status: 'active' }]);
        
        // Wait 1.2s to mock beautiful step transitions
        await new Promise(r => setTimeout(r, 1200));
        
        // Step 2: OCR Parsing
        setUploadProgress([{ name: file.name, step: 2, status: 'active' }]);
        await new Promise(r => setTimeout(r, 1200));

        // Step 3: AI Extracting
        setUploadProgress([{ name: file.name, step: 3, status: 'active' }]);

        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error('Upload or extraction failed');
        }

        // Step 4: Complete
        setUploadProgress([{ name: file.name, step: 4, status: 'success' }]);
        fetchStats();
        setTimeout(() => {
          setUploading(false);
          onViewChange('history');
        }, 1500);

      } catch (err) {
        setUploadProgress([{ name: file.name, step: 3, status: 'error' }]);
        console.error(err);
        setTimeout(() => setUploading(false), 3000);
      }
    } else {
      // Bulk processing: Use upload-batch endpoint
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('templateId', selectedTemplateId);

      try {
        // Mock parallel batch step transitions
        setUploadProgress(files.map(f => ({ name: f.name, step: 1, status: 'active' })));
        
        const response = await fetch('/api/documents/upload-batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error('Batch processing failed');
        }

        const data = await response.json();

        // Animate progression of bulk items
        await new Promise(r => setTimeout(r, 1500));
        setUploadProgress(files.map(f => ({ name: f.name, step: 2, status: 'active' })));
        
        await new Promise(r => setTimeout(r, 1500));
        setUploadProgress(files.map(f => ({ name: f.name, step: 3, status: 'active' })));

        await new Promise(r => setTimeout(r, 1500));
        setUploadProgress(files.map(f => ({ name: f.name, step: 4, status: 'success' })));

        fetchStats();
        setTimeout(() => {
          setUploading(false);
          onViewChange('history');
        }, 2000);

      } catch (err) {
        setUploadProgress(files.map(f => ({ name: f.name, step: 3, status: 'error' })));
        console.error(err);
        setTimeout(() => setUploading(false), 3000);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* 1. Stat Summary Cards */}
      <div className="dashboard-grid">
        <div className="card stat-card">
          <div className="stat-icon">
            <FileText />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Documents</span>
            <span className="stat-value">{stats.totalDocs}</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
            <Star />
          </div>
          <div className="stat-info">
            <span className="stat-label">Average Accuracy</span>
            <span className="stat-value">{stats.avgConfidence}%</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
            <Layers />
          </div>
          <div className="stat-info">
            <span className="stat-label">Active Templates</span>
            <span className="stat-value">{templates.length}</span>
          </div>
        </div>
      </div>

      {/* 2. Drag & Drop Upload Portal */}
      <div className="card" style={{ padding: '36px' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <span>Upload New Documents</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>Apply Template:</span>
            <select
              className="form-control"
              style={{ width: '220px', padding: '6px 12px', fontSize: '13px' }}
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={uploading}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </h3>

        {!uploading ? (
          <div
            className={`upload-container ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
            />
            <div className="upload-icon">
              <Upload size={28} />
            </div>
            <p className="upload-text">Drag and drop documents here, or click to browse</p>
            <p className="upload-subtext">Supports PDF, Scanned Images (JPG, PNG), Word (DOCX) and Excel (XLSX)</p>
          </div>
        ) : (
          // UPLOADING PIPELINE PANEL
          <div style={{ padding: '24px', textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Database className="spinning" size={18} /> Processing Document Extraction...
            </h4>
            
            <div style={{ maxWidth: '500px', margin: '32px auto 0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {uploadProgress.map((item, idx) => (
                <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '16px 20px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
                    <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                      {item.name}
                    </span>
                    <span style={{ color: item.status === 'error' ? 'var(--danger)' : 'var(--primary)' }}>
                      {item.status === 'error' ? 'Failed' : item.step === 4 ? 'Ready' : 'In Progress'}
                    </span>
                  </div>

                  <div className="progress-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', flexDirection: 'row', gap: '8px', marginTop: 0 }}>
                    <div className={`step-item ${item.step >= 1 ? 'completed' : ''} ${item.step === 1 && item.status === 'active' ? 'active' : ''} ${item.status === 'error' && item.step === 1 ? 'error' : ''}`}>
                      <div className="step-indicator" style={{ margin: '0 auto' }}>
                        {item.step > 1 ? <Check size={12} /> : '1'}
                      </div>
                      <span className="step-label" style={{ display: 'block', fontSize: '10px', textAlign: 'center', marginTop: '4px' }}>Upload</span>
                    </div>

                    <div className={`step-item ${item.step >= 2 ? 'completed' : ''} ${item.step === 2 && item.status === 'active' ? 'active' : ''} ${item.status === 'error' && item.step === 2 ? 'error' : ''}`}>
                      <div className="step-indicator" style={{ margin: '0 auto' }}>
                        {item.step > 2 ? <Check size={12} /> : '2'}
                      </div>
                      <span className="step-label" style={{ display: 'block', fontSize: '10px', textAlign: 'center', marginTop: '4px' }}>OCR Parse</span>
                    </div>

                    <div className={`step-item ${item.step >= 3 ? 'completed' : ''} ${item.step === 3 && item.status === 'active' ? 'active' : ''} ${item.status === 'error' && item.step === 3 ? 'error' : ''}`}>
                      <div className="step-indicator" style={{ margin: '0 auto' }}>
                        {item.step > 3 ? <Check size={12} /> : '3'}
                      </div>
                      <span className="step-label" style={{ display: 'block', fontSize: '10px', textAlign: 'center', marginTop: '4px' }}>AI Extract</span>
                    </div>

                    <div className={`step-item ${item.step >= 4 ? 'completed' : ''} ${item.status === 'error' ? 'error' : ''}`}>
                      <div className="step-indicator" style={{ margin: '0 auto' }}>
                        {item.step === 4 ? <Check size={12} /> : '4'}
                      </div>
                      <span className="step-label" style={{ display: 'block', fontSize: '10px', textAlign: 'center', marginTop: '4px' }}>Map Fields</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Helper Info Card */}
      <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', background: 'var(--gradient-glow)' }}>
        <div style={{ color: 'var(--primary)', padding: '4px' }}>
          <HelpCircle size={24} />
        </div>
        <div>
          <h4 style={{ fontSize: '15px', fontWeight: 600 }}>Smart Multi-Format Parser</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', lineHeight: 1.6 }}>
            DocExtract AI analyzes the document structure dynamically. Scanned images are automatically routed to the Tesseract OCR engine, digital documents (PDF, Word, Excel) are read natively, and templates compile layout schema bindings. Configure your Google Gemini or OpenAI API keys in the <strong>Settings</strong> tab for premium precision.
          </p>
        </div>
      </div>
    </div>
  );
}
