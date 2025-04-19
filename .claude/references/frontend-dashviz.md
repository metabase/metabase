# Metabase DashViz Frontend Architecture Reference

This document provides a consolidated reference for the Metabase visualization and dashboard frontend architecture, extracted from extensive analysis of the codebase. It serves as a quick reference guide for understanding key components, patterns, file locations, and implementation details.

## DashViz Team Scope

The DashViz team is responsible for Metabase's visualization engine, which includes:

1. **Visualization types**: Tables, bar/line/area charts, combo charts, scatter plots, pie/donut charts, funnels, histograms, gauges, progress bars, sankey charts, maps, and specialized displays.

2. **Visualization settings** across multiple levels:
   - Chart-specific settings (axes, legends, colors, data display options)
   - Global settings affecting all visualizations
   - Field-level formatting and display settings
   - Model, question, dashboard card, and series-specific settings

3. **Dashboard visualization framework**:
   - Rendering visualizations in dashboards
   - Managing card layouts, sizing, and arrangement
   - Dashboard interactivity including cross-filtering

4. **Visualization delivery systems**:
   - Email/Slack dashboard subscriptions
   - Alerts based on visualization data
   - PDF/image exports

5. **Interactive features**:
   - Click behaviors and drill-through capabilities
   - Custom tooltips and data exploration
   - Cross-filtering between dashboard elements

## Frontend Technology Stack

- **Framework**: React 18
- **State Management**: Redux and Redux Toolkit
- **Routing**: React Router 3 (older version)
- **UI Components**: Mantine UI library
- **Styling**: Mix of CSS modules, Emotion (CSS-in-JS), and Mantine styling
- **Visualization Libraries**: ECharts and D3
- **Build System**: Rspack (Webpack alternative)
- **Languages**: JavaScript and TypeScript (gradual migration)
- **Testing**: Jest for unit tests, Cypress for E2E tests

## Code Organization

- **Feature-based Structure**: Code is organized by features (dashboards, visualizations, etc.)
  
- **DashViz-related Code**:
  - `/frontend/src/metabase/visualizations/`: Core visualization components
  - `/frontend/src/metabase/dashboards/`: Dashboard-related code
  - `/frontend/src/metabase/components/`: Shared UI components
  - `/frontend/src/metabase/parameters/`: Dashboard filters and parameters
  - `/frontend/src/metabase/public/`: Public sharing and embedding
  - `/frontend/src/metabase/subscriptions/`: Email and Slack subscriptions
  - `/frontend/src/metabase/browse/`: Browsing UI for different data views

- **Component Pattern**:
  - Components typically have their own directory
  - TypeScript interfaces in separate files
  - Tests co-located with components
  - Index files for clean exports

## Table of Contents

1. [Core Visualization Architecture](#core-visualization-architecture)
2. [Visualization Types Implementation](#visualization-types-implementation)
3. [Settings System](#settings-system)
4. [Dashboard Integration](#dashboard-integration)
5. [Parameters and Filters](#parameters-and-filters)
6. [Data Fetching and State Management](#data-fetching-and-state-management)
7. [Interactivity](#interactivity)
8. [Theming and Styling](#theming-and-styling)
9. [Performance Optimization](#performance-optimization)
10. [Export and Sharing](#export-and-sharing)
11. [Testing Approaches](#testing-approaches)

## Core Visualization Architecture

### Visualization Registry

The visualization system uses a registry pattern to dynamically load and render different visualization types.

**Key Files:**
- `/frontend/src/metabase/visualizations/index.ts` - Core registry definitions
- `/frontend/src/metabase/visualizations/register.js` - Registration of all visualizations
- `/frontend/src/metabase/visualizations/types/visualization.ts` - Type definitions

**Registry Implementation:**
```typescript
// In index.ts
const visualizations = new Map<VisualizationDisplay, Visualization>();
const aliases = new Map<string, Visualization>();

export function registerVisualization(visualization: Visualization) {
  const identifier = visualization.identifier;
  visualizations.set(identifier, visualization);
  for (const alias of visualization.aliases || []) {
    aliases.set(alias, visualization);
  }
}
```

### Visualization Definition Interface

Every visualization implements this interface to define its capabilities and behavior:

```typescript
export type VisualizationDefinition = {
  uiName: string;
  identifier: VisualizationDisplay;
  iconName: IconName;
  aliases?: string[];
  
  // Feature flags
  maxMetricsSupported?: number;
  disableClickBehavior?: boolean;
  canSavePng?: boolean;
  noHeader?: boolean;
  supportsSeries?: boolean;
  
  minSize: VisualizationGridSize;
  defaultSize: VisualizationGridSize;
  
  settings: VisualizationSettingsDefinitions;
  
  // Core methods
  transformSeries?: (series: Series) => TransformedSeries;
  isSensible: (data: DatasetData) => boolean;
  checkRenderable: (series: Series, settings: VisualizationSettings) => void;
};
```

### Core Component Hierarchy

```
Visualization                         // Main container component
├── [LoadingView | ErrorView]         // Loading/Error states
└── [Specific Visualization Type]     // e.g., PieChart, BarChart
    ├── ChartWithLegend               // For charts with legends
    │   ├── Legend                    // Legend rendering
    │   └── Chart                     // Chart-specific rendering
    ├── EChartsRenderer               // For ECharts-based visualizations
    └── Tooltips, Click Actions, etc. // Interactive elements
```

**Key Files:**
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx` - Main wrapper
- `/frontend/src/metabase/visualizations/components/LoadingView.tsx` - Loading state
- `/frontend/src/metabase/visualizations/components/ErrorView.tsx` - Error state

### Data Flow

1. Raw series data flows in from parent components
2. Series data is transformed via `getVisualizationTransformed`
3. Computed settings are derived from series data and stored settings
4. Appropriate visualization is selected based on display type
5. Data is passed to the specific visualization component
6. Rendering occurs with appropriate settings applied

## Visualization Types Implementation

### Component + Definition Pattern

Metabase visualizations follow a consistent pattern:

```typescript
// Implement React component
function BarChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

// Add visualization definition
Object.assign(BarChart, BAR_CHART_DEFINITION);

// Register the visualization
registerVisualization(BarChart);
```

### ECharts Integration

Many visualizations use ECharts for rendering:

**Key Files:**
- `/frontend/src/metabase/visualizations/shared/components/RowChart/RowChart.tsx`
- `/frontend/src/metabase/visualizations/visualizations/CartesianChart/CartesianChart.tsx`

**Pattern:**
```typescript
const option = useMemo(() => {
  return getPieChartOption(
    chartModel,
    formatters,
    settings,
    renderingContext,
    // other parameters
  );
}, [dependencies]);

return (
  <ResponsiveEChartsRenderer
    option={option}
    width={width}
    height={height}
    onHover={handleHover}
    onClick={handleClick}
  />
);
```

### Common Visualization Types

| Type | Files | Base Component |
|------|-------|----------------|
| Bar Chart | `/frontend/src/metabase/visualizations/visualizations/BarChart.tsx` | CartesianChart |
| Line Chart | `/frontend/src/metabase/visualizations/visualizations/LineChart/LineChart.tsx` | CartesianChart |
| Pie Chart | `/frontend/src/metabase/visualizations/visualizations/PieChart/PieChart.tsx` | Direct ECharts |
| Table | `/frontend/src/metabase/visualizations/components/TableInteractive/TableInteractive.tsx` | Custom Table |
| Scalar | `/frontend/src/metabase/visualizations/visualizations/SmartScalar/SmartScalar.tsx` | Custom Component |
| Map | `/frontend/src/metabase/visualizations/visualizations/Map/Map.jsx` | Custom Component |

### Chart Model Pattern

Most chart visualizations follow a model → option → render pattern:

1. **Model Generation**: Transform data into a chart model
   ```typescript
   // e.g., in use-models-and-option.ts
   const model = getCartesianChartModel(series, settings);
   ```
   
2. **Option Generation**: Create ECharts options from the model
   ```typescript
   // e.g., in CartesianChart.tsx
   const option = getCartesianChartOption(model, theme);
   ```
   
3. **Rendering**: Use ECharts renderer with the option
   ```typescript
   // e.g., in visualization component
   <EChartsRenderer option={option} />
   ```

## Settings System

### Settings Definition Architecture

Settings are defined in a hierarchical structure with strong typing:

**Key Files:**
- `/frontend/src/metabase/visualizations/lib/settings/` - Settings definition files
- `/frontend/src/metabase/visualizations/lib/settings/visualization.ts` - Core settings utilities

**Settings Object Example:**
```typescript
{
  "graph.dimensions": {
    section: t`Data`,
    title: t`X-axis`,
    widget: "field",
    getDefault: ([{ card, data }]) => {
      const dimension = getDimensionForColumn(0, card, data);
      return dimension ? dimension.column : null;
    },
    // ... other properties
  },
  
  "graph.y_axis.scale": {
    section: t`Axes`,
    title: t`Y-axis scale`,
    widget: "select",
    props: {
      options: [
        { name: t`Linear`, value: "linear" },
        { name: t`Power`, value: "pow" },
        { name: t`Log`, value: "log" },
      ]
    },
    default: "linear",
  }
}
```

### Settings Computation

Settings are computed using a multi-step process:

1. **Retrieve stored settings** from the card's `visualization_settings`
2. **Calculate default values** for missing settings
3. **Resolve dependencies** between settings
4. **Apply computed values** for derived settings

**Key Function:**
```typescript
// In settings.js
export function getComputedSettings(
  settingsDefs,
  object,
  storedSettings,
  extra = {},
) {
  const computedSettings = {};
  for (const settingId in settingsDefs) {
    getComputedSetting(
      computedSettings,
      settingsDefs,
      settingId,
      object,
      storedSettings,
      extra,
    );
  }
  return computedSettings;
}
```

### Settings UI Components

Settings UI components are defined in:
- `/frontend/src/metabase/visualizations/components/settings/` - UI components for different setting types

**Widgets Registry:**
```typescript
// Map of widget types to React components
export const WIDGETS = {
  input: Input,
  number: InputNumeric,
  radio: Radio,
  select: Select,
  toggle: Toggle,
  color: ColorPicker,
  // ... more widget types
};
```

### Column-Specific Settings

Column settings are stored using a special pattern:

```typescript
// In visualization_settings
"column_settings": {
  '["name","fieldname"]': {
    "number_style": "currency",
    "currency_style": "symbol",
    "currency": "USD",
  }
}
```

## Dashboard Integration

### Dashboard Card Component Hierarchy

```
Dashboard
├── DashboardGrid
│   └── DashCard
│       ├── DashCardVisualization
│       │   └── Visualization (from viz system)
│       ├── DashCardMenu
│       └── DashCardActionsPanel (in edit mode)
└── DashboardHeader, Parameters, etc.
```

**Key Files:**
- `/frontend/src/metabase/dashboard/components/Dashboard/Dashboard.tsx` - Main dashboard
- `/frontend/src/metabase/dashboard/components/DashCard/DashCard.tsx` - Dashboard card
- `/frontend/src/metabase/dashboard/components/DashCard/DashCardVisualization.tsx` - Bridge to viz

### Series Integration

Dashboards can display multi-series visualizations:

```typescript
// From DashCard.tsx
const cards = useMemo(() => {
  if (isQuestionDashCard(dashcard) && Array.isArray(dashcard.series)) {
    return [mainCard, ...dashcard.series];
  }
  return [mainCard];
}, [mainCard, dashcard]);
```

### Dashboard Grid System

Dashboard layout is handled by a grid system:

**Key Files:**
- `/frontend/src/metabase/dashboard/components/grid/GridLayout.tsx` - Main grid component
- `/frontend/src/metabase/lib/dashboard_grid.js` - Grid constants and utilities

**Grid Constants:**
```javascript
// In dashboard_grid.js
export const GRID_WIDTH = 24;  // Number of columns
export const GRID_ASPECT_RATIO = 10 / 9;
export const GRID_BREAKPOINTS = {
  desktop: MOBILE_BREAKPOINT + 1,  // > 752px
  mobile: MOBILE_BREAKPOINT,       // <= 752px
};
export const GRID_COLUMNS = {
  desktop: GRID_WIDTH,
  mobile: 1,  // Mobile collapses to a single column
};
```

### Mobile Adaptation

Dashboard adapts to mobile by:
1. Collapsing to a single column
2. Adjusting visualization heights based on type
3. Stacking cards vertically
4. Disabling drag and resize on mobile

```typescript
// In grid-utils.ts
export function generateMobileLayout(desktopLayout) {
  const mobile = [];
  desktopLayout.forEach((item) => {
    mobile.push({
      ...item,
      x: 0,  // All items aligned to left
      y: sumVerticalSpace(mobile),  // Stack items vertically
      h: getMobileHeight(item.dashcard.card.display, item.h),
      w: 1,  // Single column
      minW: 1,
    });
  });
  return mobile;
}
```

## Parameters and Filters

### Parameter Model

Dashboard parameters are defined as:

```typescript
interface Parameter {
  id: string;
  name: string;
  type: ParameterType;  // e.g., "date/single", "category", etc.
  slug: string;
  default?: any;
  required?: boolean;
}
```

**Key Files:**
- `/frontend/src/metabase/parameters/` - Parameter components and utilities
- `/frontend/src/metabase-lib/v1/parameters/` - Parameter logic and types

### Parameter Mapping

Parameters connect to card data via parameter mappings:

```typescript
interface ParameterMapping {
  parameter_id: string;
  card_id: number;
  target: ["dimension", FieldReference] | ["variable", string] | ["text-tag", string];
}
```

**Parameter Processing Flow:**
1. Dashboard has parameters defined
2. Parameter mappings link parameters to card fields/variables
3. User sets parameter values through UI
4. Values are applied to cards during data fetching
5. Backend applies constraints to queries based on parameters

### Parameter UI Components

Parameter UI is rendered through various widgets:

**Key Files:**
- `/frontend/src/metabase/parameters/components/ParameterWidget/ParameterWidget.tsx` - Main widget
- `/frontend/src/metabase/parameters/components/widgets/` - Specific widget implementations

**Widgets for Different Types:**
- `DateWidget` - For date parameters
- `StringInputWidget` - For text parameters
- `CategoryWidget` - For category parameters
- `NumberInputWidget` - For numeric parameters

### Cross-Filtering

Cross-filtering allows clicks to filter other cards:

**Implementation:**
- Stored as custom click behavior type "crossfilter"
- Maps source data to target parameters
- Applied through click action system

```typescript
// Example cross-filter definition
{
  type: "crossfilter",
  parameterMapping: {
    "param123": {
      source: { type: "column", id: "PRODUCT" },
      target: { type: "parameter", id: "param123" }
    }
  }
}
```

## Data Fetching and State Management

### Dashboard Data Fetching

Dashboard data fetching is orchestrated in:

**Key Files:**
- `/frontend/src/metabase/dashboard/actions/data-fetching.ts` - Core data fetching

**Key Functions:**
```typescript
export const fetchDashboardCardData = (options) => (dispatch, getState) => {
  // 1. Determine which cards need data
  // 2. Set loading state
  // 3. Fetch data for each card in parallel
  // 4. Update UI when complete
};

export const fetchCardData = (card, dashcard, options) => async (dispatch) => {
  // 1. Check cache
  // 2. Apply parameters
  // 3. Fetch from appropriate API
  // 4. Monitor for slow queries
  // 5. Return result
};
```

### Request Cancellation

The system implements request cancellation to prevent race conditions:

```typescript
// In data-fetching.ts
export const cancelFetchCardData = createAction(
  CANCEL_FETCH_CARD_DATA,
  (card_id, dashcard_id) => {
    const deferred = cardDataCancelDeferreds[`${dashcard_id},${card_id}`];
    if (deferred) {
      deferred.resolve();
    }
    return { payload: { dashcard_id, card_id } };
  },
);
```

### Loading State Management

Loading states are tracked at multiple levels:

1. **Card Level** - Individual card loading state
2. **Dashboard Level** - Overall dashboard loading progress
3. **Slow Query Detection** - Special handling for slow-loading cards

```typescript
// In Visualization.tsx
const isLoading = (series: Series | null) => {
  return !(
    series &&
    series.length > 0 &&
    _.every(
      series,
      (s) => !!s.data || _.isObject(s.card.visualization_settings.virtual_card),
    )
  );
};
```

## Interactivity

### Click Action System

The click action system determines what happens when users click on visualization elements:

**Key Files:**
- `/frontend/src/metabase/visualizations/click-actions/Mode/Mode.ts` - Defines click modes
- `/frontend/src/metabase/visualizations/lib/action.js` - Action handling

**Click Action Types:**
```typescript
// Three main types of click actions
interface ClickAction {
  // Change question (drill through)
  question?: () => Question;
  
  // Navigate to URL
  url?: () => string;
  
  // Dispatch Redux action
  action?: () => any;
}
```

### Drill-Through System

Drill actions allow users to explore data by clicking on visualization elements:

**Key Files:**
- `/frontend/src/metabase/querying/drills/` - Drill implementations

**Available Drill Types:**
```typescript
// In constants.ts
export const DRILLS = {
  "drill-thru/automatic-insights": automaticInsightsDrill,
  "drill-thru/column-filter": columnFilterDrill,
  "drill-thru/distribution": distributionDrill,
  "drill-thru/pivot": pivotDrill,
  "drill-thru/sort": sortDrill,
  "drill-thru/underlying-records": underlyingRecordsDrill,
  "drill-thru/zoom": zoomDrill,
  // ... many more drill types
};
```

### Custom Click Behaviors

Dashboard creators can configure custom click behaviors:

**Types:**
1. **Link Behavior** - Navigate to URL, dashboard, or question
2. **Cross-Filter Behavior** - Filter other cards on dashboard
3. **Action Behavior** - Trigger custom actions (enterprise)

**Storage:**
```typescript
// In dashcard visualization_settings
"click_behavior": {
  "type": "link",
  "linkType": "dashboard",
  "targetId": 5
}

// Or for column-specific behaviors
"column_settings": {
  '["name","column_name"]': {
    "click_behavior": {
      "type": "crossfilter",
      "parameterMapping": { ... }
    }
  }
}
```

## Theming and Styling

### Color System

The color system is defined in:

**Key Files:**
- `/frontend/src/metabase/lib/colors/palette.ts` - Color definitions
- `/frontend/src/metabase/css/core/colors.module.css` - CSS variables

**Structure:**
```typescript
// In palette.ts
export const colors = {
  brand: "#509EE3",
  accent1: "#88BF4D",
  accent2: "#A989C5",
  // ... more colors
  
  // Semantic colors
  success: "#84BB4C",
  danger: "hsla(358, 71%, 62%, 1)",
  warning: "#F9CF48",
  
  // UI colors
  "text-dark": "#4C5773",
  "bg-light": "#F9FBFC",
}
```

**CSS Variables:**
```css
/* In colors.module.css */
:root {
  --mb-color-brand: var(--mb-base-color-blue-40);
  --mb-color-brand-light: color-mix(in srgb, var(--mb-color-brand), #fff 80%);
  --mb-base-color-blue-40: #509ee3;
}
```

### Chart Colors Assignment

Chart colors are assigned using:

**Key File:**
- `/frontend/src/metabase/lib/colors/charts.ts`

```typescript
export const getColorsForValues = (
  keys: string[],
  existingMapping?: Record<string, string> | null,
  palette?: ColorPalette,
) => {
  // Logic to assign colors to values
  // Maintains consistent colors for the same values
}
```

### Visualization Theme Integration

ECharts visualizations use themes defined in:

**Key File:**
- `/frontend/src/metabase/visualizations/shared/utils/theme.ts`

```typescript
export function getVisualizationTheme({
  theme,
  isDashboard,
  isNightMode,
  isStaticViz,
}): VisualizationTheme {
  // Returns theme object for ECharts
}
```

### Dark Mode Support

Dark mode is implemented through CSS variables and theme classes:

```css
.DashboardNight .bgLight {
  background-color: var(--mb-color-bg-black);
}

.DashboardNight .textDark {
  color: var(--mb-color-bg-light);
}
```

Visualizations detect dark mode via the `isNightMode` prop.

## Performance Optimization

### Component Memoization

Memoization is used at multiple levels:

1. **Class Method Memoization**:
```typescript
// In memoize-class.ts
export function memoizeClass<T>(...keys: string[]) {
  // Implements memoization for class methods
}

// Usage
const VisualizationMemoized = memoizeClass<Visualization>(
  "_getQuestionForCardCached",
)(Visualization);
```

2. **React Hooks Memoization**:
```typescript
// In visualization components
const option = useMemo(() => {
  return getChartOption(model, theme, onHover, onClick);
}, [model, theme, onHover, onClick]);
```

3. **Selective Re-rendering**:
```typescript
// In Visualization.tsx
static getDerivedStateFromProps(props, state) {
  // Only re-derive state when specific props have changed
  if (!isSameSeries(props.rawSeries, state._lastProps?.rawSeries) ||
      !equals(props.settings, state._lastProps?.settings)) {
    // Recalculate derived state
  }
  return null;
}
```

### Virtualization for Large Datasets

Tables use virtualization for large datasets:

**Key Files:**
- `/frontend/src/metabase/data-grid/hooks/use-virtual-grid.tsx`
- `/frontend/src/metabase/data-grid/components/DataGrid/DataGrid.tsx`

```typescript
// In DataGrid.tsx
{getVisibleRows().map((maybeVirtualRow) => {
  const { row, virtualRow } = isVirtualRow(maybeVirtualRow)
    ? maybeVirtualRow
    : { row: maybeVirtualRow, virtualRow: undefined };

  const virtualRowStyles = virtualRow != null
    ? {
        position: "absolute",
        minHeight: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }
    : {};

  return (
    <div
      key={row.id}
      ref={rowMeasureRef}
      style={virtualRowStyles}
    >
      {/* Row content */}
    </div>
  );
})}
```

### Data Caching

The data fetching system implements caching:

```typescript
// In data-fetching.ts
// Check if a cached result exists and can be used
if (!reload && lastResult && equals(
  getDatasetQueryParams(lastResult.json_query),
  getDatasetQueryParams(datasetQuery)
)) {
  return {
    dashcard_id: dashcard.id,
    card_id: card.id,
    result: lastResult,
  };
}
```

### Deferred and Debounced Updates

User interactions use debouncing to prevent excessive updates:

```typescript
// In component using window resize
useEffect(() => {
  const handleResize = _.debounce(forceUpdate, 100);
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, [forceUpdate]);
```

## Export and Sharing

### PDF and Image Export

PDF and image export is implemented in:

**Key Files:**
- `/frontend/src/metabase/visualizations/lib/save-dashboard-pdf.ts`
- `/frontend/src/metabase/visualizations/lib/save-chart-image.ts`

```typescript
// In save-dashboard-pdf.ts
export const saveDashboardPdf = async (
  selector: string,
  dashboardName: string,
) => {
  // 1. Extract dashboard content
  // 2. Determine page breaks
  // 3. Render to canvas
  // 4. Create PDF
  // 5. Save as file
};
```

### Data Export

Data exports are implemented in:

**Key File:**
- `/frontend/src/metabase/redux/downloads.ts`

Supports formats:
- CSV
- XLSX
- JSON

### Dashboard Subscriptions

Subscriptions (sending dashboards via email or Slack) are managed through:

**Key Files:**
- `/frontend/src/metabase/notifications/DashboardSubscriptionsSidebar/`

Channels supported:
- Email
- Slack
- Webhooks

### Embedding

Embedding is implemented with a secure token system:

**Key Files:**
- `/frontend/src/metabase/public/lib/embed.ts`

```typescript
// In embed.ts
function getSignedToken(
  resourceType: EmbedResourceType,
  resourceId: EmbedResource["id"],
  params: EmbeddingParametersValues = {},
  secretKey: string,
) {
  // Generate secure token for embedding
}
```

## Testing Approaches

### Unit Testing

Unit tests focus on components and utilities:

**Key Test Files:**
- `/frontend/src/metabase/visualizations/visualizations/BarChart.unit.spec.tsx`
- `/frontend/src/metabase/visualizations/components/Visualization/Visualization-themed.unit.spec.tsx`

**Test Patterns:**
```typescript
// Example test for a visualization component
it("should display the correct values", () => {
  setup({
    series,
    settings: {
      "graph.y_axis.scale": "linear",
    },
  });
  
  expect(screen.getByText("42")).toBeInTheDocument();
});
```

### End-to-End Testing

Cypress tests cover full integration:

**Key Test Files:**
- `/e2e/test/scenarios/visualizations-charts/bar_chart.cy.spec.js`
- `/e2e/test/scenarios/visualizations-charts/line_chart.cy.spec.js`

**Helper Functions:**
- `H.visitQuestionAdhoc()` - Visit a question with specific settings
- `H.chartPathWithFillColor()` - Select chart elements by color
- `H.assertEChartsTooltip()` - Verify tooltip content

### Visual Regression Testing

Visual testing uses Loki with Storybook:

**Configuration:**
- `loki.config.js` - Test configuration
- `*.stories.tsx` files - Storybook stories for visualizations

```typescript
// In PieChart.stories.tsx
export default {
  title: "viz/PieChart",
  component: PieChart,
};

export const DefaultPieChart = {
  args: {
    isDashboard: false,
    settings: { "pie.show_legend": true },
  },
};
```

---

This consolidated reference aims to provide a high-level overview while including specific file paths, patterns, and code examples to help navigate the complex visualization system in Metabase's frontend. Use this document as a starting point for understanding the system architecture and locating key components during development and debugging.