/**
 * InsightBoard - Day 2 Automated Test Suite
 * Tests SQLite persistence, REST API CRUD, Privacy Boundary Enforcement,
 * Server Restart survival, Schema Validation, and Chart Data Aggregation.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require('../server.js');
const { getDb, dbOps } = require('../server/db/database.js');

let server;
const TEST_PORT = 3098;

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method: options.method || 'GET',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'close',
          ...(options.headers || {})
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch (e) {
            json = body;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      const dataStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.write(dataStr);
    }
    req.end();
  });
}

async function runDay2Tests() {
  console.log('--- Starting InsightBoard Day 2 Test Suite ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // Use a dedicated clean test SQLite database for test runs
  const testDbPath = path.join(__dirname, 'test_insightboard.sqlite');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.env.INSIGHTBOARD_DB_PATH = testDbPath;

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server running on port ${TEST_PORT}`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    // 1. Database Initialization & Schema Verification
    // -------------------------------------------------------------
    const db = getDb(testDbPath);
    const tableInfo = db.prepare("PRAGMA table_info(dashboards)").all();
    const columnNames = tableInfo.map((c) => c.name);
    assert(columnNames.includes('id'), 'SQLite schema includes "id" primary key');
    assert(columnNames.includes('title'), 'SQLite schema includes "title" column');
    assert(columnNames.includes('dataset_signature'), 'SQLite schema includes "dataset_signature" column');
    assert(columnNames.includes('layout_config'), 'SQLite schema includes "layout_config" column');
    assert(columnNames.includes('created_at'), 'SQLite schema includes "created_at" column');

    // -------------------------------------------------------------
    // 2. Privacy Boundary Enforcement (Zero Raw Data Transmission)
    // -------------------------------------------------------------
    // Test: Server must reject payload containing raw row arrays
    const privacyViolationPayload = {
      title: 'Illegal Raw Data Upload',
      dataset_signature: { fileName: 'sales.csv', rowCount: 2, columns: [{ name: 'Sales' }] },
      layout_config: [{ chartType: 'bar', xAxis: 'Category', yAxis: 'Sales' }],
      data: [{ Category: 'Furniture', Sales: 250 }, { Category: 'Technology', Sales: 500 }] // ILLEGAL
    };

    const rejectRes1 = await request('/api/dashboards', {
      method: 'POST',
      body: privacyViolationPayload
    });
    assert(rejectRes1.statusCode === 400, 'Server rejects payload with raw data rows (HTTP 400)');
    assert(
      rejectRes1.body.error && rejectRes1.body.error.includes('Privacy violation'),
      'Server returns descriptive privacy violation error'
    );

    // Test: Server must reject signature containing embedded row arrays
    const nestedViolationPayload = {
      title: 'Illegal Nested Data',
      dataset_signature: {
        fileName: 'sales.csv',
        rows: [{ a: 1 }] // ILLEGAL
      },
      layout_config: [{ chartType: 'bar' }]
    };
    const rejectRes2 = await request('/api/dashboards', {
      method: 'POST',
      body: nestedViolationPayload
    });
    assert(rejectRes2.statusCode === 400, 'Server rejects dataset_signature containing raw rows (HTTP 400)');

    // Test: Server must reject layout_config containing raw data
    const layoutViolationPayload = {
      title: 'Illegal Layout Data',
      dataset_signature: { fileName: 'sales.csv', rowCount: 1, columns: [{ name: 'A' }] },
      layout_config: [{ chartType: 'bar', data: [1, 2, 3] }] // ILLEGAL
    };
    const rejectRes3 = await request('/api/dashboards', {
      method: 'POST',
      body: layoutViolationPayload
    });
    assert(rejectRes3.statusCode === 400, 'Server rejects layout_config containing raw data (HTTP 400)');

    // Test: Server must handle malformed dataset_signature safely
    const malformedSigRes = await request('/api/dashboards', {
      method: 'POST',
      body: {
        title: 'Malformed Signature',
        dataset_signature: '{ broken json ',
        layout_config: [{ chartType: 'bar' }]
      }
    });
    assert(malformedSigRes.statusCode === 400, 'Server rejects malformed dataset_signature string (HTTP 400)');

    // -------------------------------------------------------------
    // 3. Clean Dashboard Persistence (POST /api/dashboards)
    // -------------------------------------------------------------
    const validDashboardPayload = {
      title: 'Q3 Sales Performance',
      description: 'Department sales breakdown by category',
      dataset_signature: {
        fileName: 'sample_superstore_50rows.csv',
        fileSize: 4096,
        rowCount: 50,
        columns: [
          { name: 'Category' },
          { name: 'Sales' },
          { name: 'Region' }
        ]
      },
      layout_config: [
        {
          id: 'widget-1',
          chartType: 'bar',
          title: 'Sales by Category (SUM)',
          xAxis: 'Category',
          yAxis: 'Sales',
          aggregation: 'sum'
        }
      ]
    };

    const createRes = await request('/api/dashboards', {
      method: 'POST',
      body: validDashboardPayload
    });
    assert(createRes.statusCode === 201, 'POST /api/dashboards returns HTTP 201 Created');
    assert(createRes.body.success === true, 'Response indicates success: true');
    assert(typeof createRes.body.id === 'string' && createRes.body.id.length > 0, 'Returns created dashboard UUID');
    const createdId = createRes.body.id;

    // -------------------------------------------------------------
    // 4. Listing Dashboards (GET /api/dashboards)
    // -------------------------------------------------------------
    const listRes = await request('/api/dashboards');
    assert(listRes.statusCode === 200, 'GET /api/dashboards returns HTTP 200');
    assert(Array.isArray(listRes.body), 'GET /api/dashboards returns an array');
    assert(listRes.body.length === 1, 'Array contains 1 saved dashboard');
    assert(listRes.body[0].title === 'Q3 Sales Performance', 'Listed dashboard title matches');
    assert(listRes.body[0].dataset_signature.fileName === 'sample_superstore_50rows.csv', 'Dataset signature matches');

    // -------------------------------------------------------------
    // 5. Retrieving Specific Dashboard (GET /api/dashboards/:id)
    // -------------------------------------------------------------
    const getRes = await request(`/api/dashboards/${createdId}`);
    assert(getRes.statusCode === 200, 'GET /api/dashboards/:id returns HTTP 200');
    assert(getRes.body.id === createdId, 'Dashboard ID matches requested ID');
    assert(getRes.body.layout_config[0].xAxis === 'Category', 'Layout config correctly retrieved');
    assert(getRes.body.layout_config[0].yAxis === 'Sales', 'Layout config Y-axis matches');

    // Test PUT /api/dashboards/:id (Rename & Update Description)
    const updateRes = await request(`/api/dashboards/${createdId}`, {
      method: 'PUT',
      body: { title: 'Q3 Sales Performance (Updated)', description: 'Updated notes' }
    });
    assert(updateRes.statusCode === 200, 'PUT /api/dashboards/:id updates title with HTTP 200');
    assert(updateRes.body.dashboard.title === 'Q3 Sales Performance (Updated)', 'Dashboard title was updated');

    // Test: PUT rejects empty title
    const emptyTitleRes = await request(`/api/dashboards/${createdId}`, {
      method: 'PUT',
      body: { title: '   ' }
    });
    assert(emptyTitleRes.statusCode === 400, 'PUT /api/dashboards/:id rejects empty title with HTTP 400');

    // Test DELETE /api/dashboards/:id (Create temp dashboard and delete)
    const tempCreate = await request('/api/dashboards', {
      method: 'POST',
      body: {
        title: 'Temp to delete',
        dataset_signature: { fileName: 'temp.csv', rowCount: 1, columns: [{ name: 'A' }] },
        layout_config: [{ chartType: 'bar' }]
      }
    });
    const tempId = tempCreate.body.id;
    const deleteRes = await request(`/api/dashboards/${tempId}`, { method: 'DELETE' });
    assert(deleteRes.statusCode === 200, 'DELETE /api/dashboards/:id returns HTTP 200');
    const deleteCheck = await request(`/api/dashboards/${tempId}`);
    assert(deleteCheck.statusCode === 404, 'Deleted dashboard returns HTTP 404');

    // -------------------------------------------------------------
    // 6. Server Restart Survival Test
    // -------------------------------------------------------------
    // Terminate the active server instance
    console.log('  -> Simulating server shutdown & restart...');
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    dbOps.close(db);
    await new Promise((r) => setTimeout(r, 200));

    // Re-instantiate a fresh server instance with the same database file
    const restartedServer = app.listen(TEST_PORT);
    await new Promise((resolve) => restartedServer.on('listening', resolve));

    const restartGetRes = await request(`/api/dashboards/${createdId}`);
    assert(restartGetRes.statusCode === 200, 'Dashboard survives complete server shutdown and restart');
    assert(restartGetRes.body.title === 'Q3 Sales Performance (Updated)', 'Restored updated dashboard title intact after restart');
    assert(restartGetRes.body.layout_config[0].aggregation === 'sum', 'Restored layout configuration intact');

    // Close restarted server for remaining checks
    if (restartedServer.closeAllConnections) restartedServer.closeAllConnections();
    await new Promise((resolve) => restartedServer.close(resolve));
    await new Promise((r) => setTimeout(r, 100));

    // -------------------------------------------------------------
    // 7. Schema Validation & Missing Column Logic
    // -------------------------------------------------------------
    // Load schema validator module logic
    const { validateDatasetAgainstLayout } = await import('../public/js/modules/schemaValidator.js');
    const layout = [
      { xAxis: 'Category', yAxis: 'Sales', aggregation: 'sum' }
    ];

    // Case A: CSV has all required columns
    const validCSVColumns = ['Order ID', 'Category', 'Sales', 'Profit'];
    const validCheck = validateDatasetAgainstLayout(validCSVColumns, layout);
    assert(validCheck.isValid === true, 'Validator confirms CSV with matching columns is valid');
    assert(validCheck.missingColumns.length === 0, 'No missing columns detected');

    // Case B: CSV is missing 'Category'
    const missingXColumns = ['Order ID', 'Sales', 'Profit'];
    const invalidCheck1 = validateDatasetAgainstLayout(missingXColumns, layout);
    assert(invalidCheck1.isValid === false, 'Validator detects missing X-axis column');
    assert(invalidCheck1.missingColumns.includes('Category'), 'Missing column correctly identified as "Category"');

    // Case C: CSV is missing 'Sales'
    const missingYColumns = ['Order ID', 'Category', 'Profit'];
    const invalidCheck2 = validateDatasetAgainstLayout(missingYColumns, layout);
    assert(invalidCheck2.isValid === false, 'Validator detects missing Y-axis metric column');
    assert(invalidCheck2.missingColumns.includes('Sales'), 'Missing column correctly identified as "Sales"');

    // -------------------------------------------------------------
    // 8. Chart Data Aggregation Logic (SUM, AVG, COUNT)
    // -------------------------------------------------------------
    const { aggregateData } = await import('../public/js/modules/chartManager.js');
    const testRows = [
      { Category: 'Furniture', Sales: '100' },
      { Category: 'Furniture', Sales: '200' },
      { Category: 'Technology', Sales: '500' }
    ];

    // SUM
    const sumResult = aggregateData(testRows, 'Category', 'Sales', 'sum');
    assert(sumResult.labels[0] === 'Technology', 'Sorted descending: Technology first (500)');
    assert(sumResult.values[0] === 500, 'Technology sum is 500');
    assert(sumResult.labels[1] === 'Furniture', 'Furniture second');
    assert(sumResult.values[1] === 300, 'Furniture sum is 100 + 200 = 300');

    // AVG
    const avgResult = aggregateData(testRows, 'Category', 'Sales', 'avg');
    assert(avgResult.values[avgResult.labels.indexOf('Furniture')] === 150, 'Furniture average is 150');

    // COUNT
    const countResult = aggregateData(testRows, 'Category', 'Sales', 'count');
    assert(countResult.values[countResult.labels.indexOf('Furniture')] === 2, 'Furniture count is 2 rows');

  } catch (err) {
    console.error('Day 2 Test encountered unexpected error:', err);
    failed++;
  } finally {
    // Cleanup test database file
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      const walPath = `${testDbPath}-wal`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      const shmPath = `${testDbPath}-shm`;
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch (e) {
      // Ignored in cleanup
    }

    console.log(`\nDay 2 Test Summary: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('All Day 2 tests passed successfully!\n');
    }
  }
}

runDay2Tests();
