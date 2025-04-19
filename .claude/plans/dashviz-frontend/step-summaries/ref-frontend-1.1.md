# Visualization Registry & Plugin System

## How Visualizations Are Registered and Loaded

Metabase implements a registry-based pattern for visualizations that allows them to be dynamically registered and loaded:

1. **Central Registry**: Defined in `/frontend/src/metabase/visualizations/index.ts` using Maps to store visualizations:
   ```typescript
   const visualizations = new Map<VisualizationDisplay, Visualization>();
   const aliases = new Map<string, Visualization>();
   ```

2. **Registration Method**: The `registerVisualization` function adds visualizations to the registry:
   ```typescript
   export function registerVisualization(visualization: Visualization) {
     // Validation and error checking
     const identifier = visualization.identifier;
     visualizations.set(identifier, visualization);
     // Support for aliases
     for (const alias of visualization.aliases || []) {
       aliases.set(alias, visualization);
     }
   }
   ```

3. **Initialization**: Visualizations are registered during application startup in `app.js`:
   ```javascript
   import registerVisualizations from "metabase/visualizations/register";
   // Inside _init function
   registerVisualizations();
   ```

4. **Registration Order**: The `/frontend/src/metabase/visualizations/register.js` file imports and registers all visualization components in a predefined order.

## Extensibility Mechanisms

Metabase provides several mechanisms for extending the visualization system:

### 1. Create a New Visualization Component

All visualizations implement the `Visualization` interface which combines a React component with metadata:

```typescript
export type Visualization = React.ComponentType<...> & VisualizationDefinition;
```

The `VisualizationDefinition` provides metadata and capabilities:

```typescript
export type VisualizationDefinition = {
  name?: string;
  uiName: string;
  identifier: VisualizationDisplay;
  aliases?: string[];
  iconName: IconName;
  
  // Feature flags
  maxMetricsSupported?: number;
  maxDimensionsSupported?: number;
  disableClickBehavior?: boolean;
  // ... more properties
  
  minSize: VisualizationGridSize;
  defaultSize: VisualizationGridSize;
  
  settings: VisualizationSettingsDefinitions;
  
  // Hooks for customizing behavior
  transformSeries?: (series: Series) => TransformedSeries;
  isSensible: (data: DatasetData) => boolean;
  checkRenderable: (series: Series, settings: VisualizationSettings, query?: NativeQuery | null) => void | never;
};
```

### 2. Visualization Settings System

Each visualization defines its own settings object that controls its configuration:

```typescript
static settings = {
  ...fieldSetting("scalar.field", {
    title: t`Field to show`,
    getDefault: ([{ data: { cols } }]) => cols[0].name,
    getHidden: ([{ data: { cols } }]) => cols.length < 2,
  }),
  ...columnSettings({
    getColumns: ([{ data: { cols } }], settings) => [
      _.find(cols, (col) => col.name === settings["scalar.field"]) || cols[0],
    ],
    readDependencies: ["scalar.field"],
  }),
  // ... more settings
};
```

### 3. Series Transformation

Visualizations can transform data before rendering using a transform function:

```typescript
transformSeries?: (series: Series) => TransformedSeries;
```

### 4. ECharts Integration

Metabase uses ECharts for many of its visualizations, with its own registration system.

## Common Interfaces and Abstractions

### 1. `Visualization` Type

The core interface combining React component and metadata.

### 2. `VisualizationProps` Interface

Defines the properties passed to all visualization components:

```typescript
export interface VisualizationProps {
  series: Series;
  card: Card;
  data: DatasetData;
  settings: ComputedVisualizationSettings;
  // UI state
  width: number;
  height: number;
  isDashboard: boolean;
  isEditing: boolean;
  isFullscreen: boolean;
  
  // Event handlers
  onRender: (options) => void;
  onRenderError: (error?: string) => void;
  onHoverChange: (hoverObject?: HoveredObject | null) => void;
  onVisualizationClick: (clickObject: ClickObject | null) => void;
}
```

### 3. Key Data Structures

- **Series**: Collection of data to be visualized
- **Card**: Metadata about a visualization (question)
- **Settings**: Configuration for how to render the visualization
- **DatasetData**: The actual data (rows, columns) to be visualized

### 4. Component Structure

Most visualizations follow a similar file structure:

```
/Scalar/
  ├── Scalar.jsx       # Main component implementation
  ├── Scalar.styled.tsx # Styled components
  ├── index.ts         # Export file
  ├── constants.ts     # Constants
  ├── utils.ts         # Utilities
  └── utils.unit.spec.ts # Tests
```

### 5. Visualization Component Template

```jsx
export class Scalar extends Component {
  // Metadata
  static uiName = t`Number`;
  static identifier = "scalar";
  static iconName = "number";
  
  // Size definitions
  static minSize = getMinSize("scalar");
  static defaultSize = getDefaultSize("scalar");
  
  // Logic flags
  static noHeader = true;
  static supportsSeries = true;
  
  // Data validation
  static isSensible({ cols, rows }) {
    return rows.length === 1 && cols.length === 1;
  }
  
  static checkRenderable([{ data: { cols, rows } }]) {
    // Validation logic
  }
  
  // Settings definition
  static settings = {
    // Various visualization settings
  };
  
  // Component rendering and logic
  render() {
    // Rendering logic
  }
}
```

## Key Architecture Patterns

1. **Registry Pattern**: Central registry for dynamic lookup of visualizations
2. **Component Composition**: Visualization components built from smaller components
3. **Transformation Pipeline**: Series data goes through transformations before rendering
4. **Settings System**: Declarative configuration of visualization options
5. **Integration with ECharts**: Using a popular chart library for rendering