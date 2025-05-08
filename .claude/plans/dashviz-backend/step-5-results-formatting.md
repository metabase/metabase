# Results Formatting Analysis

## File Index
```
src/metabase/
├── query_processor/
│   └── middleware/
│       ├── visualization_settings.clj  # Manages visualization settings
│       └── process_userland_query.clj  # Query execution and metadata
├── formatter.clj                       # Core formatting utilities
├── formatter/
│   └── datetime.clj                    # Date/time formatting
└── channel/
    └── render/
        ├── body.clj                    # Rendering different visualization types
        ├── card.clj                    # Renders cards for dashboard/pulse
        └── table.clj                   # Table-specific rendering

frontend/src/metabase/
├── visualizations/
│   ├── index.ts                        # Visualization registry
│   ├── types/
│   │   └── visualization.ts            # Type definitions
│   ├── lib/
│   │   ├── settings.js                 # Settings computation
│   │   └── settings/
│   │       └── visualization.js        # Visualization-specific settings
│   └── components/
│       └── Visualization/
│           └── Visualization.tsx       # Main visualization component
```

## Summary

Metabase's visualization system is built on a multi-layered architecture that handles the transformation of raw query results into visualization-ready data. The system is designed to support various visualization types with type-specific formatting and configuration.

The backend (Clojure) is responsible for query execution, initial data formatting, and preparing data with appropriate visualization settings. The frontend (JavaScript/TypeScript) handles the final transformation and rendering of visualizations based on the data and settings provided.

The data flow follows these general steps:
1. Raw query results are processed by the query processor
2. Visualization settings are applied to the results in the backend
3. Data is formatted according to settings (numbers, dates, etc.)
4. Transformed data is sent to the frontend
5. Frontend applies additional transformations specific to visualization types
6. Data is rendered according to the visualization component specifications

## Dependencies

### Upstream Dependencies
- **Query Processor** - Provides raw query results
- **Database Schema** - Defines data types and structure
- **Field Metadata** - Provides information about fields for formatting
- **Settings System** - Provides global formatting defaults

### Downstream Dependencies
- **Frontend Visualization Components** - Consume formatted data
- **Dashboard Rendering** - Uses formatted visualizations
- **Pulse/Subscription System** - Uses rendered visualizations
- **Exports (CSV, Excel, etc.)** - Use formatted data

## Key Data Structures

### Visualization Settings
```clojure
;; Example of visualization settings structure
{::mb.viz/column-settings {
  {::mb.viz/field-id 123} {::mb.viz/column-title "Custom Title"
                          ::mb.viz/number-style "currency"
                          ::mb.viz/currency "USD"}
}
::mb.viz/global-column-settings {...}
}
```

### Formatted Data
```clojure
;; Example of formatted data structure with column metadata
{:cols [{:name "date" :display_name "Date" :base_type :type/Date}
        {:name "count" :display_name "Count" :base_type :type/Integer}]
 :rows [["2023-01-01" 42]
        ["2023-01-02" 37]]
 :viz-settings {...}}
```

### Result Transformations
```typescript
// Example of transformed series data structure
type TransformedSeries = {
  series: Array<{
    card: Card,
    data: {
      cols: Array<RemappingHydratedDatasetColumn>,
      rows: Array<Array<any>>
    }
  }>,
  visualization: VisualizationDefinition
}
```

## Core Functions

### Backend Formatting

1. **`update-viz-settings`** (visualization_settings.clj)
   - Merges card-level and field-level visualization settings
   - Manages column-specific visualization properties
   - Integrates global formatting settings

2. **`number-formatter`** (formatter.clj)
   - Applies number formatting based on visualization settings
   - Handles currency, percentages, decimal places, etc.
   - Applies locale-specific formatting

3. **`make-temporal-str-formatter`** (formatter.clj)
   - Creates formatters for date/time values
   - Handles different temporal granularities
   - Applies locale-specific date formatting

4. **`render`** (body.clj) 
   - Multi-method for rendering different visualization types
   - Transforms data according to visualization type
   - Prepares data for frontend consumption or email/exports

### Frontend Transformation

1. **`getVisualizationTransformed`** (index.ts)
   - Transforms raw series data for specific visualization types
   - Recursively applies visualization-specific transformations
   - Handles remapping of columns

2. **`getComputedSettingsForSeries`** (visualization.js)
   - Computes settings for a visualization series
   - Combines stored settings with defaults
   - Normalizes column settings

3. **`extractRemappedColumns`** (index.ts)
   - Processes remapped columns in datasets
   - Builds mapping relationships between original and remapped values
   - Ensures proper data representation

## Configuration Points

1. **Visualization Settings**
   - Card-level settings stored in `visualization_settings` field
   - Column-specific settings in `column_settings` subfield
   - Global default settings from application configuration

2. **Number Formatting**
   - Decimal and thousand separators
   - Currency symbols and formats
   - Percentage display options
   - Precision/decimal places

3. **Date/Time Formatting**
   - Date/time format patterns
   - Timezone handling
   - Relative time display options

4. **Visualization-Specific Settings**
   - Each visualization type has its own set of configurable options
   - Color schemes and palettes
   - Axis configuration
   - Display options (legends, labels, etc.)

## Enterprise Extensions

The codebase doesn't explicitly show enterprise-specific extensions for visualization formatting, but likely includes:

1. **Enhanced Export Options**
   - Additional formatting for exports in enterprise version
   - Custom branding for exports

2. **Advanced Dashboard Embedding**
   - Special formatting for embedded visualizations
   - White-labeling options

3. **Sandboxing**
   - Row-level security may affect how data is displayed
   - User attributes may influence visualization settings

## Testing Approach

1. **Unit Testing**
   - Tests for individual formatting functions
   - Verification of settings computation
   - Date/time formatting tests

2. **Integration Testing**
   - Tests for entire visualization rendering pipeline
   - Verification of data transformations

3. **Visual Testing**
   - Frontend tests for rendering correctness
   - Snapshot testing for visualization components

## Error Handling

1. **Query Errors**
   - Failed queries are captured in `save-failed-query-execution!`
   - Error information is stored with the query execution

2. **Rendering Errors**
   - Visualization components have error boundaries
   - Fallback to simpler visualizations when errors occur

3. **Data Validation**
   - `checkRenderable` method validates data for specific visualization types
   - Visualization error states for incompatible data

4. **Fallback Formatting**
   - Default formatting when settings are invalid
   - Reasonable defaults for missing configuration