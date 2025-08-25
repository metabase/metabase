# Metabase Project Summary

## Overview
Metabase is a comprehensive open-source business intelligence platform that enables anyone in an organization to ask questions and learn from data. It provides a user-friendly interface for creating dashboards, visualizations, and reports without requiring SQL knowledge, while also offering advanced features for power users.

**Key Features:**
- Easy-to-use query builder and SQL editor
- Interactive dashboards with filters and real-time updates
- Data modeling capabilities with "Models" 
- Embedding and sharing capabilities
- Multi-database support with extensive driver ecosystem
- Enterprise features for advanced permissions and audit logging
- Cloud and self-hosted deployment options

## Architecture Overview

### Backend (Clojure)
- **Language:** Clojure 1.12.0 running on Java 21
- **Web Framework:** Ring + Compojure with Jetty server
- **Database:** H2 (default), PostgreSQL, MySQL/MariaDB supported
- **Build Tool:** deps.edn with extensive alias configurations

### Frontend (JavaScript/TypeScript)
- **Framework:** React with Redux Toolkit for state management
- **Build:** Modern JavaScript toolchain with Yarn
- **UI Library:** Mantine components with custom styling
- **Visualization:** Custom chart components with @visx

### Database Layer
- **ORM:** Toucan2 for database abstraction
- **Migrations:** Liquibase for database schema management
- **Connection Pool:** HikariCP via metabase/connection-pool
- **Multi-database:** Extensive driver system supporting 20+ databases

## Key File Paths & Descriptions

### Core Application Files
- `src/metabase/core/bootstrap.clj` - Main application entry point and classloader setup
- `src/metabase/core/core.clj` - Application initialization and lifecycle management
- `src/metabase/server/handler.clj` - Main Ring handler with middleware stack
- `src/metabase/server/core.clj` - Web server configuration and routing
- `src/metabase/api/common.clj` - Common API utilities and authentication helpers

### Database & Models
- `src/metabase/app_db/` - Application database configuration and initialization
- `src/metabase/warehouses/models/database.clj` - Database connection models (implements visible-filter-clause for SQL-level permission filtering)
- `src/metabase/warehouses/api.clj` - Database API endpoints with optimized permission filtering
- `src/metabase/permissions/models/data_permissions/sql.clj` - SQL-level permission filtering helpers for models
- `src/metabase/models/` - Domain models (Note: DO_NOT_ADD_NEW_FILES_HERE.txt indicates this is being refactored)
- `src/metabase/driver/` - Database driver implementations (H2, MySQL, PostgreSQL, etc.)

### Collections & Permissions
- `src/metabase/collections/api.clj` - Collection management API endpoints (archiving via PUT with `archived: true`; namespace inheritance from parent collections)
- `src/metabase/collections/models/collection.clj` - Collection domain logic and permissions (`perms-for-archiving`, `perms-for-moving`)
- `src/metabase/permissions/core.clj` - Core permissions system and path utilities
- `src/metabase/permissions/api.clj` - Permissions group management API with tenancy filtering support (`GET /api/permissions/group?tenancy=external|internal`)
- `src/metabase/permissions/settings.clj` - Permission-related settings including tenant configuration (`use-tenants` setting)
- `src/metabase/api/common.clj` - Permission checking helpers (`write-check`, `check-403`)

### Query Processing
- `src/metabase/query_processor/` - Core query processing engine
- `src/metabase/driver/*/` - Database-specific query execution
- `src/metabase/mbql/` - Metabase Query Language implementation

### API Layer
- `src/metabase/api/` - REST API endpoints organized by domain
- `src/metabase/api/macros.clj` - API definition macros and utilities
- `src/metabase/server/middleware/` - Authentication, authorization, and request processing

### Frontend
- `frontend/src/metabase/` - Main React application
- `frontend/src/metabase-types/` - TypeScript type definitions
- `frontend/src/metabase/api/` - Frontend API client

### Enterprise Features
- `enterprise/backend/src/metabase_enterprise/` - Enterprise-only features and functionality
- `enterprise/backend/src/metabase_enterprise/sandbox/api/user.clj` - User attribute management API (includes tenant attributes)
- `enterprise/backend/src/metabase_enterprise/tenants/` - Multi-tenant support with tenant models and attributes
- `enterprise/backend/test/metabase_enterprise/` - Enterprise feature tests

### Configuration & Build
- `deps.edn` - Clojure dependency and build configuration
- `package.json` - Frontend dependencies and scripts
- `bin/build/` - Build scripts and utilities
- `resources/` - Static resources and configuration files

## Dependencies & Their Roles

### Core Clojure Dependencies
- **`org.clojure/clojure 1.12.0`** - Core language runtime
- **`ring/ring-core 1.14.1`** - HTTP server abstraction
- **`compojure/compojure 1.7.1`** - Routing library
- **`io.github.camsaul/toucan2 1.0.565`** - Modern ORM for database operations

### Database & Persistence
- **`com.github.seancorfield/next.jdbc 1.3.1002`** - JDBC wrapper
- **`com.github.seancorfield/honeysql 2.7.1310`** - SQL query builder
- **`org.postgresql/postgresql 42.7.5`** - PostgreSQL driver
- **`org.mariadb.jdbc/mariadb-java-client 2.7.10`** - MySQL/MariaDB driver
- **`com.h2database/h2 2.1.214`** - Embedded H2 database

### Web & API
- **`cheshire/cheshire 6.0.0`** - JSON parsing and generation
- **`hiccup/hiccup 1.0.5`** - HTML generation
- **`buddy/buddy-core 1.12.0-430`** - Cryptographic operations
- **`buddy/buddy-sign 3.6.1-359`** - JWT and token handling

### Data Processing & Analytics
- **`kixi/stats 0.5.7`** - Statistical functions
- **`bigml/histogram 5.0.0`** - Data distribution analysis
- **`instaparse/instaparse 1.5.0`** - Grammar-based parsing

### Frontend Dependencies
- **`@reduxjs/toolkit 2.5.0`** - State management
- **`@mantine/core 7.17.0`** - UI component library
- **`@tanstack/react-table 8.21.2`** - Table components
- **`@visx/*`** - Data visualization components

## Available Tools & APIs

### Development Environment
```bash
# Backend development
./bin/build-drivers.sh    # Build database drivers
clojure -M:run           # Start development server
clojure -M:dev           # Start with development dependencies

# Frontend development  
yarn install             # Install dependencies
yarn build-hot          # Development build with hot reload
yarn build              # Production build

# Testing
clojure -X:dev:drivers:drivers-dev:ee:ee-dev:test :only metabase.queries.models.card-test
yarn test               # Run frontend tests
```

### API Endpoints
The application exposes a comprehensive REST API:
- `/api/session` - Authentication and session management
- `/api/database` - Database connection management
- `/api/card` - Question/query management
- `/api/dashboard` - Dashboard operations
- `/api/collection` - Organizing questions and dashboards (archiving via `PUT /api/collection/:id` with `archived: true`)
- `/api/user` - User management
- `/api/permissions` - Access control
- `/api/mt/user/attributes` - User login attributes (Enterprise: includes tenant model attributes)
- `/api/ee/tenants` - Tenant management (Enterprise: create, update, list tenants with attributes)

### Permissions API with Tenancy Filtering
```bash
# Get all permission groups (default behavior)
GET /api/permissions/group

# Get only internal (non-tenant) permission groups
GET /api/permissions/group?tenancy=internal

# Get only external (tenant) permission groups  
GET /api/permissions/group?tenancy=external

# Invalid tenancy parameter returns 400 Bad Request
GET /api/permissions/group?tenancy=invalid
```

**Tenancy Filter Behavior:**
- **No parameter**: Returns all groups, respecting existing filters (excludes tenant groups when tenants feature disabled)
- **`tenancy=internal`**: Returns only non-tenant groups (`is_tenant_group = false`)
- **`tenancy=external`**: Returns only tenant groups (`is_tenant_group = true`), empty result when tenants feature disabled
- **Invalid values**: Return 400 Bad Request with validation error
- **Backward compatible**: Existing API calls continue to work unchanged

### Collection Management API
```clojure
;; Create collection with namespace inheritance
POST /api/collection
{
  "name": "My Collection",
  "parent_id": 123,            ; optional - if provided, inherits namespace from parent
  "namespace": "snippets"      ; optional - if omitted, inherits from parent_id; if provided, uses this value
}

;; Archive (delete) a collection via PUT endpoint
PUT /api/collection/:id
{
  "archived": true,
  "parent_id": null  ; optional - specify new parent when unarchiving
}

;; Permission checking for collection operations
(require '[metabase.collections.models.collection :as collection])
(collection/perms-for-archiving collection) ; returns required permission paths for collection + descendants
(collection/perms-for-moving collection new-parent) ; returns permissions for moving (collection + descendants + new parent)
(collection/perms-for-collection-and-descendants collection) ; helper for collection + descendants only
```

### Tenant Attributes API (Enterprise)
```clojure
;; Get all available user attribute keys (includes tenant attributes)
GET /api/mt/user/attributes
;; Returns: ["@tenant.slug", "environment", "region", "user-defined-key", ...]

;; Create tenant with attributes
POST /api/ee/tenants
{
  "name": "Production Tenant",
  "slug": "prod",
  "attributes": {
    "environment": "production",
    "region": "us-east-1"
  }
}

;; Update tenant attributes
PUT /api/ee/tenants/:id
{
  "attributes": {
    "environment": "staging",
    "cluster": "new-cluster"
  }
}

;; Get tenant login attribute keys programmatically
(require '[metabase-enterprise.tenants.core :as tenants])
(mt/with-premium-features #{:tenants}
  (mt/with-temporary-setting-values [use-tenants true]
    (tenants/login-attribute-keys))) ; => #{"@tenant.slug" "environment" "region" ...}
```

### Driver Development
```clojure
;; Example driver namespace structure
(ns metabase.driver.my-database
  (:require [metabase.driver :as driver]))

(driver/register! :my-database)

(defmethod driver/can-connect? :my-database [driver details]
  ;; Connection validation logic
  )
```

## Performance Optimization Patterns

### SQL-Level Permission Filtering
Metabase implements efficient permission filtering at the SQL level to avoid "fetch-then-filter" anti-patterns:

```clojure
;; Database model implements visible-filter-clause for efficient filtering
(mu/defmethod mi/visible-filter-clause :model/Database
  [_model column-or-exp user-info permission-mapping]
  [:in column-or-exp
   (perms.sql/visible-database-filter-select user-info permission-mapping)])

;; API uses SQL-level filtering instead of post-fetch filtering
(let [user-info {:user-id api/*current-user-id* :is-superuser? (mi/superuser?)}
      permission-mapping {:perms/view-data :unrestricted}
      where-clause (if filter-by-data-access?
                     [:and base-where (mi/visible-filter-clause :model/Database :id user-info permission-mapping)]
                     base-where)]
  (t2/select :model/Database {:where where-clause ...}))
```

### Permission Optimization Helpers
- **`metabase.permissions.models.data-permissions.sql/visible-database-filter-select`** - Creates SQL subquery for accessible database IDs
- **`metabase.permissions.models.data-permissions.sql/has-perms-for-database-as-honey-sql?`** - Builds database-specific permission checks
- **`metabase.permissions.models.data-permissions.sql/visible-table-filter-select`** - Creates SQL subquery for accessible table IDs

### Performance Benefits
- **Complexity Reduction:** O(total_entities) → O(user_accessible_entities)
- **Database Load Reduction:** Only fetch entities the user can actually access
- **Scalability:** Performance scales with user permissions, not total system size
- **Compatibility:** Maintains full backward compatibility while improving performance

## Implementation Patterns and Conventions

### Clojure Code Organization
- **Namespace Structure:** Follows domain-driven organization (`metabase.domain.subdomain`)
- **API Endpoints:** Use `defendpoint` macro for consistent API definition
- **Database Models:** Leverage Toucan2 for model definitions and queries
- **Middleware:** Ring middleware for cross-cutting concerns (auth, logging, etc.)

### API Development Patterns
- **Parameter Validation:** Use Malli schemas for type-safe parameter validation (e.g., `[:maybe [:enum "external" "internal"]]`)
- **Backward Compatibility:** New optional parameters should maintain existing behavior when omitted
- **Error Handling:** Return appropriate HTTP status codes (400 for validation errors, 403 for permissions)
- **Query Building:** Use HoneySQL for dynamic SQL generation with conditional clauses

### Database Patterns
- **Multi-tenancy:** Single database with user-based access control
- **Tenant Support (Enterprise):** Dedicated tenant models with configurable attributes that merge into user login attributes
- **Migrations:** Liquibase changesets in `resources/migrations/`
- **Connection Pooling:** HikariCP for efficient database connections
- **Driver System:** Plugin architecture for supporting multiple databases

### Permissions & Security Patterns
- **Collection Permissions:** Path-based permissions (`/collection/{id}/` for read-write, `/collection/{id}/read/` for read-only)
- **Hierarchical Access:** Collections inherit from parent permissions by default
- **Permission Checking:** 
  - `perms-for-archiving` - requires write permissions for collection and descendants (NOT parent)
  - `perms-for-moving` - requires write permissions for collection being moved, its descendants, and NEW parent (NOT old parent)
  - `perms-for-collection-and-descendants` - helper function for collection + descendants permissions without parent
  - `api/write-check` - validates user has write access to collection
- **Recent Permission Changes (2025):** Moving collections no longer requires permissions on the source parent collection, only on the collection being moved and the destination parent
- **Personal Collections:** Special handling - cannot be archived, permissions bound dynamically to owner

### Frontend Architecture
- **Component Structure:** Functional React components with hooks
- **State Management:** Redux Toolkit with normalized state
- **Routing:** React Router for navigation
- **API Communication:** RTK Query for data fetching

### Error Handling
- **Backend:** Slingshot for structured exception handling
- **API Responses:** Consistent error response format with HTTP status codes
- **Frontend:** Error boundaries and user-friendly error messages

## Development Workflow

### Setting Up Development Environment
1. **Prerequisites:** Java 21+, Clojure CLI, Node.js 22+, Yarn
2. **Backend Setup:**
   ```bash
   ./bin/build-drivers.sh
   clojure -M:dev:run
   ```
3. **Frontend Setup:**
   ```bash
   yarn install
   yarn build-hot
   ```

### Code Quality & Testing
- **Linting:** clj-kondo for Clojure, ESLint for JavaScript
- **Testing Framework:** Metabase uses [Hawk](https://github.com/metabase/hawk) as its test runner
- **Test Runner:** Available via both REPL and command line:
  ```clojure
  ;; Using HAWK
  (require '[mb.hawk.core])
  (mb.hawk.core/find-and-run-tests-repl {:only ['metabase.queries.models.card-test]})
  
  ;; Shell method (both clj and clojure commands work)
  clojure -X:dev:drivers:drivers-dev:ee:ee-dev:test :only metabase.queries.models.card-test
  ```
- **Clojure CLI Version:** 1.12.0.1517 (both `clj` and `clojure` commands available)
- **Enterprise Testing:** Test tenant features with `mt/with-premium-features #{:tenants}` and `mt/with-temporary-setting-values [use-tenants true]`
- **CI/CD:** GitHub Actions for automated testing and deployment

### REPL-Driven Development (Clojure)
- **Development Workflow:** Use `clojure -M:dev` for REPL with live reloading
- **Namespace Reloading:** Always use `:reload` flag: `(require '[namespace] :reload)`
- **Context Switching:** Use `(in-ns 'namespace)` to work in specific namespaces
- **Debugging:** Leverage REPL for incremental testing and function exploration
- **Specialized Editing:** Use `clojure_edit` tools for syntax-aware file modifications

### API Development Best Practices
- **Test-Driven Development:** Write tests before implementing new API features
- **Parameter Validation:** Use Malli schemas for robust input validation
- **Feature Flags:** Use premium feature checks for enterprise functionality
- **Documentation:** Update docstrings with parameter descriptions and examples
- **Backward Compatibility:** Ensure existing functionality remains unchanged

### Database Development
- **Local Development:** H2 embedded database (default)
- **Testing:** In-memory H2 or PostgreSQL/MySQL via Docker
- **Production:** PostgreSQL or MySQL recommended

## Extension Points

### Custom Database Drivers
- Implement `metabase.driver` protocol methods
- Handle database-specific SQL generation
- Provide connection and introspection capabilities
- Package as JAR and place in plugins directory

### API Extensions
- Add new endpoints in `metabase.api.*` namespaces
- Use `defendpoint` macro for consistent API definition
- Implement proper authentication and authorization checks
- Follow established patterns for parameter validation and error handling

### Collection & Permission System Extensions
- **Custom Permission Policies:** Extend `metabase.permissions.core` for specialized access controls
- **Collection Hooks:** Add validation or side effects in `t2/define-before-update` and `t2/define-after-update`
- **Permission Inheritance:** Modify `copy-collection-permissions!` for custom inheritance patterns
- **Archive Behavior:** Extend `archive-collection!` for custom archiving workflows
- **Namespace Inheritance:** Collections automatically inherit namespace from parent when not explicitly specified (implemented in `create-collection!`)

### Tenant System Extensions (Enterprise)
- **Custom Tenant Attributes:** Extend tenant model validation in `metabase-enterprise.tenants.model/Attributes`
- **Login Attribute Integration:** Modify `metabase-enterprise.tenants.core/login-attribute-keys` for custom attribute sources
- **Tenant-Aware APIs:** Use tenant context in API endpoints via `@api/*current-user*` tenant information
- **Attribute Validation:** Add custom validation rules for tenant attribute keys (must not start with `@`)

### Frontend Customization
- Create custom visualization components
- Add new dashboard filters and parameters
- Extend the query builder interface
- Customize themes and styling

### Plugin System
- Place JAR files in `plugins/` directory
- Automatic loading of database drivers
- Enterprise features as separate modules in `enterprise/`

### Embedding & Integration
- Public embedding with signed URLs
- Full-app embedding for white-labeling
- REST API for programmatic access
- Webhook notifications for events

## Common Debugging Patterns

### Common Performance Debugging Patterns

#### Permission-Related Performance Issues
1. **Identify Fetch-Then-Filter Anti-patterns:** Look for code that fetches all entities then applies `mi/can-read?` filtering
2. **Implement SQL-Level Filtering:** Use `visible-filter-clause` pattern to filter at database level
3. **Leverage Existing Helpers:** Use functions from `metabase.permissions.models.data-permissions.sql`

```clojure
;; ❌ Anti-pattern: Fetch all, then filter
(filter mi/can-read? (t2/select :model/Database))

;; ✅ Optimized: Filter at SQL level  
(let [user-info {:user-id api/*current-user-id* :is-superuser? (mi/superuser?)}
      permission-mapping {:perms/view-data :unrestricted}]
  (t2/select :model/Database 
    {:where (mi/visible-filter-clause :model/Database :id user-info permission-mapping)}))
```

#### Database API Performance Investigation
For database listing performance issues:
1. **Check User Context:** Verify if user is superuser vs non-superuser (performance can differ dramatically)
2. **Measure Permission Overhead:** Individual permission checks scale linearly with database count
3. **Profile SQL Queries:** Use `:where` clauses with permission filtering to reduce data fetched
4. **Test Scaling:** Performance should scale with user-accessible databases, not total database count

### Collection & Permission Issues
1. **Check Required Permissions:** Use `(collection/perms-for-archiving collection)` or `(collection/perms-for-moving collection new-parent)` to see what permissions are needed
2. **Verify User Permissions:** Check `@api/*current-user-permissions-set*` against required permissions
3. **Permission Path Format:** Collections use `/collection/{id}/` (write) and `/collection/{id}/read/` (read) paths
4. **Personal Collection Gotchas:** Personal collections cannot be archived and have dynamic permissions
5. **Move Operations:** Only require permissions on the collection being moved and the NEW parent, NOT the old parent (as of 2025 updates)
6. **Namespace Inheritance:** Child collections inherit namespace from parent when not explicitly specified; use `(contains? params :namespace)` to distinguish between omitted vs explicit nil values

### REPL Debugging Workflow
```clojure
;; 1. Load and switch to relevant namespace
(require '[metabase.collections.models.collection :as collection] :reload)
(in-ns 'metabase.collections.models.collection)

;; 2. Test functions with mock data
(let [test-collection {:id 123 :location "/10/20/"}
      new-parent {:id 456 :location "/30/"}]
  (perms-for-archiving test-collection)  ; collection + descendants only
  (perms-for-moving test-collection new-parent)  ; collection + descendants + new parent
  (perms-for-collection-and-descendants test-collection))  ; helper function

;; 3. Check permission sets
(require '[metabase.permissions.core :as perms])
(perms/collection-readwrite-path 123) ; => "/collection/123/"

;; 4. Test namespace inheritance
(require '[metabase.collections.api :as collections.api])
;; Test inheritance when namespace not provided
(collections.api/create-collection! {:name "Child" :parent_id 123})
;; Test explicit namespace (even if nil)
(collections.api/create-collection! {:name "Child" :parent_id 123 :namespace nil})
```

### Tenant Debugging Patterns (Enterprise)
```clojure
;; 1. Test tenant attribute functionality
(require '[metabase-enterprise.tenants.core :as tenants])
(mt/with-premium-features #{:tenants}
  (mt/with-temporary-setting-values [use-tenants true]
    (mt/with-temp
      [:model/Tenant tenant {:name "Test" :slug "test" :attributes {"env" "dev"}}]
      (tenants/login-attribute-keys)))) ; => #{"@tenant.slug" "env"}

;; 2. Debug user attribute endpoint
(require '[metabase-enterprise.sandbox.api.user :as user-api])
(mt/with-premium-features #{:sandboxes :tenants}
  (mt/with-temporary-setting-values [use-tenants true]
    ;; Test that tenant attributes appear in user attributes endpoint
    (mt/user-http-request :crowberto :get 200 "mt/user/attributes")))

;; 3. Check tenant model attributes
(t2/select :model/Tenant) ; List all tenants
(t2/select-one-fn :attributes :model/Tenant :slug "tenant-slug") ; Get specific tenant attributes
```

### API Development Debugging Patterns
```clojure
;; 1. Test parameter validation
(require '[metabase.permissions.api :as api])
;; Test endpoint with different parameter combinations
(mt/user-http-request :crowberto :get 200 "permissions/group")
(mt/user-http-request :crowberto :get 200 "permissions/group" {:tenancy "internal"})
(mt/user-http-request :crowberto :get 400 "permissions/group" {:tenancy "invalid"})

;; 2. Debug SQL query generation
(require '[metabase.permissions.api :as api])
(require '[metabase.settings.core :as setting])
;; Test different tenancy filter conditions
(let [base-where [:and]
      tenancy "external"
      tenants-enabled? (setting/get :use-tenants)]
  (case tenancy
    "external" (if tenants-enabled?
                 [:and base-where [:= :is_tenant_group true]]
                 [:= 1 0])  ; No results when tenants disabled
    "internal" [:and base-where [:= :is_tenant_group false]]
    base-where))

;; 3. Test premium feature availability
(require '[metabase.premium-features.core :as premium-features])
(premium-features/enable-tenants?)  ; Check if tenants feature enabled
```

## Security Considerations
- **Authentication:** Session-based with JWT tokens
- **Authorization:** Role-based permissions (Admin, Editor, Viewer)
- **Data Security:** Row-level security for enterprise features
- **Embedding:** Signed embedding URLs with expiration
- **Database Access:** Principle of least privilege for connections

## Performance Optimization

### Query-Level Optimizations
- **SQL-Level Permission Filtering:** Implements `visible-filter-clause` pattern for models to filter at database level instead of post-fetch
- **Permission Helper Functions:** `data-permissions.sql` namespace provides reusable SQL generation for permission-aware queries
- **Efficient Scaling:** APIs scale with user permissions (O(accessible_entities)) rather than total system size (O(total_entities))
- **Database Load Reduction:** Only fetch entities the user can actually access, eliminating fetch-then-filter anti-patterns

### Caching & Performance  
- **Query Caching:** Redis-based result caching
- **Database Optimization:** Connection pooling and query optimization
- **Frontend:** Code splitting and lazy loading
- **Monitoring:** Built-in analytics and performance metrics

This summary provides a comprehensive foundation for understanding the Metabase codebase and should enable effective assistance with development tasks, debugging, and feature implementation.
