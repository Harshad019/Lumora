/**
 * InsightBoard - Day 1 Automated Verification Test Suite
 * Tests server health, static asset serving, and Papa Parse integrity.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require('../server.js');
const Papa = require('papaparse');

let server;
const TEST_PORT = 3099;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting InsightBoard Day 1 Test Suite ---');
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

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  try {
    // Test 1: GET /api/health
    const healthRes = await request('/api/health');
    assert(healthRes.statusCode === 200, 'Health endpoint returns HTTP 200');
    const healthData = JSON.parse(healthRes.body);
    assert(healthData.status === 'ok', 'Health status is "ok"');
    assert(healthData.service === 'InsightBoard API', 'Service identifier matches');
    assert(typeof healthData.uptime === 'number', 'Uptime is reported');

    // Test 2: GET / (index.html)
    const indexRes = await request('/');
    assert(indexRes.statusCode === 200, 'Root / returns HTTP 200');
    assert(indexRes.body.includes('Lumora') || indexRes.body.includes('lumora'), 'Root serves index.html with Lumora title');
    assert(indexRes.body.includes('100% Client-Side Privacy'), 'Privacy guarantee badge present');
    assert(indexRes.body.includes('csv-file-input'), 'File input element present');
    assert(indexRes.body.includes('data-preview-table'), 'Data preview table present');

    // Test 3: Static CSS and Vendor files
    const cssRes = await request('/css/main.css');
    assert(cssRes.statusCode === 200, 'CSS stylesheet served with HTTP 200');
    assert(cssRes.body.includes('--color-primary'), 'CSS variables defined in stylesheet');

    const papaRes = await request('/vendor/papaparse.min.js');
    assert(papaRes.statusCode === 200, 'Vendor Papa Parse served with HTTP 200');
    assert(papaRes.body.length > 10000, 'Papa Parse vendor file is non-empty');

    const appJsRes = await request('/js/app.js');
    assert(appJsRes.statusCode === 200, 'Client app.js served with HTTP 200');

    // Test 4: Unrecognized API routes return 404
    const notFoundRes = await request('/api/nonexistent');
    assert(notFoundRes.statusCode === 404, 'Unknown API route returns HTTP 404');

    // Test 5: Verify zero backend CSV ingestion endpoints exist
    const rawPostRes = await request('/api/upload', { method: 'POST', body: 'fake,csv,data' });
    assert(rawPostRes.statusCode === 404, 'No /api/upload endpoint exists (strictly rejecting backend ingestion)');

    // Test 6: Verify Papa Parse in-memory CSV parsing logic
    const sampleCSV = `Order ID,Category,Sales,Quantity
CA-1001,Furniture,261.96,2
CA-1002,Technology,731.94,3
CA-1003,Office Supplies,14.62,2`;

    const parsed = Papa.parse(sampleCSV, {
      header: true,
      skipEmptyLines: true
    });

    assert(parsed.meta.fields.length === 4, 'Papa Parse correctly parses 4 column headers');
    assert(parsed.data.length === 3, 'Papa Parse parses 3 rows');
    assert(parsed.data[0]['Order ID'] === 'CA-1001', 'First row parsed correctly');
    assert(parsed.data[1]['Category'] === 'Technology', 'Second row category parsed correctly');

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('All Day 1 tests passed successfully!\n');
    }
  }
}

runTests();
