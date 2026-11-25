/**
 * InsightBoard - Day 3 Automated Test Suite
 * Tests Data Profiling, Column Type Detection, Missing-Value Metrics,
 * Descriptive Statistics (Min, Max, Mean, Median), Multi-Chart Aggregations (Bar, Line, Pie),
 * and Chart Configuration Validation.
 */

async function runDay3Tests() {
  console.log('--- Starting InsightBoard Day 3 Test Suite ---');
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
    // Dynamically import ESM modules
    const {
      isMissingValue,
      parseNumericValue,
      isDateString,
      inferColumnType,
      calculateNumericStats,
      profileDataset
    } = await import('../public/js/modules/dataProfiler.js');

    const {
      aggregateData,
      validateChartConfig
    } = await import('../public/js/modules/chartManager.js');

    // -------------------------------------------------------------
    // 1. Missing Value Detection
    // -------------------------------------------------------------
    assert(isMissingValue(null) === true, 'null is identified as missing');
    assert(isMissingValue(undefined) === true, 'undefined is identified as missing');
    assert(isMissingValue('') === true, 'Empty string is identified as missing');
    assert(isMissingValue('   ') === true, 'Whitespace string is identified as missing');
    assert(isMissingValue('N/A') === true, '"N/A" is identified as missing');
    assert(isMissingValue('null') === true, '"null" string is identified as missing');
    assert(isMissingValue('0') === false, '"0" is not missing');
    assert(isMissingValue(0) === false, 'Numeric 0 is not missing');
    assert(isMissingValue('Furniture') === false, 'Valid text is not missing');

    // -------------------------------------------------------------
    // 2. Numeric Parsing & Cleaning
    // -------------------------------------------------------------
    assert(parseNumericValue('125.50') === 125.5, 'Parses standard decimal string');
    assert(parseNumericValue('$1,250.99') === 1250.99, 'Strips currency and commas: $1,250.99 -> 1250.99');
    assert(parseNumericValue('-45.20') === -45.2, 'Parses negative numbers');
    assert(parseNumericValue('invalid_num') === null, 'Rejects non-numeric text');
    assert(parseNumericValue('') === null, 'Empty string returns null');

    // -------------------------------------------------------------
    // 3. Date String Inference
    // -------------------------------------------------------------
    assert(isDateString('2023-01-15') === true, 'Recognizes ISO YYYY-MM-DD date');
    assert(isDateString('01/15/2023') === true, 'Recognizes MM/DD/YYYY date');
    assert(isDateString('15/01/2023') === true, 'Recognizes DD/MM/YYYY date');
    assert(isDateString('125.50') === false, 'Rejects numeric strings as dates');
    assert(isDateString('Furniture') === false, 'Rejects standard category names as dates');
    assert(isDateString('2023') === false, 'Rejects standalone year integers as dates to prevent false positives');

    // -------------------------------------------------------------
    // 4. Column Type Inference
    // -------------------------------------------------------------
    const numericCol = ['100', '250.5', '$300', '450', ''];
    assert(inferColumnType(numericCol) === 'numeric', 'Correctly infers numeric column');

    const dateCol = ['2023-01-01', '2023-02-15', '2023-03-30', ''];
    assert(inferColumnType(dateCol) === 'date', 'Correctly infers date column');

    const catCol = ['East', 'West', 'East', 'South', 'Central', 'West', 'South'];
    assert(inferColumnType(catCol) === 'categorical', 'Correctly infers categorical column');

    const textCol = [
      'Customer order for custom mahogany table with polished legs and extra chairs',
      'Urgent shipment requested for regional headquarters',
      'Follow up on invoice #88910 regarding delayed delivery and partial return'
    ];
    assert(inferColumnType(textCol) === 'text', 'Correctly infers text column');

    // -------------------------------------------------------------
    // 5. Numeric Descriptive Statistics (Min, Max, Mean, Median)
    // -------------------------------------------------------------
    // Odd count: [10, 20, 30, 40, 50] -> min: 10, max: 50, sum: 150, mean: 30, median: 30
    const oddStats = calculateNumericStats([10, 50, 20, 40, 30]);
    assert(oddStats.min === 10, 'Min calculation is correct (10)');
    assert(oddStats.max === 50, 'Max calculation is correct (50)');
    assert(oddStats.mean === 30, 'Mean calculation is correct (30)');
    assert(oddStats.median === 30, 'Median calculation for odd length is correct (30)');

    // Even count: [10, 20, 30, 40] -> median: (20 + 30) / 2 = 25
    const evenStats = calculateNumericStats([40, 10, 30, 20]);
    assert(evenStats.median === 25, 'Median calculation for even length is correct (25)');

    // Single item
    const singleStats = calculateNumericStats([99.5]);
    assert(singleStats.min === 99.5 && singleStats.max === 99.5 && singleStats.mean === 99.5 && singleStats.median === 99.5, 'Single item stats correct');

    // Empty array
    assert(calculateNumericStats([]) === null, 'Empty array returns null stats gracefully');

    // -------------------------------------------------------------
    // 6. Complete Dataset Profiling
    // -------------------------------------------------------------
    const sampleFields = ['Order Date', 'Category', 'Sales', 'Customer Notes'];
    const sampleRows = [
      { 'Order Date': '2023-01-01', 'Category': 'Furniture', 'Sales': '100', 'Customer Notes': 'Delivery by 5pm' },
      { 'Order Date': '2023-01-02', 'Category': 'Technology', 'Sales': '250.50', 'Customer Notes': '' }, // missing notes
      { 'Order Date': '2023-01-03', 'Category': 'Furniture', 'Sales': 'N/A', 'Customer Notes': 'Call upon arrival' }, // missing sales
      { 'Order Date': '2023-01-04', 'Category': 'Office Supplies', 'Sales': '50', 'Customer Notes': 'Leave at porch' }
    ];

    const profile = profileDataset(sampleFields, sampleRows);
    assert(profile.totalRows === 4, 'Profile total rows is 4');
    assert(profile.totalColumns === 4, 'Profile total columns is 4');
    assert(profile.totalCells === 16, 'Profile total cells is 16');
    assert(profile.totalMissing === 2, 'Total missing count across dataset is 2');
    assert(profile.missingPercentage === 12.5, 'Total missing percentage is (2 / 16) * 100 = 12.5%');

    // Column-specific stats
    const salesCol = profile.columns.find(c => c.name === 'Sales');
    assert(salesCol.type === 'numeric', 'Sales column inferred as numeric');
    assert(salesCol.missingCount === 1, 'Sales column has 1 missing value');
    assert(salesCol.missingPercentage === 25, 'Sales missing percentage is 25%');
    assert(salesCol.stats.min === 50, 'Sales min is 50');
    assert(salesCol.stats.max === 250.5, 'Sales max is 250.5');
    assert(salesCol.stats.mean === 133.5, 'Sales mean is (100 + 250.5 + 50) / 3 = 133.5');
    assert(salesCol.stats.median === 100, 'Sales median is 100');

    const dateColProfile = profile.columns.find(c => c.name === 'Order Date');
    assert(dateColProfile.type === 'date', 'Order Date column inferred as date');

    const catColProfile = profile.columns.find(c => c.name === 'Category');
    assert(catColProfile.type === 'categorical', 'Category column inferred as categorical');

    // Empty dataset profiling
    const emptyProfile = profileDataset([], []);
    assert(emptyProfile.totalRows === 0 && emptyProfile.totalColumns === 0, 'Empty dataset profiled gracefully');

    // -------------------------------------------------------------
    // 7. Multi-Chart Aggregations (Bar, Line, Pie)
    // -------------------------------------------------------------
    const multiChartRows = [
      { Date: '2023-03-01', Category: 'Furniture', Sales: '300' },
      { Date: '2023-01-01', Category: 'Technology', Sales: '800' },
      { Date: '2023-02-01', Category: 'Office Supplies', Sales: '200' },
      { Date: '2023-01-15', Category: 'Furniture', Sales: '100' }
    ];

    // Bar chart aggregation (sorted descending)
    const barAgg = aggregateData(multiChartRows, 'Category', 'Sales', 'sum', 'desc');
    assert(barAgg.labels[0] === 'Technology' && barAgg.values[0] === 800, 'Bar chart sorted descending: Tech 800');
    assert(barAgg.labels[1] === 'Furniture' && barAgg.values[1] === 400, 'Bar chart: Furniture 400');

    // Line chart aggregation (sorted naturally/chronologically by Date)
    const lineAgg = aggregateData(multiChartRows, 'Date', 'Sales', 'sum', 'natural');
    assert(lineAgg.labels[0] === '2023-01-01', 'Line chart sorted chronologically: 2023-01-01 first');
    assert(lineAgg.labels[1] === '2023-01-15', 'Line chart sorted chronologically: 2023-01-15 second');
    assert(lineAgg.labels[2] === '2023-02-01', 'Line chart sorted chronologically: 2023-02-01 third');
    assert(lineAgg.labels[3] === '2023-03-01', 'Line chart sorted chronologically: 2023-03-01 fourth');

    // Pie chart aggregation with Count
    const pieCountAgg = aggregateData(multiChartRows, 'Category', null, 'count', 'desc');
    assert(pieCountAgg.values[pieCountAgg.labels.indexOf('Furniture')] === 2, 'Furniture row count is 2');
    assert(pieCountAgg.values[pieCountAgg.labels.indexOf('Technology')] === 1, 'Technology row count is 1');

    // -------------------------------------------------------------
    // 8. Chart Configuration Validation
    // -------------------------------------------------------------
    // Valid config
    const validConf = validateChartConfig({
      rows: multiChartRows,
      xAxis: 'Category',
      yAxis: 'Sales',
      aggregation: 'sum'
    });
    assert(validConf.isValid === true, 'Valid chart configuration accepted');

    // Invalid: Empty rows
    const emptyConf = validateChartConfig({
      rows: [],
      xAxis: 'Category',
      yAxis: 'Sales'
    });
    assert(emptyConf.isValid === false, 'Rejects empty row dataset');

    // Invalid: Missing X-axis
    const missingXConf = validateChartConfig({
      rows: multiChartRows,
      xAxis: '',
      yAxis: 'Sales'
    });
    assert(missingXConf.isValid === false, 'Rejects missing X-axis');

    // Invalid: Non-existent column
    const badColConf = validateChartConfig({
      rows: multiChartRows,
      xAxis: 'NonExistentColumn',
      yAxis: 'Sales'
    });
    assert(badColConf.isValid === false, 'Rejects non-existent X-axis column');

    // Invalid: Missing Y-axis when aggregation is sum
    const missingYConf = validateChartConfig({
      rows: multiChartRows,
      xAxis: 'Category',
      yAxis: '',
      aggregation: 'sum'
    });
    assert(missingYConf.isValid === false, 'Rejects missing Y-axis for sum aggregation');

    // Valid: Missing Y-axis is ALLOWED when aggregation is count!
    const validCountConf = validateChartConfig({
      rows: multiChartRows,
      xAxis: 'Category',
      yAxis: '',
      aggregation: 'count'
    });
    assert(validCountConf.isValid === true, 'Allows omitting Y-axis when aggregation is count');

  } catch (err) {
    console.error('Day 3 Test encountered unexpected error:', err);
    failed++;
  } finally {
    console.log(`\nDay 3 Test Summary: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('All Day 3 tests passed successfully!\n');
    }
  }
}

runDay3Tests();
