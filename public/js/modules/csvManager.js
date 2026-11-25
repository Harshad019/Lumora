/**
 * CSV Manager: Handles browser-side CSV reading, validation, and Papa Parse integration.
 * Guarantees zero raw data upload to the server.
 */

import { state } from '../state.js';
import { showToast } from './toast.js';
import { validateDatasetAgainstLayout } from './schemaValidator.js';

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validates and processes a parsed dataset when replacing an existing dataset.
 * Reuses validateDatasetAgainstLayout() to protect active chart configurations.
 */
export function processDatasetReplacement(parsedData, fileMeta = {}, options = {}) {
  const fields = parsedData.fields || [];
  const rows = parsedData.data || [];
  const fileName = fileMeta.fileName || 'dataset.csv';
  const fileSize = fileMeta.fileSize || 0;
  const parseDurationMs = fileMeta.durationMs || 0;

  if (!fields || fields.length === 0) {
    showToast('No column headers detected in the CSV file.', 'error');
    return { success: false, status: 'error', error: 'No column headers detected' };
  }

  if (!rows || rows.length === 0) {
    showToast('The CSV file contains column headers but zero data rows.', 'warning');
  }

  const activeCharts = (state.activeDashboard && state.activeDashboard.charts) || [];
  const currentDataExists = state.dataset && state.dataset.data && state.dataset.data.length > 0;

  // If replacing an existing dataset while active charts are configured:
  if (currentDataExists && activeCharts.length > 0) {
    const validation = validateDatasetAgainstLayout(fields, activeCharts);

    if (!validation.isValid) {
      const hasAnyValidChart = validation.chartStatus.some(c => c.isValid);
      const incompatibleCharts = validation.chartStatus.filter(c => !c.isValid);

      if (!hasAnyValidChart) {
        // Completely incompatible: no active charts can render
        const confirmFn = options.confirmFn || (typeof window !== 'undefined' && window.confirm ? window.confirm.bind(window) : () => true);
        const warningMsg =
          `Warning: The replacement CSV "${fileName}" is incompatible with all active charts.\n` +
          `Missing required column(s): ${validation.missingColumns.join(', ')}.\n\n` +
          `If you proceed, all charts will be unavailable until a compatible CSV is loaded.\n\n` +
          `Do you want to proceed with replacing the dataset?`;

        const proceed = confirmFn(warningMsg);
        if (!proceed) {
          showToast('CSV replacement cancelled. Existing dataset retained.', 'info');
          return {
            success: false,
            status: 'cancelled',
            validation,
            incompatibleCharts
          };
        }

        // User confirmed proceeding despite complete incompatibility
        state.setDataset({
          fileName,
          fileSize,
          fields,
          data: rows,
          parseDurationMs
        });

        showToast(
          `Dataset replaced, but all charts are unavailable due to missing column(s): ${validation.missingColumns.join(', ')}`,
          'warning'
        );

        return {
          success: true,
          status: 'incompatible',
          validation,
          incompatibleCharts
        };
      } else {
        // Partially compatible: at least one chart is valid, some have missing columns
        state.setDataset({
          fileName,
          fileSize,
          fields,
          data: rows,
          parseDurationMs
        });

        const chartDetails = incompatibleCharts.map(c => `"${c.title}" (missing: ${c.missingColumns.join(', ')})`).join('; ');
        showToast(
          `Dataset replaced with warnings. Incompatible charts: ${chartDetails}`,
          'warning'
        );

        return {
          success: true,
          status: 'partial',
          validation,
          incompatibleCharts
        };
      }
    } else {
      // Fully compatible: all active charts can render
      state.setDataset({
        fileName,
        fileSize,
        fields,
        data: rows,
        parseDurationMs
      });

      showToast(`CSV dataset replaced successfully. All charts updated!`, 'success');
      return {
        success: true,
        status: 'compatible',
        validation
      };
    }
  }

  // Initial load or replacing when no charts are configured
  state.setDataset({
    fileName,
    fileSize,
    fields,
    data: rows,
    parseDurationMs
  });

  showToast(`Parsed ${rows.length.toLocaleString()} rows in ${parseDurationMs}ms!`, 'success');
  return {
    success: true,
    status: 'initial',
    validation: null
  };
}

/**
 * Parses a File object or CSV text using Papa Parse entirely in the browser.
 */
export function parseCSVFile(file, options = {}) {
  if (!file) return;

  const isString = typeof file === 'string';
  const fileName = (!isString && file.name) ? file.name : (options.fileName || 'uploaded.csv');
  const fileSize = (!isString && typeof file.size === 'number') ? file.size : (isString ? file.length : 0);

  // Basic client-side validation
  const isCSV = fileName.toLowerCase().endsWith('.csv') || (!isString && file.type === 'text/csv') || isString;
  if (!isCSV) {
    showToast(`"${fileName}" does not appear to be a CSV file (.csv required).`, 'error');
    if (options.onComplete) options.onComplete({ success: false, error: 'Invalid file type' });
    return;
  }

  if (!isString && file.size === 0) {
    showToast('The selected CSV file is empty.', 'error');
    if (options.onComplete) options.onComplete({ success: false, error: 'File is empty' });
    return;
  }

  const papa = typeof Papa !== 'undefined' ? Papa : (typeof globalThis !== 'undefined' ? globalThis.Papa : null);
  if (!papa) {
    console.error('Papa Parse library is not loaded');
    return;
  }

  const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  papa.parse(file, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false, // Keep raw strings in preview to preserve exact user formatting
    complete: (results) => {
      const endTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const durationMs = Math.round(endTime - startTime);

      if (results.errors && results.errors.length > 0) {
        console.warn('Papa Parse encountered notices:', results.errors);
      }

      const outcome = processDatasetReplacement(
        { fields: results.meta.fields, data: results.data },
        { fileName, fileSize, durationMs },
        options
      );

      if (options.onComplete) {
        options.onComplete(outcome);
      }
    },
    error: (err) => {
      console.error('Papa Parse critical error:', err);
      showToast(`Error parsing CSV: ${err.message}`, 'error');
      if (options.onComplete) {
        options.onComplete({ success: false, error: err.message });
      }
    }
  });
}

/**
 * Built-in sample sales dataset (50 rows) for immediate, 1-click testing.
 */
export function loadSampleDataset() {
  const sampleCSV = `Order ID,Order Date,Customer,Region,Category,Sub-Category,Sales,Quantity,Profit
CA-2023-1001,2023-01-15,Alice Smith,West,Furniture,Chairs,261.96,2,41.91
CA-2023-1002,2023-01-16,Bob Jones,East,Technology,Phones,731.94,3,219.58
CA-2023-1003,2023-01-18,Charlie Brown,Central,Office Supplies,Binders,14.62,2,6.87
CA-2023-1004,2023-01-20,Diana Prince,West,Office Supplies,Paper,19.44,3,9.33
CA-2023-1005,2023-01-22,Evan Wright,South,Furniture,Tables,957.57,5,-383.03
CA-2023-1006,2023-01-25,Fiona Gallagher,East,Technology,Accessories,48.86,7,14.17
CA-2023-1007,2023-01-28,George Clark,West,Office Supplies,Art,7.28,4,1.97
CA-2023-1008,2023-02-01,Hannah Abbott,Central,Technology,Phones,907.15,4,90.72
CA-2023-1009,2023-02-04,Ian Malcolm,South,Furniture,Furnishings,25.25,3,9.85
CA-2023-1010,2023-02-07,Julia Roberts,East,Office Supplies,Appliances,114.90,5,34.47
CA-2023-1011,2023-02-10,Kevin Bacon,West,Technology,Machines,1299.99,1,324.99
CA-2023-1012,2023-02-12,Laura Croft,Central,Office Supplies,Storage,223.92,4,44.78
CA-2023-1013,2023-02-15,Michael Scott,East,Furniture,Bookcases,341.96,2,-15.39
CA-2023-1014,2023-02-18,Nancy Drew,South,Technology,Phones,419.98,2,62.99
CA-2023-1015,2023-02-21,Oscar Martinez,West,Office Supplies,Paper,32.40,5,15.55
CA-2023-1016,2023-02-24,Pam Beesly,Central,Office Supplies,Art,15.12,3,4.08
CA-2023-1017,2023-02-27,Quentin Tarantino,East,Furniture,Chairs,71.37,2,-1.78
CA-2023-1018,2023-03-02,Rachel Green,South,Technology,Accessories,223.58,4,87.19
CA-2023-1019,2023-03-05,Steve Rogers,West,Office Supplies,Binders,6.48,1,3.11
CA-2023-1020,2023-03-08,Tony Stark,Central,Technology,Copiers,1799.97,3,701.98
CA-2023-1021,2023-03-11,Uma Thurman,East,Furniture,Tables,629.10,3,-71.49
CA-2023-1022,2023-03-14,Victor Creed,South,Office Supplies,Storage,180.50,5,18.05
CA-2023-1023,2023-03-17,Wanda Maximoff,West,Technology,Accessories,160.00,2,35.20
CA-2023-1024,2023-03-20,Xavier Charles,Central,Office Supplies,Paper,52.80,4,24.81
CA-2023-1025,2023-03-23,Yvonne Strahovski,East,Furniture,Chairs,441.98,2,88.39
CA-2023-1026,2023-03-26,Zack Snyder,South,Office Supplies,Binders,9.84,3,4.52
CA-2023-1027,2023-03-29,Arthur Pendragon,West,Technology,Phones,599.97,3,149.99
CA-2023-1028,2023-04-01,Bruce Wayne,Central,Furniture,Bookcases,800.00,4,120.00
CA-2023-1029,2023-04-04,Clark Kent,East,Office Supplies,Envelopes,25.40,2,12.19
CA-2023-1030,2023-04-07,Diana Ross,South,Technology,Accessories,89.99,1,22.49
CA-2023-1031,2023-04-10,Emma Watson,West,Office Supplies,Fasteners,12.48,3,4.61
CA-2023-1032,2023-04-13,Frank Castle,Central,Furniture,Furnishings,112.50,5,28.12
CA-2023-1033,2023-04-16,Gwen Stacy,East,Technology,Phones,320.00,2,48.00
CA-2023-1034,2023-04-19,Harry Potter,South,Office Supplies,Paper,45.60,6,21.43
CA-2023-1035,2023-04-22,Iris West,West,Furniture,Tables,419.99,1,-50.39
CA-2023-1036,2023-04-25,Jack Sparrow,Central,Technology,Accessories,14.99,1,4.19
CA-2023-1037,2023-04-28,Katniss Everdeen,East,Office Supplies,Storage,310.20,6,62.04
CA-2023-1038,2023-05-01,Luke Skywalker,South,Furniture,Chairs,520.40,4,104.08
CA-2023-1039,2023-05-04,Mia Wallace,West,Office Supplies,Binders,18.90,2,8.50
CA-2023-1040,2023-05-07,Neo Anderson,Central,Technology,Phones,840.00,4,168.00
CA-2023-1041,2023-05-10,Olivia Pope,East,Office Supplies,Art,28.70,4,7.17
CA-2023-1042,2023-05-13,Peter Parker,South,Furniture,Bookcases,289.99,2,-14.49
CA-2023-1043,2023-05-16,Quinn Fabray,West,Technology,Machines,999.00,1,199.80
CA-2023-1044,2023-05-19,Ron Weasley,Central,Office Supplies,Labels,9.90,3,4.65
CA-2023-1045,2023-05-22,Sarah Connor,East,Furniture,Furnishings,88.40,4,22.10
CA-2023-1046,2023-05-25,Thomas Shelby,South,Technology,Accessories,175.20,3,43.80
CA-2023-1047,2023-05-28,Ursula Buffay,West,Office Supplies,Paper,60.10,5,28.24
CA-2023-1048,2023-05-31,Vito Corleone,Central,Furniture,Chairs,610.00,2,122.00
CA-2023-1049,2023-06-03,Walter White,East,Office Supplies,Appliances,245.50,3,73.65
CA-2023-1050,2023-06-06,Zelda Fitzgerald,South,Technology,Phones,499.99,2,99.99`;

  const blob = new Blob([sampleCSV], { type: 'text/csv' });
  const sampleFile = new File([blob], 'sample_superstore_50rows.csv', { type: 'text/csv' });
  parseCSVFile(sampleFile);
}
