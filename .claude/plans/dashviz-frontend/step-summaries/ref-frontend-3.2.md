# Filters and Parameters in Dashboard Visualizations

This document provides a comprehensive analysis of how dashboard filters/parameters interact with visualizations in the Metabase frontend.

## Table of Contents
1. [Parameter System Architecture](#parameter-system-architecture)
2. [Parameter Data Flow](#parameter-data-flow)
3. [Parameter Mapping](#parameter-mapping)
4. [Parameter UI Components](#parameter-ui-components)
5. [Parameter Application to Queries](#parameter-application-to-queries)
6. [Cross-Filtering Implementation](#cross-filtering-implementation)
7. [Special Features](#special-features)

## Parameter System Architecture

The dashboard parameter system follows a well-structured architecture with clear separation of responsibilities:

### Core Parameter Components
- **Parameter Definition**: Parameters are defined at the dashboard level and stored in the `dashboard.parameters` array
- **Parameter Mapping**: Each dashcard can have `parameter_mappings` that connect dashboard parameters to specific card fields or variables
- **Parameter Values**: Values are stored in state and can be managed through both URL parameters and UI interactions
- **Parameter Application**: When executing queries, parameter values are applied based on their mappings

### Component Types
1. **Dashboard Parameters**: Stored directly in the dashboard object, defining the parameter ID, name, type, and default values
2. **Parameter Mappings**: Connecting parameters to specific targets in cards (fields, variables, text tags)
3. **Parameter UI Components**: Different widget types based on parameter types
4. **Parameter Application Logic**: Transforming parameter values into constraints for queries

### Code Organization
The parameter system spans several key directories:
- `/frontend/src/metabase/parameters/`: Core parameter functionality
- `/frontend/src/metabase/dashboard/components/`: Dashboard-specific parameter UI
- `/frontend/src/metabase-lib/v1/parameters/`: Parameter logic and utilities

## Parameter Data Flow

Parameters flow through the system in a predictable pattern:

1. **Definition**:
   ```typescript
   // In Dashboard model
   parameters: Parameter[] = [
     {
       id: "abc123",
       name: "Date Filter",
       type: "date/single",
       slug: "date_filter",
       default: "2023-01-01"
     }
   ]
   ```

2. **Mapping**:
   ```typescript
   // In DashboardCard model
   parameter_mappings: DashboardParameterMapping[] = [
     {
       parameter_id: "abc123",
       card_id: 5,
       target: ["dimension", ["field", 123, null]]
     }
   ]
   ```

3. **Value Assignment**:
   ```typescript
   // In Redux state
   parameterValues = {
     "abc123": "2023-04-01"
   }
   ```

4. **Query Application**:
   ```typescript
   // Applied during data fetching
   const parameterValuesBySlug = getParameterValuesBySlug(
     dashboard.parameters,
     parameterValues
   );
   
   // Applied to individual cards through parameter mappings
   ```

5. **UI Representation**:
   ```jsx
   <ParameterWidget
     parameter={parameter}
     value={parameterValues[parameter.id]}
     setValue={value => setParameterValue(parameter.id, value)}
   />
   ```

## Parameter Mapping

The parameter mapping system determines how dashboard parameters are connected to specific card elements:

### Mapping Types

1. **Dimension Mapping** (for structured queries):
   ```typescript
   {
     parameter_id: "abc123",
     card_id: 5,
     target: ["dimension", ["field", 123, null], {"stage-number": 0}]
   }
   ```

2. **Variable Mapping** (for native queries):
   ```typescript
   {
     parameter_id: "abc123",
     card_id: 5,
     target: ["variable", "my_variable"]
   }
   ```

3. **Text Tag Mapping** (for text/iframe cards):
   ```typescript
   {
     parameter_id: "abc123",
     target: ["text-tag", "tag_name"]
   }
   ```

### Mapping Selection UI

The mapping UI is implemented through:

- **DashCardParameterMapper**: Shows parameter mapping interface during dashboard editing
- **DashCardCardParameterMapper**: Handles mapping for individual cards (including multi-series cards)
- **MappingOptions**: Dynamically generated based on parameter type and card structure

### Mapping Option Generation

Mapping options are dynamically generated based on compatibility between parameters and card fields:

```typescript
// From mapping-options.ts
export function getParameterMappingOptions(
  question: Question | undefined,
  parameter: Parameter | null | undefined = null,
  card: Card,
  dashcard: BaseDashboardCard | null | undefined = null,
): ParameterMappingOption[] {
  // Different logic for virtual dashcards, action dashcards, etc.
  
  if (!isNative) {
    // For structured queries, find compatible columns
    const { query, columns } = getParameterColumns(question, parameter);
    // Generate options from columns
  } else {
    // For native queries, find compatible variables and dimensions
    options.push(
      ...legacyNativeQuery
        .variables(variableFilterForParameter(parameter))
        .map(buildVariableOption)
    );
  }
  
  return options;
}
```

## Parameter UI Components

The parameter UI system consists of several layers of components:

### Component Hierarchy

```
DashboardParameterList
  └── ParameterWidget
       ├── ParameterFieldSet
       └── ParameterValueWidget
            ├── ParameterDropdownWidget
            └── [Specific Widget Type]
                 ├── StringInputWidget
                 ├── NumberInputWidget
                 ├── DateWidget
                 ├── ParameterFieldWidget
                 └── Other specialized widgets
```

### Widget Selection

Widgets are selected based on parameter type:

```javascript
// Simplified example of widget selection logic
function getWidgetForParameter(parameter) {
  const type = getParameterType(parameter);
  
  if (type === "date") {
    return DateWidget;
  } else if (type === "string") {
    return StringInputWidget;
  } else if (type === "number") {
    return NumberInputWidget;
  } else if (type === "category") {
    return ParameterFieldWidget;
  }
  
  // Default fallback
  return StringInputWidget;
}
```

### Parameter Value Handling

Parameter values follow specific patterns:

1. **Value Storage**:
   - Single values are stored as primitives
   - Multiple values are stored as arrays
   - Empty values are stored as `null` or `undefined` with specific semantics

2. **Value Serialization**:
   ```javascript
   // Normalizing values for API requests
   export function normalizeParameterValue(type, value) {
     const fieldType = getParameterType(type);
     if (value === PULSE_PARAM_USE_DEFAULT) {
       return PULSE_PARAM_USE_DEFAULT;
     } else if (isParameterValueEmpty(value)) {
       return PULSE_PARAM_EMPTY;
     } else if (["string", "number"].includes(fieldType)) {
       return [].concat(value);
     } else {
       return value;
     }
   }
   ```

3. **Empty Value Handling**:
   ```javascript
   // UI-focused empty value detection
   export function parameterHasNoDisplayValue(value) {
     return (
       (!value && value !== 0) ||
       value === "" ||
       (Array.isArray(value) && value.length === 0)
     );
   }
   ```

## Parameter Application to Queries

When fetching data for dashboard cards, parameters are applied based on their mappings:

### Parameter Value Lookup

```javascript
// Retrieving values by slug for use in queries
export function getParameterValuesBySlug(parameters, parameterValuesById) {
  parameters = parameters ?? [];
  parameterValuesById = parameterValuesById ?? {};

  return Object.fromEntries(
    parameters.map((parameter) => [
      parameter.slug,
      parameter.value ?? parameterValuesById[parameter.id] ?? null,
    ]),
  );
}
```

### Parameter Type Filtering

Parameters apply differently based on their type:

```typescript
// Determining which fields a parameter can filter
export function columnFilterForParameter(
  query: Lib.Query,
  stageIndex: number,
  parameter: Parameter | string,
): (column: Lib.ColumnMetadata) => boolean {
  const type = getParameterType(parameter);

  switch (type) {
    case "date":
      return (column) => Lib.isTemporal(column);
    case "id":
      return (column) => Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
    case "category":
      return (column) => Lib.isCategory(column) || Lib.isBoolean(column);
    // ... other types
  }

  return () => false;
}
```

### Query Transformation

The actual application of parameters to queries happens in the data fetching process:

```javascript
// In data-fetching.ts (simplified for clarity)
async function fetchCardData(card, parameters, dashcard) {
  const dashcardData = {
    // ... other data
    parameter_mappings: dashcard.parameter_mappings || [],
  };
  
  // Apply parameters to create a transformed card query
  const transformedCard = applyParameters(
    card,
    dashcardData,
    parameterValuesBySlug
  );
  
  // Fetch data with the transformed query
  const result = await CardApi.query({ cardId, parameters, ... });
  
  return result;
}
```

## Cross-Filtering Implementation

Cross-filtering allows clicking on visualization elements to filter other cards in the dashboard:

### Cross-Filter Definition

```typescript
// Click behavior definition for cross-filtering
interface CrossFilterClickBehavior {
  type: "crossfilter";
  parameterMapping: {
    [parameterId: string]: {
      source: ClickBehaviorSource;
      target: ClickBehaviorTarget;
    };
  };
}
```

### Value Extraction and Application

When a user clicks on a visualization element, data is extracted and applied to parameters:

```typescript
// From click-behavior.ts
export function getDataFromClicked({
  extraData: { dashboard, parameterValuesBySlug = {}, userAttributes } = {},
  dimensions = [],
  data = [],
}) {
  // Extract data from clicked visualization element
  const column = [...dimensions, ...data]
    .filter((d) => d.column != null)
    .reduce((acc, { column, value }) => {
      // Build a map of column name to value/column
      if (!column) { return acc; }
      const name = column.name.toLowerCase();
      // ... other processing
      return { ...acc, [name]: { value, column } };
    }, {});

  // Process parameters and user attributes
  // ...
  
  return { column, parameter, parameterByName, parameterBySlug, userAttribute };
}
```

### Parameter Target Selection

The system determines valid targets for clicked values:

```typescript
export function getTargetsForDashboard(
  dashboard: Dashboard,
  dashcard: QuestionDashboardCard,
): Target[] {
  if (!dashboard.parameters) {
    return [];
  }

  return dashboard.parameters.map((parameter) => {
    const { type, id, name } = parameter;
    const filter = baseTypeFilterForParameterType(type);
    return {
      id,
      name,
      target: { type: "parameter", id },
      sourceFilters: {
        column: (c: DatasetColumn) =>
          notRelativeDateOrRange(parameter) && filter(c.base_type),
        parameter: (sourceParam) => {
          // Compatibility logic
          return parameter.type === sourceParam.type && !isSameParameter;
        },
        userAttribute: () => !parameter.type.startsWith("date"),
      },
    };
  });
}
```

### Cross-Filter UI

The cross-filter UI is implemented through:
- **ClickBehaviorSidebar**: For configuring click behaviors including cross-filtering
- **CrossfilterOptions.tsx**: UI for specifically configuring cross-filter behaviors

## Special Features

The parameter system includes several specialized features:

### Linked Parameters

Linked parameters allow one parameter's choices to be constrained by another parameter's value:

```javascript
// Determining if a parameter can be used for/with linked filters
export function canUseLinkedFilters(parameter) {
  const type = getParameterType(parameter);
  return TYPE_SUPPORTS_LINKED_FILTERS.includes(type);
}

export function usableAsLinkedFilter(parameter) {
  const type = getParameterType(parameter);
  return FIELD_FILTER_PARAMETER_TYPES.includes(type);
}
```

### Default Value Handling

Parameters can have default values which are applied in various scenarios:

```javascript
export function getParameterValue({
  parameter,
  values = {},
  defaultRequired = false,
  lastUsedParameterValue = null,
}) {
  const value = values?.[parameter.id];
  const useDefault = defaultRequired && parameter.required;

  return (
    lastUsedParameterValue ?? value ?? (useDefault ? parameter.default : null)
  );
}
```

### Auto-Connected Parameters

Dashboard parameters can be automatically connected to card fields:

```jsx
{shouldShowAutoConnectHint && (
  <Flex mt="sm" align="center" pos="absolute" bottom={-20} style={styles}>
    <Icon name="sparkles" size="16" />
    <Text
      component="span"
      ml="xs"
      fw="bold"
      fz="sm"
      lh={1}
      color="text-light"
    >{t`Auto-connected`}</Text>
  </Flex>
)}
```

## Conclusion

The Metabase dashboard parameter system follows a well-structured architecture that enables flexible filtering of visualizations. Key patterns include:

1. **Separation of Concerns**: Clear division between parameter definition, mapping, UI, and application
2. **Type-Based Compatibility**: Parameter types determine compatible fields and variables
3. **Flexible Mapping**: Support for multiple query types (structured, native) and card types (question, virtual)
4. **Interactive Behaviors**: Support for cross-filtering and linked parameters
5. **UI Specialization**: Different widget types based on parameter type
6. **Normalized Value Handling**: Consistent handling of parameter values across the system

This architecture enables powerful dashboard interactivity while maintaining clean separation between the dashboard layer and individual visualizations.