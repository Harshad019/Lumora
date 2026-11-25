/**
 * REST API Endpoints for Dashboard Management.
 * Enforces strict privacy boundaries (rejects raw CSV rows).
 */

const express = require('express');
const router = express.Router();
const { dbOps } = require('../db/database');

/**
 * Privacy guard middleware:
 * Ensures no raw dataset row arrays are received in request payloads.
 */
function enforcePrivacyBoundary(req, res, next) {
  const body = req.body || {};

  // Reject payloads attempting to send raw data records
  if (body.data || body.rows || body.records || body.rawCSV) {
    return res.status(400).json({
      error: 'Privacy violation: Raw CSV rows or dataset records cannot be sent to the backend.'
    });
  }

  // Ensure dataset_signature only contains schema metadata
  if (body.dataset_signature) {
    try {
      const sig = typeof body.dataset_signature === 'string'
        ? JSON.parse(body.dataset_signature)
        : body.dataset_signature;

      if (sig && (sig.data || sig.rows || sig.records)) {
        return res.status(400).json({
          error: 'Privacy violation: dataset_signature must contain only schema metadata, not row data.'
        });
      }
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid JSON format in dataset_signature.'
      });
    }
  }

  // Ensure layout_config does not contain embedded raw rows
  if (body.layout_config) {
    try {
      const layout = typeof body.layout_config === 'string'
        ? JSON.parse(body.layout_config)
        : body.layout_config;

      if (layout) {
        if (layout.data || layout.rows || layout.records) {
          return res.status(400).json({
            error: 'Privacy violation: layout_config must contain only layout configuration, not raw rows.'
          });
        }
        if (Array.isArray(layout)) {
          for (const item of layout) {
            if (item && (item.data || item.rows || item.records)) {
              return res.status(400).json({
                error: 'Privacy violation: layout_config items cannot contain raw rows.'
              });
            }
          }
        }
      }
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid JSON format in layout_config.'
      });
    }
  }

  next();
}

// 1. GET /api/dashboards - List all saved dashboards (metadata summary)
router.get('/', (req, res) => {
  try {
    const dashboards = dbOps.getAllDashboards();
    res.json(dashboards);
  } catch (err) {
    console.error('Error listing dashboards:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboards.' });
  }
});

// 2. GET /api/dashboards/:id - Retrieve full dashboard configuration
router.get('/:id', (req, res) => {
  try {
    const dashboard = dbOps.getDashboardById(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: `Dashboard with ID "${req.params.id}" not found.` });
    }
    res.json(dashboard);
  } catch (err) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboard configuration.' });
  }
});

// 3. POST /api/dashboards - Create a new dashboard configuration
router.post('/', enforcePrivacyBoundary, (req, res) => {
  try {
    const { title, description, dataset_signature, layout_config, id } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Dashboard title is required.' });
    }

    if (!dataset_signature) {
      return res.status(400).json({ error: 'dataset_signature metadata is required.' });
    }

    if (!layout_config) {
      return res.status(400).json({ error: 'layout_config is required.' });
    }

    const created = dbOps.createDashboard({
      id,
      title: title.trim(),
      description: description || '',
      dataset_signature,
      layout_config
    });

    res.status(201).json({
      success: true,
      id: created.id,
      message: 'Dashboard configuration saved successfully.',
      dashboard: created
    });
  } catch (err) {
    console.error('Error saving dashboard:', err);
    res.status(500).json({ error: 'Failed to save dashboard configuration.' });
  }
});

// 4. PUT /api/dashboards/:id - Update dashboard title or layout
router.put('/:id', enforcePrivacyBoundary, (req, res) => {
  try {
    const { title, description, layout_config } = req.body;

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      return res.status(400).json({ error: 'Dashboard title cannot be empty.' });
    }

    const updated = dbOps.updateDashboard(req.params.id, {
      title,
      description,
      layout_config
    });

    if (!updated) {
      return res.status(404).json({ error: `Dashboard with ID "${req.params.id}" not found.` });
    }

    res.json({
      success: true,
      message: 'Dashboard updated successfully.',
      dashboard: updated
    });
  } catch (err) {
    console.error('Error updating dashboard:', err);
    res.status(500).json({ error: 'Failed to update dashboard.' });
  }
});

// 5. DELETE /api/dashboards/:id - Delete dashboard
router.delete('/:id', (req, res) => {
  try {
    const deleted = dbOps.deleteDashboard(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: `Dashboard with ID "${req.params.id}" not found.` });
    }
    res.json({
      success: true,
      message: 'Dashboard deleted successfully.'
    });
  } catch (err) {
    console.error('Error deleting dashboard:', err);
    res.status(500).json({ error: 'Failed to delete dashboard.' });
  }
});

module.exports = router;
