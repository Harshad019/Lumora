/**
 * Chart Manager for Lumora
 * Encapsulates Chart.js lifecycle, dataset aggregation, and multi-chart instance management (Bar, Line, Pie, Doughnut).
 */

import { showToast } from './toast.js';

// Map of active Chart.js instances: chartId -> Chart instance
const chartInstances = new Map();
// Cache of active chart configurations for seamless theme re-renders
const chartConfigs = new Map();

/**
 * Returns active theme palette and design tokens for Chart.js
 */
export function getThemeColors() {
  const isDark = typeof document !== 'undefined' &&
    document.documentElement &&
    document.documentElement.getAttribute('data-theme') === 'dark';

  return {
    isDark,
    primary: isDark ? '#9185FF' : '#635BDB',
    primaryHover: isDark ? '#A59BFF' : '#5046CA',
    primaryAlpha: isDark ? 'rgba(145, 133, 255, 0.16)' : 'rgba(99, 91, 219, 0.12)',
    barBg: isDark ? 'rgba(145, 133, 255, 0.82)' : 'rgba(99, 91, 219, 0.85)',
    barBorder: isDark ? '#9185FF' : '#635BDB',
    lineBorder: isDark ? '#9185FF' : '#635BDB',
    lineBg: isDark ? 'rgba(145, 133, 255, 0.18)' : 'rgba(99, 91, 219, 0.12)',
    linePointBg: isDark ? '#A59BFF' : '#5046CA',
    gridColor: isDark ? 'rgba(48, 59, 80, 0.65)' : 'rgba(230, 232, 240, 0.85)',
    tickColor: isDark ? '#9AA7C0' : '#62728D',
    titleColor: isDark ? '#E7EAF3' : '#26334A',
    tooltipBg: isDark ? '#192235' : '#26334A',
    tooltipText: isDark ? '#E7EAF3' : '#FFFFFF',
    tooltipBorder: isDark ? '#303B50' : '#E6E8F0',
    polarBorder: isDark ? '#192235' : '#FFFFFF',
    palette: [
      isDark ? '#9185FF' : '#635BDB',
      '#38BDF8',
      '#34D399',
      '#FBBF24',
      '#F472B6',
      '#A78BFA',
      '#FB923C',
      '#2DD4BF',
      '#818CF8',
      '#4ADE80'
    ]
  };
}

/**
 * Re-renders all active charts with current theme palette
 */
export function refreshChartsTheme() {
  for (const [chartId, entry] of chartConfigs.entries()) {
    if (entry.canvasElement && entry.config) {
      renderChart(entry.canvasElement, entry.config);
    }
  }
}


/**
 * Validates whether the dataset and chosen axes are suitable for rendering.
 */
export function validateChartConfig(config = {}) {
  const { rows, xAxis, yAxis, aggregation, chartType } = config;

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { isValid: false, error: 'No data rows available to render.' };
  }

  if (!xAxis) {
    return { isValid: false, error: 'Please select a column for the X-Axis / Category.' };
  }

  // Ensure chosen X-axis column actually exists in row data
  const firstRow = rows[0] || {};
  if (!(xAxis in firstRow)) {
    return { isValid: false, error: `Column "${xAxis}" does not exist in dataset.` };
  }

  // If aggregation is sum or avg, yAxis is required and must exist
  if (aggregation !== 'count') {
    if (!yAxis) {
      return { isValid: false, error: 'Please select a numeric column for the Y-Axis.' };
    }
    if (!(yAxis in firstRow)) {
      return { isValid: false, error: `Column "${yAxis}" does not exist in dataset.` };
    }
  }

  return { isValid: true };
}

/**
 * Aggregates dataset rows by X-axis category and computes Y-axis metrics.
 */
export function aggregateData(rows, xAxis, yAxis, aggregation = 'sum', sortMode = 'desc') {
  if (!rows || rows.length === 0 || !xAxis) {
    return { labels: [], values: [] };
  }

  const groups = new Map();

  for (const row of rows) {
    let rawX = row[xAxis];
    const key = (rawX !== undefined && rawX !== null && String(rawX).trim() !== '')
      ? String(rawX).trim()
      : '(Empty)';

    let numVal = 0;
    if (aggregation !== 'count') {
      const rawY = row[yAxis];
      numVal = parseFloat(String(rawY).replace(/[^0-9.-]/g, ''));
      if (isNaN(numVal)) numVal = 0;
    }

    if (!groups.has(key)) {
      groups.set(key, { sum: 0, count: 0 });
    }

    const group = groups.get(key);
    group.sum += numVal;
    group.count += 1;
  }

  // Convert to array of objects
  const entries = Array.from(groups.entries()).map(([label, stats]) => {
    let finalVal = 0;
    if (aggregation === 'sum') {
      finalVal = Math.round(stats.sum * 100) / 100;
    } else if (aggregation === 'avg') {
      finalVal = stats.count > 0 ? Math.round((stats.sum / stats.count) * 100) / 100 : 0;
    } else if (aggregation === 'count') {
      finalVal = stats.count;
    }
    return { label, value: finalVal };
  });

  // Sorting
  if (sortMode === 'desc') {
    entries.sort((a, b) => b.value - a.value);
  } else if (sortMode === 'asc') {
    entries.sort((a, b) => a.value - b.value);
  } else if (sortMode === 'natural') {
    entries.sort((a, b) => {
      const dateA = Date.parse(a.label);
      const dateB = Date.parse(b.label);
      if (!isNaN(dateA) && !isNaN(dateB)) return dateA - dateB;
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  }

  return {
    labels: entries.map(e => e.label),
    values: entries.map(e => e.value)
  };
}

/**
 * Unified rendering function for all supported chart types (Bar, Line, Pie, Doughnut).
 * Automatically tracks and cleans up instances by unique chartId.
 */
export function renderChart(canvasElement, config) {
  if (!canvasElement) return null;

  const chartId = config.id || canvasElement.id || 'main';

  // Validate configuration before proceeding
  const validation = validateChartConfig(config);
  if (!validation.isValid) {
    destroyChart(chartId);
    showToast(validation.error, 'warning');
    return null;
  }

  const { rows, xAxis, yAxis } = config;
  const chartType = config.chartType || 'bar';
  const aggregation = config.aggregation || 'sum';
  const chartTitle = config.title || `${yAxis || 'Count'} by ${xAxis} (${aggregation.toUpperCase()})`;

  // Destroy any existing chart instance on this specific canvas
  destroyChart(chartId);

  // For Line charts, sort chronologically/naturally if possible; otherwise sort descending
  const sortMode = chartType === 'line' ? 'natural' : 'desc';
  const aggregated = aggregateData(rows, xAxis, yAxis, aggregation, sortMode);

  if (aggregated.labels.length === 0) {
    showToast('No valid data points found to render chart.', 'warning');
    return null;
  }

  let finalLabels = aggregated.labels;
  let finalValues = aggregated.values;

  // For Pie/Doughnut charts, limit slices to 8 + "Other" to keep chart legible
  if ((chartType === 'pie' || chartType === 'doughnut') && finalLabels.length > 8) {
    const topLabels = finalLabels.slice(0, 8);
    const topValues = finalValues.slice(0, 8);
    const otherSum = finalValues.slice(8).reduce((acc, v) => acc + v, 0);

    topLabels.push('Other');
    topValues.push(Math.round(otherSum * 100) / 100);

    finalLabels = topLabels;
    finalValues = topValues;
  } else if (finalLabels.length > 25) {
    finalLabels = finalLabels.slice(0, 25);
    finalValues = finalValues.slice(0, 25);
  }

  const ctx = canvasElement.getContext('2d');
  const isPolar = chartType === 'pie' || chartType === 'doughnut';
  const theme = getThemeColors();

  // Cache config for instant theme toggling
  chartConfigs.set(chartId, { canvasElement, config });

  let datasetConfig = {};
  if (isPolar) {
    datasetConfig = {
      label: `${yAxis || 'Count'} (${aggregation})`,
      data: finalValues,
      backgroundColor: theme.palette.slice(0, finalValues.length),
      borderColor: theme.polarBorder,
      borderWidth: 2
    };
  } else if (chartType === 'line') {
    datasetConfig = {
      label: `${yAxis || 'Count'} (${aggregation})`,
      data: finalValues,
      borderColor: theme.lineBorder,
      backgroundColor: theme.lineBg,
      borderWidth: 2.5,
      tension: 0.35,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: theme.linePointBg,
      pointBorderColor: theme.polarBorder,
      pointBorderWidth: 1.5
    };
  } else {
    // Default: Bar
    datasetConfig = {
      label: `${yAxis || 'Count'} (${aggregation})`,
      data: finalValues,
      backgroundColor: theme.barBg,
      borderColor: theme.barBorder,
      borderWidth: 1.5,
      borderRadius: 6,
      maxBarThickness: 48
    };
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: chartTitle,
        color: theme.titleColor,
        font: {
          family: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          size: 13,
          weight: '600'
        },
        padding: { top: 8, bottom: 14 }
      },
      legend: {
        display: isPolar,
        position: 'right',
        labels: {
          boxWidth: 12,
          color: theme.tickColor,
          font: {
            family: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            size: 11
          }
        }
      },
      tooltip: {
        backgroundColor: theme.tooltipBg,
        titleColor: theme.tooltipText,
        bodyColor: theme.tooltipText,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        titleFont: {
          family: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          size: 12,
          weight: '600'
        },
        bodyFont: {
          family: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          size: 11
        },
        padding: 10,
        cornerRadius: 8,
        displayColors: isPolar,
        callbacks: {
          label: function (context) {
            const val = isPolar ? context.raw : context.parsed.y;
            const formatted = typeof val === 'number' ? val.toLocaleString() : val;
            if (isPolar) {
              const total = finalValues.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round((val / total) * 1000) / 10 : 0;
              return ` ${context.label}: ${formatted} (${pct}%)`;
            }
            return ` ${yAxis || 'Count'}: ${formatted}`;
          }
        }
      }
    }
  };

  if (!isPolar) {
    options.scales = {
      x: {
        grid: { display: false },
        ticks: {
          color: theme.tickColor,
          font: {
            family: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            size: 11
          },
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: theme.gridColor,
          drawBorder: false
        },
        ticks: {
          color: theme.tickColor,
          font: {
            family: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            size: 11
          },
          callback: (value) => Number.isInteger(value) ? value.toLocaleString() : value
        }
      }
    };
  }

  const instance = new Chart(ctx, {
    type: chartType,
    data: {
      labels: finalLabels,
      datasets: [datasetConfig]
    },
    options
  });

  chartInstances.set(chartId, instance);
  return instance;
}

/**
 * Backwards compatibility alias for renderBarChart
 */
export function renderBarChart(canvasElement, config) {
  return renderChart(canvasElement, { ...config, chartType: 'bar' });
}

/**
 * Cleanly destroys a specific Chart.js instance by ID, or all if no ID is passed.
 */
export function destroyChart(chartId) {
  if (chartId && chartInstances.has(chartId)) {
    chartInstances.get(chartId).destroy();
    chartInstances.delete(chartId);
    chartConfigs.delete(chartId);
    return;
  }

  if (!chartId && chartInstances.size > 0) {
    // If no ID passed, destroy 'main', 'main-bar-chart', or the first instance
    const targetKey = chartInstances.has('main')
      ? 'main'
      : (chartInstances.has('main-bar-chart') ? 'main-bar-chart' : chartInstances.keys().next().value);
    if (targetKey && chartInstances.has(targetKey)) {
      chartInstances.get(targetKey).destroy();
      chartInstances.delete(targetKey);
      chartConfigs.delete(targetKey);
    }
  }
}

/**
 * Destroy all registered chart instances on page/state clear
 */
export function destroyAllCharts() {
  for (const instance of chartInstances.values()) {
    try {
      instance.destroy();
    } catch (e) {
      // Ignore
    }
  }
  chartInstances.clear();
  chartConfigs.clear();
}

