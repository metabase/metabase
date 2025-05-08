# Visualization Type Support

## Component Index

```
frontend/src/metabase/visualizer/visualizations/
├── cartesian.ts                       # Cartesian charts (bar, line, area, scatter) handling
├── pie.ts                             # Pie chart handling
├── funnel.ts                          # Funnel visualization handling
├── utils.ts                           # Shared utilities for visualization handling

frontend/src/metabase/visualizer/components/VisualizationCanvas/
├── HorizontalWell/                    # X-axis drop targets
│   ├── HorizontalWell.tsx             # Router for visualization-specific wells
│   ├── CartesianHorizontallWell.tsx   # X-axis for cartesian charts
│   └── FunnelHorizontalWell.tsx       # "Values" well for funnel visualizations
├── VerticalWell/                      # Y-axis drop targets
│   ├── VerticalWell.tsx               # Router for visualization-specific wells
│   ├── CartesianVerticalWell.tsx      # Y-axis for cartesian charts
│   ├── PieVerticalWell.tsx            # "Slices by" well for pie charts
│   └── FunnelVerticalWell.tsx         # "Steps" well for funnel visualizations
└── ScatterFloatingWell/               # Bubble size control for scatter plots
    └── ScatterFloatingWell.tsx        # Floating well for scatter bubble size
```

## Feature Summary

The visualizer supports multiple visualization types, each with specialized drop targets and data handling:

1. **Cartesian Charts**: Bar, line, area, and scatter charts with X/Y axis mapping
2. **Pie Charts**: Circular charts with dimension and metric mapping
3. **Funnel Charts**: Step-based visualizations with dimension ordering and values
4. **Scatter Charts**: XY plots with optional bubble size dimension

Each visualization type has specific requirements for the data it can visualize, custom handling for column mappings, and specialized UI components for column assignment.

## Cartesian Charts

### Core Structure

Cartesian charts (bar, line, area, scatter) use a dimensional model with:

1. **X-axis dimensions**: Typically categories, dates, or other dimensions
2. **Y-axis metrics**: Numeric values to display on the Y-axis
3. **Special handling for scatter plots**: Bubble size as an optional third dimension

### Implementation Details

1. **Drop Handlers**: The `cartesianDropHandler` provides specialized handling for different drop zones:
   ```typescript
   export const cartesianDropHandler = (
     state: VisualizerVizDefinitionWithColumns,
     { active, over }: DragEndEvent,
     { dataSourceMap, datasetMap }: { ... }
   ) => {
     // Handle X-axis drops (dimensions)
     if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
       const isSuitableColumn = getDefaultDimensionFilter(state.display);
       if (isSuitableColumn(column)) {
         addDimensionColumnToCartesianChart(state, column, columnRef, dataSource);
         // For multi-source charts, try to add matching dimensions from other sources
         maybeImportDimensionsFromOtherDataSources(...);
       }
     }
     
     // Handle Y-axis drops (metrics)
     if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
       const isSuitableColumn = getDefaultMetricFilter(state.display);
       if (isSuitableColumn(column)) {
         addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
       }
     }
     
     // Handle scatter bubble size drops
     if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
       replaceMetricColumnAsScatterBubbleSize(state, column, columnRef, dataSource);
     }
   };
   ```

2. **Multi-Series Support**: Special handling for charts with data from multiple sources:
   ```typescript
   // Automatically import matching dimensions when combining sources
   export function maybeImportDimensionsFromOtherDataSources(
     state: VisualizerVizDefinitionWithColumns,
     newDimension: DatasetColumn,
     datasetMap: Record<string, Dataset>,
     dataSourceMap: Record<string, VisualizerDataSource>,
   ) {
     // Look for matching date dimensions or dimensions with the same ID
     // across different data sources
   }
   ```

3. **Type-Based Compatibility**: Ensures proper column-to-axis mapping:
   ```typescript
   // Intelligently adds columns where they make sense
   export function addColumnToCartesianChart(
     state: VisualizerVizDefinitionWithColumns,
     column: DatasetColumn,
     columnRef: VisualizerColumnReference,
     dataset: Dataset,
     dataSource: VisualizerDataSource,
   ) {
     // Different handling for scatter plots
     if (state.display === "scatter") {
       // Special arrangement for X axis, Y axis, and bubble size
     } else {
       // For other cartesian charts
       if (isDimension(column) && !isMetric(column)) {
         addDimensionColumnToCartesianChart(...);
       } else if (isMetric(column)) {
         addMetricColumnToCartesianChart(...);
       }
     }
   }
   ```

### UI Components

1. **CartesianVerticalWell**: Handles Y-axis (metrics) mappings:
   - Displays metrics with drag handles for reordering
   - Adapts to multi-series vs. single-series charts
   - Filters for compatible metric columns

2. **CartesianHorizontalWell**: Handles X-axis (dimensions) mappings:
   - Shows dimensions with drag handles for reordering
   - Special handling for multi-series charts: shows one representative dimension per type
   - Visual feedback during drag operations

3. **ScatterFloatingWell**: Specialized well for scatter bubble size:
   - Displayed inside the chart area
   - Single-value selection for bubble size
   - Replaceable metric column

## Pie Charts

### Core Structure

Pie charts use a simpler data model with:

1. **Metric**: A single numeric value to determine slice size
2. **Dimensions**: One or more dimensions to determine slice categories

### Implementation Details

1. **Drop Handlers**: The `pieDropHandler` manages drop operations:
   ```typescript
   export const pieDropHandler = (
     state: VisualizerVizDefinitionWithColumns,
     { active, over }: DragEndEvent,
   ) => {
     // Handle metric drops (slice size)
     if (over.id === DROPPABLE_ID.PIE_METRIC && isNumeric(column)) {
       // Replace or set the metric column
       state.settings["pie.metric"] = columnRef.name;
       state.columnValuesMapping[metricColumnName] = [columnRef];
     }
     
     // Handle dimension drops (slice categories)
     if (over.id === DROPPABLE_ID.PIE_DIMENSION) {
       // Add to pie dimensions if not already present
       state.settings["pie.dimension"] = [...dimensions, newDimension.name];
       state.columnValuesMapping[newDimension.name] = [columnRef];
     }
   };
   ```

2. **Auto-Mapping**: Automatically maps columns when adding data sources:
   ```typescript
   export function combineWithPieChart(
     state: VisualizerVizDefinitionWithColumns,
     { data }: Dataset,
     dataSource: VisualizerDataSource,
   ) {
     // Auto-map a single metric if available
     // Auto-map a single dimension if available
   }
   ```

3. **Column Management**: Handles column addition and removal:
   ```typescript
   export function removeColumnFromPieChart(
     state: VisualizerVizDefinitionWithColumns,
     columnName: string,
   ) {
     // Remove from pie.dimension or pie.metric settings
     // Clean up column from state if not used elsewhere
   }
   ```

### UI Components

1. **PieVerticalWell**: Combines two distinct wells:
   - **PieMetricWell**: For the single metric determining slice size
     - Shows the current metric with remove option
     - Accepts only numeric columns
   - **PieDimensionWell**: For dimensions determining slice categories
     - Shows all dimensions with remove options
     - Accepts only dimension columns

2. **No Horizontal Well**: Pie charts don't use a horizontal well since all mappings are handled in the vertical well

## Funnel Charts

### Core Structure

Funnel charts have two unique implementations:

1. **Standard funnel**: Uses a dimension column for steps and a metric column for values
2. **Scalar funnel**: A special case built from multiple scalar cards, where each card becomes a step

### Implementation Details

1. **Drop Handlers**: The `funnelDropHandler` manages drop operations:
   ```typescript
   export const funnelDropHandler = (
     state: VisualizerVizDefinitionWithColumns,
     { active, over }: DragEndEvent,
   ) => {
     // Handle drops on the canvas for scalar values
     if (over.id === DROPPABLE_ID.CANVAS_MAIN && isNumeric(column)) {
       addScalarToFunnel(state, dataSource, column);
     }
     
     // Handle dimension drops (funnel steps categories)
     if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
       // Set or update the dimension column
     }
     
     // Handle metric drops (funnel values)
     if (over.id === DROPPABLE_ID.Y_AXIS_WELL && isNumeric(column)) {
       // Set or update the metric column
     }
   };
   ```

2. **Scalar Funnel Handling**: Special support for creating funnels from individual numbers:
   ```typescript
   export function addScalarToFunnel(
     state: VisualizerVizDefinitionWithColumns,
     dataSource: VisualizerDataSource,
     column: DatasetColumn,
   ) {
     // Create special METRIC and DIMENSION columns if needed
     // Add the scalar value to the METRIC column mapping
     // Add the data source name to the DIMENSION column mapping
   }
   
   export function isScalarFunnel(
     state: Pick<VisualizerVizDefinitionWithColumns, "display" | "settings">,
   ) {
     return (
       state.display === "funnel" &&
       state.settings["funnel.metric"] === "METRIC" &&
       state.settings["funnel.dimension"] === "DIMENSION"
     );
   }
   ```

3. **Funnel Step Creation**: Creating funnel steps from standalone cards:
   ```typescript
   // Detect if a card can be used as a funnel step
   export function canCombineCardWithFunnel({ data }: Dataset) {
     return (
       data?.cols?.length === 1 &&
       isNumeric(data.cols[0]) &&
       data.rows?.length === 1
     );
   }
   ```

### UI Components

1. **FunnelVerticalWell**: Handles the metric column:
   - Shows the current metric with remove option
   - Accepts only numeric columns
   - Simpler than cartesian well as it only handles a single column

2. **FunnelHorizontalWell**: Handles dimension column and ordering:
   - Shows the dimension column and funnel steps
   - Supports drag-and-drop reordering of steps
   - For scalar funnels, displays the source names as steps

## Component Integration

All visualization types integrate through a common architecture:

1. **Type-Specific Routing**: Components like `VerticalWell` and `HorizontalWell` route to type-specific implementations:
   ```typescript
   // In VerticalWell.tsx
   export function VerticalWell() {
     const display = useSelector(getVisualizationType);
     
     if (isCartesianChart(display)) {
       return <CartesianVerticalWell />;
     }
     if (display === "pie") {
       return <PieVerticalWell />;
     }
     if (display === "funnel") {
       return <FunnelVerticalWell />;
     }
     return null;
   }
   ```

2. **Consistent Drop Handling**: All visualization types implement drop handlers that follow the same pattern:
   - Check drop target compatibility
   - Create column references
   - Update state and settings appropriately

3. **Consistent Removal Handling**: All visualization types handle column removal through a shared utility:
   ```typescript
   // In utils.ts
   export function removeColumnFromStateUnlessUsedElseWhere(
     state: VisualizerVizDefinitionWithColumns,
     columnName: string,
     settingsKeys: string[],
   ) {
     // Check if column is used in any setting
     // Remove if not used
   }
   ```

## Implementation Patterns

### Common Patterns Across Visualization Types

1. **Column Type Validation**: All visualizations validate column types for compatibility:
   - Cartesian charts use `getDefaultDimensionFilter` and `getDefaultMetricFilter`
   - Pie charts check for `isNumeric` and `isDimension`
   - Funnel charts validate numeric columns for metrics

2. **Column References**: Consistent creation of column references:
   ```typescript
   // Used in all visualization types
   const columnRef = createVisualizerColumnReference(
     dataSource,
     column,
     extractReferencedColumns(state.columnValuesMapping),
   );
   ```

3. **Settings Management**: Setting keys follow a predictable pattern:
   - Cartesian: `graph.dimensions`, `graph.metrics`, `scatter.bubble`
   - Pie: `pie.dimension`, `pie.metric`
   - Funnel: `funnel.dimension`, `funnel.metric`, `funnel.rows`

4. **Auto-Initialization**: All visualization types implement a `combineWith[Type]` function:
   ```typescript
   // Implemented for all visualization types
   export function combineWithPieChart(
     state: VisualizerVizDefinitionWithColumns,
     { data }: Dataset,
     dataSource: VisualizerDataSource,
   ) {
     // Type-specific logic to auto-map columns
   }
   ```

### Type-Specific Patterns

1. **Multi-series Support**: Only cartesian charts implement multi-series support:
   ```typescript
   // In cartesian.ts
   maybeImportDimensionsFromOtherDataSources(
     state,
     column,
     _.omit(datasetMap, dataSource.id),
     dataSourceMap,
   );
   ```

2. **Scalar Funnel**: Unique to funnel charts, creating funnels from multiple scalar values:
   ```typescript
   // In funnel.ts
   if (canCombineCardWithFunnel(dataset)) {
     addScalarToFunnel(state, dataSource, dataset.data.cols[0]);
     return;
   }
   ```

3. **Floating Well**: Unique to scatter plots:
   ```typescript
   // In ScatterFloatingWell.tsx
   <Box
     p="md"
     bg="bg-medium"
     style={{
       borderRadius: "var(--default-border-radius)",
       outline: isOver && canHandleActiveItem ? "1px solid var(--mb-color-brand)" : "none",
     }}
     ref={setNodeRef}
   >
     {bubbleSize ? (
       <WellItem onRemove={handleRemove}>
         <Text truncate>{t`Bubble size` + `: ${bubbleSize.display_name}`}</Text>
       </WellItem>
     ) : (
       <Text c="text-light">{t`Bubble size`}</Text>
     )}
   </Box>
   ```

## Summary of Visualization Type Support

The visualizer feature has implemented a flexible system for supporting different visualization types, with specialized handling for:

1. **Cartesian Charts**:
   - Support for bar, line, area, and scatter charts
   - Horizontal well for dimensions (X-axis)
   - Vertical well for metrics (Y-axis)
   - Special handling for multi-series data
   - Floating well for scatter bubble size

2. **Pie Charts**:
   - Single metric for slice size
   - Multiple dimensions for slice categories
   - Combined vertical well for all mappings

3. **Funnel Charts**:
   - Standard mode with dimension and metric
   - Scalar mode combining individual scalar values
   - Support for step reordering

Each visualization type implements a consistent set of functions for drop handling, column management, and auto-initialization, while providing specialized UI components tailored to the visualization's unique requirements.