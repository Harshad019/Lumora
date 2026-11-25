const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON payloads (limit set safely for metadata payloads)
app.use(express.json({ limit: '1mb' }));

// Serve static frontend assets from the public directory
app.use(express.static(path.join(__dirname, 'public')));

const dashboardRoutes = require('./server/routes/dashboards');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'InsightBoard API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Dashboard management routes
app.use('/api/dashboards', dashboardRoutes);

// Fallback for unrecognized API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server if this file is run directly
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` InsightBoard server running at:`);
    console.log(` http://localhost:${PORT}`);
    console.log(`===============================================`);
  });

  const shutdown = () => {
    console.log('\nGracefully shutting down InsightBoard server...');
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
