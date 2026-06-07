const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { initDb } = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve Uploaded Files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import Routes
const { router: authRouter } = require('./routes/auth');
const templatesRouter = require('./routes/templates');
const documentsRouter = require('./routes/documents');

// Route Middlewares
app.use('/api/auth', authRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/documents', documentsRouter);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Database Initialization and Server Start
const start = async () => {
  try {
    console.log('Initializing database...');
    await initDb();
    console.log('Database initialized successfully.');

    app.listen(PORT, () => {
      console.log(`DocExtract AI Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Database initialization failed. Server not started.', error);
    process.exit(1);
  }
};

start();
