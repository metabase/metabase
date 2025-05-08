# Dashboard Card and Series Model Analysis

## File Index
```
src/metabase/models/
├── dashboard.clj              # Main dashboard model
├── dashboard_card.clj         # Dashboard card model
├── dashboard_card_series.clj  # Series for dashboard cards
└── dashboard_tab.clj          # Dashboard tabs model

test/metabase/models/
├── dashboard_card_test.clj    # Tests for dashboard card
└── dashboard_tab_test.clj     # Tests for dashboard tabs
```

## Summary

The dashboard card model (`dashboard_card.clj`) and related models define how visualizations are organized, displayed, and configured on Metabase dashboards. The system allows cards (questions/visualizations) to be placed on dashboards with specific positions, sizes, and configurations.

Key concepts:
- **Dashboard Cards**: Individual cards/visualizations placed on dashboards with position (row, col) and size (size_x, size_y) attributes.
- **Dashboard Card Series**: Additional cards that can be added to a primary dashboard card, enabling multiple series to be displayed in a single visualization (e.g., line, bar, area charts).
- **Dashboard Tabs**: Dashboards can have tabs to organize dashboard cards into different views.
- **Link Cards**: Special dashboard cards that link to internal entities like databases, tables, dashboards, or cards.
- **Parameter Mappings**: Define how dashboard filters are connected to the cards.
- **Visualization Settings**: Store configuration for how each card is displayed.

## Dependencies

### Upstream Dependencies
- `metabase.models.interface` - Core model interface
- `metabase.models.serialization` - Serialization support for import/export
- `toucan2.core` - Database ORM layer
- `metabase.util` - Utility functions
- `metabase.util.honey-sql-2` - SQL generation utilities
- `metabase.util.malli` - Schema validation
- `methodical.core` - Polymorphic method dispatch

### Downstream Dependencies
- `metabase.api.dashboard` - API endpoints for dashboards
- `metabase.pulse` - Dashboard subscriptions
- `metabase.search.core` - Search functionality for dashboards
- `metabase.public-sharing` - Public embedding of dashboards

## Key Data Structures

1. **DashboardCard** (`:model/DashboardCard`)
   - Core attributes:
     - `dashboard_id` - ID of the dashboard it belongs to
     - `card_id` - ID of the card being displayed (null for text cards)
     - `dashboard_tab_id` - Tab the card belongs to (optional)
     - `row`, `col` - Position on the dashboard
     - `size_x`, `size_y` - Size of the card
     - `parameter_mappings` - How dashboard parameters are mapped to the card
     - `visualization_settings` - Visual configuration options
     - `action_id` - Optional reference to an action

2. **DashboardCardSeries** (`:model/DashboardCardSeries`)
   - `dashboardcard_id` - Dashboard card this series belongs to
   - `card_id` - Card ID for this series
   - `position` - Order in the series list

3. **DashboardTab** (`:model/DashboardTab`)
   - `dashboard_id` - Dashboard it belongs to
   - `name` - Tab name
   - `position` - Order in the tabs list

4. **Data Schemas**
   - `DashboardCardUpdates` - Schema for updating dashboard cards
   - `NewDashboardCard` - Schema for creating new dashboard cards
   - `ParamMapping` - Schema for parameter mappings

## Core Functions

### Dashboard Card Functions

1. **Creation and Retrieval**
   - `retrieve-dashboard-card` - Fetch dashboard card by ID with its series
   - `create-dashboard-cards!` - Create new dashboard cards with series
   - `from-parsed-json` - Convert JSON to dashboard card instances

2. **Series Management**
   - `series` - Batched hydration method to get series for dashboard cards
   - `dashcard->multi-cards` - Get cards added to dashcard as additional series
   - `update-dashboard-cards-series!` - Update series for dashboard cards

3. **Updates and Deletion**
   - `update-dashboard-card!` - Update dashboard card properties and series
   - `delete-dashboard-cards!` - Delete dashboard cards

4. **Link Card Management**
   - `dashcard-linkcard-info` - Hydration method for link card information
   - `link-card-info-query-for-model` - Query to fetch info for link cards

5. **Dashboard Tab Integration**
   - `do-update-tabs!` - Update dashboard tabs and manage card relationships

### Dashboard Card Layout

1. **Positioning**
   - `dashcard-comparator` - Compare dashboard cards for layout ordering
   - Using `row`, `col` for position and `size_x`, `size_y` for dimensions

## Configuration Points

1. **Visualization Settings**
   - Stored in the `visualization_settings` JSON column
   - Normalized when retrieved from the database
   - Includes configurations for appearance, formatting, click behavior, etc.

2. **Parameter Mappings**
   - Stored in the `parameter_mappings` JSON column
   - Define how dashboard filters connect to card queries
   - Schema validated with `ParamMapping`

3. **Series Configuration**
   - Management of multiple cards in a single visualization
   - Ordering controlled by `position` in dashboard card series

## Enterprise Extensions

There are no explicit enterprise extensions in the dashboard card models, but the code includes hooks for:

1. **Serialization** - For enterprise backup/restore and instance-to-instance migration
   - `serdes/hash-fields` - Unique identification for entities
   - `serdes/generate-path` - Path generation for serialization
   - `serdes/make-spec` - Specification for serialization

2. **Permission Checks**
   - `mi/perms-objects-set` - Permission checking methodology
   - The dashboard card inherits permissions from its parent dashboard

## Testing Approach

The test file `dashboard_card_test.clj` includes:

1. **Unit Tests**
   - Testing core functionality like retrieval, creation, and updates
   - Testing series management
   - Testing parameter mapping normalization
   - Testing visualization settings normalization

2. **Performance Tests**
   - `update-dashboard-card!-call-count-test` - Monitoring DB call counts
   - Testing optimization of batch operations

3. **Serialization Tests**
   - `identity-hash-test` - Testing hashing for serialization
   - `from-decoded-json-test` - Testing JSON serialization/deserialization

## Error Handling

1. **Schema Validation**
   - Use of Malli schemas for validating parameters, e.g., `DashboardCardUpdates`
   - Schema enforcement in functions like `update-dashboard-card!` and `create-dashboard-cards!`

2. **Transaction Management**
   - `t2/with-transaction` for atomic operations involving multiple entities
   - Example: updating dashboard cards and their series in the same transaction

3. **Identity Checks**
   - Validation of ID existence before operations
   - Permission checking via the `mi/perms-objects-set` method

4. **Normalization**
   - Parameter mappings and visualization settings normalization
   - Handling of legacy MBQL formats

## Key Insights

1. **Dashboard Organization**
   - Cards are organized on dashboards using a grid system with `row`, `col`, `size_x`, and `size_y`
   - Tabs provide additional organization capabilities
   - The `dashcard-comparator` determines the visual order (left-to-right, top-to-bottom)

2. **Visualization Configuration**
   - `visualization_settings` stores all visual customization
   - Includes chart types, colors, labels, conditional formatting, and more
   - Settings are normalized to modern MBQL syntax when retrieved

3. **Multi-Series Support**
   - The `dashboard_card_series` table creates relationships between cards
   - Allows combining multiple questions in a single visualization
   - Position attribute determines order within the series

4. **Parameter System**
   - Dashboard parameters connect to cards via parameter mappings
   - Each mapping defines how a dashboard parameter affects a specific card
   - Supports complex filtering and drill-through capabilities

5. **Link Cards**
   - Special cards that link to other entities in Metabase
   - Support navigation between related dashboards and questions
   - Entity information is hydrated dynamically to show up-to-date details