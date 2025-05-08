# Parameter Models and Validation Analysis

## File Index
```
src/metabase/
├── models/
│   ├── params.clj                      # Main parameter model and utility functions
│   ├── parameter_card.clj              # Model for parameter card relationships
│   ├── user_parameter_value.clj        # Model for storing user-specific parameter values
│   └── params/
│       ├── chain_filter.clj            # Chain filter parameter value provider
│       ├── custom_values.clj           # Custom parameter values provider
│       ├── field_values.clj            # Field values parameter provider
│       └── shared.cljc                 # Shared parameter utilities
├── query_processor/middleware/
│   └── parameters.clj                  # Middleware for parameter substitution
├── driver/common/
│   └── parameters.clj                  # Common parameter handling for drivers
├── lib/schema/
│   └── parameter.cljc                  # MLv2 parameter schema definitions
└── util/malli/
    └── schema.clj                      # Parameter validation schemas
```

## Summary

Metabase's parameter system is a flexible mechanism that allows users to create interactive dashboards and cards by adding parameter widgets that filter data. The system has several key components:

1. **Parameter Definition**: Parameters are defined on dashboards or cards with specific types (e.g., text, number, date) and widget types (e.g., category, id, date/range).

2. **Parameter Mapping**: Parameters are mapped to specific fields or template tags in queries. This mapping connects the parameter to the actual data.

3. **Parameter Values**: The system provides various ways to populate parameter values:
   - Chain filters: Values based on related fields
   - Field values: Values from a field's distinct values
   - Custom values: Static lists or values from a card

4. **Parameter Validation**: Schemas and validation functions ensure parameters conform to expected types and formats.

5. **Parameter Storage**: User-specific parameter values are stored to allow personalized dashboard experiences.

The parameter system acts as a bridge between the user interface and the query execution, enabling dynamic filtering without requiring users to write queries.

## Dependencies

### Upstream Dependencies
- **Schema Validation**: Uses `metabase.util.malli.schema` for parameter data validation
- **Field Model**: Relies on field metadata and values from `metabase.models.field` and `metabase.models.field-values`
- **Query Processor**: Uses `metabase.query-processor` to execute parameter value queries
- **Legacy MBQL**: Uses `metabase.legacy-mbql` for query manipulation

### Downstream Dependencies
- **API Endpoints**: Parameter models power dashboard and card parameter endpoints
- **Query Processing**: The query processor uses parameters for query modification
- **Rendering**: UI components rely on parameter values for rendering filters
- **Embedding**: Parameter functionality is exposed through embedding APIs

## Key Data Structures

### Parameter Schema
```clojure
(def Parameter
  [:map
   [:id   NonBlankString]
   [:type keyword-or-non-blank-str-malli]
   [:values_source_type   {:optional true} [:enum "static-list" "card" nil]]
   [:values_source_config {:optional true} ValuesSourceConfig]
   [:slug                 {:optional true} :string]
   [:name                 {:optional true} :string]
   [:default              {:optional true} :any]
   [:sectionId            {:optional true} NonBlankString]
   [:temporal_units       {:optional true} [:sequential ::lib.schema.temporal-bucketing/unit]]])
```

### Parameter Mapping Schema
```clojure
(def ParameterMapping
  [:map 
   [:parameter_id NonBlankString]
   [:target :any]
   [:card_id {:optional true} PositiveInt]])
```

### Parameter Types
The system defines various parameter types in `metabase.lib.schema.parameter/types`, including:
- Basic types: `:number`, `:text`, `:date`, `:boolean`
- Special types: `:id`, `:category`, `:location/*`
- Date range types: `:date/range`, `:date/month-year`, etc.
- Operator types: `:number/=`, `:string/contains`, etc.

### Parameter Values Source Types
- `static-list`: Values defined directly in the parameter configuration
- `card`: Values retrieved from a saved question (card)
- Field values: Values retrieved from distinct field values

## Core Functions

### Parameter Definition and Validation
- `assert-valid-parameters`: Validates parameter structure
- `assert-valid-parameter-mappings`: Validates parameter mappings

### Parameter Value Resolution
- `param-values`: Hydrates parameters with their values
- `param-fields`: Hydrates parameters with their field metadata
- `field-id->field-values-for-current-user`: Retrieves field values for parameters

### Parameter Field Resolution
- `param-target->field-clause`: Parses a parameter target to get the field it references
- `dashcards->param-field-ids`: Extracts field IDs from dashboard card parameters
- `card->template-tag-field-ids`: Extracts field IDs from card template tags

### Parameter Value Providers
- `chain-filter`: Provides parameter values filtered by other parameter selections
- `chain-filter-search`: Provides searchable parameter values
- `parameter->values`: Gets values for parameters with custom value sources
- `values-from-card`: Retrieves values from a card for parameters

### Parameter Storage
- `store!`: Stores user-specific parameter values
- `batched-upsert!`: Batch updates user parameter values

### Parameter Processing
- `substitute-parameters`: Middleware function that substitutes parameters into queries
- `expand-parameters`: Expands parameter references into actual query constraints

## Configuration Points

1. **Parameter Definition**:
   - Parameter types and widget types
   - Parameter source configuration (static list, card)
   - Default values

2. **Parameter Behavior**:
   - `*ignore-current-user-perms-and-return-all-field-values*`: Controls whether to bypass user permissions for field values
   - `*enable-reverse-joins*`: Controls whether chain filters can use reverse joins
   - `*max-rows*`: Maximum number of parameter values to return from a card

3. **Parameter Caching**:
   - Field values caching through `field-values/get-or-create-full-field-values!`
   - Advanced field values caching with hash-based keys

4. **Parameter Value Display**:
   - Human-readable value remapping
   - Field->Field remapping for display purposes

## Enterprise Extensions

The enterprise version extends the parameter system with additional functionality:

1. **Dashboard Subscription Filters**:
   - `the-parameters`: Blends parameters from dashboard subscriptions and the dashboard itself
   - Allows for filtered dashboard subscriptions via email or Slack

2. **Sandboxed Parameters**:
   - Enterprise code extends the parameter system to respect data sandboxing rules
   - Filters parameter values based on user's row-level permissions

## Testing Approach

The parameter system is tested through:

1. **Unit Tests**:
   - Testing individual functions for parameter validation and processing
   - Testing parameter value retrieval and formatting

2. **Integration Tests**:
   - Testing parameter substitution in queries
   - Testing parameter value resolution with different constraints

3. **End-to-End Tests**:
   - Cypress tests for parameter widgets on dashboards
   - Tests for parameter search functionality

## Error Handling

The parameter system includes several error handling mechanisms:

1. **Validation Errors**:
   - `assert-valid-parameters`: Throws exceptions for invalid parameter structures
   - `assert-valid-parameter-mappings`: Validates parameter mappings

2. **Query Errors**:
   - Chain filter catches errors when executing parameter value queries
   - Provides detailed error messages for debugging

3. **Permission Errors**:
   - Checks user permissions before returning field values
   - Validates access to cards used as parameter value sources

4. **Parameter Type Compatibility**:
   - Validates that parameter types are compatible with their targets
   - Controls which parameter types can be used with which widget types