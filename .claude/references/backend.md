# Metabase Backend Architecture Reference

This document provides a comprehensive overview of the Metabase backend architecture, focusing on the Clojure codebase, core systems, and configuration. It highlights the components related to the DashViz team's responsibilities as well as broader backend systems that support the application.

## Core Backend Architecture

Metabase's backend is primarily written in Clojure and follows a modular, component-based architecture. The system is designed to be extensible with clear separation of concerns between different modules.

### Directory Structure

- `/src/metabase/` - Primary location for all Clojure backend code
- `/enterprise/backend/src/metabase_enterprise/` - Enterprise edition features
- `/modules/drivers/` - Database-specific drivers
- `/test/metabase/` - Test code for the OSS version
- `/enterprise/backend/test/` - Test code for enterprise features

### Configuration System

Metabase uses a flexible configuration system with settings sourced from:

1. Environment variables (e.g., `MB_DB_TYPE`)
2. JVM options (e.g., `-Dmb.db.type`)
3. Database-stored settings
4. Default values defined in code

Key configuration files:
- `deps.edn` - Clojure dependencies and project configuration
- `bb.edn` - Babashka configuration for development tooling
- `resources/config.defaults.edn` - Default system settings
- `config.yml` - Instance-specific configuration (can be customized by users)

## Core Backend Systems

### 1. HTTP API Layer

- Located in `/api/` directory
- Organized by resource (dashboard, card, collection, etc.)
- Uses Ring for HTTP request/response handling
- Implements RESTful endpoints for frontend communication
- Includes middleware for authentication, permissions, and error handling

### 2. Models and Database Layer

- Located in `/models/` directory
- Uses Toucan2 for database entity mapping
- Defines core entities: User, Card, Dashboard, Dashboard Card, etc.
- Handles database operations, validations, and hooks
- Supports both H2 (development) and production databases (PostgreSQL, MySQL)

### 3. Query Processor

- Located in `/query_processor/` directory
- Translates MBQL (Metabase Query Language) to native SQL
- Supports multiple database engines through driver system
- Implements middleware pattern for query transformation
- Handles caching, permissions, results formatting

### 4. Driver System

- Located in `/driver/` directory and `/modules/drivers/`
- Abstracts database-specific functionality
- Implements database connectivity, query execution, metadata exploration
- Uses multimethods for polymorphic behavior across different databases
- Enables extensibility for community-contributed drivers

### 5. Background Task System

- Located in `/task/` directory
- Based on Quartz scheduler
- Manages scheduled jobs (data syncing, sending subscriptions)
- Implements task prioritization and error handling
- Maintains task history for monitoring

### 6. Public Settings

- Located in `/public_settings.clj`
- Manages application-wide settings and defaults
- Handles environment variables and settings overrides
- Controls feature flags and enterprise edition features

### 7. Security and Permissions

- Located in `/permissions/` directory
- Implements graph-based permission system
- Controls access to databases, tables, collections
- Supports data sandboxing and row-level permissions
- Integrates with authentication providers

## DashViz-Related Backend Components

The following backend components are most relevant to the DashViz team's responsibilities:

### 1. Dashboard and Card Models

- `models/dashboard.clj` - Dashboard entity definition and operations
- `models/dashboard_card.clj` - Cards placed on dashboards
- `models/card.clj` - Saved questions/visualizations
- `models/dashboard_tab.clj` - Tabbed dashboard organization

These models define the core data structures that represent dashboards and their visualizations.

### 2. Parameter Handling

- `models/params.clj` - Parameter definitions and validation
- `models/params/chain-filter.clj` - Chained filtering parameters
- `models/params/custom-values.clj` - Custom value parameters
- `models/parameter_card.clj` - Parameter to card mappings

The parameter system enables interactive dashboards through filtering and variable substitution.

### 3. Query Execution for Dashboards

- `query_processor/dashboard.clj` - Dashboard-specific query processing
- `query_processor/middleware/` - Query transformation pipeline
- `query_processor/streaming.clj` - Query streaming for large results
- `query_processor/pivot.clj` - Specialized pivot table processing

These components handle the execution of queries within the dashboard context, resolving parameters and formatting results for visualization.

### 4. Visualization Rendering

- `channel/render/card.clj` - Card visualization rendering
- `channel/render/js/svg.clj` - SVG chart generation using JavaScript
- `channel/render/png.clj` - PNG image generation
- `channel/render/table.clj` - Table formatting for emails/exports

The rendering system generates visualizations for email subscriptions, Slack notifications, and exports.

### 5. Export and Delivery

- `pulse/dashboard_subscription.clj` - Dashboard subscription processing
- `pulse/send.clj` - Send dashboard content via email/Slack
- `channel/render/image_bundle.clj` - Image bundling for delivery
- `query_processor/streaming/xlsx.clj` - Excel export functionality

These components handle the delivery of dashboard content through various channels and formats.

### 6. Dashboard API Endpoints

- `api/dashboard.clj` - Dashboard CRUD operations
- `api/card.clj` - Card CRUD operations
- `api/dataset.clj` - Query execution endpoint

API endpoints expose dashboard and visualization functionality to the frontend.

## Testing Infrastructure

The backend testing infrastructure is extensive and includes:

### 1. Testing Utilities

- `test/metabase/test.clj` - Core testing utilities and fixtures
- `test/metabase/test/data.clj` - Test database definitions
- `test/metabase/pulse/render/test-util.clj` - Visualization rendering test utilities

### 2. Model Tests

- `test/metabase/models/dashboard_test.clj` - Dashboard model tests
- `test/metabase/models/dashboard_card_test.clj` - Dashboard card tests
- `test/metabase/models/card_test.clj` - Card/question tests

### 3. API Endpoint Tests

- `test/metabase/api/dashboard_test.clj` - Dashboard API tests
- `test/metabase/api/card_test.clj` - Card API tests
- `test/metabase/api/dataset_test.clj` - Query execution tests

### 4. Visualization Tests

- `test/metabase/channel/render/card_test.clj` - Visualization rendering tests
- `test/metabase/pulse/send_test.clj` - Dashboard subscription tests

## Enterprise Features

Enterprise features extend the core functionality with:

### 1. Advanced Permissions

- Sandboxing (row-level filtering)
- Content management permissions
- Data source permissions

### 2. Dashboard Enhancements

- Dashboard embedding
- Advanced caching
- White labeling

### 3. Serialization

- Content serialization for deployment across environments
- Backup and restore functionality

## Configuration and Environment

Important configuration aspects:

### 1. Environment Variables

- `MB_DB_TYPE` - Application database type
- `MB_DB_CONNECTION_URI` - Database connection string
- `MB_ENCRYPTION_SECRET_KEY` - Encryption key for secrets
- `MB_JETTY_PORT` - HTTP server port

### 2. Feature Flags

- `enable-embedding` - Toggle embedding functionality
- `enable-serialization` - Toggle serialization features
- `enable-sandboxes` - Toggle data sandboxing

### 3. Performance Tuning

- `mb-qp-cache-backend` - Query processor cache backend
- `mb-jetty-async-response-timeout` - Query timeout setting
- Database connection pool settings

## Key Data Flow Patterns

1. **Dashboard Query Flow**:
   - Dashboard API receives request
   - Parameters are validated and resolved via `resolve-params-for-query`
   - Dashcard permissions are checked
   - Card query is processed and executed via `process-query-for-dashcard`
   - Results streamed back to client

2. **Parameter Resolution**:
   - Dashboard parameters defined at dashboard level
   - Parameter mappings connect parameters to specific cards
   - When executing, mappings transform dashboard parameters to card parameters
   - Chain filtering ensures dependent parameters work correctly

3. **Visualization Pipeline**:
   - Query results processed according to visualization settings
   - Settings determine formatting, axes, colors, etc.
   - Results formatted for target visualization type
   - For exports/subscriptions, visualizations rendered to proper format (SVG, PNG)

## Relevant Files for DashViz Team

### Core Models
- `/src/metabase/models/dashboard.clj`
- `/src/metabase/models/dashboard_card.clj`
- `/src/metabase/models/dashboard_tab.clj`
- `/src/metabase/models/card.clj`

### Parameters
- `/src/metabase/models/params.clj`
- `/src/metabase/models/params/chain-filter.clj`
- `/src/metabase/models/parameter_card.clj`

### Query Processing
- `/src/metabase/query_processor/dashboard.clj`
- `/src/metabase/query_processor/card.clj`
- `/src/metabase/query_processor/pivot.clj`

### Visualization Rendering
- `/src/metabase/channel/render/card.clj`
- `/src/metabase/channel/render/js/svg.clj`
- `/src/metabase/channel/render/png.clj`
- `/src/metabase/channel/render/table.clj`

### Delivery
- `/src/metabase/pulse/dashboard_subscription.clj`
- `/src/metabase/pulse/send.clj`

### API Endpoints
- `/src/metabase/api/dashboard.clj`
- `/src/metabase/api/card.clj`
- `/src/metabase/api/dataset.clj`