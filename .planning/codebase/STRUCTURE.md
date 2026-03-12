# Codebase Structure

**Analysis Date:** 2026-03-11

## Directory Layout

```
metabase/
├── src/metabase/               # Backend source (Clojure) - OSS
├── enterprise/backend/src/     # Backend source (Clojure) - Enterprise
├── frontend/src/metabase/      # Frontend source (TypeScript/React) - OSS
├── frontend/src/metabase-lib/  # Frontend query library
├── frontend/src/metabase-types/# Frontend TypeScript type definitions
├── enterprise/frontend/src/    # Frontend source - Enterprise
├── modules/drivers/            # Database driver modules (each a separate project)
├── test/metabase/              # Backend unit/integration tests
├── frontend/test/              # Frontend unit tests (Jest)
├── e2e/                        # End-to-end tests (Cypress)
├── resources/                  # Static resources, migrations, configs
├── dev/                        # Development-only utilities and REPL helpers
├── bin/                        # Build and utility scripts
├── docs/                       # User-facing documentation
├── mage/                       # Build automation tool (Clojure)
├── release/                    # Release scripts
├── locales/                    # Translation files (.po)
└── .github/                    # CI workflows and GitHub config
```

## Directory Purposes

**`src/metabase/`:**
- Purpose: All OSS backend source code
- Contains: Domain modules, each as a subdirectory (e.g., `dashboards/`, `collections/`, `search/`)
- Key files:
  - `driver.clj`: Driver multimethod protocol
  - `query_processor.clj`: QP entry point
  - `server/`: Ring server, middleware, routes
  - `api/macros.clj`: `defendpoint` macro for API endpoints
  - `api_routes/routes.clj`: Master route map
  - `startup/core.clj`: Server initialization
  - `cmd/core.clj`: CLI command handling
- Convention: Each domain module contains `api.clj`, `core.clj`, `models.clj`, `init.clj` as needed

**`src/metabase/<domain>/` (Domain Module Pattern):**
- Purpose: Self-contained feature area
- Contains:
  - `api.clj` - REST API endpoints using `defendpoint`
  - `core.clj` - Business logic (public API for the module)
  - `models.clj` - Toucan model definitions
  - `init.clj` - Module initialization (requiring side-effecting namespaces)
  - `settings.clj` - Module-specific Metabase settings
  - `task/` - Scheduled tasks for this module
- Key examples: `src/metabase/dashboards/`, `src/metabase/collections/`, `src/metabase/search/`, `src/metabase/sync/`, `src/metabase/notification/`

**`src/metabase/query_processor/`:**
- Purpose: MBQL query compilation and execution pipeline
- Contains: Middleware steps (`middleware/`), streaming response, pipeline protocol
- Key files:
  - `pipeline.clj`: Dynamic vars for pipeline stages
  - `preprocess.clj`, `postprocess.clj`: Pre/post processing
  - `compile.clj`: MBQL to native compilation
  - `execute.clj`: Query execution coordination
  - `middleware/`: ~30 middleware steps (permissions, caching, binning, etc.)

**`src/metabase/driver/`:**
- Purpose: Base driver implementations and shared driver utilities
- Contains: SQL driver base (`sql.clj`, `sql_jdbc.clj`), built-in drivers (H2, Postgres, MySQL)
- Key files:
  - `sql.clj`: Base SQL driver (HoneySQL generation)
  - `sql_jdbc.clj`: Base JDBC driver
  - `h2.clj`, `postgres.clj`, `mysql.clj`: Built-in drivers
  - `common.clj`: Shared driver utilities
  - `connection.clj`: Connection management

**`src/metabase/server/`:**
- Purpose: HTTP server setup and middleware
- Contains: Server lifecycle, route composition, Ring middleware
- Key files:
  - `handler.clj`: Constructs the Ring handler with middleware chain
  - `routes.clj`: Top-level route composition (public, embed, API, static files)
  - `instance.clj`: Jetty server start/stop
  - `middleware/`: Auth, session, JSON, security, logging, etc.

**`modules/drivers/`:**
- Purpose: External database driver implementations, each as a separate deps.edn project
- Contains: One directory per driver (athena, bigquery, clickhouse, databricks, mongo, oracle, redshift, snowflake, sqlite, sqlserver, etc.)
- Key pattern: Each driver has its own `deps.edn`, loaded dynamically via classloader. Driver registers itself with `driver/register!`.

**`enterprise/backend/src/metabase_enterprise/`:**
- Purpose: Enterprise-only backend features
- Contains: Feature modules (sandboxing, audit, SCIM, AI features, advanced permissions, etc.)
- Key files:
  - `api_routes/routes.clj`: EE route map (gets first priority over OSS routes)
  - `premium_features/`: License token and feature flag management
  - `sandbox/`: Row-level security (data sandboxing)
  - `audit_app/`: Audit logging
  - `scim/`: SCIM user provisioning
  - `metabot_v3/`: AI assistant

**`frontend/src/metabase/`:**
- Purpose: Main frontend application
- Contains: React components, pages, Redux state, API layer, routing
- Key subdirectories:
  - `api/`: RTK Query API definitions (one file per resource)
  - `redux/`: Redux slices and utilities
  - `plugins/`: Plugin system (OSS defaults in `oss/`, EE overrides loaded at init)
  - `ui/`: Design system components (Mantine-based)
  - `common/`: Shared components, hooks, utilities
  - `lib/`: Utility libraries (API client, analytics, auth, colors, i18n)
  - `entities/`: Legacy entity definitions (being replaced by RTK Query)
  - `querying/`: Query builder UI components
  - `visualizations/`: Chart and visualization components
  - `dashboard/`: Dashboard components and state
  - `query_builder/`: Question/query builder page
  - `embedding-sdk/`: Embedding SDK for external applications
  - `static-viz/`: Server-side rendering for static visualizations (emails, exports)

**`frontend/src/metabase-lib/`:**
- Purpose: Query manipulation library (client-side MBQL operations)
- Contains: Functions for building, modifying, and inspecting queries
- Key files: `query.ts`, `filter.ts`, `aggregation.ts`, `breakout.ts`, `join.ts`, `expression.ts`

**`frontend/src/metabase-types/`:**
- Purpose: Shared TypeScript type definitions
- Contains: API types, entity types, store types, guard utilities

**`enterprise/frontend/src/metabase-enterprise/`:**
- Purpose: Enterprise frontend features
- Contains: Feature modules that override OSS plugin defaults
- Key files:
  - `plugins.ts`: Registers all EE plugin overrides
  - `sdk-plugins.ts`: SDK-specific EE overrides
  - Feature directories mirror OSS structure (e.g., `audit_app/`, `sandboxes/`, `embedding/`)

**`resources/`:**
- Purpose: Static resources bundled into the JAR
- Contains: Database migrations, sample database, i18n configs, frontend build output
- Key files:
  - `migrations/`: Liquibase migration YAML files (numbered `000_` through `059_`)
  - `liquibase.yaml`: Migration entry point
  - `frontend_client/`: Built frontend assets (generated)
  - `sample-database.db.mv.db`: Sample H2 database
  - `log4j2.xml`: Logging configuration

**`e2e/`:**
- Purpose: Cypress end-to-end tests
- Contains: Test scenarios organized by feature area
- Key subdirectories:
  - `test/scenarios/`: Test files organized by feature (dashboard/, collections/, embedding/, etc.)
  - `support/`: Cypress helpers, commands, fixtures
  - `snapshot-creators/`: Database snapshot setup scripts

**`test/metabase/`:**
- Purpose: Backend tests (Clojure)
- Contains: Mirrors `src/metabase/` structure. Test namespaces match source namespaces with `_test` suffix.

**`dev/`:**
- Purpose: Development-only code (REPL helpers, dev API routes)
- Contains: Dev utilities, not included in production builds
- Key: `dev/src/` for dev source, `dev/test/` for dev-only tests

## Key File Locations

**Entry Points:**
- `src/metabase/cmd/core.clj`: CLI entry point (server start, migrations, etc.)
- `src/metabase/startup/core.clj`: Server initialization multimethod
- `frontend/src/metabase/app.js`: Frontend bootstrap
- `frontend/src/metabase/App.tsx`: Root React component
- `frontend/src/metabase/routes.jsx`: Main app routing

**Configuration:**
- `deps.edn`: Backend Clojure dependencies
- `package.json`: Frontend Node dependencies
- `rspack.config.js`: Frontend build configuration (primary)
- `rspack.main.config.js`: Main app Rspack config
- `tsconfig.json`: TypeScript configuration
- `resources/log4j2.xml`: Logging configuration
- `resources/liquibase.yaml`: Database migration entry point

**Core Logic:**
- `src/metabase/driver.clj`: Driver multimethod protocol
- `src/metabase/query_processor/`: Query processing pipeline
- `src/metabase/api_routes/routes.clj`: API route map
- `src/metabase/server/handler.clj`: Ring handler with middleware
- `frontend/src/metabase/api/api.ts`: RTK Query API base
- `frontend/src/metabase/store.js`: Redux store configuration

**Testing:**
- `test/metabase/`: Backend tests
- `frontend/test/`: Frontend unit test support files
- `e2e/test/scenarios/`: Cypress E2E tests
- `jest.config.js`: Jest configuration
- Frontend unit tests are co-located with source (`.unit.spec.ts` / `.unit.spec.tsx`)

## Naming Conventions

**Files (Backend Clojure):**
- `snake_case.clj` for namespace files (maps to `kebab-case` Clojure namespaces)
- `core.clj`: Module's main public API
- `api.clj`: REST API endpoints
- `models.clj`: Toucan model definitions
- `init.clj`: Module initialization (side-effect loading)
- `settings.clj`: Module-specific settings
- `impl.clj`: Private implementation details

**Files (Frontend TypeScript):**
- `PascalCase.tsx` for React component files
- `kebab-case.ts` for utilities and API files
- `camelCase.ts` for some utility modules
- `*.unit.spec.ts` / `*.unit.spec.tsx` for co-located unit tests
- `*.styled.tsx` for styled-components (legacy, prefer CSS Modules)
- `*.module.css` for CSS Modules (preferred)

**Directories:**
- Backend: `snake_case` matching Clojure namespace conventions
- Frontend: `kebab-case` for most directories, `snake_case` for some legacy modules (e.g., `query_builder/`, `static-viz/`)

**Domain Modules (Backend):**
- `src/metabase/<feature>/` for the module directory
- `*_rest` suffix for modules that are primarily REST API layers (e.g., `dashboards_rest/`, `queries_rest/`)
- Enterprise modules use `metabase_enterprise` namespace prefix

## Where to Add New Code

**New Backend API Endpoint:**
- Create module at `src/metabase/<feature>/api.clj` using `defendpoint` macro
- Register in `src/metabase/api_routes/routes.clj` route-map (keep sorted!)
- Add `init.clj` if the module needs startup initialization
- Tests at `test/metabase/<feature>/api_test.clj`
- **DO NOT** add endpoint namespaces under `src/metabase/api/`

**New Backend Domain Module:**
- Create directory `src/metabase/<feature>/`
- Add `core.clj` (business logic), `api.clj` (endpoints), `models.clj` (if new DB entities)
- Add `init.clj` to require all side-effecting namespaces
- Mirror test structure at `test/metabase/<feature>/`

**New Database Driver:**
- Create directory `modules/drivers/<driver-name>/`
- Add `deps.edn` with driver dependencies
- Implement driver namespace extending `:sql-jdbc` or `:sql` parent
- Register with `driver/register!`

**New Frontend Feature/Page:**
- Components at `frontend/src/metabase/<feature>/components/`
- Page containers at `frontend/src/metabase/<feature>/containers/`
- Routes added to `frontend/src/metabase/routes.jsx`
- API endpoints at `frontend/src/metabase/api/<feature>.ts` (RTK Query)
- Unit tests co-located as `*.unit.spec.tsx`

**New Frontend Component:**
- UI primitives: `frontend/src/metabase/ui/components/`
- Shared components: `frontend/src/metabase/common/components/`
- Feature-specific: `frontend/src/metabase/<feature>/components/`
- Use Mantine style props or CSS Modules for styling

**New Enterprise Feature (Backend):**
- Create module at `enterprise/backend/src/metabase_enterprise/<feature>/`
- Add EE routes to `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj`
- Gate with premium feature check

**New Enterprise Feature (Frontend):**
- Create module at `enterprise/frontend/src/metabase-enterprise/<feature>/`
- Register plugin overrides in `enterprise/frontend/src/metabase-enterprise/plugins.ts`
- OSS code must never directly import from `metabase-enterprise/`

**New E2E Test:**
- Add to `e2e/test/scenarios/<feature>/`
- Use helpers from `e2e/support/`

**Shared Utilities:**
- Backend: `src/metabase/util/` or `src/metabase/util.cljc`
- Frontend: `frontend/src/metabase/lib/`

## Special Directories

**`resources/migrations/`:**
- Purpose: Liquibase database migration files for the app-db
- Generated: No (hand-authored)
- Committed: Yes
- Convention: Files numbered `000_` through `059_` (and counting), using YAML format

**`resources/frontend_client/`:**
- Purpose: Built frontend assets served by the backend
- Generated: Yes (by Rspack build)
- Committed: No (build artifact)

**`target/`:**
- Purpose: Clojure compilation output
- Generated: Yes
- Committed: No

**`node_modules/`:**
- Purpose: Frontend dependencies
- Generated: Yes (by bun install)
- Committed: No

**`.storybook/`:**
- Purpose: Storybook configuration for component development
- Generated: No
- Committed: Yes

**`locales/`:**
- Purpose: Translation files (.po format) for i18n
- Generated: Partially (extracted from source, then translated)
- Committed: Yes

**`mage/`:**
- Purpose: Build automation tool (Clojure-based, similar to Make)
- Generated: No
- Committed: Yes

**`dev/`:**
- Purpose: Development-only code, REPL utilities, dev API routes
- Generated: No
- Committed: Yes
- Note: Not included in production builds

---

*Structure analysis: 2026-03-11*
