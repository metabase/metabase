# Dashboard Query Processing Analysis

## File Index
```
src/metabase/query_processor/
├── dashboard.clj                  # Core dashboard query processing
├── card.clj                       # Card query processing (used by dashboard)
└── middleware/
    ├── parameters.clj             # Parameter substitution middleware
    │   ├── mbql.clj               # Parameter handling for MBQL queries
    │   └── native.clj             # Parameter handling for native queries
    ├── catch_exceptions.clj       # Error handling middleware
    └── process_userland_query.clj # Handles user-initiated queries
```

## Summary

The Dashboard Query Processing system in Metabase is responsible for executing queries for cards in a dashboard context, handling parameter substitution, and ensuring proper permissions and validation. The core function is `process-query-for-dashcard` in `query_processor/dashboard.clj`, which prepares and executes a query for a specific card within a dashboard, resolving parameters and applying constraints.

The system is designed to maintain the relationship between dashboards, cards, and parameters, ensuring that dashboard filters properly affect the relevant cards through parameter mappings. It handles both MBQL and native queries, applying parameters differently depending on the query type.

## Dependencies

### Upstream Dependencies
- **User Interface**: The dashboard UI sends requests with parameter values
- **API Layer**: Routes requests to the query processor with dashboard context
- **Permission System**: Verifies user access to dashboards and cards

### Downstream Dependencies
- **Card Query Processor**: Used to execute the actual card queries
- **Database Connectors**: Execute the final transformed queries against databases
- **Parameter Resolution System**: Maps dashboard parameters to card parameters

## Key Data Structures

1. **Dashboard Parameters**: 
   ```clojure
   {:id "parameter_id"
    :type "parameter_type"  ;; e.g. "category", "date/range", etc.
    :target [:dimension [:field id nil]]  ;; Where to apply the parameter
    :value "parameter_value"  ;; The actual value from user input
    :default "default_value"  ;; Optional default value
   }
   ```

2. **Parameter Mappings**:
   ```clojure
   {:parameter_id "dashboard_parameter_id"
    :card_id card_id
    :target [:dimension [:field id nil]]  ;; The field in the card query to filter
   }
   ```

3. **DashboardCard**:
   ```clojure
   {:id dashcard_id
    :dashboard_id dashboard_id
    :card_id card_id
    :parameter_mappings [...]  ;; List of parameter mappings
   }
   ```

## Core Functions

1. **`process-query-for-dashcard`**: The main entry point for executing a query in the dashboard context. It:
   - Validates permissions and relationships
   - Resolves parameters for the specific dashcard
   - Sets up query context
   - Processes the query with appropriate middleware

2. **`resolve-params-for-query`**: Resolves dashboard parameters for a specific card:
   - Normalizes parameters
   - Matches parameters to mappings
   - Validates parameter types
   - Merges default values
   - Returns parameters prepared for query execution

3. **`resolve-param-for-card`**: Matches a single parameter to a card:
   - Finds the parameter in the dashboard
   - Finds the mapping for the specific card
   - Validates the parameter type
   - Prepares the parameter for query execution

4. **Parameter Substitution Pipeline**:
   - For MBQL queries: adds filter clauses or modifies temporal units
   - For Native queries: replaces template tags with values and SQL fragments

## Configuration Points

1. **Parameter Defaults**:
   - Dashboard-level default values
   - Card-level default values (which take precedence)
   - User's stored parameter values

2. **Query Constraints**:
   - Maximum result size
   - Cache settings
   - Query timeout settings

3. **Parameter Type Validation**:
   - Ensures parameters match expected types
   - Validates mappings between dashboard and card parameters
   - Ensures proper field types for parameters

## Enterprise Extensions

The code contains an enterprise extension point in the card query processor:

```clojure
(defenterprise cache-strategy
  "Returns cache strategy for a card. In EE, this checks the hierarchy for the card, dashboard, or
  database (in that order). In OSS returns root configuration, taking card's :cache_invalidated_at
  into consideration."
  metabase-enterprise.cache.strategies
  [card _dashboard-id]
  (cache-config/card-strategy (cache-config/root-strategy) card))
```

This indicates that Enterprise Edition has enhanced caching capabilities for dashboard queries, allowing for more sophisticated caching strategies based on hierarchical settings.

## Testing Approach

Testing for dashboard query processing is split between:

1. **Unit Tests** (`dashboard_test.clj`):
   - Parameter resolution
   - Card/Dashcard validation
   - Default value precedence
   - Parameter type validation
   - Filter application

2. **Integration Tests** (in API tests):
   - End-to-end parameter application
   - Dashboard filter interactions
   - Permission checks

The testing approach emphasizes checking parameter handling across different scenarios, including:
- Different parameter types
- Multiple parameters on the same card
- Parameters with default values
- Multiple cards with different parameter mappings

## Error Handling

Error handling in dashboard query processing occurs at multiple levels:

1. **Parameter Validation**:
   - Throws exceptions for invalid parameter types
   - Validates parameter existence
   - Ensures parameter mappings are valid

2. **Card and Dashboard Relationship Validation**:
   - Verifies card belongs to dashboard
   - Checks dashcard existence
   - Validates parameter mappings exist

3. **Exception Middleware**:
   - The `catch-exceptions` middleware formats errors into user-friendly responses
   - Includes query context for debugging
   - Categorizes errors by type
   - Handles SQL exceptions specifically

4. **Security Checks**:
   - Verifies proper permissions before execution
   - Prevents unauthorized access to data

## Query Execution Pipeline

The dashboard query execution follows this flow:

1. **Request Handling**: API receives request with dashboard ID, card ID, dashcard ID, and parameters
2. **Permission Check**: Verify user has access to dashboard and card
3. **Relationship Validation**: Ensure card belongs to dashboard
4. **Parameter Resolution**: 
   - Match dashboard parameters to card parameters
   - Apply default values where needed
   - Validate parameter types
5. **Query Transformation**:
   - Add filter clauses based on parameters
   - Modify temporal units if needed
   - Prepare native queries with parameter substitution
6. **Card Query Execution**:
   - Execute the prepared query against the database
   - Apply constraints (limits, etc.)
7. **Result Handling**: Return formatted results for the dashboard