/**
 * Profiler UI Module for Lumora.
 * Renders dataset summary metrics and column-level statistics.
 */

import { state } from '../state.js';
import { profileDataset } from './dataProfiler.js';

let profileContainer = null;
let profileSummaryCards = null;
let profileTableBody = null;

export function initProfilerUI() {
  profileContainer = document.getElementById('profile-section');
  profileSummaryCards = document.getElementById('profile-summary-cards');
  profileTableBody = document.getElementById('profile-table-body');

  state.subscribe((event, payload) => {
    if (event === 'dataset:loaded' || event === 'dashboard:loaded') {
      renderProfile();
    } else if (event === 'dataset:cleared') {
      clearProfile();
    }
  });
}

export function renderProfile() {
  if (!profileContainer) return;

  const { fields, data } = state.dataset;
  if (!fields || fields.length === 0 || !data || data.length === 0) {
    clearProfile();
    return;
  }

  const profile = profileDataset(fields, data);

  // Store inferred column types in state so dataset signature includes them
  state.setDatasetProfile(profile);

  // 1. Render Summary KPI Cards
  const { typeBreakdown, totalRows, totalColumns, totalMissing, missingPercentage } = profile;
  profileSummaryCards.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Dimensions</div>
      <div class="kpi-value">${totalRows.toLocaleString()} <span class="kpi-unit">rows</span> &times; ${totalColumns} <span class="kpi-unit">cols</span></div>
      <div class="kpi-sub">Total ${(totalRows * totalColumns).toLocaleString()} cells</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">Missing Values</div>
      <div class="kpi-value ${totalMissing > 0 ? 'text-warning' : 'text-success'}">
        ${missingPercentage}%
      </div>
      <div class="kpi-sub">${totalMissing.toLocaleString()} missing / empty cells</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-label">Column Types</div>
      <div class="type-pill-group">
        <span class="badge badge-numeric">${typeBreakdown.numeric} Numeric</span>
        <span class="badge badge-categorical">${typeBreakdown.categorical} Categorical</span>
        <span class="badge badge-date">${typeBreakdown.date} Date</span>
        <span class="badge badge-text">${typeBreakdown.text} Text</span>
      </div>
    </div>
  `;

  // 2. Render Column-Level Statistics Table
  profileTableBody.innerHTML = '';
  profile.columns.forEach((col) => {
    const tr = document.createElement('tr');

    const typeBadgeClass = `badge badge-${col.type}`;
    const minMaxStr = col.stats
      ? `${col.stats.min.toLocaleString()} / ${col.stats.max.toLocaleString()}`
      : col.sampleValues.slice(0, 2).join(', ') || '—';

    const meanStr = col.stats ? col.stats.mean.toLocaleString() : '—';
    const medianStr = col.stats ? col.stats.median.toLocaleString() : '—';

    tr.innerHTML = `
      <td><strong>${escapeHtml(col.name)}</strong></td>
      <td><span class="${typeBadgeClass}">${col.type}</span></td>
      <td>
        <div class="missing-cell-wrapper">
          <span>${col.missingCount} (${col.missingPercentage}%)</span>
          <div class="mini-progress-bar">
            <div class="mini-progress-fill" style="width: ${Math.min(100, col.missingPercentage)}%;"></div>
          </div>
        </div>
      </td>
      <td>${col.distinctCount.toLocaleString()}</td>
      <td><span class="stat-num">${escapeHtml(minMaxStr)}</span></td>
      <td><span class="stat-num">${meanStr}</span></td>
      <td><span class="stat-num">${medianStr}</span></td>
    `;

    profileTableBody.appendChild(tr);
  });

  profileContainer.classList.remove('hidden');
}

export function clearProfile() {
  if (profileContainer) profileContainer.classList.add('hidden');
  if (profileSummaryCards) profileSummaryCards.innerHTML = '';
  if (profileTableBody) profileTableBody.innerHTML = '';
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
