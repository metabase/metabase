# Metabase Visualizer Feature Reference

This document provides a technical overview of the Metabase Visualizer feature, a dashboard enhancement that allows users to create custom visualizations by combining data from multiple sources through a drag-and-drop interface.

## Overview

The Visualizer is a specialized dashboard card type that extends Metabase's dashboard capabilities by providing:

1. **Multi-source visualizations**: Combines data from multiple questions/cards into a single visualization
2. **Drag-and-drop mapping**: Maps columns to visualization dimensions through an intuitive interface
3. **Advanced customization**: Offers comprehensive settings for visualization appearance and behavior
4. **Rich interactivity**: Supports undo/redo, history tracking, and runtime data preview

## Architecture

### Core Types

```typescript
// The main visualizer definition stored in dashboard card settings
export type VisualizerVizDefinition = {
  display: VisualizationDisplay | null;  // Visualization type (bar, line, pie, etc.)
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;  // Maps dimensions to columns
  columns: DatasetColumn[];  // Virtual column definitions
  settings: VisualizationSettings;  // Visualization settings
};

// Data source reference - currently only card (question) sources
export type VisualizerDataSource = {
  id: string;  // Format: "card:123"
  sourceId: number;  // The actual card ID
  type: "card";  // Data source type
  name: string;  // Display name for the data source
};

// Maps a column from a data source to a visualization dimension
export type VisualizerColumnReference = {
  sourceId: string;  // Which data source this column comes from
  name: string;  // Name in the combined dataset
  originalName: string;  // Original name in the source dataset
};
```

### Integration with Dashboards

Visualizer dashcards extend the standard dashboard card model:

```typescript
export type VisualizerDashboardCard = QuestionDashboardCard & {
  visualization_settings: BaseDashboardCard["visualization_settings"] & {
    visualization: VisualizerVizDefinition;
  };
};
```

A key type guard identifies visualizer cards:

```typescript
export function isVisualizerDashboardCard(
  dashcard?: BaseDashboardCard,
): dashcard is VisualizerDashboardCard {
  if (!dashcard?.visualization_settings) {
    return false;
  }
  return dashcard.visualization_settings["visualization"] !== undefined;
}
```

In the backend, a similar detection function is used:

```clojure
(defn is-visualizer-dashcard?
  "true if dashcard has visualizer specific viz settings"
  [dashcard]
  (boolean
   (and (some? dashcard)
        (get-in dashcard [:visualization_settings :visualization]))))
```

### Key File Locations

#### Frontend

```
frontend/src/metabase/visualizer/
├── visualizer.slice.ts                   # Redux state management
├── components/
│   ├── Visualizer/
│   │   └── Visualizer.tsx                # Main container component
│   ├── VisualizationCanvas/
│   │   ├── VisualizationCanvas.tsx       # Visualization workspace
│   │   ├── VerticalWell/                 # Y-axis drop targets
│   │   └── HorizontalWell/               # X-axis drop targets
│   ├── DataImporter/
│   │   └── DataImporter.tsx              # Data source selection
│   └── VizSettingsSidebar/
│       └── VizSettingsSidebar.tsx        # Settings configuration
├── utils/
│   ├── merge-data.ts                     # Data merging between sources
│   ├── split-series.ts                   # Series splitting for charts
│   └── viz-settings.ts                   # Settings utilities
```

#### Backend

```
src/metabase/
├── api/
│   └── dashboard.clj                     # Dashboard API with visualizer support
├── channel/
│   ├── render/
│   │   ├── util.clj                      # Core visualizer utilities
│   │   ├── card.clj                      # Card rendering support
│   │   └── body.clj                      # Rendering implementation
```

## Data Flow

### Column Mapping and Data Merging

The visualizer maps columns from source data to visualization dimensions through a system of references:

1. **Column References**: Point to specific columns in source datasets
   ```typescript
   {
     sourceId: "card:123",
     originalName: "TOTAL",
     name: "COLUMN_1"
   }
   ```

2. **Name References**: Point to card names for special cases
   ```typescript
   "$_card:123_name"  // References the name of card 123
   ```

3. **Column Value Mappings**: Connect visualization dimensions to data sources
   ```typescript
   {
     "COLUMN_1": [{ sourceId: "card:123", originalName: "TOTAL", name: "COLUMN_1" }],
     "DIMENSION": ["$_card:123_name", "$_card:456_name"]
   }
   ```

4. **Data Merging**: The frontend `mergeVisualizerData()` function combines data from multiple sources based on column mappings:
   ```typescript
   export function mergeVisualizerData(
     dataSources: VisualizerDataSource[],
     datasets: Record<VisualizerDataSourceId, Dataset>,
     { columns, columnValuesMapping }: VisualizerVizDefinitionWithColumns,
   ): DatasetData {
     // Extract values for each referenced column
     // Combine values based on column mappings
     // Return unified dataset
   }
   ```

5. **Backend Merging**: The backend implements a similar function:
   ```clojure
   (defn merge-visualizer-data
     [series-data {:keys [columns columnValuesMapping] :as visualizer-settings}]
     ;; Extract values for each source mapping
     ;; Combine values based on mappings
     ;; Return row-major data matrix
   )
   ```

### Rendering Pipeline

The visualizer integrates with the core visualization system:

1. **Detection**: `isVisualizerDashboardCard()` identifies visualizer cards
2. **Data Preparation**: For visualizer cards:
   - Extract visualization definition from settings
   - Process data sources and datasets
   - Merge data from multiple sources using `mergeVisualizerData()`
3. **Rendering**: Use the core `Visualization` component with processed data
4. **Backend Rendering**: For emails and exports, the backend merges data and renders using type-specific methods

```clojure
(mu/defmethod render :funnel :- ::RenderedPartCard
  [_chart-type render-type timezone-id card dashcard data]
  (let [visualizer?    (render.util/is-visualizer-dashcard? dashcard)
        viz-settings   (if visualizer?
                         (get-in dashcard [:visualization_settings :visualization])
                         (get card :visualization_settings))
        processed-data (if (and visualizer? (= "funnel" funnel-type))
                         (render.util/merge-visualizer-data (series-cards-with-data dashcard card data) viz-settings)
                         data)]
    ;; Render with appropriate method
  ))
```

## Key Components

### 1. Visualizer Editor

The main editing interface consists of:

- **Canvas**: Central area showing the visualization preview
- **Data Sidebar**: Left panel for selecting data sources and columns
- **Settings Sidebar**: Right panel for configuring visualization settings
- **Dimensional Wells**: Drop zones around the visualization for mapping columns

```typescript
export function Visualizer({
  className,
  onSave,
  onClose,
  initialDataSources,
}: VisualizerProps) {
  // State management, event handlers, etc.
  
  return (
    <DndContext
      sensors={[canvasSensor]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={{...}}
    >
      <Stack className={className}>
        <Header onSave={handleSave} onClose={onClose} />
        <Grid {...gridProps}>
          <DataImporter />
          <VisualizationCanvas />
          <VizSettingsSidebar />
        </Grid>
        <Footer />
      </Stack>
      <DragOverlay dropAnimation={null}>
        {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
      </DragOverlay>
    </DndContext>
  );
}
```

### 2. Data Handling Components

#### DataImporter

Manages data source selection and column listing:

```typescript
export function DataImporter() {
  // State and handlers
  
  return (
    <Stack spacing="md">
      <Group>
        <Button onClick={toggleDataSourcesView}>
          {isDataSourcesOpen ? t`Columns` : t`Data`}
        </Button>
      </Group>

      {isDataSourcesOpen ? (
        <DatasetsList
          onAddDataSource={handleAddDataSource}
          dataSourceIds={dataSourceIds}
        />
      ) : (
        <ColumnsList />
      )}
    </Stack>
  );
}
```

#### VisualizationCanvas

Displays the visualization and provides drop targets:

```typescript
export function VisualizationCanvas() {
  // State and handlers
  
  return (
    <Grid columns={24} gap="xs">
      <GridCol span={isShowingVerticalWell ? 3 : 0} className={containerClass}>
        <VerticalWell />
      </GridCol>
      
      <GridCol span="auto" className={containerClass}>
        <Box {...dropTargetProps}>
          {display ? (
            <Visualization
              rawSeries={rawSeries}
              series={transformedSeries}
              isDashboard
              onVisualizationClick={handleVisualizationClick}
            />
          ) : (
            <EmptyState />
          )}
        </Box>
      </GridCol>
      
      <GridCol span={1} className={S.HorizontalWellContainer}>
        <HorizontalWell />
      </GridCol>
    </Grid>
  );
}
```

### 3. Visualization Type Support

The visualizer supports different visualization types through specialized handlers:

#### Cartesian Charts (Bar, Line, Area, Scatter)

```typescript
export const cartesianDropHandler = (
  state: VisualizerVizDefinitionWithColumns,
  { active, over }: DragEndEvent,
  { dataSourceMap, datasetMap }: { ... }
) => {
  // Handle dimensions (X-axis)
  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    addDimensionColumnToCartesianChart(state, column, columnRef, dataSource);
  }
  
  // Handle metrics (Y-axis)
  if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
  }
  
  // Handle scatter bubble size
  if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
    replaceMetricColumnAsScatterBubbleSize(state, column, columnRef, dataSource);
  }
};
```

#### Pie Charts

```typescript
export const pieDropHandler = (
  state: VisualizerVizDefinitionWithColumns,
  { active, over }: DragEndEvent,
) => {
  // Handle metric (slice size)
  if (over.id === DROPPABLE_ID.PIE_METRIC) {
    state.settings["pie.metric"] = columnRef.name;
    state.columnValuesMapping[metricColumnName] = [columnRef];
  }
  
  // Handle dimension (slice categories)
  if (over.id === DROPPABLE_ID.PIE_DIMENSION) {
    state.settings["pie.dimension"] = [...dimensions, newDimension.name];
    state.columnValuesMapping[newDimension.name] = [columnRef];
  }
};
```

#### Funnel Charts

```typescript
export const funnelDropHandler = (
  state: VisualizerVizDefinitionWithColumns,
  { active, over }: DragEndEvent,
) => {
  // Handle dimension drops (funnel steps categories)
  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    // Set or update the dimension column
  }
  
  // Handle metric drops (funnel values)
  if (over.id === DROPPABLE_ID.Y_AXIS_WELL && isNumeric(column)) {
    // Set or update the metric column
  }
  
  // Special handling for scalar funnels
  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isNumeric(column)) {
    addScalarToFunnel(state, dataSource, column);
  }
};
```

### 4. Settings Management

The visualizer reuses the core visualization settings system:

```typescript
export function VizSettingsSidebar() {
  const series = useSelector(getVisualizerRawSeries);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const handleChangeSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  const widgets = useMemo(() => {
    // Generate settings widgets based on visualization type
    return getSettingsWidgetsForSeries(
      transformedSeries,
      handleChangeSettings,
      true,
    );
  }, [transformedSeries, handleChangeSettings]);

  return (
    <BaseChartSettings
      series={series}
      transformedSeries={transformedSeries}
      chartSettings={settings}
      widgets={widgets}
      onChange={handleChangeSettings}
    />
  );
}
```

## Interactive Features

### 1. Drag-and-Drop System

The visualizer uses `@dnd-kit/core` for drag-and-drop operations:

```typescript
<DndContext
  sensors={[canvasSensor]}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
  measuring={{
    draggable: {
      measure: isVerticalDraggedItem(draggedItem)
        ? MEASURE_VERTICAL_ITEM
        : MEASURE_HORIZONTAL_ITEM,
    },
  }}
>
  {/* Component structure */}
  <DragOverlay dropAnimation={null}>
    {draggedItem && <VisualizerDragOverlay item={draggedItem} />}
  </DragOverlay>
</DndContext>
```

### 2. Undo/Redo History

Built on `redux-undo` for history tracking:

```typescript
export const reducer = undoable(visualizerSlice.reducer, {
  filter: includeAction([
    initializeVisualizer.fulfilled.type,
    addColumn.type,
    setTitle.type,
    updateSettings.type,
    removeColumn.type,
    setDisplay.type,
    handleDrop.type,
    removeDataSource.type,
    addDataSource.fulfilled.type,
  ]),
  undoType: undo.type,
  redoType: redo.type,
  clearHistoryType: CLEAR_HISTORY,
  ignoreInitialState: true,
});
```

### 3. Click Handling

Special handling for click interactions:

```typescript
export function formatVisualizerClickObject(
  clicked: ClickObject,
  originalSeries: RawSeries,
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
): ClickObject {
  // Map back to original sources for correct drill-through
  const object = { ...clicked };

  if (object.column) {
    object.cardId = findColumnCardId(object.column, columnValuesMapping);
    object.column = findRealColumn(
      object.column,
      originalSeries,
      columnValuesMapping,
    );
  }

  // Transform data and dimensions...
  return object;
}
```

## Backend Implementation

### Storage and Persistence

The visualizer uses the existing dashboard card model with the settings structure:

```clojure
{:visualization_settings
  {:visualization
    {:display "funnel",
     :columns [{:name "COLUMN_2", :base_type "type/BigInteger", ...}
               {:name "DIMENSION", :base_type "type/Text", ...}],
     :columnValuesMapping
       {:COLUMN_2 [{:sourceId "card:191", :originalName "count", :name "COLUMN_2"}
                   {:sourceId "card:192", :originalName "count", :name "COLUMN_3"}],
        :DIMENSION ["$_card:191_name" "$_card:192_name"]},
     :settings
       {:funnel.metric "COLUMN_2",
        :funnel.dimension "DIMENSION",
        :funnel.order_dimension "DIMENSION",
        ...}}}}
```

### Dashboard API Enhancements

The dashboard API handles column value mapping during dashboard duplication:

```clojure
(defn- update-colvalmap-setting
  "Visualizer dashcards have unique visualization settings which embed column id remapping metadata
  This function iterates through the `:columnValueMapping` viz setting and updates referenced card ids"
  [col->val-source id->new-card]
  (let [update-cvm-item (fn [item]
                          (if-let [source-id (:sourceId item)]
                            (if-let [[_ card-id] (and (string? source-id)
                                                      (re-find #"^card:(\d+)$" source-id))]
                              (if-let [new-card (get id->new-card (Long/parseLong card-id))]
                                (assoc item :sourceId (str "card:" (:id new-card)))
                                item)
                              item)
                            item))
        update-cvm      (fn [cvm]
                          (when (map? cvm)
                            (update-vals cvm #(mapv update-cvm-item %))))]
    (update-cvm col->val-source)))
```

### Email and Subscription Support

Special handling for visualizer dashcards in emails:

```clojure
(defn- visualizer-dashcard-href
  "Build deep linking href for visualizer dashcards"
  [dashcard]
  (h (str (urls/dashboard-url (:dashboard_id dashcard)) "#scrollTo=" (:id dashcard))))

;; Matching on both card ID and dashboard card ID for visualizer cards
(defn- assoc-attachment-booleans [part-configs parts]
  (for [{{result-card-id :id} :card :as result} parts
        :let [result-dashboard-card-id (:id (:dashcard result))
              noti-dashcard (m/find-first (fn [config]
                                            (and (= (:card_id config) result-card-id)
                                                 (= (:dashboard_card_id config) result-dashboard-card-id)))
                                          part-configs)]]
    ;; Match and merge settings
  ))
```

## State Management

### Redux Store Structure

```typescript
export interface VisualizerState extends VisualizerVizDefinitionWithColumns {
  initialState: VisualizerVizDefinitionWithColumns;
  cards: Card[];
  datasets: Record<VisualizerDataSourceId, Dataset>;
  loadingDataSources: Record<VisualizerDataSourceId, boolean>;
  loadingDatasets: Record<VisualizerDataSourceId, boolean>;
  error: string | null;
  draggedItem: DraggedItem | null;
}
```

### Key Actions

```typescript
export const visualizerSlice = createSlice({
  name: "visualizer",
  initialState,
  reducers: {
    // Core actions
    setDisplay: (state, action: PayloadAction<VisualizationDisplay | null>) => {...},
    addColumn: (state, action: PayloadAction<{...}>) => {...},
    removeColumn: (state, action: PayloadAction<string>) => {...},
    updateSettings: (state, action: PayloadAction<VisualizationSettings>) => {...},
    handleDrop: (state, action: PayloadAction<DragEndEvent>) => {...},
    
    // Data source management
    removeDataSource: (state, action: PayloadAction<VisualizerDataSourceId>) => {...},
    
    // Drag state
    setDraggedItem: (state, action: PayloadAction<DraggedItem | null>) => {...},
  },
  extraReducers: (builder) => {
    // Async actions
    builder
      .addCase(initializeVisualizer.fulfilled, (state, action) => {...})
      .addCase(addDataSource.pending, (state, action) => {...})
      .addCase(addDataSource.fulfilled, (state, action) => {...})
      .addCase(addDataSource.rejected, (state, action) => {...});
  },
});
```

## Key Algorithms

### 1. Data Merging

```javascript
// Create map from virtual column name to a vector of values
remapped-col-name->vals = (reduce
  (fn [acc {:keys [name originalName] :as source-mapping}]
    (let [ref-card-id      (value-source->card-id source-mapping)
          card-with-data   (u/find-first-map series-data [:card :id] ref-card-id)
          card-cols        (get-in card-with-data [:data :cols])
          card-rows        (get-in card-with-data [:data :rows])
          col-idx-in-card  (first (u/find-first-map-indexed card-cols [:name] originalName))]
      (if col-idx-in-card
        (let [values (mapv #(nth % col-idx-in-card) card-rows)]
          (assoc acc name values))
        acc)))
  {}
  source-mappings-with-vals)

// Create column-major matrix for all virtual columns
unzipped-rows = (mapv
  (fn [column]
    (let [source-mappings (get columnValuesMapping (keyword (:name column)))]
      (->> source-mappings
           (mapcat
            (fn [source-mapping]
              ;; Source is a name ref so just return the name of the card with matching :id
              (if-let [card-id (name-source->card-id source-mapping)]
                (let [card (:card (u/find-first-map series-data [:card :id] card-id))]
                  (some-> (:name card) vector))
                ;; Source is actual column data
                (get remapped-col-name->vals (:name source-mapping)))))
           vec)))
  columns)

// Return in row-major format
rows = (apply mapv vector unzipped-rows)
```

### 2. Series Splitting

```javascript
// Determine when to split series
export function shouldSplitVisualizerSeries(
  columnValuesMapping: ColumnValuesMapping,
  settings: VisualizationSettings,
): boolean {
  const dimensionColumnSources = getColumnSources(columnValuesMapping, getDimensionColumnName(settings));
  const hasMultipleSourcesForDimensions = new Set(
    dimensionColumnSources
      .filter(source => !isDataSourceNameRef(source))
      .map(source => source.sourceId)
  ).size > 1;
  
  return hasMultipleSourcesForDimensions;
}

// Split into multiple series based on data sources
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

### 3. Visualization Type Transitions

```javascript
export function getUpdatedSettingsForDisplay(
  columnValuesMapping: ColumnValuesMapping,
  columns: DatasetColumn[],
  settings: VisualizationSettings,
  sourceDisplay: VisualizationDisplay | null,
  targetDisplay: VisualizationDisplay | null,
): {
  columnValuesMapping: ColumnValuesMapping;
  columns: DatasetColumn[];
  settings: VisualizationSettings;
} | undefined {
  if (!sourceDisplay || !targetDisplay || sourceDisplay === targetDisplay) {
    return undefined;
  }

  // Handle transitions between visualization types
  const sourceIsCartesian = isCartesianChart(sourceDisplay);
  const targetIsCartesian = isCartesianChart(targetDisplay);

  if (sourceIsCartesian) {
    if (targetIsCartesian) {
      return cartesianToCartesian(...);
    }
    if (targetDisplay === "pie") {
      return cartesianToPie(...);
    }
  }
  
  // Other type conversions...
}
```

## Integration Patterns

### Frontend-Backend Integration

1. **Storage**: Frontend sends visualizer settings to backend for storage
2. **Retrieval**: Backend sends complete settings to frontend when loading
3. **Processing**: Backend handles data merging for emails and exports
4. **Duplication**: Backend updates card references during dashboard copy

### Pattern Recognition

Both frontend and backend use type guards to detect visualizer cards:

```typescript
// Frontend
export function isVisualizerDashboardCard(dashcard?: BaseDashboardCard) {
  if (!dashcard?.visualization_settings) {
    return false;
  }
  return dashcard.visualization_settings["visualization"] !== undefined;
}

// Backend
(defn is-visualizer-dashcard? [dashcard]
  (boolean
   (and (some? dashcard)
        (get-in dashcard [:visualization_settings :visualization]))))
```

### Type-Based Dispatch

Both systems use dispatch based on visualization type:

```typescript
// Frontend
if (isCartesianChart(state.display)) {
  cartesianDropHandler(state, event, {...});
} else if (state.display === "funnel") {
  funnelDropHandler(state, event);
} else if (state.display === "pie") {
  pieDropHandler(state, event);
}

// Backend
(mu/defmethod render :funnel [_chart-type render-type timezone-id card dashcard data]
  (let [visualizer? (render.util/is-visualizer-dashcard? dashcard)
        // Type-specific handling
      ]))
```

## Key Implementation Features

1. **Extension Over Creation**: Extends existing dashboard cards rather than creating new models
2. **Multi-Source Data**: Support for combining data from multiple sources
3. **Intuitive Mapping**: Drag-and-drop interface for column-to-visualization mapping
4. **History Tracking**: Complete undo/redo functionality with keyboard shortcuts
5. **Type-Specific Adapters**: Special handling for different visualization types
6. **Comprehensive Settings**: Reuse of core visualization settings system
7. **Email/Export Support**: Backend rendering for subscriptions and exports

## Conclusion

The Visualizer feature represents a significant enhancement to Metabase's dashboard capabilities, allowing users to create custom visualizations that combine data from multiple sources without the need for complex SQL or separate questions. The implementation balances power and usability, providing a rich feature set while maintaining an intuitive user interface.