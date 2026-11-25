# Lumora

> **See your data in a new light.**

Lumora is a privacy-first, browser-based CSV analytics studio and multi-chart dashboard builder. It enables users to explore datasets, inspect data profiles, and build rich visual analytics dashboards entirely within their browser without sending raw data rows to an external server.

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Privacy-First Architecture](#privacy-first-architecture)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Running Automated Tests](#running-automated-tests)
- [Project Directory Structure](#project-directory-structure)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Overview

Lumora pairs client-side privacy with powerful desktop-class analytics. When you load a CSV into Lumora, all parsing, statistical calculations, and chart renderings happen directly inside your browser's volatile memory. The lightweight Node.js/SQLite backend only stores dashboard layouts, axis configurations, and column signatures—never the underlying CSV data.

---

## Problem Statement

Traditional business intelligence and spreadsheet tools require users to upload confidential data to cloud servers or third-party platforms before generating charts. For privacy-sensitive domains—such as healthcare, finance, HR, and proprietary analytics—this creates data leakage risks, compliance friction (GDPR, HIPAA), and security overhead.

**Lumora solves this by reversing the paradigm:**
- The compute engine moves to the client's browser.
- The server acts solely as a configuration blueprint store.
- Users gain instant visual analytics without sacrificing data sovereignty.

---

## Privacy-First Architecture

Lumora enforces a strict privacy boundary between your machine and the backend:

1. **Zero Data Transmission**: Raw CSV rows, records, and cell contents never leave the user's browser RAM.
2. **Backend Guardrails**: Server-side Express middleware inspects every incoming payload and actively rejects requests containing raw rows or unpermitted fields with HTTP 400.
3. **SQLite Metadata Only**: The SQLite database (`dashboards` table) stores only dashboard titles, descriptions, column signatures (`{ name, type }`), and chart configuration parameters.
4. **Clean Web Storage**: `localStorage` is restricted to user theme preferences (`light` or `dark`), and `sessionStorage` holds only the active dashboard UUID. No dataset rows are ever cached in browser storage.
5. **No External CDNs**: All client libraries (Papa Parse, Chart.js) are bundled and served directly from the local filesystem to eliminate third-party telemetry or network exposure.

---

## Key Features

### 1. Instant CSV Ingestion & Profiling
- **Drag-and-Drop Dropzone**: Drag any `.csv` file or use the native file picker.
- **1-Click Sample Dataset**: Built-in 50-row Superstore sales dataset for immediate testing.
- **Client-Side Data Profiler**: Automatically categorizes columns into `numeric`, `date`, `categorical`, or `text`.
- **Descriptive Statistics**: Calculates missing-value percentages, distinct counts, min, max, mean, and median with dirty-data resilience.
- **Paginated Preview Table**: Search, filter, and inspect records with configurable page sizes (10, 25, 50).

### 2. Multi-Chart Visual Analytics Dashboard
- **Independent Widgets**: Render multiple concurrent charts in a responsive CSS Grid.
- **Supported Chart Types**: Bar, Line, Pie, and Doughnut charts powered by Chart.js.
- **Dynamic Aggregations**: Compute `sum`, `avg`, or row `count` dynamically on the client.
- **Widget Management**: Reorder charts (move up/down), edit titles/axes in a dedicated modal, or remove widgets with instant canvas lifecycle cleanup.

### 3. Persistent Dashboard Blueprints
- **SQLite Persistence**: Save dashboards by name and reload them from "My Saved Dashboards".
- **In-Place Updates**: Update existing saved dashboards or create copies seamlessly.
- **CSV Reconnection Workflow**: When reopening a dashboard across sessions, Lumora prompts for the original or compatible CSV file and validates required columns.
- **Granular Graceful Degradation**: If a replacement or reconnected CSV lacks columns for one chart, compatible charts still render while incompatible widgets display helpful warnings.

### 4. Workspace Management & Safety
- **Active Session Persistence**: Browser refresh retains the active dashboard ID via `sessionStorage` without data leakage.
- **New Dashboard / Clear Workspace**: Start a fresh workspace with a confirmation prompt that protects SQLite records.
- **Unsaved Changes Indicator**: Live status indicator near the dashboard title (`All changes saved` vs `Unsaved changes`).
- **Navigation Guard**: `beforeunload` interceptor protects against accidental tab closing or navigation when unsaved changes exist.
- **Theme Switcher**: Persistent Light (`#F7F8FC`) and Dark (`#101522`) themes with real-time Chart.js canvas color adaptation.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Runtime** | Vanilla JavaScript (ES Modules) | Client-side application state, event orchestration, and DOM management. |
| **Styling** | Modern CSS3 | Custom Properties (design tokens), responsive CSS Grid, and light/dark themes. |
| **CSV Parsing** | [Papa Parse](https://www.papaparse.com/) (v5.7.0) | Stream-fast, local CSV parsing in browser memory. |
| **Data Visualization** | [Chart.js](https://www.chartjs.org/) (v4.6.1) | Canvas-based rendering of Bar, Line, Pie, and Doughnut visualizations. |
| **Backend Server** | Node.js / Express (v4.21.2) | Static asset serving, health monitoring, and REST API for layout blueprints. |
| **Database** | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (v11.8.1) | Fast, synchronous storage for dashboard configurations. |
| **Test Suite** | Native Node.js Test Runner & Assertions | 301 automated assertions covering Days 1–5 workflows. |

---

## Architecture Overview

```
+-------------------------------------------------------------------------------+
|                                CLIENT BROWSER                                 |
|                                                                               |
|  [CSV File] ---> [Papa Parse] ---> [State Store (RAM)]                        |
|                                            |                                  |
|            +-------------------------------+------------------------------+   |
|            |                              |                              |    |
|     [Data Profiler]              [Multi-Chart Grid]             [Preview Table] |
|   (Types, Min/Max/Avg)          (Chart.js Instances)         (Search & Page)  |
|                                            |                                  |
|                               [Dashboard Manager]                             |
|                           (Schema Validator & State)                          |
+--------------------------------------------|----------------------------------+
                                             | HTTP (Layout Blueprints ONLY)
                                             | [Strict Privacy Boundary]
                                             v
+-------------------------------------------------------------------------------+
|                            NODE.JS / EXPRESS SERVER                           |
|                                                                               |
|  POST / PUT / GET / DELETE /api/dashboards                                    |
|    - Privacy Guard: Rejects payloads with raw rows or records                |
|    - SQLite Data Access Layer (`better-sqlite3`)                              |
|                                                                               |
|  [SQLite Database: server/db/insightboard.sqlite]                             |
|    - Table: dashboards (id, title, dataset_signature, layout_config)          |
+-------------------------------------------------------------------------------+
```

For complete implementation details, see [docs/architecture.md](docs/architecture.md).

---

## Screenshots

<!-- Add visual captures here once hosted or published -->

### 1. Upload & Landing View
![Lumora Upload Screen](docs/screenshots/upload_landing.png)
*(Placeholder: Drag-and-drop CSV dropzone, 1-click sample dataset loader, and privacy guarantee banner)*

### 2. Multi-Chart Dashboard & Data Profile
![Lumora Dashboard View](docs/screenshots/dashboard_view.png)
*(Placeholder: Multi-chart responsive grid showing Bar, Line, and Pie charts with summary statistics cards)*

### 3. Dark Theme Analytics Studio
![Lumora Dark Theme](docs/screenshots/dark_theme.png)
*(Placeholder: High-contrast dark theme view with live Chart.js theme adaptation)*

---

## Getting Started

### Prerequisites

- **Node.js**: v18.x or v20.x+ (LTS recommended)
- **npm**: v9.x or v10.x+

### Installation

1. Clone or download the repository:
   ```bash
   git clone https://github.com/your-username/lumora.git
   cd lumora
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

1. Start the server:
   ```bash
   npm start
   ```
   *(For development with auto-reload, run `npm run dev`)*

2. Open your web browser and navigate to:
   ```
   http://localhost:3000
   ```

3. Click **"Load Sample Dataset"** to immediately explore Superstore data or drag-and-drop your own `.csv` file.

---

## Running Automated Tests

Lumora includes automated integration and unit test suites verifying all backend endpoints, privacy boundaries, and frontend logic:

```bash
# Run the complete test suite (301 assertions across Day 1–5)
npm test

# Run individual test suites
npm run test:day1   # Server health, static assets, Papa Parse
npm run test:day2   # SQLite persistence, REST API, privacy guard
npm run test:day3   # Data profiling, statistics, chart configurations
npm run test:day4   # Multi-chart grid, independent state, reordering
npm run test:day5   # Session persistence, schema validation, dirty tracking
```

---

## Project Directory Structure

```
lumora/
├── .gitignore                    # Excludes node_modules, SQLite DBs, logs, temp files
├── docs/
│   ├── architecture.md           # Deep-dive architecture and privacy specification
│   └── screenshots/              # Screenshot assets for documentation
├── package.json                  # Project dependencies and test scripts
├── package-lock.json             # Pinned dependency tree
├── public/                       # Static frontend assets
│   ├── css/
│   │   └── main.css              # Custom styling, responsive grid, theme variables
│   ├── index.html                # Main application UI shell
│   ├── js/
│   │   ├── app.js                # Application entry point and event orchestration
│   │   ├── state.js              # Centralized reactive state store
│   │   ├── modules/
│   │   │   ├── chartManager.js   # Chart.js lifecycle, color palettes, aggregations
│   │   │   ├── csvManager.js     # Papa Parse wrapper, dataset validation, sample data
│   │   │   ├── dashboardGrid.js  # Multi-chart responsive grid and modal editors
│   │   │   ├── dashboardManager.js# SQLite persistence, session restoration, reconnect
│   │   │   ├── dataProfiler.js   # Column type inference, missing metrics, statistics
│   │   │   ├── profilerUI.js     # Profiler KPI cards and column statistics table
│   │   │   ├── schemaValidator.js# Granular per-chart column validation
│   │   │   ├── tablePreview.js   # Paginated, searchable CSV table view
│   │   │   ├── themeManager.js   # Light/dark theme toggle and persistence
│   │   │   └── toast.js          # Accessible toast notifications
│   │   └── package.json          # Module declaration for client scripts
│   └── vendor/                   # Bundled third-party libraries (zero CDN reliance)
│       ├── chart.umd.js          # Chart.js v4.6.1
│       └── papaparse.min.js      # Papa Parse v5.7.0
├── server/                       # Backend Express & SQLite layer
│   ├── db/
│   │   └── database.js           # SQLite connection & CRUD operations (`better-sqlite3`)
│   └── routes/
│       └── dashboards.js         # REST endpoints with privacy guard middleware
├── server.js                     # Express application entry point & health check
└── tests/                        # Comprehensive automated test suites
    ├── day1.test.js              # Server health, static assets, Papa Parse
    ├── day2.test.js              # SQLite CRUD, privacy rejection, restart persistence
    ├── day3.test.js              # Data profiler, statistics, chart aggregation
    ├── day4.test.js              # Multi-chart grid, independent state, layout hydration
    └── day5.test.js              # Session persistence, schema validation, dirty states
```

---

## Future Improvements

- **JSON Blueprint Import/Export**: Export dashboard configurations as `.lumora.json` files for sharing across machines without database dependencies.
- **Additional Chart Types**: Scatter plots, area charts, and grouped/stacked bar charts.
- **Exporting Dashboards**: High-resolution image (`.png`) and printable PDF summary reports.
- **Advanced Formula Columns**: In-browser computed virtual columns (e.g. `Margin = Profit / Sales`).

---

## License

This project is licensed under the [ISC License](package.json).
