# Dashboard and Card Models Analysis

## File Index
```
src/metabase/models/
├── dashboard.clj                 # Dashboard model definition
├── card.clj                      # Card model definition (Questions/Reports)
├── dashboard_card.clj            # Dashboard Card junction model
├── dashboard_tab.clj             # Dashboard Tab model
└── dashboard_card_series.clj     # Series relationships for dashboard cards
```

## Summary

### Dashboard Model
The Dashboard model represents a collection of visualizations (cards) arranged in a layout. It is the container for organizing multiple visualizations into a cohesive view. Dashboards support parameters, tabs, and filtering capabilities.

### Card Model
The Card model represents a question or visualization in Metabase. Cards can be standalone questions or used within dashboards. They contain query definitions, visualization settings, and metadata about the query results. Cards can have multiple types: question, model, or metric.

### Dashboard-Card Model
The Dashboard-Card model acts as a junction between Dashboards and Cards. It stores positioning information, visualization settings, and parameter mappings for a specific card within a dashboard. It also supports additional series to be added to a single dashboard card.

### Dashboard-Tab Model
The Dashboard-Tab model enables organization of dashboard visualizations into separate tabs. Tabs have a name and position and are associated with a specific dashboard.

### Dashboard-Card-Series Model
This model allows multiple series to be displayed on a single dashboard card, linking additional cards to create multi-series visualizations.

## Dependencies

### Upstream Dependencies
- Collection: Both Dashboards and Cards belong to Collections
- User: Creator/editor tracking
- Database/Table: Cards reference these for their queries
- Parameters: Used by both Dashboards and Cards
- Permissions: Access control system
- Serialization: For import/export functionality

### Downstream Dependencies
- Subscriptions/Pulses: For scheduled dashboard delivery
- Public sharing: For embedding/sharing
- Search index: For discovery
- Revision history: For tracking changes
- Audit logs: For activity tracking

## Key Data Structures

### Dashboard Schema
- `id`: Primary key
- `name`: Dashboard name
- `description`: Optional description
- `creator_id`: User who created the dashboard
- `collection_id`: Collection the dashboard belongs to
- `parameters`: Array of dashboard parameters
- `points_of_interest`, `caveats`: Additional notes/caveats
- `show_in_getting_started`: Whether to show in onboarding
- `public_uuid`: For public sharing
- `enable_embedding`: Boolean for embedding
- `embedding_params`: Settings for embedding
- `archived`: Boolean for soft deletion
- `position`: For ordering within a collection
- `collection_position`: Legacy position field

### Card Schema
- `id`: Primary key
- `name`: Card name
- `description`: Optional description
- `creator_id`: User who created the card
- `display`: Visualization type (e.g., table, line, bar)
- `dataset_query`: Query definition (JSON)
- `visualization_settings`: Visualization customizations (JSON)
- `result_metadata`: Field metadata for results
- `collection_id`: Collection the card belongs to
- `card_schema`: Current schema version for migrations
- `database_id`, `table_id`: Source database/table
- `query_type`: Query type (native, query)
- `archived`: Boolean for soft deletion
- `parameters`: Card-level parameters
- `parameter_mappings`: Map of parameter to field
- `type`: Card type (question, model, metric)

### Dashboard-Card Schema
- `id`: Primary key
- `dashboard_id`: Dashboard this card belongs to
- `card_id`: Card being displayed
- `size_x`, `size_y`: Width and height
- `row`, `col`: Position on dashboard
- `parameter_mappings`: Parameter mappings
- `visualization_settings`: Overrides for visualization
- `dashboard_tab_id`: Tab this card belongs to
- `action_id`: Associated action

### Dashboard-Tab Schema
- `id`: Primary key
- `dashboard_id`: Dashboard this tab belongs to
- `name`: Tab name
- `position`: Order among tabs

## Core Functions

### Dashboard Functions
- `create-dashboard-cards!`: Add cards to a dashboard
- `update-dashcards!`: Update cards on a dashboard
- `save-transient-dashboard!`: Save a denormalized dashboard
- `add-dashcards!`: Convenience method for adding cards
- `update-field-values-for-on-demand-dbs!`: Update field values for on-demand databases

### Card Functions
- `create-card!`: Create a new card
- `update-card!`: Update a card
- `check-run-permissions-for-query`: Validate query permissions
- `lib-query`: Convert card query to lib format
- `with-can-run-adhoc-query`: Add permission flag to cards
- `model?`: Check if card is a model
- `dashboard-internal-card?`: Check if card belongs to a dashboard
- `model-supports-implicit-actions?`: Check if model supports actions

### Dashboard-Card Functions
- `create-dashboard-cards!`: Create multiple dashboard cards
- `update-dashboard-card!`: Update a dashboard card
- `update-dashboard-cards-series!`: Update series for cards
- `delete-dashboard-cards!`: Delete dashboard cards
- `dashcard->multi-cards`: Get all cards in a dashcard

### Dashboard-Tab Functions
- `create-tabs!`: Create new tabs
- `update-tabs!`: Update existing tabs
- `delete-tabs!`: Delete tabs
- `do-update-tabs!`: Handle tab CRUD operations

## Configuration Points
- `current-schema-version` (Card): Controls migration behavior
- Parameter mappings: Configure dashboard filters
- Visualization settings: Customize visualizations
- Embedding parameters: Control what can be changed in embedded views
- Public sharing flags: Enable/disable public access

## Enterprise Extensions
- Data sandboxing: Row-level security
- Moderation reviews: Content verification system
- Content management: Enhanced collection capabilities
- `pre-update-check-sandbox-constraints`: Enterprise-specific permission checks

## Testing Approach
- Unit tests for model functions
- Integration tests for full workflows
- Serialization tests for import/export
- Permission tests for authorization checks

## Error Handling
- Validation of parameters and mappings before saving
- Check for circular references in card queries
- Database constraint violations (unique name in collection)
- Permission checking with appropriate error messages
- Checks for archived objects
- Handling of dashboard question relationships
- Cross-database validation for field filters