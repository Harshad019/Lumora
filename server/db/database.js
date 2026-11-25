/**
 * SQLite Database Connection and Schema Management for InsightBoard.
 * Uses better-sqlite3 for synchronous, high-performance database operations.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Default database path: server/db/insightboard.sqlite
const DEFAULT_DB_PATH = path.join(__dirname, 'insightboard.sqlite');

let dbInstance = null;

function getDb(customPath) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || process.env.INSIGHTBOARD_DB_PATH || DEFAULT_DB_PATH;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  // Enable WAL mode for better concurrency and write performance
  db.pragma('journal_mode = WAL');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      dataset_signature TEXT NOT NULL,
      layout_config TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

// Data access operations
const dbOps = {
  createDashboard({ id, title, description, dataset_signature, layout_config }, db = getDb()) {
    const dashboardId = id || crypto.randomUUID();
    const sigStr = typeof dataset_signature === 'string' ? dataset_signature : JSON.stringify(dataset_signature);
    const layoutStr = typeof layout_config === 'string' ? layout_config : JSON.stringify(layout_config);

    const titleStr = typeof title === 'string' ? title.trim() : String(title || '').trim();
    const descStr = typeof description === 'string' ? description.trim() : (description ? String(description).trim() : '');

    const stmt = db.prepare(`
      INSERT INTO dashboards (id, title, description, dataset_signature, layout_config)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(dashboardId, titleStr, descStr, sigStr, layoutStr);
    return this.getDashboardById(dashboardId, db);
  },

  getAllDashboards(db = getDb()) {
    const stmt = db.prepare(`
      SELECT id, title, description, dataset_signature, created_at, updated_at
      FROM dashboards
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all();
    return rows.map(row => ({
      ...row,
      dataset_signature: JSON.parse(row.dataset_signature)
    }));
  },

  getDashboardById(id, db = getDb()) {
    const stmt = db.prepare(`
      SELECT id, title, description, dataset_signature, layout_config, created_at, updated_at
      FROM dashboards
      WHERE id = ?
    `);
    const row = stmt.get(id);
    if (!row) return null;

    return {
      ...row,
      dataset_signature: JSON.parse(row.dataset_signature),
      layout_config: JSON.parse(row.layout_config)
    };
  },

  updateDashboard(id, { title, description, layout_config }, db = getDb()) {
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(typeof description === 'string' ? description.trim() : (description ? String(description).trim() : ''));
    }
    if (layout_config !== undefined) {
      updates.push('layout_config = ?');
      params.push(typeof layout_config === 'string' ? layout_config : JSON.stringify(layout_config));
    }

    if (updates.length === 0) return this.getDashboardById(id, db);

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);

    const stmt = db.prepare(`
      UPDATE dashboards
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    const result = stmt.run(...params);
    if (result.changes === 0) return null;

    return this.getDashboardById(id, db);
  },

  deleteDashboard(id, db = getDb()) {
    const stmt = db.prepare(`DELETE FROM dashboards WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  },

  close(db = dbInstance) {
    if (db && db.open) {
      db.close();
    }
    if (db === dbInstance) {
      dbInstance = null;
    }
  }
};

module.exports = {
  getDb,
  dbOps
};
