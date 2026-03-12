# Architecture

**Analysis Date:** 2026-03-11

## Pattern Overview

**Overall:** Modular monolith with an OSS/Enterprise split and a plugin-based driver system.

**Key Characteristics:**
- Clojure backend serving a REST API via Ring + Compojure, with a React/Redux/TypeScript SPA frontend
- Enterprise features layer on top of OSS via Clojure multimethods, Methodical, and a frontend plugin system
- Database drivers are isolated modules loaded dynamically at runtime via a custom classloader
- The Query Processor (QP) is a middleware pipeline that compiles MBQL (Metabase Query Language) into driver-specific SQL

## Layers

**HTTP Server (Ring + Compojure):**
- Purpose: Accept HTTP requests, apply middleware, route to API handlers
- Location: `src/metabase/server/`
- Contains: Server lifecycle (`instance.clj`), route composition (`routes.clj`), request handler construction (`handler.clj`), all Ring middleware (`middleware/`)
- Depends on: API routes, middleware chain
- Used by: External clients, frontend SPA

**API Routes:**
- Purpose: Define REST API endpoints and map URL paths to handler functions
- Location: `src/metabase/api_routes/routes.clj` (OSS route map), `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj` (EE route map)
- Contains: Route definitions using `api.macros/defendpoint`, sorted route-map linking URL prefixes to namespace handlers
- Depends on: Domain modules (e.g., `metabase.queries-rest.api`, `metabase.warehouses-rest.api`)
- Used by: Server handler
- Key pattern: New API endpoints live in domain-specific modules (e.g., `src/metabase/dashboards_rest/api.clj`), **not** under `src/metabase/api/`. The `src/metabase/api/` namespace is reserved for shared macros, middleware, and utilities.

**API Macros & Framework:**
- Purpose: Provide the `defendpoint` macro for defining typed REST endpoints with automatic validation, OpenAPI spec generation
- Location: `src/metabase/api/macros.clj`, `src/metabase/api/macros/`
- Contains: Endpoint definition macros, parameter parsing, Malli schema validation
- Depends on: Malli, Compojure, Ring
- Used by: All API endpoint namespaces

**Domain Modules (Backend):**
- Purpose: Encapsulate business logic for each feature area
- Location: `src/metabase/<feature>/` (e.g., `src/metabase/dashboards/`, `src/metabase/collections/`, `src/metabase/search/`)
- Contains: `api.clj` (endpoints), `core.clj` (business logic), `models.clj` (Toucan model definitions), `init.clj` (module initialization)
- Depends on: `metabase.models.*`, app-db, query processor, events
- Used by: API routes
- Key convention: Each domain module is a self-contained directory with `api.clj` for endpoints and `core.clj` for logic. Modules with `_rest` suffix (e.g., `dashboards_rest`) contain the REST API layer.

**Query Processor (QP):**
- Purpose: Compile and execute queries from MBQL to native SQL, apply transforms, enforce permissions
- Location: `src/metabase/query_processor/`
- Contains: Middleware pipeline (`middleware/`), compilation (`compile.clj`), execution (`execute.clj`), pre/post processing (`preprocess.clj`, `postprocess.clj`), pipeline protocol (`pipeline.clj`)
- Depends on: Drivers, metadata providers, permissions
- Used by: API endpoints (`/api/dataset`, card execution), embedding, public sharing
- Key pattern: QP uses a dynamic-var-based pipeline where `*execute*`, `*result*`, `*reduce*` can be rebound by middleware stages

**Driver System:**
- Purpose: Abstract database-specific operations behind a multimethod-based interface
- Location: `src/metabase/driver.clj` (protocol), `src/metabase/driver/` (base implementations), `modules/drivers/` (individual drivers)
- Contains: Multimethod definitions for introspection, query execution, metadata sync; base SQL and JDBC implementations
- Depends on: Nothing (leaf layer)
- Used by: Query Processor, Sync, metadata operations
- Key pattern: Drivers register via `driver/register!` and declare parent drivers (e.g., `:postgres` -> `:sql-jdbc` -> `:sql`). Each driver in `modules/drivers/` is a separate deps.edn project loaded at runtime.

**Application Database (App DB):**
- Purpose: Manage the internal Metabase database (H2, Postgres, MySQL) storing metadata, settings, users
- Location: `src/metabase/app_db/`
- Contains: Connection management, migrations (Liquibase), encryption, custom migrations
- Depends on: Liquibase, HikariCP/C3P0
- Used by: All domain modules via Toucan ORM

**Models (Toucan):**
- Purpose: Define database entity models with lifecycle hooks, permissions, serialization
- Location: `src/metabase/models/` (shared model utilities), individual models live in their domain module (e.g., `src/metabase/dashboards/models.clj`)
- Contains: Model definitions, `interface.clj` (shared protocols), `dispatch.clj`, `serialization.clj`
- Depends on: App DB, Toucan 2
- Used by: API handlers, domain logic

**Events System:**
- Purpose: Publish/subscribe event bus for decoupled side effects (audit logging, analytics, notifications)
- Location: `src/metabase/events/`
- Contains: `core.clj` (public API), `impl.clj` (Methodical multimethod-based dispatch), `schema.clj` (event schemas)
- Depends on: Methodical
- Used by: API handlers publish events; analytics, audit, notification modules subscribe
- Key pattern: Events use qualified keywords (e.g., `:event/database-create`). Subscribers derive their dispatch key from event topics and implement `publish-event!` methods.

**Sync:**
- Purpose: Discover and synchronize database metadata (schemas, tables, fields, field values)
- Location: `src/metabase/sync/`
- Contains: Metadata sync, analysis (fingerprinting, classification), scheduling
- Depends on: Drivers, models
- Used by: Database connection setup, scheduled tasks

**Scheduled Tasks:**
- Purpose: Run periodic background jobs (sync, cleanup, notifications)
- Location: `src/metabase/task/`
- Contains: Quartz scheduler integration, task registration via `def-startup-logic!`
- Depends on: Quartz, domain modules
- Used by: Startup initialization

**Notification System:**
- Purpose: Send alerts, dashboard subscriptions, and other notifications via email/Slack/webhook
- Location: `src/metabase/notification/`
- Contains: Event handlers, payload construction, send logic, channel management
- Depends on: Events, channels, models
- Used by: Alert/subscription triggers

**Frontend SPA (React/Redux/TypeScript):**
- Purpose: Single-page application providing the Metabase UI
- Location: `frontend/src/metabase/`
- Contains: React components, Redux state management, RTK Query API layer, routing
- Depends on: Backend REST API
- Used by: End users via browser

**Frontend API Layer (RTK Query):**
- Purpose: Type-safe API client with caching, auto-generated hooks
- Location: `frontend/src/metabase/api/`
- Contains: RTK Query API definitions per resource (e.g., `card.ts`, `dashboard.ts`, `database.ts`), tag-based cache invalidation
- Depends on: Redux Toolkit, backend REST API
- Used by: React components and hooks

**Metabase-lib (Frontend Query Library):**
- Purpose: Client-side query building, MBQL manipulation, display name generation
- Location: `frontend/src/metabase-lib/`
- Contains: Query manipulation functions, type utilities, metadata helpers
- Depends on: Backend metadata API
- Used by: Query builder UI, visualization components

**Frontend Plugin System:**
- Purpose: Allow Enterprise features to extend OSS UI without direct imports
- Location: `frontend/src/metabase/plugins/` (plugin registry), `enterprise/frontend/src/metabase-enterprise/` (EE implementations)
- Contains: Plugin constants (e.g., `PLUGIN_COLLECTIONS`, `PLUGIN_AUTH_PROVIDERS`), OSS defaults, EE overrides
- Depends on: Nothing (plugin interface is in OSS)
- Used by: Components that need conditional EE behavior
- Key pattern: OSS defines plugin objects with default behavior in `plugins/oss/`. EE code mutates these objects at startup via `initializePlugins()`. OSS code references plugins without importing EE code.

**Enterprise Backend:**
- Purpose: Premium features (sandboxing, audit, SCIM, advanced permissions, AI features)
- Location: `enterprise/backend/src/metabase_enterprise/`
- Contains: EE API routes, EE method implementations, premium feature checks
- Depends on: OSS backend (extends via multimethods)
- Used by: EE route handler (gets first priority in route resolution)

**Enterprise Frontend:**
- Purpose: Premium UI features
- Location: `enterprise/frontend/src/metabase-enterprise/`
- Contains: EE components, plugin overrides, EE-specific pages
- Depends on: OSS frontend plugin system
- Used by: Frontend plugin initialization

## Data Flow

**Query Execution (API -> Result):**

1. Client sends POST to `/api/dataset` or `/api/card/:id/query`
2. Ring middleware chain processes request (auth, session, JSON parsing, offset paging)
3. API handler validates parameters using Malli schemas
4. Query Processor receives MBQL query and runs middleware pipeline:
   - Preprocessing: expand macros, add implicit joins/clauses, resolve references, check permissions
   - Compilation: MBQL -> native SQL via driver multimethods
   - Execution: Driver runs query against data warehouse, returns reducible rows
   - Postprocessing: format rows, add metadata, apply limits, truncate
5. Results streamed back as JSON response

**Database Sync Flow:**

1. Sync triggered by schedule (Quartz) or manual API call
2. `metabase.sync/sync-database!` orchestrates the process
3. Driver's `describe-database` returns schemas/tables
4. Driver's `describe-fields` returns column metadata
5. Fingerprinting and classification analyze sample data
6. Metadata saved to app-db via Toucan models
7. Events published for audit trail

**Frontend Data Flow:**

1. React component mounts, calls RTK Query hook (e.g., `useGetCardQuery`)
2. RTK Query checks cache; if miss, dispatches API request via `apiQuery` base query
3. Response stored in Redux store under `metabase-api` reducer path
4. Component re-renders with data
5. Mutations trigger cache tag invalidation for automatic refetch

**State Management:**
- Backend: Stateless request handling with app-db as source of truth. Dynamic vars for request-scoped state (current user, driver, permissions).
- Frontend: Redux store with RTK Query for server state, legacy Redux slices for UI state. React Router for navigation state.

## Key Abstractions

**MBQL (Metabase Query Language):**
- Purpose: Database-agnostic query representation
- Examples: Used throughout `src/metabase/query_processor/`, `frontend/src/metabase-lib/`
- Pattern: Nested Clojure/JSON maps with `:type`, `:query`, `:database` keys. Compiled to native SQL by drivers.

**Driver Multimethods:**
- Purpose: Database-specific behavior behind a uniform interface
- Examples: `src/metabase/driver.clj`, `src/metabase/driver/sql.clj`, `src/metabase/driver/sql_jdbc.clj`
- Pattern: Clojure multimethods dispatching on driver keyword. Drivers inherit from parent drivers (`:sql-jdbc` -> `:sql`). Individual drivers in `modules/drivers/<name>/`.

**Toucan Models:**
- Purpose: ORM for app-db entities
- Examples: Domain module `models.clj` files (e.g., `src/metabase/dashboards/models.clj`)
- Pattern: Toucan 2 model definitions with lifecycle hooks (`:before-insert`, `:after-select`), permission checks via `mi/can-read?` / `mi/can-write?`

**Frontend Plugins:**
- Purpose: Extensibility points for EE features
- Examples: `frontend/src/metabase/plugins/index.ts`, `frontend/src/metabase/plugins/oss/`
- Pattern: Mutable objects exported from OSS. EE code mutates them at init time. Components read plugin values at render time.

**Premium Features:**
- Purpose: Gate EE functionality behind license token checks
- Examples: `src/metabase/premium_features/`, `enterprise/backend/src/metabase_enterprise/premium_features/`
- Pattern: `premium-features/has-feature?` checks at API and logic layers. EE routes require specific features.

## Entry Points

**Backend Server Start:**
- Location: `src/metabase/cmd/core.clj` (CLI entry), `src/metabase/startup/core.clj` (initialization)
- Triggers: `java -jar metabase.jar` or `clojure -M:run`
- Responsibilities: Initialize app-db, run migrations, load drivers, start Jetty server, run startup logic

**Frontend App Bootstrap:**
- Location: `frontend/src/metabase/app.js` (main entry), `frontend/src/metabase/App.tsx` (root component)
- Triggers: Browser loads `index.html`
- Responsibilities: Initialize plugins, set up Redux store, configure router, render app

**API Request Handler:**
- Location: `src/metabase/server/handler.clj` (`make-handler`)
- Triggers: Every HTTP request
- Responsibilities: Apply middleware chain, route to API handler, return response

**Frontend Route Configuration:**
- Location: `frontend/src/metabase/routes.jsx` (main app), `frontend/src/metabase/routes-embed.tsx` (embed), `frontend/src/metabase/routes-public.tsx` (public)
- Triggers: URL navigation
- Responsibilities: Map URL paths to React components, handle auth guards

## Error Handling

**Strategy:** Multi-layered with middleware-based exception handling on backend, error boundaries on frontend.

**Patterns:**
- Backend API errors return structured JSON with `:errors` map or `:message` string. HTTP status codes follow REST conventions.
- `src/metabase/server/middleware/exceptions.clj` catches unhandled exceptions and formats error responses.
- QP errors use typed error system (`src/metabase/query_processor/error_type.clj`) with categories like `:invalid-query`, `:db`, `:client`.
- Frontend uses React error boundaries (`frontend/src/metabase/ErrorBoundary.tsx`) and RTK Query error handling.

## Cross-Cutting Concerns

**Logging:** `metabase.util.log` wrapping Log4j2. Configuration at `resources/log4j2.xml`.

**Validation:** Malli schemas for API parameter validation (backend), TypeScript types + Malli-generated OpenAPI specs for frontend.

**Authentication:** Session-based auth with middleware (`src/metabase/server/middleware/auth.clj`, `session.clj`). Supports local passwords, LDAP, SSO (SAML, JWT, Google). API keys for programmatic access. Current user bound to request-scoped dynamic vars.

**Permissions:** Graph-based permission system in `src/metabase/permissions/`. Checked at API layer and within QP middleware. Enterprise adds sandboxing, advanced permissions.

**Internationalization:** Backend uses `metabase.util.i18n` with `tru`/`deferred-tru`. Frontend uses `ttag` library. Translation files in `locales/`.

---

*Architecture analysis: 2026-03-11*
