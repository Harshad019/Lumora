/**
 * Data Profiler Module for Lumora.
 * Calculates descriptive statistics, missing-value ratios, and infers column types.
 * Executed 100% in browser memory with zero network footprint.
 */

/**
 * Checks if a value is consider empty/missing in CSV context.
 */
export function isMissingValue(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    return trimmed === '' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'n/a' || trimmed === 'nan';
  }
  return false;
}

/**
 * Attempts to parse a raw string as a numeric value,
 * stripping common currency symbols, commas, or whitespace.
 */
export function parseNumericValue(val) {
  if (isMissingValue(val)) return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/[$€£,\s]/g, '');
    if (cleaned === '') return null;
    const num = Number(cleaned);
    return (!isNaN(num) && isFinite(num)) ? num : null;
  }
  return null;
}

/**
 * Checks if a string looks like a standard calendar date.
 */
export function isDateString(val) {
  if (isMissingValue(val) || typeof val !== 'string') return false;
  const trimmed = val.trim();

  // Avoid pure integers (e.g. "2023" or "100") being treated as timestamps
  if (/^\d{1,6}$/.test(trimmed)) return false;

  // Must contain typical date delimiters
  if (!/[-/.:]/.test(trimmed)) return false;

  let parsed = Date.parse(trimmed);
  if (isNaN(parsed)) {
    // Support DD/MM/YYYY or DD-MM-YYYY format
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (ddmmyyyy) {
      const [, d, m, y] = ddmmyyyy;
      parsed = Date.parse(`${m}/${d}/${y}`);
    }
  }

  if (isNaN(parsed)) return false;

  // Reasonable calendar epoch window (1900 - 2100)
  const dateObj = new Date(parsed);
  const year = dateObj.getFullYear();
  return year >= 1900 && year <= 2100;
}

/**
 * Infers the column data type based on row values.
 * Returns: 'numeric' | 'date' | 'categorical' | 'text'
 */
export function inferColumnType(rawValues) {
  const nonMissing = rawValues.filter(v => !isMissingValue(v));
  if (nonMissing.length === 0) return 'text';

  // Sample up to 200 values for fast inference on large files
  const sample = nonMissing.length > 200 ? nonMissing.slice(0, 200) : nonMissing;

  let numericCount = 0;
  let dateCount = 0;
  const uniqueSet = new Set();
  let totalLength = 0;

  for (const val of sample) {
    const strVal = String(val).trim();
    uniqueSet.add(strVal);
    totalLength += strVal.length;

    if (parseNumericValue(val) !== null) {
      numericCount++;
    } else if (isDateString(val)) {
      dateCount++;
    }
  }

  const numericRatio = numericCount / sample.length;
  const dateRatio = dateCount / sample.length;

  if (numericRatio >= 0.8) return 'numeric';
  if (dateRatio >= 0.8) return 'date';

  // Average text length check: Long descriptions or paragraphs are free text
  const avgLength = totalLength / sample.length;
  if (avgLength > 30) {
    return 'text';
  }

  // Categorical vs Free Text: low cardinality ratio or few distinct values
  const cardinality = uniqueSet.size;
  if (cardinality <= 25 || cardinality / sample.length <= 0.35) {
    return 'categorical';
  }

  return 'text';
}

/**
 * Calculates descriptive statistics for an array of numeric values.
 * Returns { min, max, mean, median } or null.
 */
export function calculateNumericStats(numericValues) {
  if (!numericValues || numericValues.length === 0) {
    return null;
  }

  // Sort ascending for median
  const sorted = [...numericValues].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += sorted[i];
  }
  const mean = Math.round((sum / count) * 100) / 100;

  let median;
  const mid = Math.floor(count / 2);
  if (count % 2 === 0) {
    median = Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  } else {
    median = Math.round(sorted[mid] * 100) / 100;
  }

  return {
    count,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    mean,
    median
  };
}

/**
 * Profiles a complete CSV dataset (fields & rows).
 */
export function profileDataset(fields = [], rows = []) {
  const totalRows = rows.length;
  const totalColumns = fields.length;
  const totalCells = totalRows * totalColumns;

  if (totalRows === 0 || totalColumns === 0) {
    return {
      totalRows: 0,
      totalColumns: 0,
      totalCells: 0,
      totalMissing: 0,
      missingPercentage: 0,
      typeBreakdown: { numeric: 0, categorical: 0, date: 0, text: 0 },
      columns: []
    };
  }

  let totalMissing = 0;
  const typeBreakdown = { numeric: 0, categorical: 0, date: 0, text: 0 };

  const columns = fields.map((field) => {
    const rawValues = rows.map(r => r[field]);
    let missingCount = 0;
    const nonMissingNumeric = [];
    const uniqueValues = new Set();
    const sampleValues = [];

    for (let i = 0; i < rawValues.length; i++) {
      const v = rawValues[i];
      if (isMissingValue(v)) {
        missingCount++;
      } else {
        const strVal = String(v).trim();
        uniqueValues.add(strVal);
        if (sampleValues.length < 3) {
          sampleValues.push(strVal);
        }
        const parsedNum = parseNumericValue(v);
        if (parsedNum !== null) {
          nonMissingNumeric.push(parsedNum);
        }
      }
    }

    totalMissing += missingCount;
    const missingPercentage = totalRows > 0 ? Math.round((missingCount / totalRows) * 1000) / 10 : 0;
    const inferredType = inferColumnType(rawValues);

    typeBreakdown[inferredType] = (typeBreakdown[inferredType] || 0) + 1;

    let stats = null;
    if (inferredType === 'numeric') {
      stats = calculateNumericStats(nonMissingNumeric);
    }

    return {
      name: field,
      type: inferredType,
      totalRows,
      missingCount,
      missingPercentage,
      distinctCount: uniqueValues.size,
      stats,
      sampleValues
    };
  });

  const missingPercentage = totalCells > 0 ? Math.round((totalMissing / totalCells) * 1000) / 10 : 0;

  return {
    totalRows,
    totalColumns,
    totalCells,
    totalMissing,
    missingPercentage,
    typeBreakdown,
    columns
  };
}
