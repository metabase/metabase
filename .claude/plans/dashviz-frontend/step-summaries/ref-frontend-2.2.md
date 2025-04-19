# Settings UI Components

## Settings Panel UI Component Structure

The visualization settings system in Metabase is built around a modular architecture of UI components that render different types of setting widgets. The system consists of:

- **Core Component Types**: A collection of specialized setting components located in `/frontend/src/metabase/visualizations/components/settings/`
- **Widget Registry**: A central mapping (`WIDGETS`) that connects setting types to specific components
- **Computation Logic**: Functions to derive computed settings values based on defaults and user settings
- **Widget Generation**: Logic to create widget instances with appropriate props and state

The foundation of the settings UI is the `ChartSettingWidgetProps` interface which defines standard props for settings components:

```typescript
interface ChartSettingWidgetProps<TValue> {
  value: TValue | undefined;
  onChange: (value?: TValue | null) => void;
  onChangeSettings: (settings: Partial<VisualizationSettings>) => void;
}
```

## Widget Types and Patterns

Metabase implements a wide variety of setting widget types tailored to different data types and interaction patterns:

### Basic Input Types
- **Toggle (`ChartSettingToggle`)**: Boolean settings using the Mantine Switch component
- **Text Input (`ChartSettingInput`)**: Text entry with controlled component pattern and blur-based saving
- **Numeric Input (`ChartSettingInputNumeric`)**: Specialized number entry with validation and formatting

### Selection Components
- **Select (`ChartSettingSelect`)**: Dropdown selection from a list of options
- **Radio (`ChartSettingRadio`)**: Radio button selection for exclusive choices
- **Icon Radio (`ChartSettingIconRadio`)**: Visual icon-based selection for visualization types
- **Multi-Select (`ChartSettingMultiSelect`)**: Selection of multiple values from options
- **Segmented Control**: Button group selection for mutually exclusive options

### Field Selection
- **Field Picker (`ChartSettingFieldPicker`)**: Selection of columns/fields from dataset 
- **Fields Picker (`ChartSettingFieldsPicker`)**: Selection of multiple fields with ordering
- **Fields Partition (`ChartSettingFieldsPartition`)**: Organizing fields into categories

### Visual Styling
- **Color Picker (`ChartSettingColorPicker`)**: Selection of colors for visualization elements
- **Colors Picker (`ChartSettingColorsPicker`)**: Assignment of colors to multiple elements

### Complex Settings
- **Nested Settings**: Hierarchical structures for complex visualization properties
- **Table Formatting (`ChartSettingsTableFormatting`)**: Rules-based conditional formatting
- **Ordered Items**: Reorderable lists with drag and drop functionality
- **Table Columns**: Configuring column display properties

## Validation and Error Handling

The visualization settings system includes several error handling and validation approaches:

### Input Validation
- **Numeric Validation**: The `ChartSettingInputNumeric` component validates numbers during input and on blur
- **Error State Display**: Components like `ChartSettingInputNumeric` use the `error` prop to display validation errors
- **Character Filtering**: Components filter allowed characters (e.g., ALLOWED_CHARS in numeric input)

### Visualization Errors
The system defines a set of error classes for different validation failures:
- `ChartSettingsError`: General settings configuration errors
- `MinRowsError`: Not enough data points for visualization
- `MinColumnsError`: Not enough columns for visualization
- `LatitudeLongitudeError`: Missing required geographic data

### Validation Logic
Validation can occur at several levels:
- **Component-Level**: Within individual settings widgets (e.g., checking for numeric values)
- **Setting Definition**: Each setting can have an `isValid` function to validate values
- **Cross-Setting Validation**: Functions like `validateStacking` validate combinations of settings
- **Visualization-Level**: Checking if all required data is available via functions like `validateDatasetRows`

## Settings Organization and Interaction Patterns

### Organization Patterns
- **Section-Based Grouping**: Settings are organized into logical sections
- **Dependent Settings**: Settings can depend on other settings (readDependencies/writeDependencies)
- **Dynamic Visibility**: Settings can be conditionally displayed based on other settings
- **Progressive Disclosure**: Complex settings reveal details as needed (e.g., RuleEditor in table formatting)

### Interaction Patterns
- **Immediate vs. Deferred Updates**: Some components update on change, others on blur
- **Controlled Components**: Most inputs maintain local state that syncs with global state
- **Cascading Changes**: Changes to one setting can reset or update related settings
- **Notification of Changes**: Components provide feedback through visual cues

### Code Example: Setting Widget Generation

The core function `getSettingWidget` demonstrates how settings are instantiated:

```javascript
function getSettingWidget(
  settingDefs,
  settingId,
  storedSettings,
  computedSettings,
  object,
  onChangeSettings,
  extra = {},
) {
  const settingDef = settingDefs[settingId];
  const value = computedSettings[settingId];
  const onChange = (value, question) => {
    const newSettings = { [settingId]: value };
    // Update dependent settings
    for (const settingId of settingDef.writeDependencies || []) {
      newSettings[settingId] = computedSettings[settingId];
    }
    // Clear settings that need to be erased
    for (const settingId of settingDef.eraseDependencies || []) {
      newSettings[settingId] = null;
    }
    onChangeSettings(newSettings, question);
    settingDef.onUpdate?.(value, extra);
  };
  
  // ... additional property computation ...
  
  return {
    // ... widget configuration ...
    widget: typeof settingDef.widget === "string" 
      ? WIDGETS[settingDef.widget] 
      : settingDef.widget,
    onChange,
    onChangeSettings,
  };
}
```