/**
 * Lumora Application Entry Point
 * Privacy-first CSV Analytics Studio & Dashboard Builder.
 */

import { state } from './state.js';
import { parseCSVFile, loadSampleDataset, formatBytes } from './modules/csvManager.js';
import { initTablePreview } from './modules/tablePreview.js';
import { renderChart, destroyChart, destroyAllCharts, refreshChartsTheme } from './modules/chartManager.js';
import { initDashboardManager, restoreSessionDashboard, clearActiveSessionDashboardId } from './modules/dashboardManager.js';
import { initProfilerUI } from './modules/profilerUI.js';
import { showToast } from './modules/toast.js';
import { initDashboardGrid } from './modules/dashboardGrid.js';
import { initTheme, onThemeChange } from './modules/themeManager.js';


// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('csv-file-input');
const btnBrowse = document.getElementById('btn-browse');
const btnLoadSample = document.getElementById('btn-load-sample');
const btnReplaceCsv = document.getElementById('btn-replace-csv');
const btnClearCsv = document.getElementById('btn-clear-csv');

const uploadSection = document.getElementById('upload-section');
const datasetBanner = document.getElementById('dataset-banner');
const tableSection = document.getElementById('table-section');
const chartSection = document.getElementById('chart-section');
const dashboardGridSection = document.getElementById('dashboard-grid-section');

const datasetName = document.getElementById('dataset-name');
const statRows = document.getElementById('stat-rows');
const statCols = document.getElementById('stat-cols');
const statSize = document.getElementById('stat-size');
const statTime = document.getElementById('stat-time');

const filterInput = document.getElementById('filter-input');
const pageSizeSelect = document.getElementById('page-size-select');

const selectChartType = document.getElementById('select-chart-type');
const selectXAxis = document.getElementById('select-x-axis');
const selectYAxis = document.getElementById('select-y-axis');
const selectAggregation = document.getElementById('select-aggregation');
const chartDisplayTitle = document.getElementById('chart-display-title');
const barChartCanvas = document.getElementById('main-bar-chart');

const serverStatusDot = document.getElementById('server-status-dot');
const serverStatusText = document.getElementById('server-status-text');

// Initialize submodules
initTablePreview();
initDashboardManager();
initProfilerUI();

/**
 * Check backend API health
 */
async function checkServerHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status === 'ok') {
      serverStatusDot.className = 'status-dot online';
      serverStatusText.textContent = 'Connected';
      const container = document.getElementById('server-status');
      if (container) container.setAttribute('title', 'Lumora SQLite API is online and healthy.');
    } else {
      throw new Error('Unexpected health response');
    }
  } catch (err) {
    console.warn('Backend server unreachable:', err.message);
    serverStatusDot.className = 'status-dot offline';
    serverStatusText.textContent = 'Disconnected';
    const container = document.getElementById('server-status');
    if (container) container.setAttribute('title', 'Backend server unreachable. Make sure the server is running.');
  }
}

/**
 * Populate column selector dropdowns for chart axes
 */
function populateAxisDropdowns(fields) {
  if (!fields || fields.length === 0) return;

  const currentX = state.activeDashboard.chartConfig.xAxis;
  const currentY = state.activeDashboard.chartConfig.yAxis;

  selectXAxis.innerHTML = '';
  selectYAxis.innerHTML = '';

  for (const field of fields) {
    const optX = document.createElement('option');
    optX.value = field;
    optX.textContent = field;
    if (field === currentX) optX.selected = true;
    selectXAxis.appendChild(optX);

    const optY = document.createElement('option');
    optY.value = field;
    optY.textContent = field;
    if (field === currentY) optY.selected = true;
    selectYAxis.appendChild(optY);
  }

  selectChartType.value = state.activeDashboard.chartConfig.chartType || 'bar';
  selectAggregation.value = state.activeDashboard.chartConfig.aggregation || 'sum';
}

/**
 * Trigger rendering of the main active chart
 */
function updateMainChart() {
  const { data } = state.dataset;
  if (!data || data.length === 0) {
    destroyChart();
    return;
  }

  const { chartConfig } = state.activeDashboard;
  if (!chartConfig.xAxis || !chartConfig.yAxis) {
    return;
  }

  const chartType = chartConfig.chartType || 'bar';
  const typeLabel = chartType.charAt(0).toUpperCase() + chartType.slice(1);
  const metricLabel = chartConfig.aggregation === 'count' ? 'Count' : chartConfig.yAxis;
  const title = `${typeLabel}: ${metricLabel} by ${chartConfig.xAxis} (${chartConfig.aggregation.toUpperCase()})`;
  chartDisplayTitle.textContent = title;

  renderChart(barChartCanvas, {
    rows: data,
    chartType,
    xAxis: chartConfig.xAxis,
    yAxis: chartConfig.yAxis,
    aggregation: chartConfig.aggregation,
    title
  });
}

/**
 * Setup Chart Control Listeners
 */
function setupChartControls() {
  selectChartType.addEventListener('change', (e) => {
    state.setChartConfig({ chartType: e.target.value });
    updateMainChart();
  });

  selectXAxis.addEventListener('change', (e) => {
    state.setChartConfig({ xAxis: e.target.value });
    updateMainChart();
  });

  selectYAxis.addEventListener('change', (e) => {
    state.setChartConfig({ yAxis: e.target.value });
    updateMainChart();
  });

  selectAggregation.addEventListener('change', (e) => {
    state.setChartConfig({ aggregation: e.target.value });
    updateMainChart();
  });
}

/**
 * Setup Drag & Drop Handlers
 */
function setupDropzone() {
  btnBrowse.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      parseCSVFile(file);
      fileInput.value = '';
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');

    const dt = e.dataTransfer;
    const file = dt.files && dt.files[0];
    if (file) {
      parseCSVFile(file);
    }
  });

  btnLoadSample.addEventListener('click', (e) => {
    e.stopPropagation();
    loadSampleDataset();
  });

  btnReplaceCsv.addEventListener('click', () => {
    fileInput.click();
  });

  btnClearCsv.addEventListener('click', () => {
    state.clearWorkspace();
    clearActiveSessionDashboardId();
    showToast('Dataset cleared from memory.', 'info');
  });
}

/**
 * Setup Controls (Filter, Page Size)
 */
function setupControls() {
  let debounceTimeout = null;
  filterInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      state.setPagination({
        filterQuery: e.target.value,
        currentPage: 1
      });
    }, 200);
  });

  pageSizeSelect.addEventListener('change', (e) => {
    state.setPagination({
      pageSize: parseInt(e.target.value, 10),
      currentPage: 1
    });
  });
}

/**
 * Handle state changes (update UI visibility and metrics)
 */
state.subscribe((event, payload) => {
  if (event === 'dataset:loaded') {
    uploadSection.classList.add('hidden');
    datasetBanner.classList.remove('hidden');
    chartSection.classList.add('hidden');
        dashboardGridSection.classList.remove('hidden');
    tableSection.classList.remove('hidden');

    datasetName.textContent = payload.fileName || 'Uploaded CSV';
    statRows.textContent = payload.rowCount.toLocaleString();
    statCols.textContent = payload.fields.length.toLocaleString();
    statSize.textContent = formatBytes(payload.fileSize);
    statTime.textContent = `${payload.parseDurationMs} ms`;

    populateAxisDropdowns(payload.fields);
    updateMainChart();
  } else if (event === 'dashboard:loaded') {
    // A saved dashboard was reopened
    if (state.dataset.fields && state.dataset.fields.length > 0) {
      uploadSection.classList.add('hidden');
      datasetBanner.classList.remove('hidden');
      chartSection.classList.add('hidden');
      dashboardGridSection.classList.remove('hidden');
      tableSection.classList.remove('hidden');

      populateAxisDropdowns(state.dataset.fields);
      updateMainChart();
    }
  } else if (event === 'dataset:cleared') {
    uploadSection.classList.remove('hidden');
    datasetBanner.classList.add('hidden');
    chartSection.classList.add('hidden');
    dashboardGridSection.classList.add('hidden');
    tableSection.classList.add('hidden');
    destroyAllCharts();
    filterInput.value = '';
  }
});

// Module scripts are deferred — DOMContentLoaded has already fired by the
// time this module executes, so register init calls directly.
initTheme();
onThemeChange(() => {
  refreshChartsTheme();
});

setupDropzone();
setupControls();
setupChartControls();
checkServerHealth();
initDashboardGrid();
restoreSessionDashboard();


