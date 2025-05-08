# Dashboard and Card API Endpoints Analysis

## File Index
```
src/metabase/api/
├── dashboard.clj            # Dashboard API endpoints
└── card.clj                 # Card (question) API endpoints
```

## Summary

### Dashboard API
The Dashboard API provides endpoints for creating, reading, updating, and deleting dashboards, as well as managing dashboard cards, parameters, and filtering. Key capabilities include:
- CRUD operations for dashboards and dashboard cards
- Dashboard parameter management and chain-filtering
- Dashboard sharing and embedding
- Dashboard actions and query execution
- Dashboard cards and tabs management

### Card API
The Card API handles operations related to questions/cards, including:
- CRUD operations for cards
- Card querying and export functionality
- Card parameter management
- Card sharing and embedding
- Model creation and management
- Collection organization

## Dependencies

### Dashboard API

**Upstream Dependencies:**
- `metabase.api.common`: Common API utilities and middleware
- `metabase.models.dashboard`: Dashboard model
- `metabase.models.dashboard-card`: Dashboard card model
- `metabase.models.dashboard-tab`: Dashboard tab model
- `metabase.models.card`: Card model
- `metabase.models.collection`: Collection model
- `metabase.query-processor.dashboard`: Dashboard query processing

**Downstream Dependencies:**
- Frontend dashboard components
- Pulse/subscription system
- Parameter binding system
- Embedding system

### Card API

**Upstream Dependencies:**
- `metabase.api.common`: Common API utilities and middleware
- `metabase.models.card`: Card model
- `metabase.models.collection`: Collection model
- `metabase.query-processor.card`: Card query processing
- `metabase.models.params`: Parameter system
- `metabase.upload`: CSV upload system

**Downstream Dependencies:**
- Frontend question/card components
- Dashboard card system
- Data model system
- Embedding system

## Key Data Structures

### Dashboard API

1. **Dashboard**
   ```clojure
   {:name string
    :description string
    :parameters [Parameter]
    :creator_id integer
    :cache_ttl integer
    :collection_id integer
    :collection_position integer
    :dashcards [DashboardCard]
    :tabs [DashboardTab]}
   ```

2. **DashboardCard**
   ```clojure
   {:id integer
    :card_id integer
    :dashboard_id integer
    :dashboard_tab_id integer
    :size_x integer
    :size_y integer
    :row integer
    :col integer
    :parameter_mappings [ParameterMapping]
    :series [Card]}
   ```

3. **DashboardTab**
   ```clojure
   {:id integer
    :dashboard_id integer
    :name string
    :position integer}
   ```

4. **Parameter**
   ```clojure
   {:id string
    :type string
    :name string
    :target any
    :options map}
   ```

### Card API

1. **Card**
   ```clojure
   {:name string
    :description string
    :type keyword
    :dataset_query map
    :display string
    :visualization_settings map
    :collection_id integer
    :collection_position integer
    :result_metadata array
    :parameters [Parameter]}
   ```

2. **ParameterMapping**
   ```clojure
   {:parameter_id string
    :target any
    :card_id integer}
   ```

## Core Functions

### Dashboard API

1. **CRUD Operations**
   - `GET /api/dashboard/`: List dashboards
   - `POST /api/dashboard/`: Create dashboard
   - `GET /api/dashboard/:id`: Get dashboard
   - `PUT /api/dashboard/:id`: Update dashboard
   - `DELETE /api/dashboard/:id`: Delete dashboard
   - `POST /api/dashboard/:from-dashboard-id/copy`: Copy dashboard

2. **Dashboard Cards Management**
   - `PUT /api/dashboard/:id/cards`: Update dashboard cards
   - `POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query`: Execute query
   - `POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/execute`: Execute action

3. **Parameter and Filtering**
   - `GET /api/dashboard/:id/params/:param-key/values`: Get parameter values
   - `GET /api/dashboard/:id/params/:param-key/search/:query`: Search parameter values
   - `GET /api/dashboard/params/valid-filter-fields`: Get valid filter fields

4. **Sharing and Embedding**
   - `POST /api/dashboard/:dashboard-id/public_link`: Generate public link
   - `DELETE /api/dashboard/:dashboard-id/public_link`: Delete public link
   - `GET /api/dashboard/public`: List public dashboards
   - `GET /api/dashboard/embeddable`: List embeddable dashboards

### Card API

1. **CRUD Operations**
   - `GET /api/card/`: List cards
   - `POST /api/card/`: Create card
   - `GET /api/card/:id`: Get card
   - `PUT /api/card/:id`: Update card
   - `DELETE /api/card/:id`: Delete card
   - `POST /api/card/:id/copy`: Copy card

2. **Query Execution**
   - `POST /api/card/:card-id/query`: Execute query
   - `POST /api/card/:card-id/query/:export-format`: Export query results
   - `POST /api/card/pivot/:card-id/query`: Execute pivot query

3. **Parameters**
   - `GET /api/card/:card-id/params/:param-key/values`: Get parameter values
   - `GET /api/card/:card-id/params/:param-key/search/:query`: Search parameter values

4. **Collections Management**
   - `POST /api/card/collections`: Move cards to collection
   - `POST /api/card/from-csv`: Create card from CSV

5. **Sharing and Embedding**
   - `POST /api/card/:card-id/public_link`: Generate public link
   - `DELETE /api/card/:card-id/public_link`: Delete public link
   - `GET /api/card/public`: List public cards
   - `GET /api/card/embeddable`: List embeddable cards

## Configuration Points

### Dashboard API
- Dashboard caching (`cache_ttl`)
- Parameter configuration
- Embedding settings (`enable_embedding`, `embedding_params`)
- Dashboard layout settings (`size_x`, `size_y`, `row`, `col`)
- Dashboard width setting (`width` - "fixed" or "full")

### Card API
- Card display type
- Visualization settings
- Model persistence settings
- Card caching (`cache_ttl`)
- Embedding settings (`enable_embedding`, `embedding_params`)
- Collection position

## Enterprise Extensions

### Dashboard API
- Advanced embedding capabilities
- Data sandboxing for dashboard parameters
- Enterprise SSO integration with embedding
- Dashboard audit functionality

### Card API
- Advanced embedding capabilities
- Data model persistence
- Enterprise SSO integration with embedding
- Data sandboxing and row-level permissions

## Testing Approach

Both the Dashboard and Card APIs are tested through:

1. **Unit Tests**
   - Function-level testing of core API logic
   - Testing parameter validation

2. **Integration Tests**
   - Testing database interactions and model updates
   - Testing interactions between components

3. **End-to-End Tests**
   - Testing complete API flows
   - Cypress tests for frontend-backend integration

4. **Permission Tests**
   - Testing authorization and access controls
   - Collection, card, and dashboard permission tests

## Error Handling

### Dashboard API
- Permission checks via `api/read-check` and `api/write-check`
- Parameter validation using Malli schemas
- Transactional integrity with `t2/with-transaction`
- Exception handling for user-friendly error messages
- HTTP status code mapping (`api/check-400`, `api/check-404`, etc.)
- Dashboard parameter validation

### Card API
- Permission checks via `api/read-check` and `api/write-check`
- Query permission validation via `card/check-run-permissions-for-query`
- Parameter validation using Malli schemas
- Exception handling for query execution errors
- Collection permission validation
- Database connection error handling

## Key API Surface for Frontend

### Dashboard API
1. **Dashboard Management**
   - Create, read, update, delete dashboards
   - Dashboard cards positioning and layout
   - Dashboard tabs management

2. **Dashboard Parameter System**
   - Parameter configuration
   - Chain filter values
   - Parameter mapping to cards

3. **Dashboard Cards Execution**
   - Execute dashboard card queries
   - Handle parameter values in queries
   - Export dashboard card data

4. **Dashboard Actions**
   - Execute dashboard actions
   - Fetch parameters for actions

### Card API
1. **Card Management**
   - Create, read, update, delete cards
   - Card metadata management
   - Collection organization
   - Result metadata handling

2. **Query Execution**
   - Execute card queries with parameters
   - Export results in various formats
   - Pivot query execution

3. **Card Parameters**
   - Parameter value fetching
   - Parameter value searching
   - Parameter mapping

4. **Model Management**
   - Model creation and updating
   - CSV upload and model creation
   - Model persistence settings