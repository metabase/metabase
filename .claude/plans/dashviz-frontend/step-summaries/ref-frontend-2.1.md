# Settings Schema Architecture

## Overview of Visualization Settings System

Metabase's visualization settings are organized in a flexible, hierarchical schema system that enables both common and visualization-specific settings. The architecture follows a declarative pattern where settings are defined as JavaScript/TypeScript objects with configurable properties.

### Core Components

1. **Settings Definition Objects**: Each setting is defined as an object with properties that define its behavior, appearance, and validation rules.

2. **Settings Groups**: Settings are grouped by functionality (e.g., `GRAPH_AXIS_SETTINGS`, `TOOLTIP_SETTINGS`) and can be composed together for a visualization.

3. **Settings Inheritance**: Visualizations can inherit settings from parent or common settings objects.

4. **Nested Settings**: Complex settings can be nested, such as column-specific formatting settings.

## Settings Schema Format and Capabilities

### Basic Setting Structure

```javascript
"setting.key": {
  section: t`Display`,          // Groups settings into UI sections
  title: t`Setting Label`,      // Human-readable label
  widget: "select",             // UI widget type to use
  default: "value",             // Default value
  getDefault: (series) => {...}, // Dynamic default value calculation
  isValid: (series, settings) => {...}, // Validation function
  getProps: (series, settings) => {...}, // Dynamic props for the widget
  getHidden: (series, settings) => {...}, // Logic for when to hide the setting
  readDependencies: ["other.setting"], // Settings this one depends on
  writeDependencies: ["another.setting"], // Settings this one affects
}
```

### Key Capabilities

- **Contextual Settings**: Settings can be shown or hidden based on other settings or data properties using `getHidden`.
- **Dynamic Defaults**: Settings can compute their default values based on the data using `getDefault`.
- **Validation**: Settings can validate their values against the data with `isValid`.
- **Dependencies**: Settings can declare dependencies on other settings with `readDependencies` and `writeDependencies`.
- **Custom Widgets**: Settings use specialized UI widgets defined in the `WIDGETS` object.

## Patterns for Default Values and Option Constraints

### Default Value Patterns

1. **Static Defaults**:
```javascript
"graph.y_axis.scale": {
  default: "linear",
}
```

2. **Function-Based Defaults** that adapt to the data:
```javascript
"graph.x_axis.scale": {
  getDefault: (series, vizSettings) => getDefaultXAxisScale(vizSettings),
}
```

3. **Persistence Pattern**: Some defaults are marked to be persisted:
```javascript
"graph.dimensions": {
  getDefault: (series, vizSettings) => getDefaultDimensions(series, vizSettings),
  persistDefault: true,
}
```

### Constraint Patterns

1. **Validation Functions**:
```javascript
"stackable.stack_type": {
  isValid: (series, settings) => {
    const seriesDisplays = getSeriesDisplays(series, settings);
    return isStackingValueValid(settings, seriesDisplays);
  },
}
```

2. **Dynamic Option Generation**:
```javascript
"graph.x_axis.scale": {
  getProps: (series, vizSettings) => ({
    options: getAvailableXAxisScales(series, vizSettings),
  }),
}
```

3. **Conditional Display Logic**:
```javascript
"graph.y_axis.min": {
  getHidden: (series, vizSettings) => vizSettings["graph.y_axis.auto_range"] !== false,
}
```

## Settings Processing Pipeline

Settings are processed through a multi-stage pipeline:

1. **Definition**: Settings are defined in visualization-specific files and combined with common settings.

2. **Computation**: Settings are computed using the `getComputedSettings` function which:
   - Resolves dependencies between settings
   - Applies stored user settings
   - Falls back to default values when needed
   - Validates settings against the data

```javascript
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

3. **Widget Generation**: UI widgets are created for each setting using `getSettingsWidgets`, which:
   - Creates widget objects for each setting
   - Handles setting dependencies
   - Configures widget props based on data and other settings

4. **Application**: Settings are applied to visualizations through the rendering process, where the computed settings determine visual aspects like axes, colors, and formatting.

## Settings Organization and Categorization

Settings are organized in several ways:

1. **By Visualization Type**: Each visualization type can define its own settings or inherit from common settings.

2. **By Section**: Settings are grouped into UI sections like "Display", "Axes", and "Data".

3. **By Context**: Settings can be general or specific to elements like columns, axes, or series.

4. **By Feature**: Settings are grouped in feature-specific objects like `GRAPH_AXIS_SETTINGS`, `TOOLTIP_SETTINGS`, etc.

## Settings Validation System

The validation system ensures settings are appropriate for the data:

```javascript
export const validateChartDataSettings = (settings) => {
  const dimensions = (settings["graph.dimensions"] || []).filter(isNotNull);
  const metrics = (settings["graph.metrics"] || []).filter(isNotNull);
  if (dimensions.length < 1 || metrics.length < 1) {
    throw new ChartSettingsError(
      t`Which fields do you want to use for the X and Y axes?`,
      { section: t`Data` },
      t`Choose fields`,
    );
  }
  // ... additional validation ...
};
```

## Settings and Visualization Rendering

Settings and visualization rendering interact through:

1. **Transformation**: Series data is transformed based on settings before rendering.

2. **Computed Properties**: Settings are used to compute properties needed for rendering.

3. **Visual Options**: Settings directly control visual aspects like colors, scales, and formatting.

4. **Column Formatting**: Special settings objects like `columnSettings` control how data values are formatted.