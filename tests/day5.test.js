/**
 * Lumora - Day 5 Step 1 Automated Test Suite
 * Tests CSV Replacement with Schema Validation:
 * 1. Fully compatible replacement CSV
 * 2. Partially compatible replacement CSV (graceful degradation)
 * 3. Completely incompatible replacement CSV
 * 4. User cancellation during incompatible replacement
 * 5. Existing dataset preserved intact after cancellation
 * 6. User confirmation when proceeding with incompatible replacement
 * 7. End-to-end parseCSVFile string/stream replacement workflow
 */

const Papa = require('papaparse');
global.Papa = Papa;

async function runDay5Tests() {
  console.log('--- Starting Lumora Day 5 Test Suite ---');
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
    const { state } = await import('../public/js/state.js');
    const { processDatasetReplacement, parseCSVFile } = await import('../public/js/modules/csvManager.js');
    const { validateDatasetAgainstLayout } = await import('../public/js/modules/schemaValidator.js');

    // -------------------------------------------------------------
    // Baseline Setup: Active Dataset & 2 Charts
    // -------------------------------------------------------------
    const initialFields = ['Region', 'Category', 'Sales', 'Profit'];
    const initialData = [
      { Region: 'East', Category: 'Technology', Sales: '500', Profit: '120' },
      { Region: 'West', Category: 'Furniture', Sales: '300', Profit: '50' }
    ];

    state.setDataset({
      fileName: 'initial_sales.csv',
      fileSize: 1024,
      fields: initialFields,
      data: initialData,
      parseDurationMs: 5
    });

    // Chart 1: Sales by Region (requires Region, Sales)
    // Chart 2: Profit by Category (requires Category, Profit)
    state.activeDashboard.charts = [
      {
        id: 'chart-1',
        title: 'Sales by Region',
        chartType: 'bar',
        xAxis: 'Region',
        yAxis: 'Sales',
        aggregation: 'sum'
      },
      {
        id: 'chart-2',
        title: 'Profit by Category',
        chartType: 'line',
        xAxis: 'Category',
        yAxis: 'Profit',
        aggregation: 'avg'
      }
    ];

    assert(state.dataset.fileName === 'initial_sales.csv', 'Initial dataset loaded in state');
    assert(state.activeDashboard.charts.length === 2, 'Two active charts configured on dashboard');

    // -------------------------------------------------------------
    // Scenario 1: Fully Compatible Replacement CSV
    // Contains all required columns (Region, Category, Sales, Profit) plus extra column
    // -------------------------------------------------------------
    const compatibleFields = ['Region', 'Category', 'Sales', 'Profit', 'Discount'];
    const compatibleData = [
      { Region: 'North', Category: 'Technology', Sales: '900', Profit: '250', Discount: '0.1' },
      { Region: 'South', Category: 'Office Supplies', Sales: '450', Profit: '90', Discount: '0.05' }
    ];

    const resCompatible = processDatasetReplacement(
      { fields: compatibleFields, data: compatibleData },
      { fileName: 'q4_compatible_sales.csv', fileSize: 2048, durationMs: 4 }
    );

    assert(resCompatible.success === true, 'Fully compatible CSV returns success: true');
    assert(resCompatible.status === 'compatible', 'Fully compatible CSV returns status: compatible');
    assert(resCompatible.validation.isValid === true, 'Validation confirms all columns present');
    assert(resCompatible.validation.missingColumns.length === 0, 'No missing columns reported');
    assert(state.dataset.fileName === 'q4_compatible_sales.csv', 'Dataset fileName updated to replacement file');
    assert(state.dataset.data.length === 2, 'Dataset rows updated with replacement data');
    assert(state.dataset.data[0].Region === 'North', 'New data accessible in state memory');

    // -------------------------------------------------------------
    // Scenario 2: Partially Compatible Replacement CSV
    // Contains Region, Sales (Chart 1 valid), but lacks Category and Profit (Chart 2 invalid)
    // -------------------------------------------------------------
    const partialFields = ['Region', 'Sales', 'Country'];
    const partialData = [
      { Region: 'East', Sales: '600', Country: 'USA' },
      { Region: 'West', Sales: '750', Country: 'USA' }
    ];

    const resPartial = processDatasetReplacement(
      { fields: partialFields, data: partialData },
      { fileName: 'regional_sales_only.csv', fileSize: 1500, durationMs: 3 }
    );

    assert(resPartial.success === true, 'Partially compatible CSV accepted for graceful degradation');
    assert(resPartial.status === 'partial', 'Partially compatible CSV returns status: partial');
    assert(resPartial.validation.isValid === false, 'Validation reports overall mismatch');
    assert(resPartial.incompatibleCharts.length === 1, 'Exactly 1 incompatible chart identified');
    assert(resPartial.incompatibleCharts[0].title === 'Profit by Category', 'Incompatible chart correctly identified');
    assert(resPartial.incompatibleCharts[0].missingColumns.includes('Category'), 'Missing "Category" identified');
    assert(resPartial.incompatibleCharts[0].missingColumns.includes('Profit'), 'Missing "Profit" identified');
    assert(state.dataset.fileName === 'regional_sales_only.csv', 'Dataset updated so valid charts can render');

    // -------------------------------------------------------------
    // Scenario 3: Completely Incompatible Replacement CSV with Cancellation
    // User cancels the replacement. Current dataset must remain 100% intact!
    // -------------------------------------------------------------
    const incompatibleFields = ['EmployeeID', 'Department', 'Salary'];
    const incompatibleData = [
      { EmployeeID: 'E001', Department: 'Engineering', Salary: '120000' },
      { EmployeeID: 'E002', Department: 'Marketing', Salary: '95000' }
    ];

    let confirmPromptShown = false;
    let confirmPromptMessage = '';

    const resCancelled = processDatasetReplacement(
      { fields: incompatibleFields, data: incompatibleData },
      { fileName: 'payroll.csv', fileSize: 3000, durationMs: 2 },
      {
        confirmFn: (msg) => {
          confirmPromptShown = true;
          confirmPromptMessage = msg;
          return false; // User clicks CANCEL
        }
      }
    );

    assert(confirmPromptShown === true, 'Confirmation prompt triggered for completely incompatible CSV');
    assert(confirmPromptMessage.includes('incompatible with all active charts'), 'Warning message clearly warns of total incompatibility');
    assert(resCancelled.success === false, 'Cancelled replacement returns success: false');
    assert(resCancelled.status === 'cancelled', 'Cancelled replacement returns status: cancelled');

    // Scenario 4: Verify existing dataset remains intact after cancellation
    assert(state.dataset.fileName === 'regional_sales_only.csv', 'Dataset fileName remains unchanged after cancellation');
    assert(state.dataset.fields.includes('Region'), 'Dataset fields preserved intact after cancellation');
    assert(state.dataset.data[0].Region === 'East', 'Dataset data rows preserved intact after cancellation');
    assert(!state.dataset.fields.includes('EmployeeID'), 'Cancelled replacement data was NOT committed');

    // -------------------------------------------------------------
    // Scenario 5: Completely Incompatible Replacement CSV with User Confirmation
    // User explicitly decides to proceed despite the warning
    // -------------------------------------------------------------
    const resProceeded = processDatasetReplacement(
      { fields: incompatibleFields, data: incompatibleData },
      { fileName: 'payroll.csv', fileSize: 3000, durationMs: 2 },
      {
        confirmFn: () => true // User clicks OK / Proceed
      }
    );

    assert(resProceeded.success === true, 'Proceeded incompatible replacement returns success: true');
    assert(resProceeded.status === 'incompatible', 'Proceeded replacement returns status: incompatible');
    assert(state.dataset.fileName === 'payroll.csv', 'Dataset committed after user confirmation');
    assert(state.dataset.fields.includes('EmployeeID'), 'New dataset fields present in state');

    // -------------------------------------------------------------
    // Scenario 6: End-to-End parseCSVFile Workflow with Validation & Cancellation
    // -------------------------------------------------------------
    // Re-seed state with a valid dataset
    state.setDataset({
      fileName: 'active_dataset.csv',
      fileSize: 1000,
      fields: ['Region', 'Sales'],
      data: [{ Region: 'Central', Sales: '100' }],
      parseDurationMs: 1
    });

    state.activeDashboard.charts = [
      {
        id: 'chart-sales',
        title: 'Central Sales',
        chartType: 'bar',
        xAxis: 'Region',
        yAxis: 'Sales',
        aggregation: 'sum'
      }
    ];

    // Attempt to parse incompatible CSV string via parseCSVFile with cancel
    const badCSVText = 'Product,Inventory,Warehouse\nWidgetA,500,WH-1\nWidgetB,300,WH-2';

    await new Promise((resolve) => {
      parseCSVFile(badCSVText, {
        fileName: 'inventory.csv',
        confirmFn: () => false, // Cancel
        onComplete: (outcome) => {
          assert(outcome.success === false, 'parseCSVFile reports success: false on cancellation');
          assert(outcome.status === 'cancelled', 'parseCSVFile reports status: cancelled');
          assert(state.dataset.fileName === 'active_dataset.csv', 'State remains active_dataset.csv after parseCSVFile cancellation');
          assert(state.dataset.fields.includes('Region'), 'Existing fields preserved after parseCSVFile cancellation');
          resolve();
        }
      });
    });

    // Parse compatible CSV string via parseCSVFile
    const goodCSVText = 'Region,Sales\nCentral,350\nNorth,600';

    await new Promise((resolve) => {
      parseCSVFile(goodCSVText, {
        fileName: 'updated_central_sales.csv',
        onComplete: (outcome) => {
          assert(outcome.success === true, 'parseCSVFile reports success: true on compatible CSV');
          assert(outcome.status === 'compatible', 'parseCSVFile reports status: compatible');
          assert(state.dataset.fileName === 'updated_central_sales.csv', 'State updated with new file from parseCSVFile');
          assert(state.dataset.data.length === 2, 'State contains newly parsed rows');
          resolve();
        }
      });
    });

    // =============================================================
    // Day 5 Step 2: Active Dashboard Session Persistence Tests
    // =============================================================
    console.log('\n--- Testing Day 5 Step 2: Session Persistence & Reconnection ---');

    // Setup mock sessionStorage in Node environment
    class MockSessionStorage {
      constructor() {
        this.store = new Map();
      }
      getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
      }
      setItem(key, value) {
        this.store.set(key, String(value));
      }
      removeItem(key) {
        this.store.delete(key);
      }
      clear() {
        this.store.clear();
      }
      get length() {
        return this.store.size;
      }
      key(index) {
        return Array.from(this.store.keys())[index] || null;
      }
    }
    global.sessionStorage = new MockSessionStorage();

    const {
      SESSION_DASHBOARD_KEY,
      getActiveSessionDashboardId,
      setActiveSessionDashboardId,
      clearActiveSessionDashboardId,
      restoreSessionDashboard
    } = await import('../public/js/modules/dashboardManager.js');

    // Spin up test server for REST API endpoints
    const http = (await import('http')).default;
    const expressApp = (await import('../server.js')).default;
    const TEST_PORT = 3096;

    const testServer = await new Promise((resolve) => {
      const s = expressApp.listen(TEST_PORT, () => resolve(s));
    });

    try {
      // 1. Create a persistent test dashboard via POST /api/dashboards
      const createPayload = {
        title: 'Executive Regional Analysis',
        description: 'Multi-chart corporate overview',
        dataset_signature: {
          fileName: 'q3_actuals.csv',
          fileSize: 4096,
          rowCount: 50,
          columns: ['Region', 'Category', 'Sales', 'Profit']
        },
        layout_config: [
          {
            id: 'chart-sales-region',
            title: 'Regional Sales Performance',
            chartType: 'bar',
            xAxis: 'Region',
            yAxis: 'Sales',
            aggregation: 'sum'
          },
          {
            id: 'chart-profit-cat',
            title: 'Category Profitability',
            chartType: 'line',
            xAxis: 'Category',
            yAxis: 'Profit',
            aggregation: 'avg'
          }
        ]
      };

      const postRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload)
      });
      const postData = await postRes.json();
      assert(postRes.status === 201, 'Test dashboard created in SQLite database (HTTP 201)');
      const testDashId = postData.id;
      assert(typeof testDashId === 'string' && testDashId.length > 10, 'Valid dashboard UUID generated');

      // 2. Active dashboard ID being stored in sessionStorage
      setActiveSessionDashboardId(testDashId);
      assert(sessionStorage.getItem(SESSION_DASHBOARD_KEY) === testDashId, 'Active dashboard ID stored in sessionStorage');
      assert(getActiveSessionDashboardId() === testDashId, 'getActiveSessionDashboardId retrieves stored ID');

      // 3. Confirming raw CSV rows are NEVER stored in sessionStorage
      let privacyViolationFound = false;
      for (const [key, val] of sessionStorage.store.entries()) {
        if (key !== SESSION_DASHBOARD_KEY) {
          privacyViolationFound = true;
        }
        if (val.includes('Region') || val.includes('Technology') || val.includes('{') || val.includes('[')) {
          privacyViolationFound = true;
        }
      }
      assert(!privacyViolationFound, 'Privacy guaranteed: sessionStorage holds ONLY the dashboard ID, zero raw rows or schemas');
      assert(sessionStorage.length === 1, 'sessionStorage contains exactly 1 entry');

      // 4. Simulate browser refresh: Clear client RAM state
      state.clearDataset();
      assert(state.dataset.data.length === 0, 'Browser refresh simulation: dataset memory cleared');
      assert(state.activeDashboard.charts.length === 0, 'Browser refresh simulation: active charts cleared');
      assert(getActiveSessionDashboardId() === testDashId, 'sessionStorage persists dashboard ID across refresh');

      // 5. Restore after browser refresh triggers reconnection
      const restoreResult = await restoreSessionDashboard({
        fetchFn: (url, opts) => fetch(`http://127.0.0.1:${TEST_PORT}${url}`, opts)
      });
      assert(restoreResult.restored === true, 'restoreSessionDashboard returns restored: true');
      assert(restoreResult.pendingReconnect === true, 'restoreSessionDashboard identifies that CSV reconnection is required');
      assert(state.pendingReconnection !== null, 'pendingReconnection populated with saved dashboard blueprint');
      assert(state.pendingReconnection.title === 'Executive Regional Analysis', 'Pending reconnection has saved dashboard title');
      assert(state.pendingReconnection.dataset_signature.fileName === 'q3_actuals.csv', 'Pending reconnection has expected filename');
      assert(Array.isArray(state.pendingReconnection.layout_config), 'Pending reconnection preserves layout array');
      assert(state.pendingReconnection.layout_config.length === 2, 'Pending reconnection has both chart blueprints');

      // 6. User cancellation preserves saved dashboard configuration
      // If user dismisses or cancels the reconnect prompt, state.pendingReconnection remains accessible
      assert(state.pendingReconnection.id === testDashId, 'Pending reconnection preserved after cancellation');
      assert(getActiveSessionDashboardId() === testDashId, 'sessionStorage ID preserved after cancellation');

      // 7. Successful CSV reconnection restoring multiple charts
      const reconnectedFields = ['Region', 'Category', 'Sales', 'Profit'];
      const reconnectedData = [
        { Region: 'East', Category: 'Technology', Sales: '800', Profit: '200' },
        { Region: 'West', Category: 'Furniture', Sales: '400', Profit: '80' }
      ];

      // Reconnect and load
      const valOutcome = validateDatasetAgainstLayout(reconnectedFields, state.pendingReconnection.layout_config);
      assert(valOutcome.isValid === true, 'Reconnected CSV satisfies all chart column requirements');

      state.setDataset({
        fileName: 'q3_actuals.csv',
        fileSize: 4096,
        fields: reconnectedFields,
        data: reconnectedData,
        parseDurationMs: 3
      });
      state.loadDashboardDoc(state.pendingReconnection);

      assert(state.activeDashboard.id === testDashId, 'Active dashboard ID restored in state');
      assert(state.activeDashboard.title === 'Executive Regional Analysis', 'Dashboard title restored');
      assert(state.activeDashboard.charts.length === 2, 'Both charts restored into active dashboard');
      assert(state.activeDashboard.charts[0].id === 'chart-sales-region', 'Chart 1 ID restored');
      assert(state.activeDashboard.charts[0].title === 'Regional Sales Performance', 'Chart 1 title restored');
      assert(state.activeDashboard.charts[0].chartType === 'bar', 'Chart 1 type restored');
      assert(state.activeDashboard.charts[0].xAxis === 'Region', 'Chart 1 X-axis restored');
      assert(state.activeDashboard.charts[0].yAxis === 'Sales', 'Chart 1 Y-axis restored');
      assert(state.activeDashboard.charts[1].id === 'chart-profit-cat', 'Chart 2 ID restored');
      assert(state.activeDashboard.charts[1].title === 'Category Profitability', 'Chart 2 title restored');
      assert(state.activeDashboard.charts[1].chartType === 'line', 'Chart 2 type restored');
      assert(state.activeDashboard.charts[1].aggregation === 'avg', 'Chart 2 aggregation restored');

      // 8. Deleted dashboard clears the stored ID from sessionStorage
      const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards/${testDashId}`, {
        method: 'DELETE'
      });
      assert(delRes.status === 200, 'DELETE /api/dashboards/:id returns HTTP 200');

      clearActiveSessionDashboardId();
      assert(sessionStorage.getItem(SESSION_DASHBOARD_KEY) === null, 'Deleted dashboard clears ID from sessionStorage');
      assert(getActiveSessionDashboardId() === null, 'getActiveSessionDashboardId returns null after deletion');

      // 9. Stale dashboard ID handling (404 clears sessionStorage)
      setActiveSessionDashboardId('non-existent-uuid-9999');
      assert(getActiveSessionDashboardId() === 'non-existent-uuid-9999', 'Stale ID written to sessionStorage for test');

      const staleResult = await restoreSessionDashboard({
        fetchFn: (url, opts) => fetch(`http://127.0.0.1:${TEST_PORT}${url}`, opts)
      });
      assert(staleResult.restored === false, 'Stale ID returns restored: false');
      assert(staleResult.reason === 'not_found', 'Stale ID returns reason: not_found');
      assert(getActiveSessionDashboardId() === null, 'Stale ID automatically wiped from sessionStorage');

      // 10. Server/API failure handling
      setActiveSessionDashboardId('arbitrary-uuid-fail');
      const failResult = await restoreSessionDashboard({
        fetchFn: async () => {
          throw new Error('Connection refused / Server unreachable');
        }
      });
      assert(failResult.restored === false, 'Network/server error returns restored: false');
      assert(failResult.reason === 'server_error', 'Returns reason: server_error');
      assert(failResult.error.includes('Server unreachable'), 'Descriptive error message captured');

      clearActiveSessionDashboardId();

      // =============================================================
      // Day 5 Step 3: New Dashboard / Clear Workspace Tests
      // =============================================================
      console.log('\n--- Testing Day 5 Step 3: New Dashboard / Clear Workspace ---');

      const { startNewDashboard } = await import('../public/js/modules/dashboardManager.js');

      // 1. Create a dashboard in SQLite to ensure it survives "New Dashboard"
      const persistentDashPayload = {
        title: 'Persistent Corporate Dashboard',
        description: 'Must survive workspace clearing',
        dataset_signature: {
          fileName: 'corporate_data.csv',
          fileSize: 2048,
          rowCount: 10,
          columns: ['Region', 'Sales']
        },
        layout_config: [
          {
            id: 'chart-corp-sales',
            title: 'Corporate Sales',
            chartType: 'bar',
            xAxis: 'Region',
            yAxis: 'Sales',
            aggregation: 'sum'
          }
        ]
      };

      const createRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persistentDashPayload)
      });
      const createdDash = await createRes.json();
      assert(createRes.status === 201, 'Persistent dashboard created in SQLite');
      const persistentId = createdDash.id;

      // Load active workspace with data, active charts, and session ID
      state.setDataset({
        fileName: 'active_temporary_data.csv',
        fileSize: 1024,
        fields: ['Region', 'Sales'],
        data: [{ Region: 'North', Sales: '500' }],
        parseDurationMs: 2
      });
      state.activeDashboard.id = persistentId;
      state.activeDashboard.title = 'Persistent Corporate Dashboard';
      state.activeDashboard.charts = [
        {
          id: 'chart-corp-sales',
          title: 'Corporate Sales',
          chartType: 'bar',
          xAxis: 'Region',
          yAxis: 'Sales',
          aggregation: 'sum'
        }
      ];
      setActiveSessionDashboardId(persistentId);

      assert(state.dataset.data.length === 1, 'Active workspace has 1 data row');
      assert(state.activeDashboard.charts.length === 1, 'Active workspace has 1 active chart');
      assert(getActiveSessionDashboardId() === persistentId, 'Active dashboard ID present in sessionStorage');

      // 2. User Cancellation preserves the current workspace
      const cancelOutcome = startNewDashboard({
        confirmFn: () => false // User cancels
      });
      assert(cancelOutcome.success === false, 'Cancelled New Dashboard returns success: false');
      assert(cancelOutcome.cancelled === true, 'Cancelled New Dashboard returns cancelled: true');
      assert(state.dataset.data.length === 1, 'Dataset remains intact in memory after cancellation');
      assert(state.activeDashboard.charts.length === 1, 'Active charts preserved after cancellation');
      assert(state.activeDashboard.id === persistentId, 'Active dashboard ID preserved after cancellation');
      assert(getActiveSessionDashboardId() === persistentId, 'sessionStorage ID preserved after cancellation');

      // 3. User Confirmation clears workspace cleanly
      const confirmOutcome = startNewDashboard({
        confirmFn: () => true // User confirms
      });
      assert(confirmOutcome.success === true, 'Confirmed New Dashboard returns success: true');
      assert(confirmOutcome.cancelled === false, 'Confirmed New Dashboard returns cancelled: false');

      // Verify dataset cleared from browser memory
      assert(state.dataset.data.length === 0, 'New Dashboard clears active dataset rows from memory');
      assert(state.dataset.fields.length === 0, 'New Dashboard clears dataset fields');
      assert(state.dataset.fileName === null, 'New Dashboard resets dataset fileName to null');

      // Verify active charts cleared
      assert(state.activeDashboard.charts.length === 0, 'New Dashboard clears active charts');
      assert(state.activeDashboard.id === null, 'New Dashboard clears active dashboard ID');
      assert(state.activeDashboard.title === 'My Analytics Dashboard', 'New Dashboard resets dashboard title to default');

      // Verify sessionStorage cleared
      assert(getActiveSessionDashboardId() === null, 'New Dashboard removes dashboard ID from sessionStorage');
      assert(sessionStorage.getItem(SESSION_DASHBOARD_KEY) === null, 'sessionStorage entry is null');

      // 4. Previously saved dashboards remain intact in SQLite
      const verifySqliteRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards/${persistentId}`);
      assert(verifySqliteRes.status === 200, 'Previously saved dashboard still exists in SQLite (HTTP 200)');
      const verifySqliteData = await verifySqliteRes.json();
      assert(verifySqliteData.title === 'Persistent Corporate Dashboard', 'Saved dashboard title in SQLite intact');
      assert(verifySqliteData.layout_config.length === 1, 'Saved dashboard layout in SQLite intact');

      // 5. Browser refresh does NOT restore the previous dashboard
      const refreshResult = await restoreSessionDashboard({
        fetchFn: (url, opts) => fetch(`http://127.0.0.1:${TEST_PORT}${url}`, opts)
      });
      assert(refreshResult.restored === false, 'Refresh after New Dashboard does not restore old dashboard');
      assert(refreshResult.reason === 'no_session', 'Reason is no_session');
      assert(state.pendingReconnection === null, 'No pending reconnection triggered');
      assert(state.activeDashboard.charts.length === 0, 'Charts remain empty on fresh workspace');

      // 6. Existing saved dashboard can still be reopened via Saved Dashboards
      const reopenResult = await restoreSessionDashboard({
        dashboardId: persistentId,
        fetchFn: (url, opts) => fetch(`http://127.0.0.1:${TEST_PORT}${url}`, opts)
      });
      assert(reopenResult.restored === true, 'Existing dashboard can be reopened from Saved Dashboards');
      assert(reopenResult.pendingReconnect === true, 'Reopened dashboard prompts for CSV reconnection');
      assert(state.pendingReconnection.id === persistentId, 'Pending reconnection matches saved dashboard ID');
      assert(getActiveSessionDashboardId() === persistentId, 'Reopened dashboard re-establishes session ID');

      // Cleanup SQLite test dashboard
      await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards/${persistentId}`, {
        method: 'DELETE'
      });
      clearActiveSessionDashboardId();

      // =============================================================
      // Day 5 Step 4: Unsaved Changes Indicator Tests
      // =============================================================
      console.log('\n--- Testing Day 5 Step 4: Unsaved Changes Indicator ---');

      const {
        updateSaveStatusIndicator,
        handleBeforeUnload
      } = await import('../public/js/modules/dashboardManager.js');

      // 1. Newly initialized workspace starts clean
      state.clearWorkspace();
      assert(state.isDirty === false, 'Newly initialized workspace starts clean (isDirty === false)');

      // 2. Adding a chart marks the dashboard dirty
      state.setDataset({
        fileName: 'sample.csv',
        fileSize: 100,
        fields: ['Region', 'Sales'],
        data: [{ Region: 'East', Sales: '100' }],
        parseDurationMs: 1
      });
      state.markClean();
      assert(state.isDirty === false, 'Baseline reset to clean');

      const addedChart = state.addChart({
        title: 'Sales by Region',
        chartType: 'bar',
        xAxis: 'Region',
        yAxis: 'Sales'
      });
      assert(state.isDirty === true, 'Adding a chart marks the dashboard dirty');

      // 3. Editing chart configuration marks it dirty
      state.markClean();
      assert(state.isDirty === false, 'Reset to clean for edit test');
      state.updateChart(addedChart.id, { title: 'Updated Sales Title' });
      assert(state.isDirty === true, 'Editing chart title marks it dirty');

      state.markClean();
      state.updateChart(addedChart.id, { chartType: 'line' });
      assert(state.isDirty === true, 'Changing chart type marks it dirty');

      state.markClean();
      state.updateChart(addedChart.id, { aggregation: 'avg' });
      assert(state.isDirty === true, 'Changing aggregation marks it dirty');

      // 4. Deleting a chart marks it dirty
      state.markClean();
      assert(state.isDirty === false, 'Reset to clean for delete test');
      state.removeChart(addedChart.id);
      assert(state.isDirty === true, 'Deleting a chart marks it dirty');

      // 5. Reordering charts marks it dirty
      const c1 = state.addChart({ title: 'Chart 1', chartType: 'bar', xAxis: 'Region', yAxis: 'Sales' });
      const c2 = state.addChart({ title: 'Chart 2', chartType: 'line', xAxis: 'Region', yAxis: 'Sales' });
      state.markClean();
      assert(state.isDirty === false, 'Reset to clean for reorder test');
      state.moveChart(c2.id, 'up');
      assert(state.isDirty === true, 'Reordering charts marks it dirty');

      // 6. Successful save resets dirty state
      assert(state.isDirty === true, 'Dashboard is currently dirty before save');
      const saveRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Dirty State Test Dashboard',
          description: 'Testing clean reset on save',
          dataset_signature: {
            fileName: 'sample.csv',
            fileSize: 100,
            rowCount: 1,
            columns: ['Region', 'Sales']
          },
          layout_config: state.getLayoutConfig()
        })
      });
      assert(saveRes.status === 201, 'Save to SQLite succeeded');
      const savedDashData = await saveRes.json();
      state.activeDashboard.id = savedDashData.id;
      state.markClean();
      assert(state.isDirty === false, 'Successful save resets dirty state to clean');

      // 7. Failed save preserves dirty state
      state.markDirty();
      assert(state.isDirty === true, 'Dashboard marked dirty');
      try {
        const failedRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        assert(failedRes.status === 400, 'Server rejected invalid payload with HTTP 400');
      } catch (e) {
        // Expected
      }
      assert(state.isDirty === true, 'Failed save preserves dirty state');

      // 8. Opening and restoring a saved dashboard starts clean
      const savedDoc = {
        id: savedDashData.id,
        title: 'Restored Clean Dashboard',
        description: '',
        layout_config: state.getLayoutConfig()
      };
      state.loadDashboardDoc(savedDoc);
      assert(state.isDirty === false, 'Opening and restoring a saved dashboard starts clean');

      // 9. New Dashboard cancellation preserves dirty state
      state.markDirty();
      assert(state.isDirty === true, 'Dashboard marked dirty before New Dashboard prompt');
      const cancelNew = startNewDashboard({ confirmFn: () => false });
      assert(cancelNew.cancelled === true, 'New Dashboard prompt cancelled');
      assert(state.isDirty === true, 'New Dashboard cancellation preserves dirty state');

      // 10. Confirmed New Dashboard resets dirty state
      const confirmNew = startNewDashboard({ confirmFn: () => true });
      assert(confirmNew.success === true, 'New Dashboard confirmed');
      assert(state.isDirty === false, 'Confirmed New Dashboard resets dirty state to clean');

      // 11. Browser unload protection is enabled only when dirty
      state.markClean();
      let eventClean = { defaultPrevented: false, returnValue: undefined, preventDefault() { this.defaultPrevented = true; } };
      handleBeforeUnload(eventClean);
      assert(eventClean.defaultPrevented === false, 'beforeunload does NOT prevent navigation when clean');
      assert(eventClean.returnValue === undefined, 'beforeunload leaves returnValue undefined when clean');

      state.markDirty();
      let eventDirty = { defaultPrevented: false, returnValue: undefined, preventDefault() { this.defaultPrevented = true; } };
      handleBeforeUnload(eventDirty);
      assert(eventDirty.defaultPrevented === true, 'beforeunload prevents navigation when dirty');
      assert(eventDirty.returnValue === '', 'beforeunload sets returnValue to string when dirty');

      // 12. Theme changes and ordinary UI interactions do not mark the dashboard dirty
      state.markClean();
      state.setPagination({ currentPage: 2, pageSize: 50, filterQuery: 'search-term' });
      assert(state.isDirty === false, 'Pagination and search interactions do not mark dashboard dirty');

      state.setDatasetProfile({ columns: [{ name: 'Region', type: 'categorical' }] });
      assert(state.isDirty === false, 'Data profiling does not mark dashboard dirty');

      // Cleanup saved test dashboard from SQLite
      await fetch(`http://127.0.0.1:${TEST_PORT}/api/dashboards/${savedDashData.id}`, {
        method: 'DELETE'
      });
      state.clearWorkspace();
    } finally {
      await new Promise(resolve => testServer.close(resolve));
    }

    console.log(`\nDay 5 Test Summary: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('All Day 5 tests passed successfully!\n');
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Day 5 Test encountered unexpected error:', err);
    process.exitCode = 1;
  }
}

runDay5Tests();
