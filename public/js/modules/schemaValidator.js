/**
 * Schema Validator for Lumora.
 * Verifies that a reconnected CSV file contains all columns required by the dashboard.
 * Supports granular per-chart validation so unaffected charts can still render if one fails.
 */

export function validateDatasetAgainstLayout(availableFields, layoutConfig) {
  if (!Array.isArray(availableFields)) {
    return {
      isValid: false,
      missingColumns: ['(No columns detected)'],
      requiredColumns: [],
      chartStatus: []
    };
  }

  const fieldsSet = new Set(availableFields);
  const requiredColumnsSet = new Set();
  const charts = Array.isArray(layoutConfig) ? layoutConfig : (layoutConfig ? [layoutConfig] : []);

  const chartStatus = charts.map((chart, index) => {
    if (!chart) return { chartId: `chart-${index}`, isValid: false, missingColumns: [], requiredColumns: [] };

    const chartRequired = [];
    if (chart.xAxis) {
      chartRequired.push(chart.xAxis);
      requiredColumnsSet.add(chart.xAxis);
    }
    if (chart.yAxis && chart.aggregation !== 'count') {
      chartRequired.push(chart.yAxis);
      requiredColumnsSet.add(chart.yAxis);
    }

    const chartMissing = chartRequired.filter(col => !fieldsSet.has(col));

    return {
      chartId: chart.id || `chart-${index}`,
      title: chart.title || `Chart #${index + 1}`,
      isValid: chartMissing.length === 0,
      missingColumns: chartMissing,
      requiredColumns: chartRequired
    };
  });

  const requiredColumns = Array.from(requiredColumnsSet);
  const missingColumns = requiredColumns.filter(col => !fieldsSet.has(col));

  return {
    isValid: missingColumns.length === 0,
    requiredColumns,
    missingColumns,
    chartStatus
  };
}
