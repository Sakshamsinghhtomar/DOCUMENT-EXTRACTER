const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { dbRun, dbGet, dbAll } = require('../db');
const { authenticateToken } = require('./auth');
const { extractDocumentData } = require('../services/extractor');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure config file exists
const configPath = path.join(__dirname, '../config.json');
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({ provider: 'local', apiKey: '' }), 'utf8');
}

// Helper to get active AI settings
const getApiSettings = () => {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { provider: 'local', apiKey: '' };
  }
};

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, PNG, DOCX, and XLSX are supported.'));
    }
  }
});

// GET all documents (with their extracted data)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const docs = await dbAll(`
      SELECT d.*, t.name as template_name 
      FROM documents d
      LEFT JOIN templates t ON d.template_id = t.id
      ORDER BY d.created_at DESC
    `);

    // Fetch extractions for each document
    const results = await Promise.all(
      docs.map(async (doc) => {
        const extractions = await dbAll(
          'SELECT field_name, extracted_value, confidence, is_edited FROM extractions WHERE document_id = ?',
          [doc.id]
        );
        
        const fieldsMap = {};
        extractions.forEach((ext) => {
          fieldsMap[ext.field_name] = {
            value: ext.extracted_value,
            confidence: ext.confidence,
            isEdited: ext.is_edited === 1
          };
        });

        return {
          ...doc,
          fields: fieldsMap
        };
      })
    );

    res.json(results);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Server error listing documents' });
  }
});

// GET single document details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const doc = await dbGet(`
      SELECT d.*, t.name as template_name, t.fields as template_fields
      FROM documents d
      LEFT JOIN templates t ON d.template_id = t.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const extractions = await dbAll(
      'SELECT id, field_name, extracted_value, confidence, is_edited FROM extractions WHERE document_id = ?',
      [doc.id]
    );

    res.json({
      ...doc,
      template_fields: JSON.parse(doc.template_fields || '[]'),
      extractions
    });
  } catch (error) {
    console.error('Error fetching document details:', error);
    res.status(500).json({ error: 'Server error fetching document' });
  }
});

// Process extraction helper
const processDocumentExtraction = async (docId, filePath, fileType, templateId) => {
  try {
    // 1. Fetch template fields
    const template = await dbGet('SELECT fields FROM templates WHERE id = ?', [templateId]);
    if (!template) throw new Error('Template not found');

    const fields = JSON.parse(template.fields);

    // 2. Run extraction
    const apiSettings = getApiSettings();
    const extractedData = await extractDocumentData(filePath, fileType, fields, apiSettings);

    // 3. Save extractions to database
    for (const fieldName of Object.keys(extractedData)) {
      const fieldResult = extractedData[fieldName];
      await dbRun(
        'INSERT INTO extractions (document_id, field_name, extracted_value, confidence, is_edited) VALUES (?, ?, ?, ?, 0)',
        [docId, fieldName, fieldResult.value ? String(fieldResult.value) : '', fieldResult.confidence || 1.0]
      );
    }

    // 4. Update document status
    await dbRun(
      "UPDATE documents SET status = 'Completed' WHERE id = ?",
      [docId]
    );
  } catch (error) {
    console.error(`Extraction failed for document ID ${docId}:`, error);
    await dbRun(
      "UPDATE documents SET status = 'Failed', error_message = ? WHERE id = ?",
      [error.message, docId]
    );
  }
};

// POST single upload & extract
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const { templateId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  if (!templateId) {
    return res.status(400).json({ error: 'Template ID is required' });
  }

  try {
    const filename = req.file.originalname;
    const filePath = req.file.path;
    const fileType = req.file.mimetype;

    // Create pending database record
    const result = await dbRun(
      "INSERT INTO documents (filename, file_path, file_type, status, template_id, user_id) VALUES (?, ?, ?, 'Processing', ?, ?)",
      [filename, filePath, fileType, templateId, req.user.id]
    );

    const docId = result.id;

    // Run extraction asynchronously so user gets immediate response or we can wait
    // We will await it for single upload so that we return the fresh data directly
    await processDocumentExtraction(docId, filePath, fileType, templateId);

    // Return the completed document data
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [docId]);
    const extractions = await dbAll('SELECT * FROM extractions WHERE document_id = ?', [docId]);

    res.status(201).json({
      message: 'Document uploaded and processed successfully',
      document: doc,
      extractions
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error processing file' });
  }
});

// POST batch upload & extract
router.post('/upload-batch', authenticateToken, upload.array('files', 10), async (req, res) => {
  const { templateId } = req.body;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  if (!templateId) {
    return res.status(400).json({ error: 'Template ID is required' });
  }

  try {
    const files = req.files;
    const docIds = [];

    // Create database records for all files
    for (const file of files) {
      const result = await dbRun(
        "INSERT INTO documents (filename, file_path, file_type, status, template_id, user_id) VALUES (?, ?, ?, 'Processing', ?, ?)",
        [file.originalname, file.path, file.mimetype, templateId, req.user.id]
      );
      docIds.push({
        id: result.id,
        filename: file.originalname,
        filePath: file.path,
        fileType: file.mimetype
      });
    }

    // Process extractions sequentially (or concurrently in background)
    // To give the client a quick response, we trigger the processing in the background and respond
    // with the documents lists. The frontend can poll or we can send them immediately.
    // Let's run it concurrently in background.
    docIds.forEach((doc) => {
      processDocumentExtraction(doc.id, doc.filePath, doc.fileType, templateId);
    });

    res.status(201).json({
      message: 'Batch upload successfully queued. Files are processing.',
      documents: docIds.map(d => ({ id: d.id, filename: d.filename, status: 'Processing' }))
    });
  } catch (error) {
    console.error('Batch upload error:', error);
    res.status(500).json({ error: 'Server error processing batch files' });
  }
});

// PUT update document fields (editable interface)
router.put('/:id/fields', authenticateToken, async (req, res) => {
  const { fields } = req.body; // Array of { field_name, value }

  if (!fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: 'Fields array is required' });
  }

  try {
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    for (const field of fields) {
      // Update value and mark as edited, set confidence to 1.0 (since user verified it)
      await dbRun(
        'UPDATE extractions SET extracted_value = ?, confidence = 1.0, is_edited = 1 WHERE document_id = ? AND field_name = ?',
        [String(field.value), doc.id, field.field_name]
      );
    }

    res.json({ message: 'Fields updated successfully' });
  } catch (error) {
    console.error('Error updating fields:', error);
    res.status(500).json({ error: 'Server error updating fields' });
  }
});

// DELETE document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete file from storage
    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    // Delete DB entries (cascading extractions via DELETE trigger or manually)
    await dbRun('DELETE FROM extractions WHERE document_id = ?', [doc.id]);
    await dbRun('DELETE FROM documents WHERE id = ?', [doc.id]);

    res.json({ message: 'Document and extractions deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Server error deleting document' });
  }
});

// POST Export documents to Excel/CSV
router.post('/export', authenticateToken, async (req, res) => {
  const { documentIds, format } = req.body; // format = 'xlsx' or 'csv'

  if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
    return res.status(400).json({ error: 'Document IDs are required' });
  }

  try {
    // 1. Fetch document and template details
    const docs = await dbAll(`
      SELECT d.id, d.filename, d.created_at, t.name as template_name, t.fields as template_fields
      FROM documents d
      LEFT JOIN templates t ON d.template_id = t.id
      WHERE d.id IN (${documentIds.map(() => '?').join(',')})
    `, documentIds);

    if (docs.length === 0) {
      return res.status(404).json({ error: 'No documents found for export' });
    }

    // 2. Fetch extractions for these documents
    const extractions = await dbAll(`
      SELECT document_id, field_name, extracted_value
      FROM extractions
      WHERE document_id IN (${documentIds.map(() => '?').join(',')})
    `, documentIds);

    // Group extractions by document
    const extMap = {};
    extractions.forEach((ext) => {
      if (!extMap[ext.document_id]) extMap[ext.document_id] = {};
      extMap[ext.document_id][ext.field_name] = ext.extracted_value;
    });

    // 3. Compile spreadsheet data
    const spreadsheetData = docs.map((doc) => {
      const row = {
        'Document ID': doc.id,
        'File Name': doc.filename,
        'Template Used': doc.template_name,
        'Uploaded Date': new Date(doc.created_at).toLocaleString()
      };

      // Extract template fields
      const fields = JSON.parse(doc.template_fields || '[]');
      fields.forEach((field) => {
        const docExts = extMap[doc.id] || {};
        row[field.label || field.name] = docExts[field.name] || '';
      });

      return row;
    });

    // 4. Generate XLSX/CSV
    const worksheet = xlsx.utils.json_to_sheet(spreadsheetData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Extracted Data');

    if (format === 'csv') {
      const csvContent = xlsx.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=extracted_data_${Date.now()}.csv`);
      return res.send(csvContent);
    } else {
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=extracted_data_${Date.now()}.xlsx`);
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Server error generating export' });
  }
});

// GET active API Settings
router.get('/settings/api', authenticateToken, (req, res) => {
  const settings = getApiSettings();
  res.json({
    provider: settings.provider,
    hasKey: !!settings.apiKey // Only send boolean, keep key hidden for security
  });
});

// POST update API Settings
router.post('/settings/api', authenticateToken, (req, res) => {
  const { provider, apiKey } = req.body;

  if (!provider) {
    return res.status(400).json({ error: 'Provider is required' });
  }

  try {
    const currentSettings = getApiSettings();
    const newSettings = {
      provider,
      apiKey: apiKey !== undefined ? apiKey : currentSettings.apiKey // Update key only if supplied
    };

    fs.writeFileSync(configPath, JSON.stringify(newSettings), 'utf8');
    res.json({ message: 'API settings updated successfully' });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Server error saving settings' });
  }
});

module.exports = router;
