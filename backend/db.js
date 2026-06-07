const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'docextract.db');
const db = new sqlite3.Database(dbPath);

// Helper functions to wrap sqlite3 queries in Promises
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize the database tables
const initDb = async () => {
  // Users Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'User',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Templates Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      fields TEXT NOT NULL, -- JSON array of fields: [{"name": "insured_name", "label": "Insured Name", "type": "text", "required": true}]
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Documents Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      status TEXT DEFAULT 'Uploaded', -- 'Uploaded', 'Processing', 'Completed', 'Failed'
      error_message TEXT,
      template_id INTEGER,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(template_id) REFERENCES templates(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Extractions Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      extracted_value TEXT,
      confidence REAL DEFAULT 1.0,
      is_edited INTEGER DEFAULT 0, -- 0 = false, 1 = true
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  // API Keys Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Seed default Admin User if not exists
  const adminExists = await dbGet('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!adminExists) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin123', salt);
    await dbRun(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      ['admin', hash, 'Admin']
    );
    console.log('Seeded default Admin user (admin / admin123)');
  }

  // Seed a default template for Motor/Auto Insurance policies
  const templateExists = await dbGet("SELECT * FROM templates WHERE name = 'Auto Insurance Policy'");
  if (!templateExists) {
    const defaultFields = [
      { name: 'insured_name', label: 'Insured Name', type: 'text', required: true },
      { name: 'policy_number', label: 'Policy Number', type: 'text', required: true },
      { name: 'vehicle_number', label: 'Vehicle Number', type: 'text', required: false },
      { name: 'idv', label: 'Insured Declared Value (IDV)', type: 'number', required: false },
      { name: 'start_date', label: 'Insurance Start Date', type: 'date', required: true },
      { name: 'end_date', label: 'Insurance Expired Date', type: 'date', required: true },
      { name: 'phone_number', label: 'Phone Number', type: 'text', required: false },
      { name: 'od_premium', label: 'OD Premium', type: 'number', required: false },
      { name: 'tp_premium', label: 'Third Party Premium (TP)', type: 'number', required: false },
      { name: 'ncb', label: 'No Claim Bonus (NCB %)', type: 'text', required: false }
    ];

    await dbRun(
      'INSERT INTO templates (name, description, fields, user_id) VALUES (?, ?, ?, ?)',
      [
        'Auto Insurance Policy',
        'Standard layout for car and two-wheeler insurance schedules.',
        JSON.stringify(defaultFields),
        1 // Admin user id
      ]
    );
    console.log('Seeded default Auto Insurance Policy template');
  }
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDb
};
