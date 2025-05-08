# Metabase Backend Visualization System: Comprehensive Reference

This document serves as a complete reference for the Metabase backend visualization system, consolidating analysis from all component areas. This reference provides an information-dense overview of the architecture, data flows, and systems that power Metabase's visualization capabilities.

## Core Data Models

### Dashboard Model

**File Structure**:
```
src/metabase/models/
├── dashboard.clj                  # Primary dashboard model
├── revision.clj                   # Revision tracking for dashboards
└── collection.clj                 # Collections containing dashboards
test/metabase/models/
└── dashboard_test.clj             # Dashboard model tests
```

**Primary Responsibilities**:
- Container for organizing visualizations
- Stores metadata, parameters, and layout information
- Manages revision history and permissions

**Key Data Structures**:
- `Dashboard`: Record with `:id`, `:name`, `:description`, `:collection_id`, `:parameters`
- `DashboardParameter`: Dashboard-level filter definition with type and values
- `Revision`: History tracking for dashboard changes

**Core Functions**:
- `dashboard/read-dashboard`: Retrieves dashboard with associated cards and tabs
- `dashboard/create-dashboard!`: Creates a new dashboard with parameters and cards
- `dashboard/update-dashboard!`: Updates dashboard properties and layout
- `dashboard/add-cards!`: Adds multiple cards to a dashboard
- `dashboard/save-card-parameters!`: Updates parameter mappings for cards

**Dependencies**:
- Upstream: Collections system, Permissions system
- Downstream: Dashboard API, Pulse system

### Card Model

**File Structure**:
```
src/metabase/models/
├── card.clj                       # Card (question) model
├── query.clj                      # Query definitions
├── query_cache.clj                # Caching for card queries
└── visualization_settings.clj     # Visualization configuration
test/metabase/models/
└── card_test.clj                  # Card model tests
```

**Primary Responsibilities**:
- Represents a question/visualization with a dataset query
- Stores visualization settings and metadata
- Manages execution options and result caching

**Key Data Structures**:
- `Card`: Record with `:id`, `:name`, `:dataset_query`, `:visualization_settings`, `:display`
- `VisualizationSettings`: Map of visualization configuration options
- `DatasetQuery`: Map containing `:type`, `:database`, `:native`/`:query` for execution

**Core Functions**:
- `card/read-card`: Retrieves card with visualization settings
- `card/create-card!`: Creates a new visualization
- `card/execute-card`: Executes a card's query with parameters
- `card/card->dataset`: Converts card for use as source in other queries

**Dependencies**:
- Upstream: Query Processor, Collections
- Downstream: Dashboard Card, Card API, Pulse Rendering

### Dashboard Card and Series Models

**File Structure**:
```
src/metabase/models/
├── dashboard_card.clj             # Dashboard card junction model
├── dashboard_card_series.clj      # Multi-series support
└── parameter_card_mapping.clj     # Parameter to card mappings
test/metabase/models/
├── dashboard_card_test.clj        # Dashboard card tests
└── dashboard_card_series_test.clj # Series tests
```

**Primary Responsibilities**:
- Connects cards to dashboards with position information
- Manages multi-series visualization configurations
- Stores card-specific visualization settings

**Key Data Structures**:
- `DashboardCard`: Record with `:dashboard_id`, `:card_id`, `:row`, `:col`, `:size_x`, `:size_y`, `:parameter_mappings`
- `DashboardCardSeries`: Record connecting additional series to a dashboard card
- `ParameterMapping`: Maps dashboard parameters to specific card fields

**Core Functions**:
- `dashboard-card/create-dashboard-card!`: Adds a card to a dashboard
- `dashboard-card/update-dashboard-card!`: Updates position or settings
- `dashboard-card/delete-dashboard-card!`: Removes card from dashboard
- `dashboard-card/retrieve-dashboard-card`: Gets card with series and parameters

**Dependencies**:
- Upstream: Dashboard model, Card model
- Downstream: Dashboard API, Parameter system

### Dashboard Tabs

**File Structure**:
```
src/metabase/models/
├── dashboard_tab.clj              # Dashboard tabs model
└── dashboard_tab_card.clj         # Card to tab association
test/metabase/models/
└── dashboard_tab_test.clj         # Tab model tests
```

**Primary Responsibilities**:
- Organizes dashboard cards into tabs
- Manages tab ordering and visibility
- Provides navigation structure for dashboards

**Key Data Structures**:
- `DashboardTab`: Record with `:dashboard_id`, `:name`, `:position`
- Tab-to-card associations via dashboard cards' `:dashboard_tab_id`

**Core Functions**:
- `dashboard-tab/create-tab!`: Creates a new tab on a dashboard
- `dashboard-tab/update-tab!`: Updates tab properties
- `dashboard-tab/delete-tab!`: Removes a tab and handles orphaned cards
- `dashboard-tab/move-cards-to-tab!`: Moves selected cards between tabs

**Dependencies**:
- Upstream: Dashboard model
- Downstream: Dashboard API, Dashboard Card model

## Query Processing System

### Dashboard Query Processing

**File Structure**:
```
src/metabase/query_processor/
├── dashboard.clj                  # Dashboard query handling
├── card.clj                       # Card query execution
└── middleware/
    ├── parameters.clj             # Parameter handling
    ├── permissions.clj            # Query permissions
    └── results_metadata.clj       # Result annotations
test/metabase/query_processor/
└── dashboard_test.clj             # Dashboard query tests
```

**Primary Responsibilities**:
- Executes queries for all cards on a dashboard
- Handles parameter substitution for dashboard filters
- Optimizes multi-card execution with batching

**Key Data Structures**:
- `DashboardQuery`: Contains card, parameters, and context information
- `CardResults`: Map of card ID to query results
- `ExecutionContext`: Processing context with user, permissions, and settings

**Core Functions**:
- `dashboard/execute-dashboard`: Executes all queries for a dashboard
- `dashboard/execute-dashboard-cards`: Executes specific cards with parameters
- `dashboard/apply-parameters`: Applies parameters to card queries
- `dashboard/run-query-for-card-with-params`: Executes single card with parameters

**Dependencies**:
- Upstream: Query Processor, Card model, Parameter system
- Downstream: Dashboard API, Subscription system

### Results Formatting

**File Structure**:
```
src/metabase/formatting/
├── visualization.clj              # Visualization formatting
├── cards.clj                      # Card-specific formatting
├── numbers.clj                    # Number formatting
├── time.clj                       # Date/time formatting
└── humanization.clj               # Field name humanization
test/metabase/formatting/
└── visualization_test.clj         # Formatting tests
```

**Primary Responsibilities**:
- Transforms raw query results for visualization
- Applies formatting based on visualization settings
- Handles special visualization-specific transformations

**Key Data Structures**:
- `QueryResults`: Map with `:data`, `:row_count`, `:status`
- `ColumnMetadata`: Column-specific format and display information
- `FormattedResults`: Results with formatting applied for visualization

**Core Functions**:
- `formatting/format-dashboard-results`: Formats all results for a dashboard
- `formatting/format-card-results`: Applies card-specific formatting
- `formatting/apply-visualization-settings`: Uses settings for formatting
- `formatting/transform-results`: Applies visualization-specific transformations

**Dependencies**:
- Upstream: Query Processor, Visualization Settings
- Downstream: Rendering system, Export functionality

### Query Caching and Performance

**File Structure**:
```
src/metabase/query_processor/
├── cache/
│   ├── impl.clj                   # Cache implementation
│   └── backend.clj                # Storage backend
├── middleware/
│   └── cache.clj                  # Caching middleware
└── util/
    └── cache_key.clj              # Cache key generation
test/metabase/query_processor/cache/
└── cache_test.clj                 # Cache tests
```

**Primary Responsibilities**:
- Caches query results for improved performance
- Manages cache invalidation and TTL
- Optimizes parameter-dependent query execution

**Key Data Structures**:
- `CacheEntry`: Cached result with metadata and invalidation info
- `CacheConfig`: Configuration for caching behavior
- `QueryCache`: System-wide cache store

**Core Functions**:
- `cache/maybe-return-cached-results`: Retrieves cached results if valid
- `cache/cache-results!`: Stores results in cache
- `cache/invalidate-cache!`: Clears cache entries
- `cache/parameter-sensitive-cache-key`: Creates keys for parameterized queries

**Configuration Points**:
- `query-caching-max-ttl`: Maximum cache time-to-live
- `query-caching-min-ttl`: Minimum cache time-to-live
- `enable-query-caching`: Master toggle for caching

**Dependencies**:
- Upstream: Query Processor
- Downstream: Dashboard execution, API endpoints

## Parameter System

### Parameter Models and Validation

**File Structure**:
```
src/metabase/models/params/
├── parameters.clj                 # Parameter definitions
├── validations.clj                # Validation rules
├── field_values.clj               # Field value sources
└── default_values.clj             # Default handling
test/metabase/models/params/
└── parameters_test.clj            # Parameter tests
```

**Primary Responsibilities**:
- Defines parameter types and validation rules
- Manages parameter configuration and defaults
- Validates parameter values against constraints

**Key Data Structures**:
- `Parameter`: Dashboard-level parameter definition
- `ParameterMapping`: Connection between parameter and card field
- `ParameterValue`: User-provided value for a parameter

**Core Functions**:
- `params/normalize-parameter`: Standardizes parameter format
- `params/validate-parameter-value`: Checks value against type rules
- `params/param-target-field`: Resolves field for a parameter
- `params/default-parameter-value`: Computes default value if not provided

**Dependencies**:
- Upstream: Field metadata, Type system
- Downstream: Query execution, Chain filtering

### Parameter Resolution in Queries

**File Structure**:
```
src/metabase/query_processor/middleware/
├── parameters.clj                 # Parameter processing
├── mbql_parameters.clj            # MBQL parameter handling
└── native_parameters.clj          # Native query parameters
test/metabase/query_processor/middleware/
└── parameters_test.clj            # Parameter tests
```

**Primary Responsibilities**:
- Converts parameters to query clauses or substitutions
- Handles different query types (MBQL vs. native)
- Resolves field references for parameters

**Key Data Structures**:
- `ParameterToFieldMapping`: How parameter connects to specific fields
- `FieldValues`: Possible values for parameter fields
- `ParameterClause`: MBQL clause generated from parameter

**Core Functions**:
- `parameters/add-parameters-to-query`: Applies parameters to a query
- `parameters/substitute-native-parameters`: Handles native query substitution
- `parameters/mbql-parameter->clause`: Converts parameter to MBQL
- `parameters/field-form-from-param-mapping`: Resolves field reference

**Dependencies**:
- Upstream: Parameter model, Field metadata
- Downstream: Query execution, Dashboard visualization

### Chain Filtering and Dependencies

**File Structure**:
```
src/metabase/models/params/
├── chain_filter.clj               # Chain filter implementation
├── field_values.clj               # Field value retrieval
└── dependency_graph.clj           # Parameter dependencies
src/metabase/api/
└── chain_filter.clj               # Chain filter API endpoints
test/metabase/models/params/
└── chain_filter_test.clj          # Chain filter tests
```

**Primary Responsibilities**:
- Handles dependent parameters (parameters filtered by other parameters)
- Discovers join paths between related fields
- Optimizes dependent parameter value resolution

**Key Data Structures**:
- `DependentParameters`: Graph of parameter dependencies
- `FilteredValues`: Values filtered by dependent parameters
- `JoinGraph`: Relations between tables for filtering

**Core Functions**:
- `chain-filter/get-field-values-for-field`: Retrieves values with dependencies
- `chain-filter/build-chain-filter-query`: Creates filtering query
- `chain-filter/join-path-between`: Discovers join paths for cross-table filtering
- `chain-filter/parse-filter-param-values`: Translates values for filtering

**Dependencies**:
- Upstream: Field metadata, Table relations
- Downstream: Parameter UI, Dashboard interaction

## Visualization Rendering

### Card Rendering System

**File Structure**:
```
src/metabase/pulse/render/
├── card.clj                       # Card rendering
├── body.clj                       # Email body rendering
├── style.clj                      # Styling utilities
└── common.clj                     # Shared rendering code
test/metabase/pulse/render/
└── card_test.clj                  # Card rendering tests
```

**Primary Responsibilities**:
- Renders card data as visualizations for different channels
- Handles channel-specific formatting and limitations
- Coordinates rendering of different visualization types

**Key Data Structures**:
- `RenderContext`: Rendering environment and options
- `CardRenderRequest`: Data needed to render a card
- `RenderedCard`: Final visualization output for delivery

**Core Functions**:
- `render/render-card-for-channel`: Multi-method for different channels
- `render/render-pulse-card`: Renders card for a pulse/subscription
- `render/render-for-export`: Prepares visualization for export
- `render/detect-pulse-chart-type`: Determines visualization approach

**Dependencies**:
- Upstream: Query results, Formatting system
- Downstream: Delivery channels, Export system

### SVG/PNG Generation

**File Structure**:
```
src/metabase/pulse/render/
├── js_engine.clj                  # JavaScript engine integration
├── js/                            # JavaScript rendering code
│   ├── svg.clj                    # SVG generation
│   └── charts.clj                 # Chart-specific rendering
├── image/
│   ├── svg.clj                    # SVG utilities
│   └── png.clj                    # PNG conversion
└── common.clj                     # Shared rendering utilities
test/metabase/pulse/render/
└── js_test.clj                    # JavaScript rendering tests
```

**Primary Responsibilities**:
- Renders visualizations as SVG using JavaScript
- Converts SVG to PNG for email and export
- Handles browser-dependent visualizations in headless context

**Key Data Structures**:
- `JavaScriptRenderingContext`: GraalVM environment for running JS
- `RenderOptions`: Configuration for image generation
- `ImageDimensions`: Size constraints for rendered images

**Core Functions**:
- `js/render-chart-to-svg`: Renders chart data as SVG string
- `png/svg->png`: Converts SVG to PNG image
- `png/render-html-to-png`: Renders HTML (tables) to PNG
- `js/execute-js-with-timeout`: Safely runs JS with timeouts

**Dependencies**:
- Upstream: Card rendering system, Visualization libraries
- Downstream: Email delivery, Export system

### Table and Text Formatting

**File Structure**:
```
src/metabase/pulse/render/
├── table.clj                      # Table rendering
├── style.clj                      # CSS styles
├── text.clj                       # Text formatting
└── display_value.clj              # Value display formatting
test/metabase/pulse/render/
└── table_test.clj                 # Table rendering tests
```

**Primary Responsibilities**:
- Formats tabular data for display
- Handles special column types and formats
- Creates HTML tables for email and other channels

**Key Data Structures**:
- `TableSettings`: Column-specific display settings
- `FormattedColumn`: Column with values formatted for display
- `TableRendering`: Complete HTML table representation

**Core Functions**:
- `table/render-table`: Creates HTML table from data
- `table/format-cell`: Formats individual cells based on type
- `table/create-remapping`: Handles value remapping
- `table/render-mini-bar`: Creates in-cell bar visualizations

**Dependencies**:
- Upstream: Query results, Formatting system
- Downstream: Email channel, Slack channel

## Dashboard Subscriptions and Export

### Dashboard Subscription System

**File Structure**:
```
src/metabase/pulse/
├── dashboard_subscription.clj     # Dashboard subscriptions
├── pulse.clj                      # Core pulse functionality
├── schedule.clj                   # Scheduling logic
└── parameters.clj                 # Parameter handling for pulses
test/metabase/pulse/
└── dashboard_subscription_test.clj # Subscription tests
```

**Primary Responsibilities**:
- Schedules dashboard deliveries via email/Slack
- Manages subscription parameters and filters
- Coordinates rendering and delivery process

**Key Data Structures**:
- `Pulse`: Record of subscription schedule and recipients
- `PulseChannel`: Delivery channel configuration
- `PulseCard`: Cards included in subscription

**Core Functions**:
- `dashboard-subscription/send-dashboard-subscription!`: Delivers dashboard
- `dashboard-subscription/create-dashboard-subscription!`: Sets up schedule
- `dashboard-subscription/schedule-pulse!`: Adds to task scheduler
- `dashboard-subscription/execute-dashboard`: Renders with parameters

**Dependencies**:
- Upstream: Dashboard model, Card rendering system
- Downstream: Email channel, Slack channel

### Email and Slack Delivery

**File Structure**:
```
src/metabase/pulse/
├── channel.clj                    # Channel abstraction
├── render.clj                     # Rendering coordination
└── channel/
    ├── email.clj                  # Email implementation
    └── slack.clj                  # Slack implementation
test/metabase/pulse/
├── email_test.clj                 # Email tests
└── slack_test.clj                 # Slack tests
```

**Primary Responsibilities**:
- Delivers rendered visualizations via email
- Formats messages for Slack with proper attachments
- Handles channel-specific limitations and layouts

**Key Data Structures**:
- `EmailRenderContext`: Email-specific rendering options
- `SlackRenderContext`: Slack-specific formatting options
- `ChannelPulse`: Channel-specific pulse configuration

**Core Functions**:
- `email/send-pulse-email!`: Sends formatted email with visualizations
- `slack/post-slack-attachments!`: Posts to Slack channel
- `email/render-email-body`: Creates HTML email body
- `slack/build-slack-attachments`: Creates Slack message format

**Configuration Points**:
- `email-from-address`: From address for emails
- `slack-token`: API token for Slack integration
- `enable-embedding-in-emails`: Toggle for image embedding

**Dependencies**:
- Upstream: Card rendering system, PNG generation
- Downstream: Email service, Slack API

### Export Functionality

**File Structure**:
```
src/metabase/api/
├── dataset.clj                    # Dataset export endpoints
├── card.clj                       # Card export endpoints
└── export/
    ├── csv.clj                    # CSV generation
    ├── xlsx.clj                   # Excel generation
    └── json.clj                   # JSON generation
test/metabase/api/
└── export_test.clj                # Export tests
```

**Primary Responsibilities**:
- Exports query results in various formats (CSV, Excel, JSON)
- Handles large result sets with streaming
- Formats exports consistently with UI visualizations

**Key Data Structures**:
- `ExportFormat`: Enum of supported formats
- `ExportSettings`: Format-specific configuration
- `ExportRequest`: Details of export including constraints

**Core Functions**:
- `export/export-card`: Exports a card's data
- `export/create-export-csv`: Generates CSV from results
- `export/create-export-xlsx`: Creates Excel file from results
- `export/format-for-export`: Applies consistent formatting

**Dependencies**:
- Upstream: Query processor, Formatting system
- Downstream: API endpoints, Download handling

## API Endpoints and Integration

### Dashboard and Card API Endpoints

**File Structure**:
```
src/metabase/api/
├── dashboard.clj                  # Dashboard API
├── card.clj                       # Card API
├── public.clj                     # Public/embedded endpoints
└── dataset.clj                    # Dataset/query endpoints
test/metabase/api/
├── dashboard_test.clj             # Dashboard API tests
└── card_test.clj                  # Card API tests
```

**Primary Responsibilities**:
- Exposes CRUD operations for visualization objects
- Handles authorization and validation
- Provides endpoints for execution and interaction

**Key Endpoints**:
- `GET /api/dashboard/:id`: Retrieves dashboard
- `POST /api/dashboard`: Creates new dashboard
- `GET /api/card/:id`: Retrieves card
- `POST /api/card`: Creates new card
- `POST /api/dashboard/:id/cards`: Adds cards to dashboard
- `GET /api/dashboard/:id/params/:param-key/values`: Gets parameter values
- `POST /api/dataset/`: Executes a query

**Core Functions**:
- `api.dashboard/read`: Returns dashboard with cards and tabs
- `api.dashboard/create!`: Creates a new dashboard
- `api.card/query`: Executes a card's query
- `api.public/dashboard`: Public/embedded dashboard endpoint

**Dependencies**:
- Upstream: All model components, Query processor
- Downstream: Frontend, Embedding system

### Enterprise Extensions

**File Structure**:
```
src/metabase-enterprise/
├── dashboard/
│   ├── api.clj                    # Extended dashboard API
│   ├── subscription.clj           # Enhanced subscriptions
│   └── embedding.clj              # Advanced embedding
├── sandboxing/
│   ├── query_processor.clj        # Sandboxed queries
│   └── visualizations.clj         # Sandboxed visualizations
└── content/
    └── verification.clj           # Content verification
test/metabase-enterprise/
└── dashboard/
    └── api_test.clj               # Enterprise API tests
```

**Primary Responsibilities**:
- Extends core functionality with enterprise features
- Provides advanced visualization capabilities
- Enables enterprise-specific governance and controls

**Key Extensions**:
- **Interactive Embedding**: Advanced embedding with drill-through and filtering
- **Subscription Filters**: Parameter-based subscription targeting
- **Content Verification**: Approval workflows for dashboards
- **Advanced Caching**: More sophisticated caching strategies
- **Data Sandboxing**: Row-level security for visualizations
- **White-labeling**: Custom branding for embedded dashboards
- **SSO Authentication**: Enhanced authentication for embedded visualizations

**Extension Points**:
- Parameter system for sandboxed data access
- Rendering pipeline for white-labeled output
- Subscription system for filtered delivery
- Caching system for tenant-aware caching

**Dependencies**:
- Upstream: Core visualization system
- Downstream: Enterprise frontend, embedding clients

## Key System Interactions

### Data Flow: Dashboard Rendering

1. API receives request for dashboard (`GET /api/dashboard/:id`)
2. Dashboard model retrieves dashboard with cards and tabs
3. Parameter system resolves any provided parameter values
4. Query processor executes queries for each card with parameters
5. Results formatter prepares data for visualization
6. Response is returned to frontend for rendering

### Data Flow: Dashboard Subscription

1. Scheduler triggers dashboard subscription at scheduled time
2. Subscription system retrieves dashboard with subscription parameters
3. Query processor executes queries for included cards
4. Card rendering system generates visualizations for each card
5. PNG generation creates images for charts
6. Delivery system formats email or Slack message with visualizations
7. Channel-specific code delivers to recipients

### Data Flow: Parameter Chain Filtering

1. Frontend requests parameter values (`GET /api/dashboard/:id/params/:param-key/values`)
2. Parameter system checks for dependencies on other parameters
3. Chain filter system builds query with dependent parameter constraints
4. Query executes with proper filtering applied
5. Filtered values are returned for parameter dropdown

## Error Handling

**Common Error Patterns**:
- Permission checks before operations with clear error messages
- Parameter validation with detailed validation errors
- Graceful fallbacks for rendering issues
- Timeout handling for long-running operations
- Notification system for background task failures

**Key Error Handlers**:
- `ex-data` with `:type` for categorized errors
- HTTP status codes mapping to error categories
- Structured error responses with actionable messages
- Logging with context for debugging
- Query execution error reporting

## Testing Approaches

**Unit Tests**:
- Function-level tests for core components
- Test fixtures for common data structures
- Mocking of external services

**Integration Tests**:
- End-to-end tests for API endpoints
- Database integration tests for model operations
- Inter-component interaction tests

**Visual Tests**:
- Snapshot testing for rendered visualizations
- Comparison tests for formatting consistency

**Performance Tests**:
- Query caching effectiveness tests
- Large dashboard performance tests
- Subscription delivery timing tests

## Performance Considerations

**Caching Strategies**:
- Query result caching with TTL
- Parameter value caching
- Rendered visualization caching

**Optimization Techniques**:
- Batched query execution
- Streaming for large exports
- Asynchronous subscription processing
- Efficient parameter value resolution

**Configuration Tuning**:
- Cache TTL settings
- Query timeout configurations
- Image rendering quality vs. speed
- Database connection pooling

## Conclusion

The Metabase backend visualization system provides a robust foundation for creating, displaying, and distributing interactive dashboards and visualizations. The modular architecture allows for extension and customization while maintaining core functionality.

Key strengths include:
- Flexible parameter system with chain filtering
- Comprehensive rendering pipeline for different channels
- Robust subscription and distribution capabilities
- Performance optimization through caching
- Extensibility for enterprise features

This system enables Metabase to deliver interactive, insightful visualizations across different contexts while maintaining consistent behavior and appearance.