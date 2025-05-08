# Parameter Resolution in Queries Analysis

## File Index
```
src/metabase/
├── query_processor/
│   ├── middleware/
│   │   ├── parameters.clj                      # Main parameter substitution middleware
│   │   ├── parameters/
│   │   │   ├── mbql.clj                        # Parameter handling for MBQL queries
│   │   │   └── native.clj                      # Parameter handling for native queries
│   │   └── process_userland_query.clj          # Process queries with parameters
│   └── card.clj                                # Card query processing including parameters
├── driver/
│   └── common/
│       └── parameters/
│           ├── values.clj                      # Parameter value extraction and transformation
│           ├── operators.clj                   # Operator parameter handling
│           ├── dates.clj                       # Date parameter handling
│           └── parse.clj                       # Parameter string parsing
├── models/
│   ├── dashboard_card.clj                      # Parameter mappings in dashboard cards
│   └── dashboard.clj                           # Dashboard parameter definition storage
└── api/
    ├── dashboard.clj                           # API endpoints for dashboard parameters
    └── dataset.clj                             # Dataset API for parameterized queries
```

## Summary

The parameter resolution system in Metabase provides a mechanism to substitute user-provided values into queries at runtime. This enables dynamic filtering, comparisons, and data segmentation without requiring modifications to the underlying query structure. 

There are two main types of parameter resolution:

1. **MBQL Parameter Resolution**: Used for structured queries where parameters are applied by generating filter clauses.
2. **Native Parameter Resolution**: Used for raw SQL queries where parameters are directly substituted into the query text with proper escaping.

Parameters flow from dashboard or card UI definitions to the query processor middleware, which transforms them into appropriate filter clauses (for MBQL) or text substitutions (for native queries) before execution.

## Dependencies

### Upstream Dependencies
- **User Interface**: Parameters are defined in dashboards, cards, or provided during query execution
- **Dashboard Parameter Mappings**: Connect dashboard filters to card fields
- **Parameter Definitions**: Define the type, target, and constraints for parameters

### Downstream Dependencies
- **Query Processor**: Executes queries after parameter resolution
- **Database Drivers**: Prepare and execute the parameterized queries
- **Visualization System**: Displays results based on applied parameters
- **Caching Layer**: Caches based on parameter values

## Key Data Structures

### Parameter Definition
```clojure
{:type      :text/:number/:date/:category/:dimension  ; Parameter type
 :target    [<target-type> <field-reference>]         ; What field this parameter applies to
 :value     <parameter-value>                         ; The value to filter by
 :default   <default-value>                           ; Optional default if no value provided
 :options   <parameter-options>                       ; Optional configuration options
 :required  true/false}                               ; Whether parameter is required
```

### Parameter Mapping
```clojure
{:parameter_id <dashboard-parameter-id>              ; ID of the dashboard parameter
 :target       [<target-type> <field-reference>]}    ; Field or variable reference in the card
```

### Field Filter
```clojure
{:field <field-metadata>                             ; Field being filtered
 :value {:type <parameter-type>                      ; Type of parameter value
         :value <parameter-value>}}                  ; Actual filter value
```

## Core Functions

### Parameter Substitution

1. **`metabase.query-processor.middleware.parameters/substitute-parameters`**: The main entry point for parameter substitution.
   - Transforms a query with parameters into a fully formed query with all parameters replaced.

2. **`metabase.query-processor.middleware.parameters/expand-parameters`**: 
   - Recursively processes and expands parameters throughout a query.

3. **`metabase.query-processor.middleware.parameters.mbql/expand`**:
   - Expands parameters for MBQL queries by adding filter clauses.

4. **`metabase.query-processor.middleware.parameters.native/expand-inner`**:
   - Driver-specific parameter expansion for native queries.

### Parameter Value Processing

1. **`metabase.driver.common.parameters.values/value-for-tag`**:
   - Extracts and parses a parameter value for a given tag.

2. **`metabase.driver.common.parameters.values/parse-value-for-type`**:
   - Converts parameter string values to the appropriate type (numbers, dates, etc.).

3. **`metabase.driver.common.parameters.values/query->params-map`**:
   - Builds a complete parameter map from query template tags and parameter values.

### Filter Generation

1. **`metabase.query-processor.middleware.parameters.mbql/build-filter-clause`**:
   - Constructs filter clauses from parameters for MBQL queries.

2. **`metabase.driver.common.parameters.operators/to-clause`**:
   - Converts operator-style parameters to MBQL filter clauses.

3. **`metabase.driver.common.parameters.dates/date-string->filter`**:
   - Generates filter clauses for date parameters.

## Configuration Points

1. **Parameter Types**:
   - Text, Number, Date, Category, Dimension
   - Each with specific parsing and handling logic

2. **Date Parameter Formats**:
   - Relative dates: "yesterday", "past30days", "thisweek", etc.
   - Absolute dates: "2023-01-01", "2023-01-01~2023-02-01"
   - Exclusions: "exclude-days-Mon-Wed", etc.

3. **Operator Parameters**:
   - `equals`, `not-equals`, `contains`, `starts-with`, etc.
   - Numerical operators: `>`, `<`, `between`, etc.

4. **Field Mappings**:
   - Dashboard parameter to card field mappings
   - Variable to field mappings in queries

## Enterprise Extensions

While not directly mentioned in the code examined, enterprise features likely include:

1. **Advanced Parameter Types**: Possibly more sophisticated parameter types
2. **Parameter Permissions**: Controlling who can see or modify parameters
3. **Sandboxing with Parameters**: Using parameters for data sandboxing (row-level restrictions)
4. **Cached Parameter Values**: Special handling for parameters in cached queries

## Testing Approach

The code reveals several test files that verify parameter resolution:

1. **Unit Tests**:
   - `parameters_test.clj`: Tests parameter substitution functionality
   - `dates_test.clj`: Tests date parameter handling
   - `operators_test.clj`: Tests operator parameter handling
   - `values_test.clj`: Tests parameter value extraction and parsing

2. **Test Patterns**:
   - Parameter expansion in MBQL queries
   - Parameter expansion in native queries
   - Parameter expansion in nested queries
   - Multiple parameters in dashboards
   - Parameter default values
   - Required vs. optional parameters

## Error Handling

1. **Missing Required Parameters**:
   - Throws exception when required parameters are missing values

2. **Invalid Parameter Values**:
   - Type validation for parameter values
   - Range validation for numeric parameters
   - Format validation for date parameters

3. **Parameter Resolution Errors**:
   - Clear error messages with parameter context
   - Special error types for parameter validation
   - Structured error responses in API endpoints

4. **Graceful Degradation**:
   - Optional parameters can be replaced with default behavior (e.g., "1 = 1")
   - Default values can be provided at multiple levels