/**
 * Lumora - Day 4 Automated Test Suite
 * Tests Multi-Chart Dashboard functionality:
 * 1. Independent chart creation and unique ID generation
 * 2. Multi-chart coexistence without cross-mutation
 * 3. Individual chart editing, reordering, and removal
 * 4. Multi-chart layout configuration export and hydration
 * 5. Granular per-chart schema validation and graceful degradation
 * 6. Independent data aggregations for coexisting charts
 */

async function runDay4Tests() {
  console.log('--- Starting Lumora Day 4 Test Suite ---');
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

  try {
    // Dynamically import client state and validator modules
    const { state } = await import('../public/js/state.js');
    const { validateDatasetAgainstLayout } = await import('../public/js/modules/schemaValidator.js');
    const { aggregateData, validateChartConfig } = await import('../public/js/modules/chartManager.js');

    // Setup sample test dataset
    const sampleFields = ['Region', 'Category', 'Sales', 'Profit', 'Quantity'];
    const sampleData = [
      { Region: 'East', Category: 'Technology', Sales: '500', Profit: '120', Quantity: '5' },
      { Region: 'East', Category: 'Furniture', Sales: '200', Profit: '30', Quantity: '2' },
      { Region: 'West', Category: 'Technology', Sales: '300', Profit: '80', Quantity: '3' },
      { Region: 'West', Category: 'Office Supplies', Sales: '100', Profit: '25', Quantity: '10' }
    ];

    state.setDataset({
      fileName: 'sales_q3.csv',
      fileSize: 1024,
      fields: sampleFields,
      data: sampleData,
      parseDurationMs: 12
    });

    // -------------------------------------------------------------
    // 1. Initial State & Smart First Chart
    // -------------------------------------------------------------
    assert(Array.isArray(state.activeDashboard.charts), 'activeDashboard.charts is an array');
    assert(state.activeDashboard.charts.length === 1, 'Initial chart created upon dataset load');
    const chart1 = state.activeDashboard.charts[0];
    assert(typeof chart1.id === 'string' && chart1.id.length > 5, 'First chart has a valid ID');
    assert(chart1.chartType === 'bar', 'First chart defaults to bar chart');
    assert(chart1.xAxis === 'Region', 'First chart selected categorical X-axis (Region)');
    assert(chart1.yAxis === 'Sales', 'First chart selected numeric Y-axis (Sales)');

    // -------------------------------------------------------------
    // 2. Add Second Independent Chart
    // -------------------------------------------------------------
    const chart2 = state.addChart({
      chartType: 'line',
      xAxis: 'Category',
      yAxis: 'Profit',
      aggregation: 'sum',
      title: 'Profit by Category'
    });

    assert(state.activeDashboard.charts.length === 2, 'Dashboard now has 2 coexisting charts');
    assert(chart2.id !== chart1.id, 'Second chart has a unique ID distinct from first chart');
    assert(chart2.chartType === 'line', 'Second chart has independent chartType: line');
    assert(chart2.xAxis === 'Category', 'Second chart has independent xAxis: Category');
    assert(chart2.yAxis === 'Profit', 'Second chart has independent yAxis: Profit');
    assert(chart2.title === 'Profit by Category', 'Second chart has independent title');

    // Verify first chart is completely unaffected by adding second chart
    const currentChart1 = state.activeDashboard.charts[0];
    assert(currentChart1.id === chart1.id, 'First chart ID unchanged');
    assert(currentChart1.xAxis === 'Region', 'First chart X-axis preserved (Region)');
    assert(currentChart1.yAxis === 'Sales', 'First chart Y-axis preserved (Sales)');
    assert(currentChart1.chartType === 'bar', 'First chart type preserved (bar)');

    // -------------------------------------------------------------
    // 3. Add Third Chart with Smart Defaults
    // -------------------------------------------------------------
    const chart3 = state.addChart();
    assert(state.activeDashboard.charts.length === 3, 'Dashboard now has 3 coexisting charts');
    assert(chart3.id !== chart1.id && chart3.id !== chart2.id, 'Third chart has unique ID');
    assert(typeof chart3.chartType === 'string', 'Third chart assigned valid chart type');
    assert(typeof chart3.xAxis === 'string' && chart3.xAxis.length > 0, 'Third chart assigned default X-axis');
    assert(typeof chart3.yAxis === 'string' && chart3.yAxis.length > 0, 'Third chart assigned default Y-axis');

    // -------------------------------------------------------------
    // 4. Update Second Chart in Place
    // -------------------------------------------------------------
    state.updateChart(chart2.id, {
      title: 'Average Profit by Category',
      aggregation: 'avg',
      chartType: 'pie'
    });

    const updatedChart2 = state.activeDashboard.charts.find(c => c.id === chart2.id);
    assert(updatedChart2.title === 'Average Profit by Category', 'Chart 2 title updated in place');
    assert(updatedChart2.aggregation === 'avg', 'Chart 2 aggregation updated to avg');
    assert(updatedChart2.chartType === 'pie', 'Chart 2 chartType updated to pie');

    // Verify Chart 1 and Chart 3 remain unchanged
    const verifyChart1 = state.activeDashboard.charts[0];
    assert(verifyChart1.aggregation === 'sum', 'Chart 1 aggregation unchanged (sum)');
    assert(verifyChart1.chartType === 'bar', 'Chart 1 chartType unchanged (bar)');

    // -------------------------------------------------------------
    // 5. Reordering Charts (Move Up / Move Down)
    // -------------------------------------------------------------
    // Initial order: [chart1, chart2, chart3]
    state.moveChart(chart2.id, 'up'); // Moves chart2 to index 0: [chart2, chart1, chart3]
    assert(state.activeDashboard.charts[0].id === chart2.id, 'chart2 moved up to index 0');
    assert(state.activeDashboard.charts[1].id === chart1.id, 'chart1 moved down to index 1');

    state.moveChart(chart2.id, 'down'); // Moves chart2 back to index 1: [chart1, chart2, chart3]
    assert(state.activeDashboard.charts[0].id === chart1.id, 'chart1 restored to index 0');
    assert(state.activeDashboard.charts[1].id === chart2.id, 'chart2 restored to index 1');

    // Moving index 0 up should be a no-op
    state.moveChart(chart1.id, 'up');
    assert(state.activeDashboard.charts[0].id === chart1.id, 'Moving top chart up is safe no-op');

    // -------------------------------------------------------------
    // 6. Remove Chart
    // -------------------------------------------------------------
    state.removeChart(chart3.id);
    assert(state.activeDashboard.charts.length === 2, 'Chart 3 removed; 2 charts remain');
    assert(!state.activeDashboard.charts.some(c => c.id === chart3.id), 'Chart 3 is no longer in active dashboard');
    assert(state.activeDashboard.charts.some(c => c.id === chart1.id), 'Chart 1 remains');
    assert(state.activeDashboard.charts.some(c => c.id === chart2.id), 'Chart 2 remains');

    // -------------------------------------------------------------
    // 7. Layout Configuration Serialization & Hydration
    // -------------------------------------------------------------
    const layout = state.getLayoutConfig();
    assert(Array.isArray(layout), 'Layout config is an array');
    assert(layout.length === 2, 'Layout config contains exactly 2 chart blueprints');
    assert(layout[0].id === chart1.id, 'Layout config preserves chart 1 ID');
    assert(layout[1].id === chart2.id, 'Layout config preserves chart 2 ID');
    assert(layout[1].chartType === 'pie', 'Layout config preserves chart 2 type (pie)');

    // Hydrate into clean state
    state.clearDataset();
    assert(state.activeDashboard.charts.length === 0, 'Charts cleared on dataset clear');

    state.setDataset({
      fileName: 'sales_restored.csv',
      fileSize: 2048,
      fields: sampleFields,
      data: sampleData,
      parseDurationMs: 8
    });

    state.loadDashboardDoc({
      id: 'dash-uuid-1234',
      title: 'Restored Executive Dashboard',
      description: 'Multi-chart blueprint',
      layout_config: layout
    });

    assert(state.activeDashboard.id === 'dash-uuid-1234', 'Dashboard ID restored');
    assert(state.activeDashboard.title === 'Restored Executive Dashboard', 'Dashboard title restored');
    assert(state.activeDashboard.charts.length === 2, 'Both charts restored from layout array');
    assert(state.activeDashboard.charts[0].xAxis === 'Region', 'Chart 1 X-axis restored');
    assert(state.activeDashboard.charts[1].title === 'Average Profit by Category', 'Chart 2 title restored');

    // -------------------------------------------------------------
    // 8. Granular Schema Validation for Multiple Charts
    // -------------------------------------------------------------
    // Scenario A: All required columns present
    const validResult = validateDatasetAgainstLayout(sampleFields, layout);
    assert(validResult.isValid === true, 'Validation passes when all columns exist');
    assert(validResult.missingColumns.length === 0, 'No missing columns reported');
    assert(validResult.chartStatus.length === 2, 'Reports status for both charts');
    assert(validResult.chartStatus[0].isValid === true, 'Chart 1 is valid');
    assert(validResult.chartStatus[1].isValid === true, 'Chart 2 is valid');

    // Scenario B: Dataset missing "Profit" (affects Chart 2, but Chart 1 still valid)
    const partialFields = ['Region', 'Category', 'Sales', 'Quantity']; // "Profit" omitted
    const partialResult = validateDatasetAgainstLayout(partialFields, layout);
    assert(partialResult.isValid === false, 'Overall validation fails when any chart misses columns');
    assert(partialResult.missingColumns.includes('Profit'), 'Identifies "Profit" as missing column');
    assert(partialResult.chartStatus[0].isValid === true, 'Chart 1 (Region/Sales) remains valid');
    assert(partialResult.chartStatus[1].isValid === false, 'Chart 2 (Category/Profit) marked invalid');
    assert(partialResult.chartStatus[1].missingColumns.includes('Profit'), 'Chart 2 reports "Profit" missing');

    // -------------------------------------------------------------
    // 9. Independent Aggregations on Coexisting Charts
    // -------------------------------------------------------------
    // Chart 1: Sales by Region (sum)
    const agg1 = aggregateData(sampleData, 'Region', 'Sales', 'sum', 'desc');
    assert(agg1.labels[0] === 'East' && agg1.values[0] === 700, 'East region sales sum is 500 + 200 = 700');
    assert(agg1.labels[1] === 'West' && agg1.values[1] === 400, 'West region sales sum is 300 + 100 = 400');

    // Chart 2: Profit by Category (avg)
    const agg2 = aggregateData(sampleData, 'Category', 'Profit', 'avg', 'desc');
    assert(agg2.labels[0] === 'Technology' && agg2.values[0] === 100, 'Technology profit avg is (120 + 80) / 2 = 100');
    assert(agg2.labels.includes('Furniture'), 'Furniture category aggregated independently');

    // -------------------------------------------------------------
    // 10. Multi-Chart Layout Persistence via Express API & SQLite
    // -------------------------------------------------------------
    const http = (await import('http')).default;
    const expressApp = (await import('../server.js')).default;
    const TEST_PORT = 3097;

    const testServer = await new Promise((resolve) => {
      const s = expressApp.listen(TEST_PORT, () => resolve(s));
    });

    const apiRequest = (urlPath, options = {}) => {
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
            res.on('data', chunk => (body += chunk));
            res.on('end', () => {
              let json = null;
              try { json = JSON.parse(body); } catch (e) { json = body; }
              resolve({ statusCode: res.statusCode, body: json });
            });
          }
        );
        req.on('error', reject);
        if (options.body) {
          req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
      });
    };

    try {
      // POST multi-chart dashboard
      const postRes = await apiRequest('/api/dashboards', {
        method: 'POST',
        body: {
          title: 'Q3 Multi-Chart Executive Dashboard',
          description: 'Comprehensive cross-metric analysis',
          dataset_signature: {
            columns: sampleFields,
            columnCount: 5,
            types: { Region: 'categorical', Category: 'categorical', Sales: 'numeric', Profit: 'numeric', Quantity: 'numeric' }
          },
          layout_config: layout
        }
      });

      assert(postRes.statusCode === 201, 'POST /api/dashboards returns HTTP 201 Created for multi-chart dashboard');
      assert(postRes.body && postRes.body.success === true, 'Multi-chart creation returned success: true');
      const savedDashId = postRes.body && postRes.body.id;
      assert(typeof savedDashId === 'string', 'Saved dashboard returned valid UUID');

      // GET dashboard by ID
      const getRes = await apiRequest(`/api/dashboards/${savedDashId}`);
      assert(getRes.statusCode === 200, 'GET /api/dashboards/:id returns HTTP 200');
      assert(getRes.body.title === 'Q3 Multi-Chart Executive Dashboard', 'Retrieved dashboard title matches');
      assert(Array.isArray(getRes.body.layout_config), 'Retrieved layout_config is an array');
      assert(getRes.body.layout_config.length === 2, 'Retrieved layout_config preserves all 2 charts');
      assert(getRes.body.layout_config[0].id === chart1.id, 'Chart 1 ID preserved through SQLite round-trip');
      assert(getRes.body.layout_config[1].chartType === 'pie', 'Chart 2 type (pie) preserved through SQLite round-trip');

      // Cleanup
      const delRes = await apiRequest(`/api/dashboards/${savedDashId}`, { method: 'DELETE' });
      assert(delRes.statusCode === 200, 'DELETE /api/dashboards/:id cleanly removes test dashboard');
    } finally {
      await new Promise(resolve => testServer.close(resolve));
    }

    console.log(`\nDay 4 Test Summary: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('All Day 4 tests passed successfully!\n');
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Day 4 Test encountered unexpected error:', err);
    process.exitCode = 1;
  }
}

runDay4Tests();
