/**
 * Dashboard Grid Module for Lumora.
 * Manages responsive multi-chart rendering, reordering (move up/down),
 * individual chart editing, removal, and per-widget graceful degradation.
 */

import { state } from '../state.js';
import { renderChart, destroyChart, destroyAllCharts } from './chartManager.js';
import { showToast } from './toast.js';

let gridContainer = null;
let editModal = null;
let editForm = null;
let editChartId = null;

let editTitleInput = null;
let editTypeSelect = null;
let editXAxisSelect = null;
let editYAxisSelect = null;
let editAggregationSelect = null;

export function initDashboardGrid() {
  gridContainer = document.getElementById('dashboard-grid');
  editModal = document.getElementById('chart-edit-modal');
  editForm = document.getElementById('chart-edit-form');

  editTitleInput = document.getElementById('edit-chart-title');
  editTypeSelect = document.getElementById('edit-chart-type');
  editXAxisSelect = document.getElementById('edit-chart-x-axis');
  editYAxisSelect = document.getElementById('edit-chart-y-axis');
  editAggregationSelect = document.getElementById('edit-chart-aggregation');

  // "Add Chart" button
  const btnAddChart = document.getElementById('btn-add-chart');
  if (btnAddChart) {
    btnAddChart.addEventListener('click', () => {
      if (!state.dataset.data || state.dataset.data.length === 0) {
        showToast('Please load a CSV dataset before adding charts.', 'warning');
        return;
      }
      const newChart = state.addChart();
      openChartEditor(newChart.id);
      showToast('New chart added! Configure your axes.', 'info');
    });
  }

  setupEditModal();

  // Subscribe to state updates
  state.subscribe((event) => {
    if (event === 'charts:changed' || event === 'dataset:loaded' || event === 'dashboard:loaded') {
      renderDashboardGrid();
    } else if (event === 'dataset:cleared') {
      destroyAllCharts();
      if (gridContainer) gridContainer.innerHTML = '';
    }
  });
}

/**
 * Setup Edit Modal listeners
 */
function setupEditModal() {
  const btnClose = document.getElementById('btn-close-chart-edit');
  const btnCancel = document.getElementById('btn-cancel-chart-edit');

  const closeModal = () => {
    if (editModal) editModal.classList.add('hidden');
    editChartId = null;
  };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeModal();
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!editChartId) return;

      const chartType = editTypeSelect?.value || 'bar';
      const xAxis = editXAxisSelect?.value || '';
      const yAxis = editYAxisSelect?.value || '';
      const aggregation = editAggregationSelect?.value || 'sum';
      const typeLabel = chartType.charAt(0).toUpperCase() + chartType.slice(1);
      const metricLabel = aggregation === 'count' ? 'Count' : yAxis;

      const title = editTitleInput?.value?.trim() || `${typeLabel}: ${metricLabel} by ${xAxis}`;

      state.updateChart(editChartId, { title, chartType, xAxis, yAxis, aggregation });

      showToast(`Updated chart "${title}"`, 'success');
      closeModal();
    });
  }
}




/**
 * Open chart edit modal for a given chart ID
 */
export function openChartEditor(chartId) {
  const chart = state.activeDashboard.charts.find(c => c.id === chartId);
  if (!chart || !editModal) return;

  editChartId = chartId;
  const fields = state.dataset.fields || [];

  // Populate axis dropdowns
  editXAxisSelect.innerHTML = '';
  editYAxisSelect.innerHTML = '';

  fields.forEach(field => {
    const optX = document.createElement('option');
    optX.value = field;
    optX.textContent = field;
    if (field === chart.xAxis) optX.selected = true;
    editXAxisSelect.appendChild(optX);

    const optY = document.createElement('option');
    optY.value = field;
    optY.textContent = field;
    if (field === chart.yAxis) optY.selected = true;
    editYAxisSelect.appendChild(optY);
  });

  editTitleInput.value = chart.title || '';
  editTypeSelect.value = chart.chartType || 'bar';
  editAggregationSelect.value = chart.aggregation || 'sum';

  editModal.classList.remove('hidden');
}

/**
 * Render all charts in the responsive CSS Grid
 */
export function renderDashboardGrid() {
  if (!gridContainer) return;

  const { charts } = state.activeDashboard;
  const { data, fields } = state.dataset;

  if (!data || data.length === 0) {
    destroyAllCharts();
    gridContainer.innerHTML = '';
    return;
  }

  if (!charts || charts.length === 0) {
    destroyAllCharts();
    gridContainer.innerHTML = `
      <div class="empty-grid-placeholder" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; border: 2px dashed var(--border-color); border-radius: 12px; background: var(--card-bg);">
        <p style="font-weight: 600; font-size: 1.1rem; color: var(--text-color); margin-bottom: 0.5rem;">No charts in this dashboard</p>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.25rem;">Add a chart to visualize your dataset from different angles.</p>
        <button type="button" class="btn btn-primary" onclick="document.getElementById('btn-add-chart').click()">+ Add Chart</button>
      </div>
    `;
    return;
  }

  // Clear previous HTML and cleanup existing chart instances
  destroyAllCharts();
  gridContainer.innerHTML = '';

  const fieldsSet = new Set(fields || []);

  charts.forEach((chart, index) => {
    const card = document.createElement('div');
    card.className = 'dashboard-chart-card';
    card.id = `card-${chart.id}`;

    // Verify column availability for this specific chart (graceful degradation)
    const missingCols = [];
    if (!chart.xAxis || !fieldsSet.has(chart.xAxis)) {
      missingCols.push(chart.xAxis || '(Unset X-Axis)');
    }
    if (chart.aggregation !== 'count' && (!chart.yAxis || !fieldsSet.has(chart.yAxis))) {
      missingCols.push(chart.yAxis || '(Unset Y-Axis)');
    }

    const isFirst = index === 0;
    const isLast = index === charts.length - 1;

    // Header with title, type badge, and action controls
    card.innerHTML = `
      <div class="dash-card-header">
        <div class="dash-card-title-group">
          <span class="badge badge-numeric" style="text-transform: uppercase;">${escapeHtml(chart.chartType || 'bar')}</span>
          <h3 class="dash-card-title" title="${escapeHtml(chart.title)}">${escapeHtml(chart.title)}</h3>
        </div>
        <div class="dash-card-actions">
          <button type="button" class="btn-icon" data-action="move-up" data-id="${chart.id}" title="Move Up" ${isFirst ? 'disabled' : ''}>▲</button>
          <button type="button" class="btn-icon" data-action="move-down" data-id="${chart.id}" title="Move Down" ${isLast ? 'disabled' : ''}>▼</button>
          <button type="button" class="btn-icon" data-action="edit" data-id="${chart.id}" title="Edit Chart Settings">✎</button>
          <button type="button" class="btn-icon btn-icon-danger" data-action="delete" data-id="${chart.id}" title="Remove Chart">&times;</button>
        </div>
      </div>
      <div class="dash-card-body">
        ${missingCols.length > 0
          ? `<div class="error-banner" style="margin: 1.5rem 1rem;">
               <strong>Chart Unavailable:</strong> Missing column(s): <code>${escapeHtml(missingCols.join(', '))}</code> in current dataset.
             </div>`
          : `<div class="chart-canvas-wrapper"><canvas id="canvas-${chart.id}"></canvas></div>`
        }
      </div>
    `;

    // Attach actions
    card.querySelector('[data-action="move-up"]').onclick = () => state.moveChart(chart.id, 'up');
    card.querySelector('[data-action="move-down"]').onclick = () => state.moveChart(chart.id, 'down');
    card.querySelector('[data-action="edit"]').onclick = () => openChartEditor(chart.id);
    card.querySelector('[data-action="delete"]').onclick = () => {
      destroyChart(chart.id);
      state.removeChart(chart.id);
      showToast('Chart removed from dashboard.', 'info');
    };

    gridContainer.appendChild(card);

    // If valid, render Chart.js instance into canvas
    if (missingCols.length === 0) {
      const canvas = card.querySelector(`#canvas-${chart.id}`);
      if (canvas) {
        renderChart(canvas, {
          id: chart.id,
          rows: data,
          chartType: chart.chartType || 'bar',
          xAxis: chart.xAxis,
          yAxis: chart.yAxis,
          aggregation: chart.aggregation || 'sum',
          title: chart.title
        });
      }
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
