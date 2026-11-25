/**
 * Dashboard Manager for Lumora.
 * Handles Saving (create vs update in-place), Listing, Reopening, Renaming, Deleting,
 * and Granular CSV Reconnection (allowing unaffected charts to render).
 * Strictly enforces privacy: No raw CSV data is ever posted to the server.
 */

import { state } from '../state.js';
import { showToast } from './toast.js';
import { validateDatasetAgainstLayout } from './schemaValidator.js';

let saveModal, saveForm, inputDashTitle, inputDashDesc, saveModalNotice, btnSubmitSave, btnSaveAsNew;
let listModal, dashboardListContainer;
let reconnectModal, reconnectFilenameLabel, reconnectColsLabel, reconnectDropzone, reconnectFileInput, reconnectErrorBanner;

export const SESSION_DASHBOARD_KEY = 'lumora_active_dashboard_id';

export function getActiveSessionDashboardId() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(SESSION_DASHBOARD_KEY);
    }
  } catch (err) {
    console.warn('Unable to access sessionStorage:', err);
  }
  return null;
}

export function setActiveSessionDashboardId(id) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (id) {
        sessionStorage.setItem(SESSION_DASHBOARD_KEY, id);
      } else {
        sessionStorage.removeItem(SESSION_DASHBOARD_KEY);
      }
    }
  } catch (err) {
    console.warn('Unable to write to sessionStorage:', err);
  }
}

export function clearActiveSessionDashboardId() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_DASHBOARD_KEY);
    }
  } catch (err) {
    console.warn('Unable to clear sessionStorage:', err);
  }
}

/**
 * Starts a new dashboard workspace.
 * Asks for confirmation if workspace contains data or dashboard configuration.
 * Clears in-memory dataset, active dashboard state, and sessionStorage.
 * Does NOT delete any saved dashboards from SQLite.
 */
export function startNewDashboard(options = {}) {
  const hasData = state.dataset && state.dataset.data && state.dataset.data.length > 0;
  const hasCharts = state.activeDashboard && state.activeDashboard.charts && state.activeDashboard.charts.length > 0;
  const hasSavedId = !!(state.activeDashboard && state.activeDashboard.id);
  const isDirty = state.isDirty;

  if (hasData || hasCharts || hasSavedId || isDirty) {
    const confirmFn = options.confirmFn || (typeof window !== 'undefined' && window.confirm ? window.confirm.bind(window) : () => true);
    let message =
      'Start a new dashboard?\n\n' +
      'This will clear the current workspace and return to the CSV upload screen. ' +
      'Any dashboards already saved to SQLite will remain safe and accessible via "Saved Dashboards".';
    if (isDirty) {
      message =
        'You have unsaved changes in your dashboard!\n\n' +
        'Starting a new dashboard will discard your unsaved changes and return to the CSV upload screen. ' +
        'Any dashboards already saved to SQLite will remain safe.\n\n' +
        'Do you want to proceed?';
    }

    const proceed = confirmFn(message);
    if (!proceed) {
      return { success: false, cancelled: true };
    }
  }

  // Clear active dashboard ID from sessionStorage
  clearActiveSessionDashboardId();

  // Clear workspace in state (dataset, profile, charts, activeDashboard meta)
  state.clearWorkspace();

  showToast('Started new dashboard workspace.', 'info');
  return { success: true, cancelled: false };
}

/**
 * Updates visual unsaved changes status indicator
 */
export function updateSaveStatusIndicator() {
  if (typeof document === 'undefined') return;
  const indicator = document.getElementById('save-status-indicator');
  const textSpan = document.getElementById('save-status-text');
  if (!indicator || !textSpan) return;

  if (state.isDirty) {
    indicator.className = 'save-status-indicator dirty';
    indicator.setAttribute('title', 'You have unsaved changes in your dashboard');
    textSpan.textContent = 'Unsaved changes';
  } else {
    indicator.className = 'save-status-indicator clean';
    indicator.setAttribute('title', 'All dashboard changes are saved to SQLite');
    textSpan.textContent = 'All changes saved';
  }
}

/**
 * Handles navigation/refresh confirmation via beforeunload
 */
export function handleBeforeUnload(e) {
  if (state.isDirty) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      e.returnValue = '';
    }
    return '';
  }
}

export function setupBeforeUnload() {
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload);
  }
}

export function initDashboardManager() {
  saveModal = document.getElementById('save-modal');
  saveForm = document.getElementById('save-dashboard-form');
  inputDashTitle = document.getElementById('dash-title-input');
  inputDashDesc = document.getElementById('dash-desc-input');
  saveModalNotice = document.getElementById('save-modal-notice');
  btnSubmitSave = document.getElementById('btn-submit-save');
  btnSaveAsNew = document.getElementById('btn-save-as-new');

  listModal = document.getElementById('list-modal');
  dashboardListContainer = document.getElementById('saved-dashboards-list');

  reconnectModal = document.getElementById('reconnect-modal');
  reconnectFilenameLabel = document.getElementById('reconnect-filename');
  reconnectColsLabel = document.getElementById('reconnect-columns');
  reconnectDropzone = document.getElementById('reconnect-dropzone');
  reconnectFileInput = document.getElementById('reconnect-file-input');
  reconnectErrorBanner = document.getElementById('reconnect-error-banner');

  setupSaveModal();
  setupListModal();
  setupReconnectModal();

  // Attach "New Dashboard" button listeners
  const btnNewDashboard = document.getElementById('btn-new-dashboard');
  if (btnNewDashboard) {
    btnNewDashboard.addEventListener('click', () => startNewDashboard());
  }
  const btnHeaderNewDashboard = document.getElementById('btn-header-new-dashboard');
  if (btnHeaderNewDashboard) {
    btnHeaderNewDashboard.addEventListener('click', () => startNewDashboard());
  }

  state.subscribe((event, payload) => {
    if (event === 'dashboard:loaded' && payload && payload.id) {
      setActiveSessionDashboardId(payload.id);
    }
    if (event === 'dashboard:dirtyChanged' || event === 'dashboard:loaded' || event === 'dataset:cleared') {
      updateSaveStatusIndicator();
    }
  });

  setupBeforeUnload();
  updateSaveStatusIndicator();
}

/**
 * Setup Save Modal
 */
function setupSaveModal() {
  const btnOpenSave = document.getElementById('btn-save-dashboard');
  const btnOpenSaveSingle = document.getElementById('btn-save-dashboard-single');
  const btnCloseSave = document.getElementById('btn-close-save-modal');
  const btnCancelSave = document.getElementById('btn-cancel-save');

  const openSaveDialog = () => {
    if (!state.dataset.data || state.dataset.data.length === 0) {
      showToast('Please load a CSV dataset before saving a dashboard.', 'warning');
      return;
    }
    inputDashTitle.value = state.activeDashboard.title || 'My Analytics Dashboard';
    inputDashDesc.value = state.activeDashboard.description || '';

    // Check if updating existing dashboard or creating new
    if (state.activeDashboard.id) {
      if (saveModalNotice) {
        saveModalNotice.innerHTML = `Editing existing dashboard (ID: <code>${state.activeDashboard.id.substring(0, 8)}...</code>). Update existing or save as a new copy.`;
        saveModalNotice.classList.remove('hidden');
      }
      if (btnSubmitSave) btnSubmitSave.textContent = 'Save Changes (Update)';
      if (btnSaveAsNew) btnSaveAsNew.classList.remove('hidden');
    } else {
      if (saveModalNotice) saveModalNotice.classList.add('hidden');
      if (btnSubmitSave) btnSubmitSave.textContent = 'Save to SQLite';
      if (btnSaveAsNew) btnSaveAsNew.classList.add('hidden');
    }

    saveModal.classList.remove('hidden');
    inputDashTitle.focus();
  };

  if (btnOpenSave) {
    btnOpenSave.addEventListener('click', openSaveDialog);
  }
  if (btnOpenSaveSingle) {
    btnOpenSaveSingle.addEventListener('click', openSaveDialog);
  }

  const closeSave = () => saveModal.classList.add('hidden');
  if (btnCloseSave) btnCloseSave.addEventListener('click', closeSave);
  if (btnCancelSave) btnCancelSave.addEventListener('click', closeSave);

  // Handle Form Submit: Update existing (if ID present) or Create new
  if (saveForm) {
    saveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = inputDashTitle.value.trim();
      if (!title) {
        showToast('Please provide a dashboard title.', 'warning');
        return;
      }

      const description = inputDashDesc.value.trim();
      const layoutConfig = state.getLayoutConfig();

      if (state.activeDashboard.id) {
        // UPDATE existing dashboard
        await performUpdateDashboard(state.activeDashboard.id, title, description, layoutConfig);
      } else {
        // CREATE new dashboard
        await performCreateDashboard(title, description, layoutConfig);
      }
      closeSave();
    });
  }

  // Handle "Save as New Copy"
  if (btnSaveAsNew) {
    btnSaveAsNew.addEventListener('click', async () => {
      const title = inputDashTitle.value.trim();
      if (!title) {
        showToast('Please provide a dashboard title.', 'warning');
        return;
      }
      const description = inputDashDesc.value.trim();
      const layoutConfig = state.getLayoutConfig();
      await performCreateDashboard(`${title} (Copy)`, description, layoutConfig);
      closeSave();
    });
  }
}

/**
 * API call to create new dashboard (POST)
 */
async function performCreateDashboard(title, description, layoutConfig) {
  const datasetSignature = state.getDatasetSignature();

  try {
    const payload = {
      title,
      description,
      dataset_signature: datasetSignature,
      layout_config: layoutConfig
    };

    const res = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save dashboard');

    state.activeDashboard.id = data.id;
    setActiveSessionDashboardId(data.id);
    state.setDashboardMeta(title, description);
    state.markClean();
    showToast(`Dashboard "${title}" saved to SQLite!`, 'success');
  } catch (err) {
    console.error('Create dashboard error:', err);
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

/**
 * API call to update existing dashboard in-place (PUT)
 */
async function performUpdateDashboard(id, title, description, layoutConfig) {
  try {
    const payload = {
      title,
      description,
      layout_config: layoutConfig
    };

    const res = await fetch(`/api/dashboards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update dashboard');

    state.setDashboardMeta(title, description);
    setActiveSessionDashboardId(id);
    state.markClean();
    showToast(`Dashboard "${title}" updated!`, 'success');
  } catch (err) {
    console.error('Update dashboard error:', err);
    showToast(`Update failed: ${err.message}`, 'error');
  }
}

/**
 * Setup Saved Dashboards List Modal
 */
function setupListModal() {
  const btnOpenList = document.getElementById('btn-saved-dashboards');
  const btnCloseList = document.getElementById('btn-close-list-modal');

  if (btnOpenList) {
    btnOpenList.addEventListener('click', () => {
      loadSavedDashboardsList();
      listModal.classList.remove('hidden');
    });
  }

  const closeList = () => listModal.classList.add('hidden');
  if (btnCloseList) btnCloseList.addEventListener('click', closeList);
}

/**
 * Fetch and display list of saved dashboards from /api/dashboards
 */
export async function loadSavedDashboardsList() {
  if (!dashboardListContainer) return;

  dashboardListContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: #94a3b8;">Loading saved dashboards...</div>';

  try {
    const res = await fetch('/api/dashboards');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dashboards = await res.json();

    if (dashboards.length === 0) {
      dashboardListContainer.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: #64748b;">
          <p style="font-weight: 500; font-size: 1rem; margin-bottom: 0.5rem;">No saved dashboards yet.</p>
          <p style="font-size: 0.85rem; color: #94a3b8;">Create charts and click "Save Dashboard" to persist them in SQLite.</p>
        </div>
      `;
      return;
    }

    dashboardListContainer.innerHTML = '';
    dashboards.forEach((dash) => {
      const item = document.createElement('div');
      item.className = 'saved-dash-card';

      const sig = dash.dataset_signature || {};
      const fileName = sig.fileName || 'unknown.csv';
      const colCount = sig.columns ? sig.columns.length : 0;
      const formattedDate = new Date(dash.updated_at || dash.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      item.innerHTML = `
        <div class="saved-dash-meta">
          <h4 class="saved-dash-title">${escapeHtml(dash.title)}</h4>
          <div class="saved-dash-sub">
            <span>Dataset: <strong>${escapeHtml(fileName)}</strong> (${colCount} cols)</span>
            <span>&bull;</span>
            <span>Updated: ${formattedDate}</span>
          </div>
          ${dash.description ? `<p class="saved-dash-desc">${escapeHtml(dash.description)}</p>` : ''}
        </div>
        <div class="saved-dash-actions">
          <button type="button" class="btn btn-primary btn-sm btn-open-dash" data-id="${dash.id}">Open</button>
          <button type="button" class="btn btn-secondary btn-sm btn-rename-dash" data-id="${dash.id}" title="Rename dashboard">Rename</button>
          <button type="button" class="btn btn-danger btn-sm btn-delete-dash" data-id="${dash.id}" title="Delete dashboard">Delete</button>
        </div>
      `;

      // Attach button handlers
      const btnOpen = item.querySelector('.btn-open-dash');
      const btnRename = item.querySelector('.btn-rename-dash');
      const btnDelete = item.querySelector('.btn-delete-dash');

      btnOpen.addEventListener('click', () => reopenDashboard(dash.id));
      btnRename.addEventListener('click', () => renameDashboard(dash.id, dash.title));
      btnDelete.addEventListener('click', () => deleteDashboard(dash.id, dash.title));

      dashboardListContainer.appendChild(item);
    });
  } catch (err) {
    console.error('Error fetching dashboard list:', err);
    dashboardListContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: #dc2626;">Failed to load dashboards: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * Rename a dashboard in-place via PUT
 */
async function renameDashboard(dashboardId, currentTitle) {
  const newTitle = prompt('Enter new title for dashboard:', currentTitle);
  if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) return;

  try {
    const res = await fetch(`/api/dashboards/${dashboardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`Renamed to "${newTitle.trim()}"`, 'success');

    // If currently active dashboard is this one, update in memory
    if (state.activeDashboard.id === dashboardId) {
      state.setDashboardMeta(newTitle.trim(), state.activeDashboard.description);
    }
    loadSavedDashboardsList();
  } catch (err) {
    console.error('Error renaming dashboard:', err);
    showToast(`Rename failed: ${err.message}`, 'error');
  }
}

/**
 * Reopen a saved dashboard
 */
export async function reopenDashboard(dashboardId) {
  try {
    const res = await fetch(`/api/dashboards/${dashboardId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dashDoc = await res.json();

    listModal.classList.add('hidden');

    const layout = dashDoc.layout_config;
    const currentFields = state.dataset.fields;
    const hasData = state.dataset.data && state.dataset.data.length > 0;

    if (hasData && currentFields.length > 0) {
      const validation = validateDatasetAgainstLayout(currentFields, layout);
      if (validation.isValid) {
        state.loadDashboardDoc(dashDoc);
        setActiveSessionDashboardId(dashDoc.id);
        showToast(`Loaded dashboard: "${dashDoc.title}"`, 'success');
        return;
      }
    }

    // Dataset missing or missing columns -> Open Reconnect Modal
    setActiveSessionDashboardId(dashDoc.id);
    openReconnectModal(dashDoc);
  } catch (err) {
    console.error('Error reopening dashboard:', err);
    showToast(`Failed to open dashboard: ${err.message}`, 'error');
  }
}

/**
 * Delete a saved dashboard
 */
async function deleteDashboard(dashboardId, title) {
  if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

  try {
    const res = await fetch(`/api/dashboards/${dashboardId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`Dashboard "${title}" deleted.`, 'info');

    if (state.activeDashboard.id === dashboardId) {
      state.activeDashboard.id = null;
      clearActiveSessionDashboardId();
    }
    if (state.pendingReconnection && state.pendingReconnection.id === dashboardId) {
      state.pendingReconnection = null;
      clearActiveSessionDashboardId();
    }
    loadSavedDashboardsList();
  } catch (err) {
    console.error('Error deleting dashboard:', err);
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

/**
 * Setup CSV Reconnect Modal
 */
function setupReconnectModal() {
  const btnCloseReconnect = document.getElementById('btn-close-reconnect-modal');
  const btnCancelReconnect = document.getElementById('btn-cancel-reconnect');
  const btnBrowseReconnect = document.getElementById('btn-browse-reconnect');

  const closeReconnect = () => {
    if (reconnectModal) reconnectModal.classList.add('hidden');
    if (reconnectErrorBanner) reconnectErrorBanner.classList.add('hidden');
    // Note: Do not clear state.pendingReconnection on cancel so dashboard configuration is preserved
  };

  if (btnCloseReconnect) btnCloseReconnect.addEventListener('click', closeReconnect);
  if (btnCancelReconnect) btnCancelReconnect.addEventListener('click', closeReconnect);

  if (btnBrowseReconnect) {
    btnBrowseReconnect.addEventListener('click', () => reconnectFileInput.click());
  }

  if (reconnectDropzone) {
    reconnectDropzone.addEventListener('click', () => reconnectFileInput.click());

    reconnectDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      reconnectDropzone.classList.add('dragover');
    });

    reconnectDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      reconnectDropzone.classList.remove('dragover');
    });

    reconnectDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      reconnectDropzone.classList.remove('dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleReconnectedFile(file);
    });
  }

  if (reconnectFileInput) {
    reconnectFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleReconnectedFile(file);
        reconnectFileInput.value = '';
      }
    });
  }
}

/**
 * Display Reconnect Modal for a pending dashboard
 */
export function openReconnectModal(dashDoc) {
  state.pendingReconnection = dashDoc;

  if (typeof document !== 'undefined') {
    const reconnectTitleLabel = document.getElementById('reconnect-dash-title');
    if (reconnectTitleLabel) {
      reconnectTitleLabel.textContent = dashDoc.title || 'Saved Dashboard';
    }

    const fileName = dashDoc.dataset_signature ? dashDoc.dataset_signature.fileName : 'dataset.csv';
    if (reconnectFilenameLabel) {
      reconnectFilenameLabel.textContent = fileName;
    }

    const validation = validateDatasetAgainstLayout([], dashDoc.layout_config);
    if (reconnectColsLabel) {
      reconnectColsLabel.textContent = validation.requiredColumns.join(', ') || 'N/A';
    }

    if (reconnectErrorBanner) reconnectErrorBanner.classList.add('hidden');
    if (reconnectModal) reconnectModal.classList.remove('hidden');
  }
}

/**
 * Handle reconnected CSV file with granular fallback
 */
function handleReconnectedFile(file) {
  if (!file) return;
  const pendingDash = state.pendingReconnection;
  if (!pendingDash) return;

  const isString = typeof file === 'string';
  const fileName = (!isString && file.name) ? file.name : 'dataset.csv';
  const fileSize = (!isString && typeof file.size === 'number') ? file.size : (isString ? file.length : 0);
  const isCSV = fileName.toLowerCase().endsWith('.csv') || (!isString && file.type === 'text/csv') || isString;
  if (!isCSV) {
    showReconnectError(`"${fileName}" is not a CSV file (.csv required).`);
    return;
  }

  const papa = typeof Papa !== 'undefined' ? Papa : (typeof globalThis !== 'undefined' ? globalThis.Papa : null);
  if (!papa) {
    showReconnectError('Papa Parse library is not loaded');
    return;
  }

  papa.parse(file, {
    header: true,
    skipEmptyLines: 'greedy',
    complete: (results) => {
      const fields = results.meta.fields || [];
      const validation = validateDatasetAgainstLayout(fields, pendingDash.layout_config);

      // Check if AT LEAST ONE chart is valid
      const hasAnyValidChart = validation.chartStatus.some(c => c.isValid);

      if (!hasAnyValidChart && !validation.isValid) {
        // Zero charts can render
        showReconnectError(
          `Uploaded CSV is missing required column(s): "${validation.missingColumns.join('", "')}". ` +
          `Expected columns: [${validation.requiredColumns.join(', ')}].`
        );
        return;
      }

      // Valid! Commit dataset to browser RAM
      state.setDataset({
        fileName,
        fileSize,
        fields: results.meta.fields,
        data: results.data,
        parseDurationMs: 0
      });

      // Load dashboard blueprint
      state.loadDashboardDoc(pendingDash);
      setActiveSessionDashboardId(pendingDash.id);

      // Close modal
      if (reconnectModal) reconnectModal.classList.add('hidden');
      state.pendingReconnection = null;
      if (reconnectErrorBanner) reconnectErrorBanner.classList.add('hidden');

      if (!validation.isValid) {
        showToast(`Dataset reconnected. Some charts are unavailable due to missing columns.`, 'warning');
      } else {
        showToast(`Dataset reconnected! Dashboard "${pendingDash.title}" restored.`, 'success');
      }
    },
    error: (err) => {
      showReconnectError(`Failed to parse CSV: ${err.message}`);
    }
  });
}

function showReconnectError(message) {
  if (reconnectErrorBanner) {
    reconnectErrorBanner.textContent = message;
    reconnectErrorBanner.classList.remove('hidden');
  }
}

/**
 * Checks for a saved dashboard ID in sessionStorage and attempts to restore it.
 * If found and valid, retrieves configuration from the API and opens reconnect modal.
 * Handles 404 (stale ID) and API errors gracefully.
 */
export async function restoreSessionDashboard(options = {}) {
  const savedId = options.dashboardId || getActiveSessionDashboardId();
  if (!savedId) return { restored: false, reason: 'no_session' };

  try {
    const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) return { restored: false, reason: 'no_fetch' };

    const res = await fetchFn(`/api/dashboards/${savedId}`);
    if (res.status === 404) {
      clearActiveSessionDashboardId();
      showToast('The previously active dashboard was not found or has been deleted.', 'info');
      return { restored: false, reason: 'not_found' };
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const dashDoc = await res.json();

    // If dataset is already in memory and compatible, load directly
    const currentFields = state.dataset.fields;
    const hasData = state.dataset.data && state.dataset.data.length > 0;
    if (hasData && currentFields && currentFields.length > 0) {
      const validation = validateDatasetAgainstLayout(currentFields, dashDoc.layout_config);
      if (validation.isValid) {
        state.loadDashboardDoc(dashDoc);
        setActiveSessionDashboardId(dashDoc.id);
        showToast(`Restored dashboard: "${dashDoc.title}"`, 'success');
        return { restored: true, dashboard: dashDoc, immediate: true };
      }
    }

    // Dataset needs to be reconnected
    setActiveSessionDashboardId(dashDoc.id);
    openReconnectModal(dashDoc);
    showToast(`Restoring dashboard "${dashDoc.title}". Please reconnect your CSV.`, 'info');
    return { restored: true, dashboard: dashDoc, pendingReconnect: true };
  } catch (err) {
    console.warn('Failed to restore dashboard session:', err.message);
    showToast('Unable to restore dashboard session: server unreachable.', 'warning');
    return { restored: false, reason: 'server_error', error: err.message };
  }
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
