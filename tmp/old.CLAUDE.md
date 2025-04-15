# Claude Custom Commands
- When executing custom slash commands carefully read the instructions in the command file before proceeding
- If the command instructions are clear and precise, follow them exactly as written and do not include extra steps

# Metabase Development Guide

## Autonomous Development Workflow

- Do not attempt to read or edit files outside the project folder
- Add failing tests first, then fix them
- Work autonomously in small, testable increments
- Run targeted tests, and lint continuously during development
- Prioritize understanding existing patterns before implementing
- Don't commit changes, leave it for the user to review and make commits

## Quick Commands

### JavaScript/TypeScript
- **Lint:** `yarn lint-eslint`
- **Test:** `yarn test-unit path/to/file.unit.spec.js` or `yarn test-unit -t "pattern"`
- **Watch:** `yarn test-unit-watch path/to/file.unit.spec.js`
- **Format:** `yarn prettier`
- **Type Check:** `yarn type-check`

### Clojure
- **Lint:** `./bin/mage kondo [path]`
- **Format:** `./bin/mage cljfmt-files [path]`
- **Test file:** `clojure -X:dev:test :only namespace/test-name`

### ClojureScript
- **Test:** `yarn test-cljs`

## Application Database Access

When analyzing code that interacts with the metabase application database (app db):

### PostgreSQL App Database Access (mb-postgres)

The following tools are available to query the Metabase PostgreSQL App DB:

  - `mcp__mb-postgres__list_tables`: List all tables in the database
  - `mb-postgres:list_tables (MCP)()...`

  - `mcp__mb-postgres__query`: Run SQL queries against the Metabase database
  - `mb-postgres:query (MCP)(sql: "SELECT * FROM <table_name> LIMIT 10")...`

  - `mcp__mb-postgres__describe_table`: Get detailed schema information for a specific table
  - `mb-postgres:describe_table (MCP)(table_name: <table_name>)...`

### When to Use Database Tools

Always use the database tools when:

1. **Analyzing data models and relationships**
  - Examining table schemas to understand entity relationships
  - Investigating foreign key constraints and data dependencies
  - Understanding the structure of cards, dashboards, and other core objects

2. **Working with application settings**
  - Checking system-wide configuration stored in the settings table
  - Understanding how user preferences are persisted
  - Examining feature flags and their current values

3. **Investigating data representation**
  - Understanding how fields, tables, and databases are represented
  - Examining metadata like field types, semantic types, and visibility
  - Looking at how fingerprinting and field values are stored

4. **Exploring notification systems**
  - Understanding channel configurations and subscriptions
  - Examining how alerts and pulses are configured
  - Investigating notification recipients and delivery mechanisms

5. **Analyzing visualization and rendering**
  - Understanding how visualization settings are stored
  - Examining dashboard layouts and card positioning
  - Investigating rendering options for different chart types

6. **Studying user and permissions systems**
  - Examining user data and group memberships
  - Understanding permission models and access controls
  - Investigating collection hierarchies and content organization

7. **Troubleshooting code behavior**
  - When code references database fields or values that aren't obvious
  - When investigating how configuration affects application features
  - When exploring data transformations between storage and presentation

## Documentation
- User facing documentation is located in the `docs/` directory
- Below are bullet points explaining concepts covered in the docs
- Reference the appropriate documentation whenever answering conceptual questions about Metabase or feature specific source code.
- Any time you reference documentation directory `docs/` be sure to ignore any subdirectories named "images".

### Metabase
- Metabase is an open-source business intelligence platform that allows users to query data and create visualizations
- Supports embedding these analytics capabilities in external applications
- Offers both self-hosted options (JAR, Docker) and a cloud version with additional features
- Primary use cases include data exploration, dashboarding, and customer-facing analytics
- Built with a focus on making data accessible to non-technical users while offering advanced options

### Questions
- Questions docs are located at `docs/questions/`
- Questions are queries, their results, and visualizations - the basic analytical unit in Metabase
- Can be created using a graphical query builder or SQL/native editor
- Support various visualization types (tables, charts, maps, etc.)
- Can be saved to collections or directly to dashboards
- Support for custom expressions, complex calculations, and joining data from different tables
- Allow setting up alerts when results meet specific criteria
- Provide export options and version history

### Dashboards
- Dashboard docs are located at `docs/dashboards/`
- Dashboards are collections of related questions organized onto a single page
- Support various card types: questions, text/headers, iframes, and links
- Offer dashboard-wide filters that can affect multiple cards simultaneously
- Feature interactive elements like custom click behaviors
- Support multiple tabs for organizing complex dashboards
- Include auto-refresh capabilities for real-time monitoring
- Can be shared via public links or subscriptions (email/Slack)
- Provide fullscreen and night mode options for display on TVs/monitors

### Data Modeling
- Data modeling docs are located at `docs/data-modeling/`
- Helps organize and curate data to make it more accessible and useful
- Models are fundamental building blocks that provide intuitive "starting point tables" for questions
- Metadata customization helps Metabase understand your data (column types, display names, etc.)
- Field types dictate how data is displayed and what special functionality is available
- Metrics provide official definitions for important calculations across the organization
- Segments are pre-defined filters for common data subsets

### Actions
- Actions docs are located at `docs/actions/`
- Enable write operations to databases through SQL-based entities
- Allow users to build custom forms and business logic that can modify data
- Types include Basic (auto-generated) and Custom (user-written SQL)
- Create interactive dashboards with buttons that modify data
- Build custom workflows for data management or public-facing forms
- Currently supported for PostgreSQL and MySQL databases only

### Embedding
- Embedding docs are located at `docs/embedding/`
- Allows integration of Metabase visualizations and analytics into external websites or applications
- Four embedding types:
  - Embedded Analytics SDK: React-based component integration
  - Interactive Embedding: Full self-service analytics with SSO
  - Static Embedding: Secure, view-only charts with locked parameters
  - Public Links: Open sharing of specific visualizations
- Used for customer-facing analytics, multi-tenant data access, and application integration
- Each type offers different levels of interactivity, security, and customization

### Database Connections
- Database connection docs are located at `docs/databases/`
- Establish connections between Metabase and various database systems
- Support numerous database types including PostgreSQL, MySQL, MongoDB, BigQuery, Snowflake, etc.
- Provide security features like SSL/TLS encryption and SSH tunneling
- Include synchronization processes to gather schema information and sample data
- Support advanced options like schema filtering and JSON column unfolding
- Allow credential encryption at rest and role-based access control
- Form the foundation for all analytics functionality in Metabase

### Permissions
- Permissions docs are located at `docs/permissions/`
- Control access to data and functionality through group-based assignments
- Features additive permissions (users get the most permissive access across all groups)
- Includes three main types:
  - Data permissions: Control viewing, querying, downloading, and managing data
  - Collection permissions: Determine access to saved items like questions and dashboards
  - Application permissions: Control access to admin features
- Support data sandboxing for row-level and column-level security
- Balance data security with analytical needs across organizations

### Installation and Operation
- Installation docs are located at `docs/installation-and-operation/`
- Multiple deployment options:
  - Metabase Cloud (recommended, hosted solution)
  - Docker containers (recommended for self-hosting)
  - JAR file with Java Runtime Environment
  - Platform-specific deployments (Azure, Debian, Elastic Beanstalk, etc.)
- Important considerations include:
  - Migrating from default H2 to production databases
  - Environment variable configuration
  - Backup strategies for application data
  - Monitoring options via JMX or Prometheus

### People and Groups
- User management docs are located at `docs/people-and-groups/`
- Based around accounts, groups, and various authentication methods
- Groups control permissions through membership (including special Admin and All Users groups)
- Authentication options include:
  - Local email/password (default)
  - Google Sign-in (Open Source)
  - LDAP (Open Source)
  - Premium options: JWT, SAML (Azure, Okta, Auth0, Google, Keycloak), SCIM
- Features account management, password complexity settings, session controls
- Supports user attributes for data sandboxing and conditional permissions

## Architecture
- The sections below provide information about Metabase's codebase architecture
- Refer to these sections for understanding key concepts and design patterns
- Always check for existing patterns before adding new code

### General
- Metabase is an open-source business intelligence platform built with Clojure (backend) and JavaScript/TypeScript (frontend)
- The application uses a modular architecture with clear separation between frontend and backend components
- Metabase uses an application database (app DB) to store metadata, users, questions, dashboards, etc.
  - Supports multiple database types for the app DB including H2 (default), PostgreSQL, MySQL, and MariaDB
  - Database migrations are managed through Liquibase
- Communication between frontend and backend happens via a RESTful API implemented in `src/metabase/api/`
- The codebase includes both open source (OSS) and enterprise (EE) features
  - Enterprise code primarily lives in the `enterprise/` directory
  - Feature flags and entitlement checks control access to EE features
- The codebase follows functional programming principles with an emphasis on immutability and composability
- Key configuration files include:
  - `deps.edn`: Clojure dependencies and build configurations
  - `package.json`: JavaScript/TypeScript dependencies
  - `shadow-cljs.edn`: ClojureScript configuration
  - `tsconfig.json`: TypeScript configuration

### Frontend
- Coming soon...

### Backend
- Metabase's backend architecture follows a modular, component-based design built on Clojure
- For a more detailed analysis of the backend architecture, refer to the CLAUDE-BACKEND-ANALYSIS.md file
- Key subsystems are organized into distinct namespaces under `src/metabase/`:
  - `api/`: RESTful API endpoints for frontend communication
  - `query_processor/`: Query transformation and execution pipeline
  - `driver/`: Extensible system for connecting to different database types
  - `models/`: Domain objects representing core entities (dashboards, questions, etc.)
  - `db/`: Application database connection and management
  - `server/`: HTTP server, request handling, and middleware stack
  - `task/`: Scheduled task management (using Quartz)
  - `plugins/`: Plugin system for extending functionality
  - `permissions/`: Access control and authorization
  - `sync/`: Database synchronization for metadata
  - `lib/`: MBQL query language components (shared with frontend)

- Request processing follows a middleware-based pipeline:
  - Each HTTP request passes through multiple middleware functions
  - Middleware manages authentication, session handling, security headers, etc.
  - Routes are defined using Compojure and dispatched to appropriate handlers
  - API endpoints use the `defendpoint` macro for consistent validation and response formatting

- Core design patterns include:
  - Multimethod-based polymorphism for extensible components (especially drivers)
  - Registry pattern with dynamic loading for plugins and extensions
  - Protocol-based interfaces for type-specific implementations
  - Middleware pattern for flexible request processing
  - Thread-local binding for request context propagation
  - Layered settings system with multiple resolution sources

- Database interactions:
  - Uses Toucan2 as the ORM layer with HoneySql for SQL generation
  - Models define schema, validation, and behavior for domain entities
  - Abstraction layer supports multiple database types for the app DB
  - Connection pooling with c3p0 manages database connections efficiently
  - Migrations managed through Liquibase ensure schema consistency

- Query processing architecture:
  - Pipeline-based approach transforms MBQL queries to native database queries
  - Middleware pattern allows composable, focused processing steps
  - Driver-specific implementations handle database-specific syntax
  - Results are processed through a streaming, reducible interface

- Driver system architecture:
  - Hierarchical plugin system where drivers can inherit from parent drivers
  - Abstract drivers (like `:sql`) provide common functionality
  - Concrete drivers (like `:postgres`) implement database-specific operations
  - Multimethods dispatch operations to appropriate driver implementations
  - Lazy loading optimizes startup time and resource usage

- Plugin architecture:
  - Dynamic loading system for extending functionality at runtime
  - Custom classloader manages plugin JARs and dependencies
  - Plugin manifests define initialization steps and dependencies
  - Special handling for JDBC drivers ensures proper integration

- Enterprise integration:
  - `defenterprise` macro provides dual implementations (OSS/EE)
  - Feature flags control access to premium features
  - Token-based entitlements determine available functionality
  - Registry pattern with runtime dispatch selects appropriate implementation
  - Maintains separate namespaces while enabling code reuse

### Backend Technologies
- **Core Technologies:**
  - Clojure: Primary backend language
  - Java: Platform and interoperability with JVM libraries
  - JDBC: Database connectivity for source databases
  - Jetty: Web server and HTTP handler
  - Ring: HTTP server abstraction and middleware
  - Compojure: Routing library for HTTP endpoints
  
- **Data Access & Persistence:**
  - Toucan2: ORM layer for interacting with the application database
  - HoneySql: SQL generation for database queries
  - JDBC: Database connectivity for application database
  - c3p0: Connection pooling for database connections
  - Liquibase: Database schema migration and versioning
  - next.jdbc: Modern JDBC wrapper for Clojure
  
- **Query Processing & Execution:**
  - MBQL: Metabase Query Language (custom intermediate language)
  - core.async: Asynchronous programming and cancellation support
  - Transducers: Data transformation pipelines for result processing
  - Reducible Collections: Streaming data processing
  
- **Scheduling & Background Processing:**
  - Quartz: Task scheduling and execution
  - core.async: Asynchronous processing
  
- **Validation & Schema:**
  - Malli: Schema validation and coercion
  - clojure.spec: Type specifications and data validation
  
- **Security & Authentication:**
  - BCrypt: Password hashing
  - Ring-anti-forgery: CSRF protection
  - Java Crypto: Encryption for sensitive values
  
- **Utility Libraries:**
  - tools.logging: Logging infrastructure
  - cheshire: JSON parsing and generation
  - tools.namespace: Namespace management
  - core.memoize: Caching and memoization
  - data.csv: CSV processing
  - potemkin: Library of reusable abstractions
  
- **Testing:**
  - clojure.test: Testing framework
  - expectations: BDD-style assertions
  - test-check: Property-based testing
  - eftest: Fast test runner
