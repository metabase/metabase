# Chart Types Implementation

## Key Implementation Strategies

Metabase's visualization system is built with a consistent architecture that separates concerns:

1. **Component Architecture**
   - **Chart Definition**: Each chart type has a definition file that specifies properties, settings, and behavior
   - **Rendering Component**: React components that handle the actual chart rendering
   - **Model Creation**: Functions that transform data into chart models
   - **Option Generation**: Functions that create ECharts options from models
   - **Formatters**: Utilities for formatting values appropriately

2. **ECharts Integration**

   Modern visualizations leverage ECharts, a powerful JavaScript charting library:

   ```tsx
   // ResponsiveEChartsRenderer.tsx
   <EChartsRenderer
     ref={ref}
     {...echartsRenderedProps}
     width={width}
     height={height}
   />

   // EChartsRenderer.tsx
   chartRef.current = init(chartElemRef.current, null, {
     width,
     height,
     renderer: "svg",
   });

   chartRef.current?.setOption(option, notMerge);
   ```

3. **Chart Type Inheritance**

   Many chart types extend or reuse the same base implementations:

   ```tsx
   // LineChart.tsx
   export function LineChart(props: VisualizationProps) {
     return <CartesianChart {...props} />;
   }

   // BarChart.tsx
   export function BarChart(props: VisualizationProps) {
     return <CartesianChart {...props} />;
   }
   ```

## Data Processing and Transformation

1. **Series Data Extraction and Processing**

   Raw series data is processed into appropriate models:

   ```tsx
   // use-models-and-option.ts
   const seriesToRender = useMemo(
     () => extractRemappings(rawSeries),
     [rawSeries],
   );

   const chartModel = useMemo(() => {
     let getModel;
     getModel = getCartesianChartModel;
     
     if (card.display === "waterfall") {
       getModel = getWaterfallChartModel;
     } else if (card.display === "scatter") {
       getModel = getScatterPlotModel;
     }

     return getModel(
       seriesToRender,
       settings,
       Array.from(hiddenSeries),
       renderingContext,
       showWarning,
     );
   }, [...dependencies]);
   ```

2. **Data Normalization**

   Data is transformed into specific structures expected by each chart type:

   ```typescript
   // For pie charts
   export function getPieChartModel(rawSeries, settings, hiddenSlices, renderingContext, showWarning) {
     // Extract column descriptors, aggregate data, and handle edge cases
     const { metricDesc, dimensionDesc } = getPieColumns(rawSeries, settings);
     
     // Transform and normalize the data
     const aggregatedRows = getAggregatedRows(
       dataRows,
       dimensionDesc.index,
       metricDesc.index
     );
     
     // Build chart-specific data structure
     const sliceTree = createSliceTree(/* parameters */);
     
     // Calculate percentages, angles, etc.
     sliceTree.forEach(node => calculatePercentageAndIsOther(node, node, settings));
     computeSliceAngles(getArrayFromMapValues(sliceTree));
     
     return {
       sliceTree,
       numRings,
       total,
       colDescs,
     };
   }
   ```

## Settings Implementation

1. **Settings Definition**

   Each chart type defines its settings structure and behavior:

   ```typescript
   // PIE_CHART_DEFINITION
   settings: {
     // Metric setting
     ...metricSetting("pie.metric", {
       section: t`Data`,
       title: t`Measure`,
       showColumnSetting: true,
       getDefault: (rawSeries: Series) => getDefaultPieColumns(rawSeries).metric,
     }),
     
     // Display settings
     "pie.show_legend": {
       section: t`Display`,
       title: t`Show legend`,
       widget: "toggle",
       getDefault: getDefaultShowLegend,
       inline: true,
       marginBottom: "1rem",
     },
     
     // Format settings
     "pie.decimal_places": {
       section: t`Display`,
       title: t`Number of decimal places`,
       widget: "number",
       props: {
         placeholder: t`Auto`,
         options: { isInteger: true, isNonNegative: true },
       },
       getHidden: (_, settings) =>
         settings["pie.percent_visibility"] == null ||
         settings["pie.percent_visibility"] === "off",
       readDependencies: ["pie.percent_visibility"],
     },
   }
   ```

2. **Settings Dependencies**

   Settings can depend on other settings:

   ```typescript
   // Example from PIE_CHART_DEFINITION
   "pie.decimal_places": {
     // ...
     getHidden: (_, settings) =>
       settings["pie.percent_visibility"] == null ||
       settings["pie.percent_visibility"] === "off",
     readDependencies: ["pie.percent_visibility"],
   }
   ```

## Common Patterns vs Chart-Specific Implementations

### Common Patterns

1. **Chart Definition Structure**
   - All charts have a definition object with common properties like `uiName`, `identifier`, `iconName`, `settings`
   - Standard patterns for handling rendering, series data, and settings

2. **Data Processing Flow**
   - Raw series data → Model → ECharts options → Rendering
   - Consistent pattern for series data extraction, transformation, and rendering

3. **Responsive Behavior**
   - Charts automatically adjust to container sizes using `ExplicitSize` and responsive renderers

4. **Settings Organization**
   - Settings grouped by sections (Data, Display, etc.)
   - Common setting types reused across charts (toggles, selects, etc.)

### Chart-Specific Implementations

1. **Table Visualization**
   - Uses `TableInteractive` component instead of ECharts
   - Has specific handling for pagination, column visibility, and formatting
   - Unique settings for row index, pagination, and pivoting

2. **Pie Charts**
   - Uses a tree-based data structure for hierarchical slices
   - Special handling for small slices (aggregated into "Other")
   - Custom angle calculations and percentage displays

3. **Cartesian Charts (Line, Bar)**
   - Share a common `CartesianChart` component
   - Chart-specific options generated during model creation
   - Different settings for axes, stacking, and line styles

4. **Specialized Charts**
   - Funnel, Waterfall, and Sankey charts have specialized data transformations
   - Specific layout algorithms and rendering options

## ECharts Integration Example

```typescript
// From PieChart.tsx
const option = useMemo(
  () => ({
    ...getPieChartOption(
      chartModel,
      formatters,
      settings,
      renderingContext,
      sideLength,
      hoveredIndex,
      hoveredSliceKeyPath,
    ),
    tooltip: getTooltipOption(chartModel, formatters, containerRef),
  }),
  [
    chartModel,
    formatters,
    settings,
    renderingContext,
    sideLength,
    hoveredIndex,
    hoveredSliceKeyPath,
  ],
);
```