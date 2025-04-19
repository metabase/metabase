# Base Visualization Components

## Main `Visualization` Component Hierarchy

The Metabase visualization system is built around a core `Visualization` component that serves as a container and orchestrator for various chart types. The system follows a plugin-based architecture where specific visualizations are registered with a central registry.

### Core Components

1. **Visualization Component** (`/frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx`)
   - The main container component that handles:
     - Data transformation
     - Settings computation
     - Error handling
     - User interactions (clicks, hovers)
     - Rendering the appropriate visualization

2. **Visualization Registry** (`/frontend/src/metabase/visualizations/index.ts`)
   - Maintains a map of visualization types to their component implementations
   - Provides utility functions for working with visualizations
   - Handles visualization transformation and selection

3. **Individual Visualization Components**
   - Each chart type (PieChart, BarChart, etc.) is implemented as a React component
   - Components follow a standard interface defined in `VisualizationDefinition` and `VisualizationProps`
   - Registered centrally via `registerVisualizations()` in `app.js`

## Component Lifecycle and Rendering Patterns

The `Visualization` component uses several important lifecycle patterns:

### Data Flow and Transformation

1. **Data Preparation**:
   ```typescript
   const deriveStateFromProps = (props: VisualizationProps) => {
     const transformed = props.rawSeries
       ? getVisualizationTransformed(extractRemappings(props.rawSeries))
       : null;
     
     const series = transformed?.series ?? null;
     const computedSettings = !isLoading(series)
       ? getComputedSettingsForSeries(series)
       : {};
     
     return {
       series,
       computedSettings,
       visualization: transformed?.visualization,
     };
   };
   ```

2. **Derived State Management**:
   The component uses `getDerivedStateFromProps` to update state only when necessary, based on changes to specific props.

3. **Rendering Logic**:
   The render method handles multiple states including:
   - Loading
   - Error
   - Empty data
   - Normal rendering
   - Conditional header display

### Interactive Behavior

The component implements several interactive patterns:

1. **Click Handling**:
   ```typescript
   handleVisualizationClick = (clicked: ClickObject | null) => {
     // Custom handler or default action
     if (typeof handleVisualizationClick === "function") {
       handleVisualizationClick(clicked);
       return;
     }

     const didPerformDefaultAction = performDefaultAction(
       this.getClickActions(clicked),
       {
         dispatch: this.props.dispatch,
         onChangeCardAndRun: this.handleOnChangeCardAndRun,
       },
     );
     
     // Set state for popover if no default action was performed
     if (!didPerformDefaultAction) {
       setTimeout(() => {
         this.setState({ clicked });
       }, 100);
     }
   };
   ```

2. **Hover Management**:
   The component manages hover state with timeout-based cleanup.

3. **Error Boundary**:
   The component implements error handling via React's error boundary pattern.

## Shared/Reusable Visualization Components

The visualization system includes several reusable components:

### View Components

1. **LoadingView**: Displays a spinner while data is loading, with additional information for slow-loading queries
2. **ErrorView**: Shows error messages with an icon
3. **NoResultsView**: Displays a standardized "no results" message
4. **ChartSettingsErrorButton**: Provides a button to open chart settings when there's a configuration error

### Support Components

1. **ChartWithLegend**: Used by multiple visualizations to standardize legend display
2. **ResponsiveEChartsRenderer**: A wrapper for ECharts that handles responsiveness
3. **ChartTooltip**: Standardized tooltip implementation for visualizations
4. **ClickActionsPopover**: Handles displaying and managing drill-through actions

### Hooks and Utilities

Several custom hooks are used for common visualization patterns:

1. **useChartEvents**: Manages chart event handling for consistent behavior
2. **useBrowserRenderingContext**: Provides rendering context with theming
3. **useCloseTooltipOnScroll**: Standardizes tooltip behavior on scroll

## Visualization Definition System

Each visualization is defined using a standardized structure:

```typescript
// From PieChart's chart-definition.ts
export const PIE_CHART_DEFINITION: VisualizationDefinition = {
  uiName: t`Pie`,
  identifier: "pie",
  iconName: "pie",
  minSize: getMinSize("pie"),
  defaultSize: getDefaultSize("pie"),
  isSensible: ({ cols, rows }) => {
    // Logic to determine if this visualization makes sense for the data
  },
  checkRenderable: (
    [{ data: { rows } }],
    settings,
  ) => {
    // Validation logic
  },
  hasEmptyState: true,
  settings: {
    // Chart-specific settings definitions
  }
};
```

This definition is then attached to the component:

```typescript
// From PieChart.tsx
Object.assign(PieChart, PIE_CHART_DEFINITION);
```

## Rendering Flow

The complete rendering flow follows these steps:

1. App initialization calls `registerVisualizations()`
2. A parent component renders `<Visualization>` with data and settings
3. `Visualization` component:
   - Transforms the data using `getVisualizationTransformed`
   - Computes settings with `getComputedSettingsForSeries`
   - Determines which visualization component to render
   - Handles loading/error states
4. Specific visualization components (e.g., `PieChart`) render using:
   - ECharts (for most charts)
   - Custom React components
5. Interactive elements trigger callbacks for hovering, clicking, etc.