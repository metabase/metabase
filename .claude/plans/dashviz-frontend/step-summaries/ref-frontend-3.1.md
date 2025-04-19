# Dashboard Card Components and Visualization Integration

This document provides an in-depth analysis of how visualizations are integrated into dashboard cards in the Metabase frontend codebase.

## Table of Contents
1. [Component Architecture](#component-architecture)
2. [Key Component Hierarchy](#key-component-hierarchy)
3. [Data Flow](#data-flow)
4. [Configuration and Settings](#configuration-and-settings)
5. [Integration Patterns](#integration-patterns)
6. [Dashboard-Specific Behaviors](#dashboard-specific-behaviors)

## Component Architecture

The dashboard visualization system follows a layered component architecture with a clear separation of concerns:

### Dashboard Layer
- **DashCard**: The outermost container component that represents a card on a dashboard
- **DashCardVisualization**: A bridge component that connects dashboard cards to the visualization system
- **DashCardMenu**: Provides user actions specific to the dashboard context (download, fullscreen, etc.)
- **DashCardActionsPanel**: UI for card editing operations in dashboard edit mode

### Visualization Layer
- **Visualization**: The core visualization component that handles rendering and interactions
- **[Specific Chart]**: Individual visualization types (BarChart, LineChart, etc.)
- **CartesianChart**: A shared component for cartesian-based visualizations
- **EChartsRenderer**: Low-level renderer for creating charts using the ECharts library

### Parameter Mapping Layer
- **DashCardParameterMapper**: Handles connecting dashboard filters to card visualizations
- **DashCardCardParameterMapper**: Maps parameters to specific cards (including multi-series cards)

## Key Component Hierarchy

```
Dashboard
  └── DashCard
      ├── DashCardActionsPanel (edit mode)
      └── DashCardVisualization
          ├── DashCardMenu
          │   └── DashCardQuestionDownloadButton
          ├── Visualization (core visualization component)
          │   ├── ChartCaption (title and header)
          │   ├── [Specific Chart Implementation]
          │   │   └── CartesianChart/OtherChartType
          │   │       └── EChartsRenderer
          │   ├── ChartTooltip
          │   └── ClickActionsPopover
          └── Various Overlays (parameter mapping, click behavior)
```

## Data Flow

The flow of data from dashboard to visualization follows these stages:

1. **Dashboard to DashCard**:
   - Dashboard maintains state about cards, their positions, and parameters
   - Each DashCard receives its data via `getDashcardData` selector
   - Cards can be standalone questions or part of series (multi-series visualizations)

2. **DashCard to Visualization**:
   ```javascript
   // From DashCardVisualization.tsx
   return (
     <Visualization
       dashboard={dashboard}
       dashcard={dashcard}
       rawSeries={series}
       metadata={metadata}
       mode={getClickActionMode}
       getHref={getHref}
       gridSize={gridSize}
       totalNumGridCols={totalNumGridCols}
       // ... many more props
     />
   );
   ```

3. **Series Transformation**:
   - The visualization component transforms raw series data through `getVisualizationTransformed`
   - Transforms include calculation of computed settings, extending cards with visualization settings

4. **Settings Application**:
   - Settings from dashcard are applied to the visualization
   - Computed settings are derived based on the data and type of visualization

5. **Rendering**:
   - Specific chart implementation renders the visualization
   - Most charts use ECharts as the rendering engine
   - Some special visualizations handle their own rendering logic

## Configuration and Settings

Dashboard cards extend and override visualization settings through several mechanisms:

1. **Card Extension**:
   ```javascript
   // From DashCard.tsx
   const mainCard = useMemo(
     () =>
       extendCardWithDashcardSettings(
         dashcard.card,
         dashcard.visualization_settings,
       ),
     [dashcard],
   );
   ```

2. **Settings Hierarchy**:
   - Base visualization settings from the card definition
   - Dashboard-specific overrides from dashcard.visualization_settings
   - Computed settings generated at render time

3. **Settings Update Flow**:
   ```javascript
   // Handler in DashCardVisualization.tsx
   const handleOnUpdateVisualizationSettings = useCallback(
     (settings: VisualizationSettings) => {
       onUpdateVisualizationSettings(dashcard.id, settings);
     },
     [dashcard.id, onUpdateVisualizationSettings],
   );
   ```

## Integration Patterns

Several patterns enable the flexible integration of visualizations in dashboards:

### 1. Component Extension
Chart types extend base implementations. For example, BarChart simply extends CartesianChart:

```javascript
// From BarChart.tsx
export function BarChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

// Add metadata via object assignment
Object.assign(
  BarChart,
  getCartesianChartDefinition({
    uiName: t`Bar`,
    identifier: "bar",
    iconName: "bar",
    // ...more properties
  }),
);
```

### 2. Visualization Registry
Visualizations are registered in a central registry for dynamic loading:

```javascript
// From visualizations/index.ts
export function registerVisualization(visualization: Visualization) {
  const identifier = visualization.identifier;
  visualizations.set(identifier, visualization);
  
  // Support for aliases
  for (const alias of visualization.aliases || []) {
    aliases.set(alias, visualization);
  }
}

// Accessing visualizations
export function getVisualizationRaw(series) {
  const display = series[0]?.card?.display;
  return visualizations.get(display) || aliases.get(display);
}
```

### 3. Data Transformation
Series data is transformed before being rendered by visualizations:

```javascript
const transformed = props.rawSeries
  ? getVisualizationTransformed(extractRemappings(props.rawSeries))
  : null;

const series = transformed?.series ?? null;
```

### 4. Hooks-Based Event Handling
Dashboard-specific events are handled using custom hooks:

```javascript
// From CartesianChart.tsx
const { onSelectSeries, onOpenQuestion, eventHandlers } = useChartEvents(
  chartRef,
  chartModel,
  timelineEventsModel,
  option,
  props,
);
```

## Dashboard-Specific Behaviors

Dashboards introduce specific behaviors to visualizations:

### 1. Parameter Mapping
Dashboard filters can be mapped to card fields or question variables:

```javascript
// Part of parameter mapping system
const selectedMappingOption = getMappingOptionByTarget(
  mappingOptions,
  target,
  question,
  editingParameter ?? undefined,
);
```

### 2. Sizing and Grid Layout
Cards adapt to dashboard grid dimensions:

```javascript
// From DashCard.tsx
const gridSize = useMemo(
  () => ({ width: dashcard.size_x, height: dashcard.size_y }),
  [dashcard],
);
```

### 3. Multi-Series Support
Dashboards can combine multiple questions into a single multi-series chart:

```javascript
// From DashCard.tsx
const cards = useMemo(() => {
  if (isQuestionDashCard(dashcard) && Array.isArray(dashcard.series)) {
    return [mainCard, ...dashcard.series];
  }
  return [mainCard];
}, [mainCard, dashcard]);
```

### 4. Conditional Display Elements
Different UI elements appear based on dashboard context:

```javascript
// Determining appropriate action buttons
const shouldShowDashCardMenu = DashCardMenu.shouldRender({
  question,
  result: mainSeries,
  isXray,
  isPublicOrEmbedded,
  isEditing,
  downloadsEnabled,
});

// Display logic for different states
{replacementContent ? (
  replacementContent
) : isDashboard && noResults ? (
  <NoResultsView isSmall={small} />
) : error ? (
  <ErrorView error={errorMessageOverride ?? error} icon={errorIcon} isSmall={small} />
) : loading ? (
  <LoadingView expectedDuration={expectedDuration} isSlow={!!isSlow} />
) : (
  // Actual chart rendering
)}
```

## Conclusion

The integration of visualizations into dashboard cards follows a well-structured architecture with clear separation of concerns. This architecture enables:

1. **Flexibility**: Different visualization types can be rendered within the same dashboard framework
2. **Consistency**: Common behaviors like tooltips and click actions work consistently across visualizations
3. **Extensibility**: New visualization types can be added by implementing the visualization interface
4. **Integration**: Dashboard-specific features like filters can interact with visualizations

This architecture allows Metabase to offer a rich dashboard experience while maintaining modular visualization components that can be used in multiple contexts (questions, dashboards, embeds).