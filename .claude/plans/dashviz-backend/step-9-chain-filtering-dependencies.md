# Chain Filtering and Dependencies Analysis

## File Index
```
src/metabase/models/params/
├── chain_filter.clj             # Main chain filter implementation
├── chain_filter/
│   └── dedupe_joins.clj         # Helper for optimizing joins in chain filter queries
├── field_values.clj             # Field values fetching and caching support
├── shared.cljc                  # Shared utilities for parameter handling
└── custom_values.clj            # Custom parameter values support

enterprise/backend/src/metabase_enterprise/sandbox/models/params/
└── field_values.clj             # Enterprise extensions for sandboxing field values

test/metabase/models/params/
├── chain_filter_test.clj        # Tests for chain filter functionality
└── chain_filter/
    └── dedupe_joins_test.clj    # Tests for join deduplication

enterprise/backend/test/metabase_enterprise/sandbox/models/params/
└── chain_filter_test.clj        # Enterprise-specific chain filter tests
```

## Summary

Chain filtering is a crucial feature in Metabase's dashboard parameter system that enables dependent parameters, where the values of one parameter depend on the selections made in other parameters. It powers the API endpoints that fetch available parameter values based on other parameter constraints.

Key concepts include:
- **Parameter dependency**: The ability for one parameter's available values to be filtered based on selections in other parameters
- **Chain filter queries**: MBQL queries that fetch filtered parameter values from the database
- **Field remapping**: Support for human-readable values in parameters
- **Value caching**: Performance optimization via caching of field values
- **Joins management**: Automated discovery and optimization of table joins required for cross-table parameter dependencies

The main functionality is divided into two primary operations:
1. `chain-filter`: Fetches possible values of a field constrained by other field values
2. `chain-filter-search`: Similar to chain-filter but adds a text search constraint

## Dependencies

### Upstream Dependencies
- **Query Processor**: Executes MBQL queries to fetch filtered parameter values
- **Field Values**: Provides caching of field values
- **MBQL Library**: Constructs and manipulates MBQL queries
- **Database Metadata**: Uses database schema to determine relationships between tables
- **Permissions System**: Ensures users only see values they have permission to access

### Downstream Dependencies
- **Dashboard API**: Uses chain filtering to populate parameter widgets
- **Parameter Widgets**: UI components that display parameter values
- **Dashboard Subscriptions**: Used when generating dashboard reports with parameters
- **Embedding API**: Supports parameters in embedded dashboards
- **Actions**: Provides valid values for action parameters

## Key Data Structures

### `Constraint` Schema
```clojure
[:map
 [:field-id ms/PositiveInt]
 [:op :keyword]
 [:value :any]
 [:options {:optional true} [:maybe map?]]]
```
Represents a constraint on a field, consisting of a field ID, an operation (like `=`, `contains`, etc.), a value, and optional settings.

### Join Information
```clojure
{:lhs {:table <id>, :field <id>}, :rhs {:table <id>, :field <id>}}
```
Describes join information between tables, with left-hand side (lhs) and right-hand side (rhs) table and field IDs.

### Field Values Result
```clojure
{:values [[value] or [value human-readable-value]], 
 :has_more_values boolean}
```
The format returned by chain filter functions, containing values (either single values or value/human-readable pairs) and a flag indicating if more values exist.

## Core Functions

### `chain-filter`
```clojure
(defn chain-filter [field-id constraints & options]
  "Fetch possible values of Field with field-id by restricting the possible 
   values to rows that match values of other Fields in the constraints map."
  ...)
```
The main function that returns possible values of a field filtered by constraints from other fields.

### `chain-filter-search`
```clojure
(defn chain-filter-search [field-id constraints query & options]
  "Version of chain-filter that adds a constraint to only return values 
   containing the search string."
  ...)
```
Extends chain-filter with text search capability.

### `chain-filter-mbql-query`
```clojure
(defn- chain-filter-mbql-query [field-id constraints {:keys [original-field-id limit]}]
  "Generate the MBQL query powering chain-filter."
  ...)
```
Builds the MBQL query that will fetch constrained field values.

### `find-joins`
```clojure
(defn find-joins [database-id source-table-id other-table-id]
  "Find the joins needed to make fields in a table accessible in a query."
  ...)
```
Discovers the necessary joins between tables to support cross-table filtering.

### `traverse-graph`
```clojure
(defn- traverse-graph [graph start end max-depth]
  "A breadth first traversal of graph to find paths between tables."
  ...)
```
Graph traversal algorithm to find paths between tables (for determining joins).

### `dedupe-joins`
```clojure
(defn dedupe-joins [source-id in-joins keep-ids]
  "Remove unnecessary joins from a collection of joins."
  ...)
```
Optimizes the set of joins needed by removing redundant ones.

## Configuration Points

1. **Dynamic Variables**
   - `*enable-reverse-joins*`: Controls whether to use reverse relationships in joins (default: true)
   - `max-traversal-depth`: Maximum depth for graph traversal when finding joins (default: 5)
   - `max-results`: Maximum number of results to return (default: 1000)

2. **Caching Configuration**
   - `find-joins-cache-duration-ms`: Duration to cache join information (default: 5 minutes)
   - Field values caching via `field-values` system

3. **Query Behavior**
   - Support for different field remapping types (human-readable values, FK->PK, etc.)
   - Configuration for handling temporal fields differently
   - Case-sensitive and case-insensitive text searches

## Enterprise Extensions

Enterprise extensions focus on integrating sandboxing with chain filtering:

1. **Sandboxed Field Values**
   - `field-is-sandboxed?`: Checks if a field is subject to sandboxing
   - `hash-input-for-sandbox`: Provides sandbox-specific cache keys
   - Custom field values fetching that respects row-level security

2. **GTAP (Group Table Access Policy) Integration**
   - Integration with table-level access policies
   - User attribute-based filtering of parameter values
   - Enhanced caching that respects user-specific permissions

## Testing Approach

The testing approach is comprehensive, covering:

1. **Basic Functionality**
   - Simple chain filter tests (e.g., "Show me expensive restaurants")
   - Cross-table filtering (e.g., "Show me categories with expensive restaurants")
   - Case sensitivity and text search

2. **Advanced Features**
   - Multi-hop joins (e.g., 4-level joins in the airports dataset)
   - Multiple values for parameters
   - Human-readable value remapping

3. **Graph Theory**
   - Breadth-first search algorithm tests
   - Join path discovery
   - Join deduplication

4. **Edge Cases**
   - Handling of nil and empty values
   - Backwards joins
   - Time interval parameters

5. **Enterprise Features**
   - Sandboxed field values tests
   - GTAP integration tests

## Error Handling

Error handling is implemented at multiple levels:

1. **Query Construction**
   - Safe traversal of join graphs with depth limits
   - Graceful handling of missing relationships
   - Validation of field types for searching (e.g., text fields only)

2. **Query Execution**
   - Rich error information when chain filter queries fail
   - Permission checking before query execution
   - Wrapping of errors with contextual information

3. **Value Processing**
   - Fallbacks for formatting errors
   - Handling of missing or nil values
   - Error recovery in the caching layer

4. **Specific Error Cases**
   - Field does not exist (404 error)
   - Cannot search non-Text fields (400 error)
   - Query execution errors with explanatory messages

## Chain Filtering Execution Flow

1. **Parameter Request**
   - Dashboard requests parameter values for a field
   - Request includes constraints from other parameters

2. **Permission Check**
   - Verify user has permissions to access the field
   - Apply sandboxing rules if in Enterprise edition

3. **Cache Check**
   - Check if field values are cached and can be used
   - Generate appropriate cache key based on constraints and user context

4. **Join Discovery**
   - If cross-table filtering is needed, find necessary joins
   - Optimize joins to minimize query complexity

5. **Query Construction**
   - Build MBQL query with necessary joins and filters
   - Apply remapping logic if the field has remappings

6. **Query Execution**
   - Execute the query via query processor
   - Apply any post-processing (like limiting results)

7. **Result Formatting**
   - Format values (single values or value/display-value pairs)
   - Add metadata like has_more_values flag

8. **Cache Update**
   - Store results in field values cache if appropriate
   - Set expiration based on configuration