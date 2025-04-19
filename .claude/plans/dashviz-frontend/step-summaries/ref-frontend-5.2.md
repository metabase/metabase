# Custom Visualization Extensions

This document analyzes how custom visualization extensions work in Metabase, focusing on the extension points for custom visualizations, the plugin architecture for new chart types, and enterprise-specific visualization features.

## Core Architecture

### Visualization Registration System

The visualization system in Metabase is built around a registry pattern. The core of this system is found in `frontend/src/metabase/visualizations/index.ts`:

```typescript
const visualizations = new Map<VisualizationDisplay, Visualization>();
const aliases = new Map<string, Visualization>();

export function registerVisualization(visualization: Visualization) {
  // Check visualization is valid
  const identifier = visualization.identifier;
  // Register the visualization
  visualizations.set(identifier, visualization);
  // Register any aliases
  for (const alias of visualization.aliases || []) {
    aliases.set(alias, visualization);
  }
}
```

This registry stores all visualization types and provides methods to retrieve and transform visualizations based on different criteria.

### Visualization Definition Interface

The core interface that defines a visualization is `VisualizationDefinition` in `frontend/src/metabase/visualizations/types/visualization.ts`:

```typescript
export type VisualizationDefinition = {
  name?: string;
  noun?: string;
  uiName: string;
  identifier: VisualizationDisplay;
  aliases?: string[];
  iconName: IconName;
  hasEmptyState?: boolean;

  maxMetricsSupported?: number;
  maxDimensionsSupported?: number;

  disableClickBehavior?: boolean;
  canSavePng?: boolean;
  noHeader?: boolean;
  hidden?: boolean;
  disableSettingsConfig?: boolean;
  supportPreviewing?: boolean;
  supportsSeries?: boolean;

  minSize: VisualizationGridSize;
  defaultSize: VisualizationGridSize;

  settings: VisualizationSettingsDefinitions;

  transformSeries?: (series: Series) => TransformedSeries;
  isSensible: (data: DatasetData) => boolean;
  checkRenderable: (
    series: Series,
    settings: VisualizationSettings,
    query?: NativeQuery | null,
  ) => void | never;
  isLiveResizable?: (series: Series) => boolean;
  onDisplayUpdate?: (settings: VisualizationSettings) => VisualizationSettings;
};
```

This interface defines all the properties and methods that a visualization must implement:

1. **Metadata Properties**:
   - `uiName`: User-facing name of the visualization
   - `identifier`: Unique identifier for the visualization
   - `iconName`: Icon to display for the visualization
   - `aliases`: Alternative identifiers

2. **Capability Flags**:
   - `maxMetricsSupported`: Maximum number of metrics this visualization can display
   - `maxDimensionsSupported`: Maximum number of dimensions this visualization can display
   - `disableClickBehavior`: Whether click interactions are disabled
   - `canSavePng`: Whether this visualization can be exported as a PNG
   - `hidden`: Whether this visualization should be hidden from the UI

3. **Size Properties**:
   - `minSize`: Minimum size required for this visualization
   - `defaultSize`: Default size for this visualization

4. **Settings**:
   - `settings`: Definitions for configurable settings specific to this visualization

5. **Required Methods**:
   - `isSensible`: Determines if this visualization makes sense for a given dataset
   - `checkRenderable`: Validates if the visualization can be rendered with the given data and settings
   - `transformSeries`: Optional function to transform the data series before rendering

### Component Structure

A visualization in Metabase consists of two key parts:

1. **React Component**: Implements the rendering logic
2. **Definition Object**: Implements the `VisualizationDefinition` interface

The final type merges these together:

```typescript
export type Visualization = React.ComponentType<
  Omit<VisualizationProps, "width" | "height"> & {
    width?: number | null;
    height?: number | null;
  } & VisualizationPassThroughProps
> &
  VisualizationDefinition;
```

## Extension Points

### 1. Creating Custom Visualizations

To create a custom visualization, you need to:

1. Create a React component that renders your visualization
2. Implement the `VisualizationDefinition` interface
3. Register your visualization using `registerVisualization`

Example implementation:

```typescript
// 1. Define a React component for your visualization
const MyCustomChart = ({ series, settings, width, height, ...props }) => {
  // Custom rendering logic
  return <div>...</div>;
};

// 2. Implement the VisualizationDefinition interface
const CUSTOM_CHART_DEFINITION = {
  uiName: "My Custom Chart",
  identifier: "custom-chart",
  iconName: "chart",
  minSize: { width: 4, height: 4 },
  defaultSize: { width: 8, height: 6 },
  
  isSensible: ({ cols, rows }) => {
    // Logic to determine if this viz makes sense for the data
    return true;
  },
  
  checkRenderable: ([{ data }], settings) => {
    // Validation logic
    if (!settings["custom.requiredSetting"]) {
      throw new ChartSettingsError("Required setting missing");
    }
  },
  
  settings: {
    "custom.requiredSetting": {
      section: "Data",
      title: "Required Setting",
      widget: "toggle",
      default: true
    },
    // Other settings...
  }
};

// 3. Merge component and definition
Object.assign(MyCustomChart, CUSTOM_CHART_DEFINITION);

// 4. Register the visualization
registerVisualization(MyCustomChart);
```

### 2. Plugin System

Metabase has a plugin system defined in `frontend/src/metabase/plugins/index.ts` that could potentially be used for visualization extensions, though it doesn't have a specific hook for visualizations. Enterprise features often use this plugin system.

### 3. Enterprise Extensions

Enterprise visualizations follow the same pattern but are included only in the enterprise edition. A good example is `AuditTableVisualization` which:

1. Extends the base visualization system with a specialized table for audit data
2. Uses the same registration mechanism: `registerVisualization(AuditTableVisualization)`
3. Sets `hidden: true` to hide it from the standard visualization picker
4. Reuses existing settings: `static settings = Table.settings;`

## Practical Extension Pattern

Based on the analysis, the practical pattern for implementing custom visualizations is:

1. **Create Definition File**:
   ```typescript
   // chart-definition.ts
   export const CUSTOM_CHART_DEFINITION: VisualizationDefinition = {
     uiName: "Custom Chart",
     identifier: "custom-chart",
     iconName: "chart",
     minSize: { width: 4, height: 4 },
     defaultSize: { width: 8, height: 6 },
     isSensible: () => true,
     checkRenderable: () => {},
     settings: {
       // Chart-specific settings
     }
   };
   ```

2. **Create Component File**:
   ```typescript
   // CustomChart.tsx
   import { CUSTOM_CHART_DEFINITION } from "./chart-definition";
   
   export const CustomChart = ({ series, settings, width, height }) => {
     // Rendering logic
     return <div>...</div>;
   };
   
   Object.assign(CustomChart, CUSTOM_CHART_DEFINITION);
   ```

3. **Register the Visualization**:
   ```typescript
   // register.js
   import { registerVisualization } from "metabase/visualizations";
   import { CustomChart } from "./CustomChart";
   
   registerVisualization(CustomChart);
   ```

## Settings System

Visualizations can define their own settings that will appear in the visualization settings panel. These are defined in the `settings` property of the `VisualizationDefinition`:

```typescript
settings: {
  "custom.color": {
    section: "Display",
    title: "Color",
    widget: "color",
    default: "#000"
  },
  "custom.showLabels": {
    section: "Display",
    title: "Show Labels",
    widget: "toggle",
    default: true
  }
}
```

Each setting can define:
- Section (tab in the settings panel)
- Title (display name)
- Widget type (control to use)
- Default value
- Visibility logic with `getHidden`
- Validation with `isValid`
- Custom props with `getProps`

## Static Visualizations

There's a separate registration for static visualizations used in exports and embeds:

```javascript
// frontend/src/metabase/static-viz/register.js
export const registerStaticVisualizations = () => {
  registerVisualization(Scalar);
  registerVisualization(LineChart);
  // Other visualizations...
  setDefaultVisualization(Scalar);
};
```

Not all visualizations support static rendering, so this is a subset of the full visualization registry.

## Conclusion

Metabase's visualization system provides a flexible framework for adding custom visualizations through:

1. A clear component + definition pattern
2. A centralized registration system
3. Extensive customization through settings
4. Enterprise extension capabilities

While there's no explicit "plugin" system specifically for visualizations, the pattern is consistent and well-documented in the codebase, making it straightforward to add new visualization types that integrate seamlessly with the rest of the application.