# Data Handling and Transformation

## Component Index

```
frontend/src/metabase/visualizer/
├── utils/
│   ├── column.ts                         # Column reference and manipulation utilities
│   ├── data-source.ts                    # Data source management utilities
│   ├── merge-data.ts                     # Data merging between multiple sources
│   ├── split-series.ts                   # Series splitting for multi-series charts
│   ├── get-visualization-columns.ts      # Column generation for visualizations
│   ├── get-initial-state-for-card-data-source.ts  # Initialization from a card
│   ├── get-initial-state-for-multiple-series.ts   # Initialization from multiple series
│   └── get-initial-state-for-visualizer-card.ts   # Initialization from visualizer card
├── components/DataImporter/
│   ├── DataImporter.tsx                  # Data source selection UI
│   ├── DatasetsList/                     # Available data sources listing
│   │   ├── DatasetsList.tsx              # Dataset browser interface
│   │   └── getIsCompatible.ts            # Dataset compatibility checking
│   └── ColumnsList/                      # Column selection interface
│       └── ColumnsList.tsx               # Column listing and selection
```

## Feature Summary

The visualizer feature implements a sophisticated data handling system that enables:

1. **Data Source Selection**: Users can select and add one or more data sources (questions) to create visualizations
2. **Column Mapping**: Columns from different data sources can be mapped to visualization dimensions
3. **Data Merging**: Data from multiple sources can be merged into a unified dataset
4. **Data Transformation**: Raw data can be transformed for different visualization types
5. **Initial State Creation**: Visualizer states can be created from various starting points

This system allows for flexible data visualization creation from diverse data sources, with automatic compatibility checking and transformations specific to different visualization types.

## Data Source and Column Model

### Core Abstractions

1. **Data Sources**: 
   - Represented by `VisualizerDataSource` with an ID, type, and name
   - Currently only supports "card" type (questions/saved cards)
   - Identified by a structured ID format: `"card:123"`

2. **Column References**:
   - Represented by `VisualizerColumnReference` pointing to source data
   - Contains source ID, original column name, and internal name
   - Example:
     ```typescript
     {
       sourceId: "card:123",
       originalName: "TOTAL",
       name: "COLUMN_1"
     }
     ```

3. **Column Value Sources**:
   - Can be a column reference or a data source name reference
   - Data source name references have format `$_card:123_name`
   - Used for special values like series names

4. **Column Value Mappings**:
   - Maps visualization dimension names to column value sources
   - Core structure for linking data to visualization dimensions
   - Example:
     ```typescript
     {
       "COLUMN_1": [{ sourceId: "card:123", originalName: "TOTAL", name: "COLUMN_1" }],
       "COLUMN_2": [{ sourceId: "card:123", originalName: "CATEGORY", name: "COLUMN_2" }]
     }
     ```

### Column Reference Management

The system maintains column references with several key functions:

1. **Creation**: `createVisualizerColumnReference()` creates references with:
   - Checks for existing references to avoid duplication
   - Generates unique internal names (`COLUMN_1`, `COLUMN_2`, etc.)
   - Associates columns with their data source

2. **Comparison**: Functions like `isReferenceToColumn()` and `compareColumnReferences()` check:
   - Reference equality for deduplication
   - Source identity for column grouping
   - Reference validity for security and stability

3. **Column Copying**: `copyColumn()` creates visualization-ready columns:
   - Preserves original column properties
   - Assigns internal names for mapping
   - Handles display name conflicts with source attribution

## Data Import and Selection

### Data Source Selection

The `DataImporter` component manages the process of selecting data sources:

1. **Two Modes**:
   - Dataset selection mode: Browse and add data sources
   - Column management mode: View and work with columns from selected sources

2. **Dataset Compatibility**:
   - `getIsCompatible()` determines if datasets can be combined
   - Checks type compatibility based on current visualization
   - Ensures primary dimensions are compatible
   - Special handling for different visualization types (pie, funnel, etc.)

3. **Column Selection**:
   - `ColumnsList` displays available columns from all data sources
   - Columns are draggable to map to visualization dimensions
   - Organized by source and column type

### State Initialization

The visualizer can initialize its state from different starting points:

1. **From Card Source**: `getInitialStateForCardDataSource()`:
   - Creates state from a single question/card
   - Selects appropriate columns based on visualization type
   - Maps original settings to visualizer format
   - Handles special cases like table → bar chart conversion

2. **From Multiple Series**: `getInitialStateForMultipleSeries()`:
   - Creates state from a multi-series card
   - Processes all columns from all series
   - Merges settings from multiple sources
   - Maintains visualization type and settings

3. **From Visualizer Card**: `getInitialStateForVisualizerCard()`
   - Recreates state from existing visualizer card
   - Preserves all column mappings and settings
   - Re-establishes data source connections

## Data Transformation

### Data Merging

The `mergeVisualizerData()` function is central to combining data from multiple sources:

1. **Process Flow**:
   - Extract all referenced columns from mappings
   - Collect raw values for each referenced column
   - Build a unified data structure based on column mappings
   - Result is a dataset with merged rows from multiple sources

2. **Key Techniques**:
   - Value extraction by column reference
   - Row zipping to align values
   - Special handling for data source name references
   - Error checking for missing values

3. **Implementation Details**:
   ```typescript
   // Collect source data from referenced columns
   referencedColumns.forEach((ref) => {
     const dataset = datasets[ref.sourceId];
     const columnIndex = dataset?.data.cols.findIndex(
       (col) => col.name === ref.originalName
     );
     if (columnIndex >= 0) {
       const values = dataset.data.rows.map((row) => row[columnIndex]);
       referencedColumnValuesMap[ref.name] = values;
     }
   });
   
   // Build unified rows based on column mappings
   const unzippedRows = columns.map((column) =>
     (columnValuesMapping[column.name] ?? [])
       .map((valueSource) => {
         if (isDataSourceNameRef(valueSource)) {
           // Handle special data source name references
           const id = getDataSourceIdFromNameRef(valueSource);
           const dataSource = dataSources.find((source) => source.id === id);
           return dataSource?.name ? [dataSource.name] : [];
         }
         // Get values for standard column references
         return referencedColumnValuesMap[valueSource.name];
       })
       .flat()
   );
   
   // Zip rows back together
   return {
     cols: columns,
     rows: _.zip(...unzippedRows),
     results_metadata: { columns }
   };
   ```

### Visualization Column Generation

The `getVisualizationColumns()` function creates columns for visualization display:

1. **Special Cases**:
   - Special handling for "scalar funnel" visualization
   - Creates metric and dimension columns as needed

2. **Column Creation**:
   - Processes each column mapping
   - Extracts actual column data from original datasets
   - Creates new visualization-specific columns
   - Assigns proper display names and metadata

3. **Implementation Details**:
   ```typescript
   Object.entries(columnValuesMapping).forEach(
     ([_visualizationColumnName, columnMappings]) => {
       columnMappings.forEach((columnMapping) => {
         if (typeof columnMapping !== "string") {
           // Find the original column in the source dataset
           const datasetColumn = datasets[columnMapping.sourceId]?.data.cols
             .find((col) => col.name === columnMapping.originalName);
           
           const dataSource = dataSources.find(
             (dataSource) => dataSource.id === columnMapping.sourceId
           );
           
           // Create a visualization column
           const visualizationColumn = copyColumn(
             columnMapping.name,
             datasetColumn,
             dataSource.name,
             visualizationColumns
           );
           
           visualizationColumns.push(visualizationColumn);
         }
       });
     }
   );
   ```

### Series Splitting

For multi-series visualizations, the system can split data using `splitVisualizerSeries()`:

1. **When to Split**:
   - Determined by `shouldSplitVisualizerSeries()`
   - Splits when dimensions come from multiple data sources
   - Only applicable to cartesian chart types

2. **Split Process**:
   - Identifies distinct data sources
   - Extracts columns belonging to each source
   - Creates separate series for each source
   - Assigns appropriate settings to each series

3. **Implementation Details**:
   ```typescript
   return dataSourceIds.map((dataSourceId, i) => {
     // Find columns from this data source
     const columnNames = Object.keys(columnValuesMapping).filter((columnName) =>
       columnValuesMapping[columnName].some(
         (valueSource) =>
           !isDataSourceNameRef(valueSource) &&
           valueSource.sourceId === dataSourceId
       )
     );
     
     // Extract columns and rows
     const cols = series[0].data.cols.filter((col) =>
       columnNames.includes(col.name)
     );
     
     const rows = series[0].data.rows.map((row) =>
       row.filter((_, i) => columnNames.includes(data.cols[i].name))
     );
     
     // Create a new series with appropriate settings
     return {
       card: {
         ...mainCard,
         id: getVisualizerSeriesCardId(i),
         name: seriesName,
         visualization_settings: {
           ...mainCard.visualization_settings,
           "graph.metrics": metrics,
           "graph.dimensions": dimensions,
         },
       },
       data: { cols, rows, results_metadata: { columns: cols } },
     };
   });
   ```

## Implementation Details

### Data Flow Architecture

The data handling system follows a well-defined flow:

1. **Data Source Management**:
   - User selects data sources via `DataImporter`
   - Source details stored in Redux state
   - Compatibility checked via `getIsCompatible()`

2. **Column Mapping**:
   - User maps columns to visualization dimensions via drag-and-drop
   - Mappings stored in `columnValuesMapping` state
   - References created with `createVisualizerColumnReference()`

3. **Data Transformation**:
   - Raw datasets merged via `mergeVisualizerData()`
   - Visualization columns created via `getVisualizationColumns()`
   - Series split if needed via `splitVisualizerSeries()`

4. **Visualization Rendering**:
   - Transformed data passed to visualization components
   - Settings applied to display
   - Updates triggered on mapping changes

### Error Handling and Edge Cases

The system handles several edge cases:

1. **Missing Data**: 
   - Checks for undefined datasets/columns
   - Skips incompatible columns
   - Provides warnings for missing mappings

2. **Type Compatibility**:
   - Verifies column type compatibility for visualization types
   - Special handling for different data types (date, number, string)
   - Ensures visualization semantics match column types

3. **Multiple Data Sources**:
   - Resolves naming conflicts
   - Handles different row counts
   - Supports joining based on dimensional mapping

### Performance Considerations

The system implements several optimizations:

1. **Selective Processing**:
   - Only processes columns that are actually mapped
   - Avoids unnecessary transformations
   - Uses native row operations when possible

2. **Memory Efficiency**:
   - Reuses column references where possible
   - Avoids duplicate data storage
   - Leverages source datasets directly

3. **Processing Optimizations**:
   - Flat arrays for faster column value access
   - Map-based lookups for column resolution
   - Single-pass transformations where possible

The data handling and transformation system is a sophisticated component that enables the flexible, user-friendly visualization creation experience of the visualizer feature, balancing power and simplicity in a well-architected system.