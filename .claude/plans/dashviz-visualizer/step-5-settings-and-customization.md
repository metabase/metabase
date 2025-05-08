# Settings and Customization

## Component Index

```
frontend/src/metabase/visualizer/
├── components/
│   └── VizSettingsSidebar/
│       └── VizSettingsSidebar.tsx         # Settings UI panel
├── utils/
│   ├── viz-settings.ts                    # Settings utilities 
│   └── get-updated-settings-for-display.ts # Settings transformations between visualizations
├── selectors.ts                           # Redux selectors for settings
├── visualizer.slice.ts                    # Redux actions for settings management

frontend/src/metabase/visualizations/
├── components/
│   └── ChartSettings/
│       └── BaseChartSettings/             # Core settings component
│           └── BaseChartSettings.tsx      # Base settings implementation
└── lib/
    └── settings/
        └── visualization.ts               # Common settings generation logic
```

## Feature Summary

The visualizer feature provides a robust settings and customization system that:

1. **Reuses Core Settings Framework**: Leverages Metabase's existing visualization settings system
2. **Provides Type-Specific Settings**: Shows different settings based on the selected visualization type
3. **Handles Visualization Transitions**: Preserves relevant settings when switching between visualization types
4. **Integrates with Redux**: Manages settings state through Redux with undo/redo support
5. **Handles Multiple Datasets**: Adapts settings when working with multiple data sources

This system allows users to customize visualization appearance, behavior, and formatting while maintaining a consistent interface with the rest of Metabase.

## Settings Integration Architecture

### Core Settings Component

The `VizSettingsSidebar` component serves as the main interface for visualization settings:

```typescript
export function VizSettingsSidebar({ className }: { className?: string }) {
  const series = useSelector(getVisualizerRawSeries);
  const transformedSeries = useSelector(getVisualizerTransformedSeries);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const handleChangeSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  const widgets = useMemo(() => {
    if (transformedSeries.length === 0) {
      return [];
    }

    try {
      setError(null);
      const widgets = getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        true,
      );
      return widgets.filter(
        (widget) => !HIDDEN_SETTING_WIDGETS.includes(widget.id),
      );
    } catch (error) {
      setError(error as Error);
      return [];
    }
  }, [transformedSeries, handleChangeSettings]);

  return (
    <BaseChartSettings
      series={series}
      transformedSeries={transformedSeries}
      chartSettings={settings}
      widgets={widgets}
      onChange={handleChangeSettings}
      className={className}
    />
  );
}
```

Key aspects of this implementation:
1. Reuses `BaseChartSettings` from the core visualization system
2. Filters out certain settings not applicable to visualizer (`HIDDEN_SETTING_WIDGETS`)
3. Uses Redux selectors to access series and settings data
4. Dispatches `updateSettings` action on changes

### Settings Data Flow

The settings flow through several stages:

1. **Raw Settings**: Stored in Redux state (`settings` property)
2. **Computed Settings**: Derived from raw settings with merged defaults and computations
3. **Settings Widgets**: Generated based on visualization type and available data
4. **UI Rendering**: Settings organized into sections with appropriate controls

This flow ensures that:
- Default values are provided when not explicitly set
- Settings reflect the current state of the visualization
- Only relevant settings are shown to the user

## Settings State Management

### Redux Integration

Settings are stored and managed in the Redux state through several actions:

```typescript
// From visualizer.slice.ts
export const {
  updateSettings,
  setDisplay,
  // Other actions...
} = visualizerSlice.actions;

// Settings update reducer
updateSettings: (state, action: PayloadAction<VisualizationSettings>) => {
  state.settings = {
    ...state.settings,
    ...action.payload,
  };
},
```

This approach:
- Provides atomic updates to individual settings
- Maintains a single source of truth for all settings
- Enables undo/redo through history tracking

### Undo/Redo Support

The settings are wrapped in Redux-undo for history tracking:

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

This provides:
- Complete history of settings changes
- Ability to undo/redo individual settings updates
- Tracking of related actions that affect settings

### Computed Settings

The system differentiates between raw settings (stored directly) and computed settings (derived at runtime):

```typescript
export const getVisualizerComputedSettings = createSelector(
  [getVisualizerTransformedSeries],
  (series): ComputedVisualizationSettings =>
    series.length > 0 ? getComputedSettingsForSeries(series) : {},
);
```

This separation ensures:
- Default values are always available
- Dependent settings are recalculated as needed
- Settings reflect the current state of the data and visualization

## Visualization Type Transitions

When users switch between visualization types, settings need to be transformed to maintain visual consistency. This is handled by `getUpdatedSettingsForDisplay`:

```typescript
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

The implementation handles several specific conversions:
1. **Cartesian → Cartesian**: Preserves dimensions and metrics, adjusting for limits
2. **Cartesian → Pie**: Maps dimensions to pie slices and metrics to values
3. **Pie → Cartesian**: Maps slices to X-axis and values to Y-axis
4. **Funnel → Other Types**: Handles special case of scalar funnels

This ensures that:
- Data mappings are preserved when possible
- Settings are properly translated between types
- Edge cases like scalar funnels are handled appropriately

## Settings Types and Categories

### Visualization-Specific Settings

Each visualization type has specific settings defined by the core Metabase visualization system:

1. **Cartesian Charts**:
   - `graph.dimensions`: X-axis columns
   - `graph.metrics`: Y-axis columns
   - `graph.x_axis.*`: X-axis appearance settings
   - `graph.y_axis.*`: Y-axis appearance settings
   - `graph.colors`: Series colors
   - Chart-specific settings (e.g., `line.interpolate`, `stackable.stack_type`)

2. **Pie Charts**:
   - `pie.dimension`: Columns for slices
   - `pie.metric`: Column for values
   - `pie.show_legend`: Legend visibility
   - `pie.slice_threshold`: Small slices handling

3. **Funnel Charts**:
   - `funnel.dimension`: Column for steps
   - `funnel.metric`: Column for values
   - `funnel.rows`: Order of funnel steps

### Common Settings

Some settings are common to all visualization types:
- `card.title`: Visualization title
- Color settings
- Formatting options
- Display options (labels, legends, etc.)

### Settings Discovery

The system discovers available settings dynamically:

```typescript
export function getColumnVizSettings(cardDisplay: VisualizationDisplay) {
  const display = isVisualizerSupportedVisualization(cardDisplay)
    ? cardDisplay
    : DEFAULT_VISUALIZER_DISPLAY;
  const visualization = getVisualization(display);
  const settings = visualization?.settings ?? {};

  // Extract data-related settings
  return Object.keys(settings).filter((key) => {
    return isDataSetting(settings[key] ?? {});
  });
}
```

This enables:
- Dynamic discovery of settings based on visualization type
- Filtering to show only relevant settings
- Adaptation as new visualization types are added

## Settings UI Implementation

### Widget Generation

The UI widgets for settings are generated dynamically based on the visualization type:

```typescript
const widgets = useMemo(() => {
  if (transformedSeries.length === 0) {
    return [];
  }

  try {
    setError(null);
    const widgets = getSettingsWidgetsForSeries(
      transformedSeries,
      handleChangeSettings,
      true,
    );
    return widgets.filter(
      (widget) => !HIDDEN_SETTING_WIDGETS.includes(widget.id),
    );
  } catch (error) {
    setError(error as Error);
    return [];
  }
}, [transformedSeries, handleChangeSettings]);
```

This provides:
- Type-appropriate settings widgets
- Error handling for invalid settings
- Filtering of settings not applicable to visualizer

### BaseChartSettings

The core settings UI is provided by `BaseChartSettings`:

```typescript
<BaseChartSettings
  series={series}
  transformedSeries={transformedSeries}
  chartSettings={settings}
  widgets={widgets}
  onChange={handleChangeSettings}
  className={className}
/>
```

Which implements:
- Section-based organization (Data, Display, Axes, etc.)
- Widget rendering for different setting types
- Popover UI for complex settings
- Error handling and validation

### Settings Sections

Settings are organized into logical sections:

```typescript
const {
  chartSettingCurrentSection,
  currentSectionHasColumnSettings,
  sectionNames,
  setCurrentSection,
  showSectionPicker,
  visibleWidgets,
} = useChartSettingsSections({
  initial,
  widgets,
});
```

Common sections include:
- **Data**: Column mappings and data formatting
- **Display**: Chart-specific display options
- **Axes**: Axis configuration for cartesian charts
- **Labels**: Text display options
- **Legend**: Legend configuration
- **Colors**: Color scheme settings

## Multi-Series Settings

The visualizer has special handling for multi-series scenarios:

```typescript
export const getIsMultiseriesCartesianChart = createSelector(
  [
    getVisualizationType,
    getVisualizerColumnValuesMapping,
    getVisualizerRawSettings,
  ],
  (display, columnValuesMapping, settings) =>
    display &&
    isCartesianChart(display) &&
    shouldSplitVisualizerSeries(columnValuesMapping, settings),
);
```

Which affects:
- Per-series color settings
- Series-specific formatting options
- Legend display and ordering
- Special handling for merged datasets

## Settings Validation and Error Handling

The system implements validation and error checking:

```typescript
export const getIsRenderable = createSelector(
  [getVisualizationType, getVisualizerRawSeries, getVisualizerComputedSettings],
  (display, rawSeries, settings) => {
    if (!display) {
      return false;
    }

    const visualization = getVisualization(display);

    if (!visualization) {
      return false;
    }

    try {
      visualization.checkRenderable(rawSeries, settings);
      return true;
    } catch (e) {
      return false;
    }
  },
);
```

This ensures:
- Invalid settings combinations are detected
- Error states are properly handled
- Users receive feedback on settings issues

## Implementation Patterns

### Settings Selectors

The system uses Redux selectors extensively to derive settings state:

```typescript
export const getVisualizerRawSettings = (state: State) =>
  getCurrentHistoryItem(state).settings;

export const getVisualizerComputedSettings = createSelector(
  [getVisualizerTransformedSeries],
  (series): ComputedVisualizationSettings =>
    series.length > 0 ? getComputedSettingsForSeries(series) : {},
);
```

This pattern:
- Provides memoized computation of derived settings
- Separates raw and computed settings clearly
- Ensures settings are consistent with visualization state

### Settings Updates

Settings updates follow a consistent pattern:

```typescript
const handleChangeSettings = useCallback(
  (settings: VisualizationSettings) => {
    dispatch(updateSettings(settings));
  },
  [dispatch],
);
```

This ensures:
- All settings changes go through Redux
- Changes are tracked in history
- Updates trigger appropriate re-rendering

### Types of Settings

The system supports various types of settings:

1. **Simple Values**: Direct key-value pairs (e.g., `"pie.show_legend": true`)
2. **Arrays**: Lists of values (e.g., `"graph.dimensions": ["PRODUCT_ID", "CREATED_AT"]`)
3. **Objects**: Nested settings (e.g., `"series_settings": { "series_id": { ... } }`)
4. **Column References**: Links to data columns (e.g., `"pie.metric": "TOTAL"`)

Each type has appropriate UI widgets and serialization handling.

## Summary of Settings and Customization

The visualizer's settings and customization system provides a powerful yet user-friendly interface for tailoring visualizations. Key strengths include:

1. **Integration with Core System**: Leverages Metabase's existing settings framework
2. **Type-Specific Customization**: Provides relevant settings for each visualization type
3. **Smooth Transitions**: Maintains settings coherence when switching visualization types
4. **Multi-Source Support**: Handles settings for visualizations with multiple data sources
5. **History Tracking**: Provides undo/redo capabilities for all settings changes
6. **Validation and Error Handling**: Ensures settings remain valid and provides feedback

This implementation strikes a balance between power and simplicity, offering rich customization options while maintaining a consistent, intuitive interface.