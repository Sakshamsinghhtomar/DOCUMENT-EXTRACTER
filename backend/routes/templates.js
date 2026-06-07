const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db');
const { authenticateToken } = require('./auth');

// GET all templates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const templates = await dbAll('SELECT * FROM templates ORDER BY name ASC');
    const formattedTemplates = templates.map(t => ({
      ...t,
      fields: JSON.parse(t.fields)
    }));
    res.json(formattedTemplates);
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: 'Server error listing templates' });
  }
});

// GET template by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const template = await dbGet('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    template.fields = JSON.parse(template.fields);
    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Server error fetching template' });
  }
});

// POST create template
router.post('/', authenticateToken, async (req, res) => {
  const { name, description, fields } = req.body;

  if (!name || !fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: 'Template name and a valid fields array are required' });
  }

  try {
    const fieldsJson = JSON.stringify(fields);
    const result = await dbRun(
      'INSERT INTO templates (name, description, fields, user_id) VALUES (?, ?, ?, ?)',
      [name, description || '', fieldsJson, req.user.id]
    );

    res.status(201).json({
      message: 'Template created successfully',
      template: {
        id: result.id,
        name,
        description,
        fields
      }
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Server error creating template' });
  }
});

// PUT update template
router.put('/:id', authenticateToken, async (req, res) => {
  const { name, description, fields } = req.body;

  if (!name || !fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: 'Template name and fields array are required' });
  }

  try {
    const template = await dbGet('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const fieldsJson = JSON.stringify(fields);
    await dbRun(
      'UPDATE templates SET name = ?, description = ?, fields = ? WHERE id = ?',
      [name, description || '', fieldsJson, req.params.id]
    );

    res.json({
      message: 'Template updated successfully',
      template: {
        id: req.params.id,
        name,
        description,
        fields
      }
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Server error updating template' });
  }
});

// DELETE template
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const template = await dbGet('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await dbRun('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Server error deleting template' });
  }
});

module.exports = router;
