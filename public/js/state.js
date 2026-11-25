/**
 * Central state store for Lumora.
 * Raw CSV data is kept exclusively in browser RAM and is NEVER sent over the network.
 * Supports Multi-Chart Dashboards with reordering, editing, and per-chart configuration.
 */

export const state = {
  // Active dataset in browser memory
  dataset: {
    fileName: null,
    fileSize: 0,
    fields: [],      // Array of column header names: ["Category", "Sales", ...]
    data: [],        // Array of row objects: [{ Category: "Furniture", Sales: "261.96" }, ...]
    rowCount: 0,
    parseDurationMs: 0,
    profile: null
  },

  // Active dashboard configuration with multiple charts
  activeDashboard: {
    id: null,
    title: 'My Analytics Dashboard',
    description: '',
    charts: [] // Array of { id, title, chartType, xAxis, yAxis, aggregation }
  },

  // Unsaved changes tracking
  isDirty: false,

  markDirty() {
    const wasDirty = this.isDirty;
    this.isDirty = true;
    if (!wasDirty) {
      this.notify('dashboard:dirtyChanged', true);
    }
  },

  markClean() {
    const wasDirty = this.isDirty;
    this.isDirty = false;
    if (wasDirty) {
      this.notify('dashboard:dirtyChanged', false);
    }
  },

  // Backwards compatibility getter for chartConfig
  get chartConfig() {
    return this.activeDashboard.charts[0] || {
      id: 'chart-1',
      chartType: 'bar',
      xAxis: '',
      yAxis: '',
      aggregation: 'sum',
      title: 'Bar Chart'
    };
  },

  // Holds dashboard object awaiting CSV reconnection
  pendingReconnection: null,

  // Table preview & pagination controls
  pagination: {
    currentPage: 1,
    pageSize: 25,
    maxPreviewRows: 50,
    filterQuery: ''
  },

  // Listeners for state change notifications
  listeners: [],

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },

  notify(event, payload) {
    for (const listener of this.listeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    }
  },

  setDataset(datasetData) {
    this.dataset = {
      ...datasetData,
      rowCount: datasetData.data ? datasetData.data.length : 0
    };
    this.pagination.currentPage = 1;
    this.pagination.filterQuery = '';

    // Auto-select smart initial axes for the chart if empty
    if (!this.activeDashboard.charts || this.activeDashboard.charts.length === 0) {
      this.autoSelectChartAxes();
    }

    this.notify('dataset:loaded', this.dataset);
  },

  autoSelectChartAxes() {
    const { fields, data } = this.dataset;
    if (!fields || fields.length === 0 || !data || data.length === 0) return;

    const sampleRow = data[0] || {};
    let chosenX = null;
    let chosenY = null;

    for (const f of fields) {
      const val = sampleRow[f];
      const isNum = !isNaN(parseFloat(val)) && isFinite(val);
      if (!isNum && !chosenX) {
        chosenX = f;
      }
      if (isNum && !chosenY) {
        chosenY = f;
      }
    }

    if (!chosenX) chosenX = fields[0];
    if (!chosenY) chosenY = fields.length > 1 ? fields[1] : fields[0];

    const initialChart = {
      id: 'chart-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      chartType: 'bar',
      xAxis: chosenX,
      yAxis: chosenY,
      aggregation: 'sum',
      title: `${chosenY} by ${chosenX}`
    };

    this.activeDashboard.charts = [initialChart];
  },

  setDatasetProfile(profile) {
    this.dataset.profile = profile;
    this.notify('dataset:profiled', profile);
  },

  // Multi-Chart Management Methods
  addChart(chartConfig = {}) {
    const { fields, data } = this.dataset;
    let defaultX = '';
    let defaultY = '';

    if (fields && fields.length > 0) {
      const sampleRow = (data && data[0]) || {};

      // Select categorical / date / text column for X
      for (const f of fields) {
        const val = sampleRow[f];
        const isNum = !isNaN(parseFloat(val)) && isFinite(val);
        if (!isNum) {
          defaultX = f;
          break;
        }
      }
      if (!defaultX) defaultX = fields[0];

      // Select numeric column for Y
      for (const f of fields) {
        const val = sampleRow[f];
        const isNum = !isNaN(parseFloat(val)) && isFinite(val);
        if (isNum && f !== defaultX) {
          defaultY = f;
          break;
        }
      }
      if (!defaultY) defaultY = fields.length > 1 ? fields[1] : defaultX;
    }

    const existingCount = this.activeDashboard.charts ? this.activeDashboard.charts.length : 0;
    const typeCycle = ['bar', 'line', 'pie', 'doughnut'];
    const suggestedType = typeCycle[existingCount % typeCycle.length];

    const chartType = chartConfig.chartType || suggestedType;
    const xAxis = chartConfig.xAxis || defaultX;
    const yAxis = chartConfig.yAxis || defaultY;
    const aggregation = chartConfig.aggregation || 'sum';
    const typeLabel = chartType.charAt(0).toUpperCase() + chartType.slice(1);
    const metricLabel = aggregation === 'count' ? 'Count' : yAxis;
    const title = chartConfig.title || `${typeLabel}: ${metricLabel} by ${xAxis}`;

    const newChart = {
      id: 'chart-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      chartType,
      xAxis,
      yAxis,
      aggregation,
      title
    };

    this.activeDashboard.charts.push(newChart);
    this.markDirty();
    this.notify('charts:changed', this.activeDashboard.charts);
    return newChart;
  },

  updateChart(chartId, updates) {
    const index = this.activeDashboard.charts.findIndex(c => c.id === chartId);
    if (index !== -1) {
      this.activeDashboard.charts[index] = {
        ...this.activeDashboard.charts[index],
        ...updates
      };
      this.markDirty();
      this.notify('charts:changed', this.activeDashboard.charts);
    }
  },

  removeChart(chartId) {
    this.activeDashboard.charts = this.activeDashboard.charts.filter(c => c.id !== chartId);
    this.markDirty();
    this.notify('charts:changed', this.activeDashboard.charts);
  },

  moveChart(chartId, direction) {
    const index = this.activeDashboard.charts.findIndex(c => c.id === chartId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = this.activeDashboard.charts[index - 1];
      this.activeDashboard.charts[index - 1] = this.activeDashboard.charts[index];
      this.activeDashboard.charts[index] = temp;
      this.markDirty();
      this.notify('charts:changed', this.activeDashboard.charts);
    } else if (direction === 'down' && index < this.activeDashboard.charts.length - 1) {
      const temp = this.activeDashboard.charts[index + 1];
      this.activeDashboard.charts[index + 1] = this.activeDashboard.charts[index];
      this.activeDashboard.charts[index] = temp;
      this.markDirty();
      this.notify('charts:changed', this.activeDashboard.charts);
    }
  },

  // Backwards-compatible single-chart setter
  setChartConfig(updates) {
    if (!this.activeDashboard.charts || this.activeDashboard.charts.length === 0) {
      this.addChart(updates);
    } else {
      this.activeDashboard.charts[0] = {
        ...this.activeDashboard.charts[0],
        ...updates
      };
      this.markDirty();
      this.notify('charts:changed', this.activeDashboard.charts);
      this.notify('chart:configChanged', this.activeDashboard.charts[0]);
    }
  },

  setDashboardMeta(title, description = '') {
    const titleChanged = this.activeDashboard.title !== (title || 'Untitled Dashboard');
    const descChanged = this.activeDashboard.description !== (description || '');
    this.activeDashboard.title = title || 'Untitled Dashboard';
    this.activeDashboard.description = description || '';
    if (titleChanged || descChanged) {
      this.markDirty();
    }
    this.notify('dashboard:metaChanged', this.activeDashboard);
  },

  getDatasetSignature() {
    const typeMap = {};
    if (this.dataset.profile && this.dataset.profile.columns) {
      this.dataset.profile.columns.forEach(c => { typeMap[c.name] = c.type; });
    }
    return {
      fileName: this.dataset.fileName || 'unknown.csv',
      fileSize: this.dataset.fileSize || 0,
      rowCount: this.dataset.rowCount || 0,
      columns: (this.dataset.fields || []).map(name => ({
        name,
        type: typeMap[name] || 'text'
      }))
    };
  },

  getLayoutConfig() {
    return this.activeDashboard.charts.map(chart => ({
      id: chart.id,
      chartType: chart.chartType || 'bar',
      title: chart.title || 'Chart',
      xAxis: chart.xAxis,
      yAxis: chart.yAxis,
      aggregation: chart.aggregation || 'sum'
    }));
  },

  loadDashboardDoc(doc) {
    this.activeDashboard.id = doc.id;
    this.activeDashboard.title = doc.title;
    this.activeDashboard.description = doc.description || '';

    const layout = doc.layout_config;
    if (Array.isArray(layout)) {
      this.activeDashboard.charts = layout.map((item, idx) => ({
        id: item.id || `chart-${idx + 1}`,
        chartType: item.chartType || 'bar',
        xAxis: item.xAxis || '',
        yAxis: item.yAxis || '',
        aggregation: item.aggregation || 'sum',
        title: item.title || `${item.yAxis || 'Count'} by ${item.xAxis || 'Category'}`
      }));
    } else if (layout) {
      this.activeDashboard.charts = [{
        id: layout.id || 'chart-1',
        chartType: layout.chartType || 'bar',
        xAxis: layout.xAxis || '',
        yAxis: layout.yAxis || '',
        aggregation: layout.aggregation || 'sum',
        title: layout.title || 'Chart'
      }];
    } else {
      this.activeDashboard.charts = [];
    }

    this.markClean();
    this.notify('dashboard:loaded', doc);
    this.notify('charts:changed', this.activeDashboard.charts);
  },

  clearWorkspace() {
    this.activeDashboard = {
      id: null,
      title: 'My Analytics Dashboard',
      description: '',
      charts: []
    };
    this.pendingReconnection = null;
    this.markClean();
    this.clearDataset();
  },

  clearDataset() {
    this.dataset = {
      fileName: null,
      fileSize: 0,
      fields: [],
      data: [],
      rowCount: 0,
      parseDurationMs: 0,
      profile: null
    };
    this.pagination.currentPage = 1;
    this.pagination.filterQuery = '';
    this.activeDashboard.charts = [];
    this.markClean();
    this.notify('dataset:cleared', null);
  },

  setPagination(updates) {
    this.pagination = { ...this.pagination, ...updates };
    this.notify('pagination:changed', this.pagination);
  }
};
