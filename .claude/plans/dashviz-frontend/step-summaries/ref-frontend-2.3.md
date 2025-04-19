# Settings State Management

## Storage Structure

Metabase's visualization settings are stored in a hierarchical structure:

1. **Card Level**: Settings are primarily stored in the `visualization_settings` property of card objects:
   ```javascript
   // In visualization.js
   export function getStoredSettingsForSeries(series) {
     let storedSettings = (series && series[0] && series[0].card.visualization_settings) || {};
     // ...normalization logic
     return storedSettings;
   }
   ```

2. **Column Settings**: Column-specific settings are stored in a nested `column_settings` object, indexed by a JSON-serialized column reference or name:
   ```javascript
   // Example structure
   {
     "column_settings": {
       '["ref", ["field", 1, null]]': { 
         "number_style": "currency",
         "currency": "USD"
       }
     }
   }
   ```

3. **Nested Settings**: For complex visualizations with multiple configurable elements, settings are organized using the `nestedSettings` pattern, where settings for each element are stored under a unique key.

## Settings Access and Computation

The system follows a well-defined pattern for accessing settings:

1. **Definition → Storage → Computation**: Each visualization defines its available settings, which are combined with stored values to compute the actual settings used for rendering.

2. **Multi-level Inheritance**:
   ```javascript
   // From column.js
   function getInhertiedSettingsForColumn(column) {
     return {
       ...getGlobalSettingsForColumn(column),
       ...getLocalSettingsForColumn(column),
     };
   }
   ```
   Settings can come from:
   - Global application defaults
   - User-defined global settings
   - Visualization-specific defaults
   - Stored card-specific settings

3. **Computed Settings**: The system calculates final settings by merging defaults with user preferences:
   ```javascript
   // In settings.js
   export function getComputedSettings(settingsDefs, object, storedSettings, extra = {}) {
     const computedSettings = {};
     for (const settingId in settingsDefs) {
       getComputedSetting(computedSettings, settingsDefs, settingId, object, storedSettings, extra);
     }
     return computedSettings;
   }
   ```

## Update Patterns When Settings Change

### Change Handling

The settings update process follows these steps:

1. **User Interaction**: UI components trigger change events through widgets like `ChartSettingColorPicker`, `ChartSettingInput`, etc.

2. **Change Propagation**: Changes are processed by the `handleChangeSettings` function:
   ```javascript
   // In ChartSettingNestedSettings.jsx
   handleChangeSettingsForObjectKey = (changedKey, changedSettings) => {
     const { objects, onChange } = this.props;
     const oldSettings = this.props.value || {};
     const newSettings = objects.reduce((newSettings, object) => {
       const currentKey = getObjectKey(object);
       const objectSettings = getObjectSettings(oldSettings, object);
       if (currentKey === changedKey) {
         newSettings[currentKey] = updateSettings(objectSettings, changedSettings);
       } else {
         newSettings[currentKey] = objectSettings;
       }
       return newSettings;
     }, {});
     onChange(newSettings);
   }
   ```

3. **Immutable Updates**: The system uses immutable update patterns:
   ```javascript
   // In settings.js
   export function updateSettings(storedSettings, changedSettings) {
     const newSettings = {
       ...storedSettings,
       ...changedSettings,
     };
     // remove undefined settings
     for (const [key, value] of Object.entries(changedSettings)) {
       if (value === undefined) {
         delete newSettings[key];
       }
     }
     return newSettings;
   }
   ```

4. **Dependency Tracking**: Settings can define dependencies on other settings:
   ```javascript
   // From column.js
   time_style: {
     // ...
     getHidden: (column, settings) => !settings["time_enabled"] || isDateWithoutTime(column),
     readDependencies: ["time_enabled"],
   }
   ```
   When a setting changes, its dependencies are also processed.

5. **Persistence**: Changes flow back to the card's `visualization_settings` property, which gets saved to the database when the user saves the card.

## Settings and Visualization Rendering

### Rendering Flow

1. **Initialization**: The `Visualization` component computes settings during initialization:
   ```javascript
   // In Visualization.tsx
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
   }
   ```

2. **Props Flow**: Computed settings are passed as props to the visualization component:
   ```javascript
   <CardVisualization
     // ...other props
     settings={settings}
     // ...more props
   />
   ```

3. **Validation**: Before rendering, each visualization can validate its settings:
   ```javascript
   try {
     if (visualization.checkRenderable && series) {
       visualization.checkRenderable(series, settings, query);
     }
   } catch (e: unknown) {
     error = (e as Error).message || t`Could not display this chart with this data.`;
     // ...error handling
   }
   ```

4. **Derived Formatters**: Settings often produce formatter functions used during rendering:
   ```javascript
   // In column.js
   _numberFormatter: {
     getValue: (column, settings) => numberFormatterForOptions(settings),
     readDependencies: [
       "number_style",
       "currency_style",
       "currency",
       "decimals",
     ],
   }
   ```

### Default/Custom Value Interaction

The resolution order for a setting's value is:
- Custom getter function
- Stored user settings (if valid)
- Dynamic default value
- Static default value

```javascript
// From settings.js
if (settingDef.getValue) {
  return (computedSettings[settingId] = settingDef.getValue(object, settings, extra));
}

if (storedSettings[settingId] !== undefined) {
  if (!settingDef.isValid || settingDef.isValid(object, settings, extra)) {
    return (computedSettings[settingId] = storedSettings[settingId]);
  }
}

if (settingDef.getDefault) {
  const defaultValue = settingDef.getDefault(object, settings, extra);
  return (computedSettings[settingId] = defaultValue);
}

if ("default" in settingDef) {
  return (computedSettings[settingId] = settingDef.default);
}
```

## Key State Management Components and Functions

1. **Core Settings Functions**:
   - `getComputedSettings`: Calculates final settings by merging definitions with stored values
   - `updateSettings`: Creates a new settings object with changes applied
   - `getSettingsWidgets`: Transforms settings definitions into UI components

2. **Visualization-Specific Settings**:
   - `getComputedSettingsForSeries`: Combines visualization-specific settings with column settings
   - `getStoredSettingsForSeries`: Retrieves and normalizes settings from a visualization series

3. **Nested Settings Pattern**:
   - `nestedSettings`: Higher-order function for creating settings with complex hierarchy
   - `columnSettings`: Creates column-specific settings using the nested pattern

## Settings Data Flow

1. **Storage to Display**:
   ```
   Card.visualization_settings 
     → getStoredSettingsForSeries 
       → getComputedSettingsForSeries 
         → Visualization Component Props
   ```

2. **User Change to Storage**:
   ```
   UI Widget Change 
     → handleChangeSettings 
       → updateSettings 
         → onUpdateVisualizationSettings 
           → Card.visualization_settings
   ```

## Performance Optimization Techniques

1. **Memoization**: The `Visualization` component is wrapped with `memoizeClass` to prevent unnecessary recalculations.

2. **Derived State**: React's `getDerivedStateFromProps` is used to efficiently update the state only when necessary.

3. **Precomputed Formatters**: Settings that affect formatting are compiled into reusable formatter functions.

4. **Dependency Tracking**: The `readDependencies` array specifies which settings should trigger recomputation of a derived setting.

5. **Conditional UI Updates**: The `getHidden` function conditionally shows or hides settings based on context.