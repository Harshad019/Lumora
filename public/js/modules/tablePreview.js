/**
 * Table Preview Module: Renders paginated, searchable CSV rows in an accessible HTML table.
 */

import { state } from '../state.js';

const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');
const paginationSummary = document.getElementById('pagination-summary');
const currentPageLabel = document.getElementById('current-page-label');
const previewRangeInfo = document.getElementById('preview-range-info');

const btnFirst = document.getElementById('btn-first-page');
const btnPrev = document.getElementById('btn-prev-page');
const btnNext = document.getElementById('btn-next-page');
const btnLast = document.getElementById('btn-last-page');

export function initTablePreview() {
  // Subscribe to state updates
  state.subscribe((event) => {
    if (event === 'dataset:loaded' || event === 'pagination:changed') {
      renderTable();
    } else if (event === 'dataset:cleared') {
      clearTable();
    }
  });

  // Attach pagination button listeners
  btnFirst.addEventListener('click', () => {
    if (state.pagination.currentPage > 1) {
      state.setPagination({ currentPage: 1 });
    }
  });

  btnPrev.addEventListener('click', () => {
    if (state.pagination.currentPage > 1) {
      state.setPagination({ currentPage: state.pagination.currentPage - 1 });
    }
  });

  btnNext.addEventListener('click', () => {
    const totalPages = getTotalPages();
    if (state.pagination.currentPage < totalPages) {
      state.setPagination({ currentPage: state.pagination.currentPage + 1 });
    }
  });

  btnLast.addEventListener('click', () => {
    const totalPages = getTotalPages();
    if (state.pagination.currentPage < totalPages) {
      state.setPagination({ currentPage: totalPages });
    }
  });
}

function getFilteredRows() {
  const { data } = state.dataset;
  if (!data || data.length === 0) return [];

  // MVP constraint: Preview up to the first 50 rows of the dataset
  const previewSlice = data.slice(0, state.pagination.maxPreviewRows);

  const query = state.pagination.filterQuery.trim().toLowerCase();
  if (!query) return previewSlice;

  return previewSlice.filter((row) => {
    return Object.values(row).some((val) => {
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(query);
    });
  });
}

function getTotalPages() {
  const rows = getFilteredRows();
  const { pageSize } = state.pagination;
  return Math.max(1, Math.ceil(rows.length / pageSize));
}

export function renderTable() {
  const { fields, rowCount } = state.dataset;
  if (!fields || fields.length === 0) {
    clearTable();
    return;
  }

  // 1. Render Table Headers
  tableHead.innerHTML = '';
  const headerRow = document.createElement('tr');

  // Index column header
  const indexTh = document.createElement('th');
  indexTh.className = 'row-index-cell';
  indexTh.textContent = '#';
  headerRow.appendChild(indexTh);

  for (const field of fields) {
    const th = document.createElement('th');
    th.textContent = field;
    headerRow.appendChild(th);
  }
  tableHead.appendChild(headerRow);

  // 2. Filter & Paginate Rows
  const filteredRows = getFilteredRows();
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / state.pagination.pageSize));

  // Guard against invalid current page
  if (state.pagination.currentPage > totalPages) {
    state.pagination.currentPage = totalPages;
  }
  const page = state.pagination.currentPage;
  const size = state.pagination.pageSize;

  const startIndex = (page - 1) * size;
  const endIndex = Math.min(startIndex + size, filteredRows.length);
  const rowsToDisplay = filteredRows.slice(startIndex, endIndex);

  // 3. Render Table Body
  tableBody.innerHTML = '';
  if (rowsToDisplay.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = fields.length + 1;
    emptyCell.style.textAlign = 'center';
    emptyCell.style.padding = '2rem';
    emptyCell.style.color = '#94a3b8';
    emptyCell.textContent = 'No matching rows found.';
    emptyRow.appendChild(emptyCell);
    tableBody.appendChild(emptyRow);
  } else {
    rowsToDisplay.forEach((row, idx) => {
      const tr = document.createElement('tr');

      // Row index cell
      const indexTd = document.createElement('td');
      indexTd.className = 'row-index-cell';
      indexTd.textContent = String(startIndex + idx + 1);
      tr.appendChild(indexTd);

      for (const field of fields) {
        const td = document.createElement('td');
        const val = row[field];

        if (val === undefined || val === null || val === '') {
          td.innerHTML = '<span class="cell-null">(empty)</span>';
        } else {
          td.textContent = String(val);
          td.title = String(val);
        }
        tr.appendChild(td);
      }
      tableBody.appendChild(tr);
    });
  }

  // 4. Update Pagination Controls & Labels
  currentPageLabel.textContent = String(page);
  btnFirst.disabled = page <= 1;
  btnPrev.disabled = page <= 1;
  btnNext.disabled = page >= totalPages;
  btnLast.disabled = page >= totalPages;

  const previewCount = Math.min(rowCount, state.pagination.maxPreviewRows);
  previewRangeInfo.textContent = `Showing first ${previewCount} rows of ${rowCount.toLocaleString()}`;

  if (filteredRows.length === 0) {
    paginationSummary.textContent = '0 rows found';
  } else {
    paginationSummary.textContent = `Showing rows ${startIndex + 1}–${endIndex} of ${filteredRows.length} (Page ${page} of ${totalPages})`;
  }
}

export function clearTable() {
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';
  currentPageLabel.textContent = '1';
  paginationSummary.textContent = 'Page 1 of 1';
  btnFirst.disabled = true;
  btnPrev.disabled = true;
  btnNext.disabled = true;
  btnLast.disabled = true;
}
