# Pivot Table Migration - File Reference

This file provides a comprehensive reference to the codebase areas relevant to the pivot table migration project, focusing on the distinction between FE pivots and standalone pivot visualizations.

## Frontend Components and Services

### Table Visualization with FE Pivot Feature
- `/frontend/src/metabase/visualizations/visualizations/Table/Table.tsx`
  - Contains the `"table.pivot"` setting that enables FE pivoting
  - Configures pivot column and cell column settings

- `/frontend/src/metabase/visualizations/components/TableInteractive/TableInteractive.tsx`
  - Renders the table for both regular and pivoted views
  - Uses `isPivoted` prop to determine behavior

- `/frontend/src/metabase/lib/data_grid.js`
  - Contains `pivot()` function - Simple pivoting used by FE pivots
  - Contains `multiLevelPivot()` - Complex pivoting for standalone pivot viz

### Standalone Pivot Visualization
- `/frontend/src/metabase/visualizations/visualizations/PivotTable/PivotTable.tsx`
  - Main component for standalone pivot visualization
  - Handles rendering complex pivot tables with headers and data grid

- `/frontend/src/metabase/visualizations/visualizations/PivotTable/settings.ts`
  - Defines settings including row/column totals controls:
    - `"pivot.show_row_totals"` 
    - `"pivot.show_column_totals"`

### API Services and Integration
- `/frontend/src/metabase/services.js`
  - Defines `maybeUsePivotEndpoint()` function that determines when to use pivot endpoint
  - Contains `MetabaseApi.dataset_pivot` function that makes POST request to `/api/dataset/pivot`
  - Maps between regular endpoints and pivot endpoints

## Backend Implementation

### API Endpoint
- `/src/metabase/api/dataset.clj`
  - Contains the definition for the `/api/dataset/pivot` endpoint
  - Handler calls `qp.pivot/run-pivot-query` with the query and formatting options

### Pivot Query Processing
- `/src/metabase/query_processor/pivot.clj`
  - Core backend implementation for generating pivot queries
  - `run-pivot-query` function (line ~591) processes pivot requests
  - `generate-queries` function (line ~182) creates multiple subqueries based on pivot options
  - `breakout-combinations` function (line ~88) determines what combinations of breakouts to use for queries
  - These functions need to be modified to take into account row/column totals settings

### Shared Pivot Logic
- `/src/metabase/pivot/core.cljc`
  - Core logic shared between frontend and backend
  - Functions for formatting, subtotals, and grand totals

## Milestone 1 Focus

For Milestone 1, the focus is on modifying the `generate-queries` and related functions in `/src/metabase/query_processor/pivot.clj` to optimize query generation based on the row/column totals settings. If a user has disabled totals, only a single query should be executed instead of multiple ones, improving performance for pivot table visualizations.