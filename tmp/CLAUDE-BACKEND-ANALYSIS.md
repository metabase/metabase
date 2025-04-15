Can you identify the key backend modules by examining the top-level directories in src/metabase/? Explain them to me.

1. API (api/): The REST API implementation that serves as the interface between frontend and backend. Contains endpoints for various resources (cards, dashboards, databases, etc.).
2. Query Processor (query_processor/): The core engine that transforms user queries into database-specific queries, executes them, and processes the results. Includes a middleware-based pipeline for query transformation.
3. Models (models/): Contains the data models representing entities like cards, dashboards, databases, users, and more. These models define the structure and behavior of data stored in the application database.
4. Database (db/): Handles connections to the application database, including connection pooling, migrations via Liquibase, and query execution.
5. Driver (driver/): The database driver system that enables Metabase to connect to various data source databases. Includes common functionality and specific implementations for SQL databases.
6. Server (server/): Manages the HTTP server, middleware stack, routing, and request handling. Includes authentication, session management, and error handling.
7. Permissions (permissions/): Implements the permission system that controls access to data and features based on user roles and groups.
8. Task (task/): Handles scheduled tasks using Quartz, including syncing databases, sending alerts, and cleaning up old data.
9. Sync (sync/): Responsible for syncing metadata from data source databases, including table and field information, as well as analyzing data for optimized display.
10. Util (util/): Contains utility functions and helpers used throughout the codebase, including date formatting, string manipulation, encryption, and more.
11. Events (events/): An event system for publishing and subscribing to various application events, used for cross-cutting concerns like analytics and audit logging.
12. Plugins (plugins/): Manages the plugin system for loading external code, particularly database drivers.
13. Actions (actions/): Implements write operations to data source databases, allowing users to create forms and workflows for data modification.
14. Lib (lib/): Contains the MBQL (Metabase Query Language) library that defines the query structure and operations used in the query builder.
15. Notification (notification/): Handles sending alerts and subscriptions via email, Slack, and other channels.
16. Public Sharing (public_sharing/): Manages public links to dashboards and questions without requiring authentication.
17. Embed (embed/): Supports embedding Metabase content in external applications, including authentication and rendering.
18. SSO (sso/): Implements single sign-on authentication methods like LDAP and Google Auth.
19. XRays (xrays/): Provides automatic insight generation and visualization suggestions based on data analysis.
20. Search (search/): Implements full-text search across various Metabase entities like questions, dashboards, and collections.

How does a request flow through the backend? Can you analyze the server setup and middleware stack in src/metabase/server/?

Request Flow Architecture

1. Entry Point
- All HTTP requests enter through app in metabase.server.handler which serves as the primary Ring handler
- The handler applies a stack of middleware functions to the incoming requests
2. Middleware Stack (Processing Order)
- Requests are processed through middleware from bottom to top in the middleware list
- Responses flow back through middleware from top to bottom
3. Key Middleware Functions (in processing order)
- SSL/HTTPS Redirection: Redirects HTTP requests to HTTPS if configured
- Request Tracking: Binds request to thread-local var and adds unique request ID
- Gzip Compression: Compresses responses if client supports it
- Content Type: Adds default content type headers to responses
- Cookie Parsing: Parses cookies from requests
- Authentication:
    - Extracts session key from cookies or headers
    - Looks for API keys in headers
    - Binds current user information to the request

- Session Management:
    - Manages user sessions and timeout
  - Resets session timeout with user activity
- Parameter Processing:
    - Converts string parameters to keywords
  - Handles pagination parameters
- JSON Processing:
    - Parses JSON request bodies
  - Serializes responses as JSON
- Security Headers: Adds security headers to prevent caching, XSS, etc.
- Logging: Logs API calls for monitoring
- Exception Handling: Catches and formats exceptions for proper API responses

1. Routing
- After passing through middleware, requests are routed using Compojure routes in metabase.server.routes
- Routes are organized into several contexts:
    - /api/*: API endpoints handled by metabase.api.routes
    - /app/*: Static frontend resources
    - /public/*: Public sharing endpoints
    - /embed/*: Embedding endpoints
    - Root path /: Main application
2. Authentication Flow
- Session-based auth looks for:
    - metabase.SESSION cookie (normal session)
    - metabase.EMBEDDED_SESSION cookie (embedded session)
    - X-Metabase-Session header (alternative for cookies)

- API Key auth looks for:
    - X-Metabase-API-Key header for user API keys
  - X-Api-Key header for static API key (limited usage)
- Upon successful authentication:
    - User ID is bound to the request
  - Superuser status is determined
  - User permissions are loaded
  - User locale is set

1. API Request Handling
- API requests are checked for initialization status
- API routes are defined in metabase.api.routes
- Different API endpoints may apply additional middleware for specific authorization requirements
- Most endpoints use defendpoint macro which applies standard parameter parsing and validation
2. Response Generation
- Responses flow back through middleware in reverse order
- JSON responses are serialized
- Sessions are updated if needed
- Security headers are added
- Responses are compressed if appropriate

Key Architectural Patterns

1. Middleware Pattern
- Ring middleware functions that transform the request and response
- Each middleware has a specific responsibility
- Middleware can be composed and reordered
2. Thread-Local Binding
- Current user, permissions, and other request context bound to thread-local vars
- Makes context available throughout request processing without passing explicitly
3. Delayed Computation
- Many expensive operations (like loading user permissions) use delay for lazy evaluation
- Only computed if actually needed during request processing
4. Session Management
- Sessions stored in application database
- Session IDs passed via cookies or headers
- Sessions have configurable timeout periods
- Anti-CSRF tokens used for embedded sessions
5. Request/Response Streaming
- Support for async request handling with respond/raise pattern
- Streaming response capabilities for large data exports

This architecture follows a standard web application pattern but with careful attention to authentication, performance, and security concerns specific to a business intelligence platform.

What patterns are used in the API implementation? Can you examine a few representative files in src/metabase/api/?

Based on my analysis of the Metabase API implementation, I can identify several key patterns:

API Implementation Patterns

1. Defendpoint Macro
- Central to API design is the defendpoint macro (defined in metabase.api.common)
- Defines endpoints with HTTP verb, route, docstring, parameter schema, and handler code
- Example: (api.macros/defendpoint :get "/" [params] ...)
- Automatically handles common tasks like parameter validation and error responses
2. Schema Validation
- Uses Malli schema system for parameter validation and type coercion
- Validates both route parameters and request body
- Provides automatic type conversion for parameters (e.g., string to int)
- Defines custom schemas for domain-specific validations
3. Permission Checking
- Rich permission checking system with helper functions:
    - read-check, write-check, create-check, update-check
    - check-superuser for admin-only endpoints

- Permission checks occur early in endpoint functions
- Uses dynamic variables like *current-user*, *is-superuser?*, and *current-user-permissions-set* bound by middleware

1. Error Handling
- Extensive use of helper functions like check-404, check-403, check-400
- Functions like check to verify conditions and return appropriate HTTP error codes
- let-404 for binding values that must exist
- Structured error responses using ex-info with appropriate metadata
2. Response Formatting
- Automatic JSON serialization of responses
- Special handling for certain common return types (numbers, booleans, keywords)
- Consistent response formatting across different endpoint types
3. Hydration Pattern
- Uses a pattern called "hydration" to efficiently load related entities
- Example: (t2/hydrate bookmarks :card) adds card data to bookmark records
- Helps reduce N+1 query problems and optimize response generation
4. Event Publishing
- Many operations publish events when they complete
- Used for analytics, audit logging, and triggering side effects
- Example: (events/publish-event! :event/read-permission-failure {...})
5. Query Filtering and Customization
- Often implements multiple querying strategies via multimethods
- Example: cards-for-filter-option* with implementations for different filter types
- Allows for flexible API query parameters that map to different backend queries
6. Caching and Performance Optimizations
- Uses memoization for expensive operations
- Example: session-with-id-query is memoized to compile SQL only once
- Strategic use of delayed computation with the delay macro
7. Enterprise Feature Conditionals
- Uses defenterprise macro to extend functionality in enterprise version
- Example: Additional permission checks or features in premium version
- Pattern of core implementation with enterprise extensions
8. Documentation as First-Class Concern
- Detailed docstrings required for all endpoints
- Used to generate API documentation for third-party developers
- OpenAPI integration for formal API documentation
9. Collection Position Management
- Special helpers for managing ordered collections of items
- Functions like reconcile-position-for-collection! maintain ordering when items move
- Example of domain-specific patterns for common operations

These patterns demonstrate a well-structured API layer focused on consistency, security, and performance. The extensive use of helper functions and macros ensures that common concerns like error handling, validation, and permissions are handled consistently across all endpoints.

How does Metabase interact with its application database? Can you analyze src/metabase/db/ and identify the key patterns?

Based on my analysis of the Metabase database interaction code, I can identify several key patterns that govern how Metabase interacts with its application database.

Key Application Database Patterns

1. Abstraction over Multiple Database Types
- Supports multiple database engines (H2, PostgreSQL, MySQL) for the application database
- Uses a database type abstraction that handles dialect-specific differences
- Implements custom quoting and SQL generation based on the selected database type
2. Connection Pooling and Management
- Uses a connection pool for efficient database access (via c3p0)
- Implements the ApplicationDB record which wraps a DataSource and implements javax.sql.DataSource
- Manages connection lifecycle with thread-local bindings and dynamic variables
- Employs a read-write lock mechanism to control access to the database during critical operations
3. Migrations and Schema Management
- Uses Liquibase for database migrations and schema versioning
- Supports both automatic and manual migration workflows
- Handles migration locks to prevent concurrent migrations
- Implements custom migrations for specialized functionality
- Includes downgrade capabilities for version rollbacks
4. ORM and Query Interface
- Uses Toucan2 as the primary ORM layer
- HoneySql2 for SQL generation with custom dialect support
- Provides high-level query functions that handle SQL compilation and error handling
- Implements custom middleware for Toucan queries
5. Transaction Management
- Supports nested transactions using savepoints
- Prevents common pitfalls like deadlocks with a custom transaction implementation
- Handles rollback scenarios gracefully with proper cleanup
6. Encryption Support
- Provides database-level encryption capabilities
- Manages encryption keys through environment variables
- Checks and validates encryption status during startup
- Implements automatic database encryption when needed
7. Caching Strategy
- Implements application-DB-aware caching through memoize-for-application-db
- Uses unique identifiers to isolate cache entries per database instance
- Allows for cache invalidation when database configuration changes
8. Thread Safety and Concurrency
- Prevents application database calls from core.async dispatch threads
- Uses locking for setup operations to prevent race conditions
- Employs atomic references for tracking state
- Implements reentrant locks for connection access control
9. Dynamic Rebinding
- Supports rebinding the application database at runtime
- Uses the with-application-db macro to change the database context
- Enables testing with different database configurations
10. Error Handling and Diagnostics
- Comprehensive error handling with detailed error messages
- SQL formatting for debugging and error reporting
- Connection validation during startup to ensure database access
- Database release capabilities to handle lock situations
11. Plugin Architecture for Database Drivers
- Extensible system for database-specific implementations
- Uses multimethods for dialect-specific behavior
- Loads appropriate drivers dynamically
- Custom implementations for H2, MySQL, and PostgreSQL
12. Database Setup Flow
- Well-defined initialization process that includes:
    - Database connection verification
    - Migration check and execution
    - Encryption validation and setup
    - Schema and data migrations
    - Custom setup logic

These patterns demonstrate a highly modular and robust database interaction system designed to handle various database engines, provide transaction safety, manage schema evolution, and support a variety of operational needs.

What's the architecture of the query processor? Can you analyze the structure in src/metabase/query_processor/?

Query Processor Architecture

The Metabase query processor is a sophisticated pipeline-based system designed to transform, validate, and execute queries written in MBQL (Metabase Query Language) against various data sources. It follows a middleware architecture pattern with clear separation of preprocessing, execution, and post-processing phases.

Core Components

1. High-Level Flow
- Process occurs in distinct phases: preprocessing → compilation → execution → post-processing
- Main entry point: metabase.query-processor/process-query
- User-facing entry points: userland-query and userland-query-with-default-constraints
2. Pipeline Architecture
- Uses middleware pattern throughout with composable, function-based middleware layers
- Each middleware function transforms the query or adds capabilities
- Pipeline is dynamically built at runtime and can be hot-reloaded
3. Two Types of Middleware
- Around Middleware: Wraps the entire process from outside (pre/post processing)
- Pipeline Middleware: Transforms the query as it passes through the pipeline
4. Preprocessing Phase
- Extensive preprocessing middleware chain in metabase.query_processor.preprocess
- Approximately 40+ preprocessing steps that run sequentially
- Key functions: normalize, resolve references, add implicit clauses, validate
- Handles both legacy MBQL and pMBQL (new Metabase Lib) formats with converters
5. Compilation Phase
- Compiles the preprocessed MBQL query to native SQL (or other database-specific formats)
- Driver-specific implementation transforms MBQL to native queries
6. Execution Phase
- Driver executes the compiled native query
- Streaming results model with reducible data flow
- Cancellation support via core.async channels
7. Post-Processing Phase
- Formats and transforms result data
- Applies additional operations that can't be done at the database level
- Handles error wrapping and result formatting

Key Design Patterns

1. Middleware Pattern
- Each processing step is a function that takes a handler and returns a new handler
- Enables composition of small, focused functions with single responsibilities
- Allows for conditional application of features
2. Reducible Results
- Uses transducers and reducible collections for processing result rows
- Enables streaming processing without loading all results into memory
- Core pattern in metabase.query_processor.reducible
3. Error Handling Pattern
- Comprehensive exception catching and formatting
- Exception chain tracking with structured responses
- Error types categorization (qp.error-type)
4. Cancellation Pattern
- Uses core.async channels to signal cancellations
- Middleware can check for cancellation before expensive operations
- Graceful shutdown of resources
5. Extensibility through Multimethods
- Uses multimethods to customize behavior for different database drivers
- Allows for plugin-based extension of supported databases
6. Transition Strategy Pattern
- Uses wrapper functions (ensure-legacy and ensure-pmbql) to manage transition between legacy MBQL and pMBQL
- Allows incremental migration of middleware components

Notable Middleware Functions

1. Data Manipulation
- Add implicit clauses: Adds default fields, order-bys
- Add implicit joins: Automatically creates joins when referencing fields from other tables
- Resolve fields: Maps field references to actual database fields
2. Security
- Permissions middleware: Checks user permissions
- Enterprise sandboxing: Adds row-level filters for data sandbox
- Parameter substitution: Safely replaces parameters with values
3. Optimization
- Cache middleware: Caches results and returns them when appropriate
- Binning: Optimizes numerical and temporal bucketing
- Optimized temporal filters: Improves date filtering performance
4. Data Preparation
- Auto-bucketing: Automatically buckets datetime fields
- Value parsing: Ensures filter values match expected types
- Add source metadata: Adds information about fields in source queries

This architecture demonstrates a sophisticated, functional approach to query processing that balances flexibility, extensibility, performance, and maintainability. The middleware pattern allows for clear separation of concerns, making it easier to understand, debug, and enhance specific aspects of the query processing pipeline.

How does the database driver system work? Can you analyze the pattern in src/metabase/driver/?

Based on my analysis of the Metabase database driver system, let me explain its key architecture and patterns:

Metabase Database Driver System Architecture

Core Architecture

Metabase uses a hierarchical plugin-based architecture for database drivers that allows extensive customization and extension. The key components are:

1. Driver Hierarchy:
- Drivers form a hierarchy using Clojure's derive mechanism
- Base drivers like :sql are abstract, with concrete implementations like :postgres inheriting from them
- This allows for shared functionality and method inheritance
2. Registration System:
- Drivers register using driver/register! with optional parent drivers
- Registration handles loading driver namespaces and establishing the hierarchy relationships
- Example: (driver/register! :postgres, :parent :sql-jdbc)
3. Multimethod Dispatch:
- Most driver functionality is implemented through multimethods
- Two main dispatch functions:
    - dispatch-on-uninitialized-driver: For simple driver methods that don't need initialization
    - dispatch-on-initialized-driver: For methods requiring the driver to be fully loaded
4. Initialization and Lazy Loading:
- Drivers are registered at startup but initialized on-demand
- The system loads only what's needed, when it's needed
- Initialization happens once per driver and cascades to parent drivers first

Driver Capabilities

Drivers advertise their capabilities through the database-supports? multimethod:

1. Feature Declaration:
- Features are keywords like :nested-queries, :regex, :left-join
- Drivers declare support using method implementations:
(defmethod driver/database-supports? [:postgres feature]
[_driver _feature _db] supported?)
2. Capability Inheritance:
- Abstract drivers like :sql define baseline capabilities
- Child drivers inherit these capabilities but can override them

Query Processing Pipeline

1. MBQL to Native Translation:
- The mbql->native method translates Metabase's MBQL queries to native database queries
- SQL-based drivers implement common translation logic in sql.qp namespace
- Database-specific customizations are added through targeted method implementations
2. Parameter Handling:
- Native parameter substitution uses substitute-native-parameters
- Different drivers handle parameterized queries differently (safety, syntax)
3. Result Handling:
- execute-reducible-query returns streaming results for efficient memory usage
- Type conversion and normalization happens in result processing

SQL Driver Implementation

The :sql abstract driver provides:

1. Common SQL Functionality:
- Base query processing
- Parameter substitution
- SQL formatting and prettification
2. SQL-JDBC Extension:
- Additional layer for JDBC-based SQL drivers
- Connection handling
- Metadata extraction for schema information

Database-Specific Extensions

Database drivers like Postgres extend the system with:

1. Type System Mapping:
- Maps database-specific types to Metabase types
- Handles custom types like Postgres enums
2. Special Features:
- JSON handling
- Date/time manipulation
- Database-specific functions and operators
3. Connection Management:
- SSL configuration
- Authentication methods
- Session settings

Data Synchronization

Drivers implement methods for exploring database schemas:

1. Metadata Extraction:
- describe-database: Gets all tables in a database
- describe-table: Gets fields in a table
- describe-table-fks: Gets foreign keys
- describe-table-indexes: Gets table indexes
2. Field Type Inference:
- Maps database types to Metabase types
- Infers semantic types based on naming and usage
3. Connection Testing:
- can-connect? verifies connection details

Summary

The Metabase driver system uses a well-structured, extensible architecture that:

1. Establishes a clear hierarchy of driver functionality
2. Uses Clojure's multimethod system for polymorphic dispatch
3. Provides sensible defaults that can be overridden
4. Lazy-loads drivers and components for efficiency
5. Isolates database-specific code while sharing common implementations
6. Enables extensive customization through a consistent interface

This design allows Metabase to support many different databases while maintaining a consistent query interface and minimizing code duplication.

How does authentication work? Can you examine the auth system in relevant files?

Based on my analysis of Metabase's authentication system files, here's a comprehensive explanation of how authentication works in Metabase:

Metabase Authentication System

Core Authentication Methods

Metabase supports multiple authentication methods:

1. Username/Password (Local Authentication)
- Standard email/password authentication
- Passwords are bcrypt-hashed with a random salt
- Stored in the core_user table
2. Session-based Authentication
- After successful login, users receive a session ID
- Sessions are stored in the core_session table
- Sessions can be delivered via:
    - Cookies (metabase.SESSION or metabase.EMBEDDED_SESSION)
    - HTTP header (X-Metabase-Session)
3. API Key Authentication
- API keys allow programmatic access
- Users can generate API keys in their profile
- Keys are passed via the X-Api-Key header
4. Single Sign-On (SSO) Integration
- Google Authentication: OAuth-based login
- LDAP Authentication: Directory service integration
- SAML Authentication: Enterprise SSO (in enterprise edition)
- JWT Authentication: Token-based SSO (in enterprise edition)

Authentication Flow

1. Login Process

The login flow is handled in metabase.session.api:

1. User submits credentials (username/password)
2. System checks for rate limiting/throttling
3. Authentication attempts proceed in this order:
a. LDAP authentication (if enabled)
b. Local database authentication
4. Upon successful authentication:
a. A session is created
b. Session ID is returned to client
c. Session cookies are set

For security, the system performs the same amount of work for invalid users to prevent timing attacks, by running bcrypt verification against a fake password hash.

1. Session Management

Sessions are managed in metabase.server.middleware.session:

1. For each request, the system:
a. Extracts session key from cookies or header
b. Validates the session against the database
c. If valid, attaches user information to the request
d. Otherwise, treats the request as unauthenticated
2. Session timeout:
    - Sessions expire after a configurable period (default: 2 weeks)
    - Session timeout is reset on each authenticated request
3. Password Reset Flow

The password reset process works as follows:

1. User requests password reset via email
2. System generates a secure reset token in format "USER-ID_RANDOM-UUID"
3. Token is hashed with bcrypt and stored in user record
4. Original token is emailed to user's registered email
5. User clicks link with token
6. Frontend verifies token validity
7. User submits new password
8. Password is updated, token is cleared, all sessions are invalidated
9. SSO Implementation

SSO is implemented through integration points:

- Google Auth: Uses OAuth 2.0 to authenticate with Google
- LDAP: Connects to directory services for authentication
- SAML/JWT: Available in Enterprise Edition for integration with Identity Providers

The SSO flow is pluggable through multimethods, allowing different implementations to be seamlessly integrated.

Security Features

1. Throttling/Rate Limiting
- Login attempts are throttled by username and IP address
- Password reset requests are throttled
- Prevents brute force attacks
2. Password Security
- Passwords are hashed with bcrypt and unique salts
- Password requirements are configurable
- Password reset tokens expire after 48 hours
3. Session Security
- HTTP-only cookies prevent JavaScript access
- Anti-CSRF tokens for embedded sessions
- Sessions can be invalidated by admins
4. Account Lockout
- Accounts can be deactivated by admins
- Deactivated accounts cannot log in

User Management

1. User Creation
- Users can be created directly by admins
- Users can be invited (generates email with password reset link)
- Users can be provisioned through SSO (LDAP/Google/SAML)
2. Permission Groups
- Every user belongs to at least the "All Users" group
- Admins belong to the "Admin" group
- Custom groups can be created for permission management
- Group membership determines data access

Architecture

The authentication system follows a middleware-based approach:

1. Session Middleware (wrap-session-key)
- Extracts session information from requests
2. Current User Middleware (wrap-current-user-info)
- Attaches user information to requests based on session/API key
3. User Binding Middleware (bind-current-user)
- Sets thread-local bindings for user context
- Makes current user accessible throughout request handling
4. Permission Binding
- User permissions are calculated and cached for performance
- Permissions control access to data/features

The system is designed to be extensible, allowing different authentication methods to be plugged in without changing the core request flow.

Key Components

1. User Model (metabase.models.user)
- Core user information and schema
- Password handling logic
- User creation/update hooks
2. Session API (metabase.session.api)
- Handles login/logout endpoints
- Password reset functionality
3. Session Middleware (metabase.server.middleware.session)
- Authentication verification
- User context attachment
4. SSO Integrations (metabase.sso.*)
- Integration with external identity providers
- User provisioning from SSO sources

This architecture provides a flexible, secure authentication system that can adapt to various organizational needs, from simple password-based authentication to complex enterprise SSO integrations.

How does Metabase handle scheduled tasks? Can you analyze the task system in src/metabase/task/?

Based on my analysis of Metabase's task scheduling system, here's a comprehensive explanation of how scheduled tasks work in Metabase:

Metabase Task Scheduling System

Architecture Overview

Metabase uses Quartz Scheduler, a robust Java-based scheduling library, to handle all scheduled tasks. This system is designed to be:

1. Reliable - Tasks persist across application restarts
2. Scalable - Can handle many concurrent tasks
3. Flexible - Supports both simple and complex scheduling patterns
4. Maintainable - Organized around a consistent pattern for defining and registering tasks

Core Components

1. Quartz Integration

Metabase wraps Quartz with a Clojure interface that provides:

- Connection Provider: Custom implementation that uses Metabase's application database connection pool
- Class Load Helper: Custom implementation that uses Metabase's classloader to ensure plugins work correctly
- Database Backend: Tasks and their schedules are stored in the application database
1. Task Registration System

Tasks are registered using a multimethod pattern:

(defmethod task/init! ::TaskName [_]
(let [job (jobs/build
(jobs/of-type TaskImplementation)
(jobs/with-identity (jobs/key job-key)))
trigger (triggers/build
(triggers/with-identity (triggers/key trigger-key))
(triggers/start-now)
(triggers/with-schedule schedule))]
(task/schedule-task! job trigger)))

This pattern allows each task namespace to define and register its task implementation.

1. Scheduling Mechanisms

Metabase supports multiple scheduling approaches:

1. Cron-based Scheduling: Using cron expressions (e.g., "0 0 */12 * * ? *" for every 12 hours)
2. Simple Scheduling: Using intervals (e.g., repeat every N minutes)
3. One-time Scheduling: Tasks that run once and then complete
4. Task Management API

The system provides functions for:

- Scheduling: schedule-task! to add a job and its trigger
- Rescheduling: reschedule-task! to update an existing job's schedule
- Triggering: trigger-now! to run a task immediately
- Deletion: delete-task! to remove a scheduled task
- Inspection: job-info and scheduler-info to view task details

Task Lifecycle

1. Initialization
2. When Metabase starts, it calls init-scheduler! which:
- Sets JDBC backend properties based on the database type
- Initializes the Quartz scheduler instance
- Deletes jobs whose implementation classes can't be found
- Calls all registered task initialization methods via init-tasks!
3. Each task namespace registers its job and trigger through the task/init! multimethod
4. After initialization, the scheduler is in standby mode
5. Activation

The start-scheduler! function starts the scheduler, allowing tasks to execute according to their schedules. This can be disabled using the MB_DISABLE_SCHEDULER environment variable.

1. Execution

When a task is due to execute:

1. Quartz creates an instance of the job class
2. The job's execute method is called with a JobExecutionContext
3. The task performs its work, which may include:
- Database operations
- System maintenance
- Email notifications
- Data processing
4. Any exceptions are caught and logged, and the task may be flagged for retry depending on configuration
5. Shutdown

When Metabase shuts down, stop-scheduler! is called to:

- Gracefully shut down the scheduler
- Allow running jobs to complete
- Release resources

Task Examples

Metabase includes various scheduled tasks:

1. Anonymous Stats Sender (send_anonymous_stats.clj):
- Sends anonymous usage statistics to Metabase
- Runs at a random hour/minute daily to distribute server load
2. Audit Table Truncation (truncate_audit_tables.clj):
- Removes old data from audit-related tables
- Uses a configurable retention policy (minimum 30 days)
- Runs every 12 hours with batched deletion
3. Follow-up Emails (follow_up_emails.clj):
- Sends follow-up emails to users
- Part of onboarding and engagement
4. Task History Cleanup (task_history_cleanup.clj):
- Purges old task history records
- Prevents unbounded growth of task history
5. Cache Management (cache.clj):
- Refreshes various caches
- Ensures data consistency

Technical Implementation Details

1. Database Storage

Quartz uses several tables in the application database:

- QRTZ_JOB_DETAILS: Stores job class and configuration
- QRTZ_TRIGGERS: Stores trigger schedules and state
- QRTZ_FIRED_TRIGGERS: Tracks currently executing triggers
- QRTZ_SCHEDULER_STATE: Maintains scheduler instance state

This persistence enables tasks to survive application restarts and work properly in clustered environments.

1. Error Handling

Tasks include error handling mechanisms:

- The rerun-on-error macro wraps job execution to retry failed tasks
- Most tasks use try/catch blocks to prevent a single task failure from affecting others
- Failed tasks are logged for troubleshooting
1. Scheduling Expressions

Metabase provides utilities in metabase.util.cron for working with cron expressions:

- Converting between frontend-friendly schedule maps and cron strings
- Validation of cron expressions
- Support for complex scheduling patterns (hourly, daily, weekly, monthly)
1. Enterprise Extensions

The task system supports enterprise extensions:

- Some tasks like truncate_audit_tables.clj use the defenterprise macro to provide enhanced functionality in the enterprise edition
- The enterprise implementation is loaded dynamically when available

Task Development Pattern

When creating a new task in Metabase:

1. Define a job using jobs/defjob with your task implementation
2. Create unique job and trigger key strings
3. Implement the task/init! multimethod to register your job and trigger
4. Use appropriate scheduling (cron, simple interval, etc.)
5. Include proper error handling and logging
6. Follow clean task termination patterns

Optimization Considerations

The task system includes several optimizations:

1. Batched Operations: Tasks that might affect many rows (like truncate_audit_tables) use batching to avoid long-running transactions
2. Misfire Handling: Tasks specify how to handle missed executions (e.g., MISFIRE_INSTRUCTION_DO_NOTHING)
3. Load Distribution: Some tasks randomize their execution time to prevent clustering of activity
4. Resource Cleanup: Tasks that acquire resources ensure proper cleanup, even in error cases

This sophisticated task scheduling system enables Metabase to perform regular maintenance, send notifications, and manage system operations reliably without requiring manual intervention.

How does the plugin architecture work? Can you analyze how plugins are loaded and integrated?

Now that I've thoroughly analyzed the Metabase plugin system, here's a comprehensive explanation of how plugins are loaded and integrated:

Metabase Plugin Architecture

Overview

Metabase's plugin architecture provides a flexible, dynamic system for extending the application's functionality, particularly for database drivers. It enables both bundled and user-installed plugins, manages dependencies between plugins, and supports lazy loading to optimize performance.

Core Plugin System Components

The plugin system is built around several key components:

1. Plugin Management (metabase.plugins)
- Handles discovering and loading plugins
- Manages the plugin directory
- Extracts system modules from the application
2. Custom Classloader (metabase.plugins.classloader)
- Provides a dynamic classloader to add JARs at runtime
- Ensures the correct classloader context for loading classes
- Overrides Clojure's require to use the correct classloader
3. Plugin Initialization (metabase.plugins.initialize)
- Controls the initialization sequence of plugins
- Manages dependencies between plugins
- Supports lazy loading of drivers
4. Initialization Steps (metabase.plugins.init_steps)
- Defines the possible initialization steps for plugins
- Implements loading namespaces and registering JDBC drivers
5. JDBC Proxy (metabase.plugins.jdbc_proxy)
- Works around JVM limitations with JDBC drivers
- Creates proxy drivers for JDBC drivers not loaded by the system classloader
6. Lazy-Loaded Drivers (metabase.plugins.lazy_loaded_driver)
- Implements placeholders for drivers that should be loaded on demand
- Registers basic driver metadata before full initialization

Plugin Loading Process

1. Bootstrap

The plugin loading process begins in metabase.core.bootstrap/-main, which:

1. Initializes the custom classloader via (metabase.plugins.classloader/the-classloader)
2. Calls metabase.core.core/entrypoint which eventually calls plugins/load-plugins!
3. Plugin Discovery

During load-plugins!, Metabase:

1. Configures the plugins directory (default: ./plugins/)
2. Extracts bundled system modules to the plugins directory
3. Identifies all JAR files in the plugins directory
4. For development/test mode, also loads local plugin manifests from the classpath
5. Plugin Classification

Plugins are classified into two categories:

1. Metabase Plugins - JARs with a metabase-plugin.yaml manifest
- These follow Metabase's plugin protocol
- Often implement database drivers or other functionality
- Can specify initialization steps and dependencies
2. Support Libraries - JARs without a manifest
- Simple JAR dependencies (e.g., JDBC drivers)
- Added directly to the classpath
- Initialized before Metabase plugins to ensure dependencies are available
3. Plugin Initialization

For each plugin JAR:

1. If the JAR has no manifest:
- It's added directly to the classpath via add-to-classpath!
2. If the JAR has a manifest:
- The manifest is parsed to extract plugin information
- Plugin dependencies are checked via all-dependencies-satisfied?
- If dependencies are met, the plugin is initialized
- If dependencies are not met, the plugin is queued for later initialization
3. Driver Initialization

For driver plugins specifically:

1. If configured for lazy loading (default):
- A placeholder driver is registered via register-lazy-loaded-driver!
- The driver's connection properties are registered
- Full initialization is deferred until the driver is actually used
2. If not lazy loading:
- The JAR is immediately added to the classpath
- All initialization steps specified in the manifest are executed
3. Deferred Initialization

When a lazy-loaded driver is first used:

1. driver/the-initialized-driver triggers initialization
2. The JAR is added to the classpath
3. Specified initialization steps are executed
4. The driver is marked as initialized

Plugin Manifest Structure

Each plugin defines its behavior through a metabase-plugin.yaml manifest:

# Required plugin information

info:
name: "plugin-name"
version: "1.0.0"
description: "Plugin description"

# Driver information (for database drivers)

driver:
name: "driver-name"
display-name: "Human-readable Driver Name"
parent: ["sql-jdbc"]  # Parent drivers to inherit from
connection-properties:
- host
- port
- dbname
- user
- password
lazy-load: true  # Whether to load driver lazily (default: true)

# Dependencies required before initialization

dependencies:
- class: "org.example.RequiredClass"
message: "Custom error message if missing"
- plugin: "another-plugin"
- env-var: "REQUIRED_ENV_VAR"

# Initialization steps

init:
- step: load-namespace
namespace: "my.driver.namespace"
- step: register-jdbc-driver
class: "org.example.jdbc.Driver"

Dependency Management

Metabase supports three types of plugin dependencies:

1. Class Dependencies - Required Java classes
- Checked via Class.forName
- Useful for ensuring required libraries are available
2. Plugin Dependencies - Other Metabase plugins
- Tracked by plugin name
- Ensures correct initialization order
3. Environment Variable Dependencies - Required environment variables
- Ensures configuration is present
- Useful for plugins requiring external settings

The dependency system:

- Tracks plugins with unsatisfied dependencies
- Retries initialization when dependencies become available
- Logs informative messages about unmet dependencies

JDBC Driver Integration

A unique challenge solved by the plugin system is Java's DriverManager behavior, which only recognizes JDBC drivers loaded by the system classloader. Metabase addresses this with:

1. A proxy driver system in metabase.plugins.jdbc_proxy
2. The register-jdbc-driver initialization step
3. Dynamic creation of proxy drivers that wrap the actual JDBC drivers

This allows JDBC drivers loaded from the plugins directory to work properly, even though they're loaded by Metabase's custom classloader.

Development Support

For development and testing, the plugin system includes:

1. Loading of local plugin manifests from the classpath
2. Support for additional development manifests via environment variables
3. Special handling of signed JARs like spark-deps.jar

Enterprise Extensions

The plugin system also supports Metabase Enterprise Edition features:

1. Enterprise plugins can be loaded alongside OSS plugins
2. Enterprise features check availability at runtime (premium-features/defenterprise)
3. The system handles absence of enterprise code gracefully

Benefits of the Architecture

This sophisticated plugin architecture provides several advantages:

1. Modularity - Core functionality is separate from plugins
2. Dynamic Loading - Plugins can be added without recompiling Metabase
3. Performance - Lazy loading improves startup time
4. Dependency Management - Plugins can depend on other plugins
5. Extensibility - Uniform extension points for drivers and other features

The plugin system is central to Metabase's extensibility, enabling a wide range of database drivers and additional functionality to be added without modifying the core application.

How is the enterprise code integrated with the open source codebase? What patterns are used for feature flags and entitlements?

Based on my examination, here's how enterprise code is integrated with Metabase's open source codebase:

1. defenterprise Macro:
The core mechanism is the defenterprise macro, which allows defining functions with dual implementations across OSS/EE boundaries. This macro:
- Creates a function registry to track OSS and EE implementations
- Dynamically dispatches calls to the appropriate implementation based on feature availability
- Handles fallback behavior when EE code or features aren't available
2. Namespace Mapping:
- OSS code lives in metabase/ namespaces
- Enterprise code lives in metabase-enterprise/ namespaces
- When defenterprise is used in OSS code, it specifies the EE namespace that contains the extended implementation
3. Feature Flags and Token Validation:
- Premium features are defined in metabase.premium-features.core using define-premium-feature
- Each feature is associated with a token check via the has-feature? function
- Token validation is handled by token-check.clj, which verifies tokens against a remote service
- Features are enabled only when a valid token with the specific feature exists
4. Implementation Pattern Example:
- OSS code in metabase.task.truncate_audit_tables defines base functionality
- EE code in metabase_enterprise.task.truncate_audit_tables extends this
- The audit-models-to-truncate function is defined in both namespaces:
    - OSS version only handles QueryExecution table
    - EE version adds AuditLog and ViewLog tables when the :audit-app feature is present
5. Runtime Feature Detection:
- Function dynamic-ee-oss-fn checks if:
    - EE implementation exists
    - The token includes the required feature
    - If both are true, use EE implementation
    - Otherwise, use OSS implementation or fallback
6. Entitlements Management:
- Features are gated by token-based entitlements
- Common entitlements include: embedding, sandboxing, audit-app, whitelabeling, etc.
- Functions like assert-has-feature provide convenient ways to check for entitlements
- API endpoints use these checks to prevent access to premium features

This architecture allows the codebase to:

- Maintain a clean OSS experience while enabling premium features
- Support different deployment models (cloud, self-hosted, airgapped)
- Provide graceful fallbacks when enterprise features aren't available
- Keep enterprise-specific code separate while reusing the OSS foundation

Based on what you've seen so far, what are the common design patterns used throughout the backend codebase?

Based on my analysis of the Metabase codebase, I've identified these key design patterns:

1. Multimethods for Polymorphism
- Used extensively in the driver system to support different databases
- Creates a clear extension point with dispatch functions
- Allows inheritance through hierarchies where specific drivers inherit from parent drivers
- Example: Driver initialization, query execution, and data type conversion
2. Protocol-Based Interfaces
- Defines clean interfaces with implementations for different types
- More efficient than multimethods for type-specific dispatch
- Used for smaller interfaces compared to the multimethod-based driver system
- Example: The Resolvable protocol in settings for handling different setting types
3. Registry Pattern with Dynamic Loading
- Registries (atoms containing maps) store extensible components
- Registration functions add new implementations at runtime
- Often combined with multimethods for behavior selection
- Example: Driver registry, settings registry, enterprise function registry
4. Settings System with Layered Resolution
- Sophisticated typed configuration with multiple sources
- Retrieval hierarchy (user-local → database-local → env vars → DB → default)
- Support for sensitive values, validation, and typed conversion
- Settings definition via defsetting macro creates getter/setter functions
5. Enterprise Feature Integration
- defenterprise macro for dual OSS/Enterprise implementations
- Feature flag system tied to license tokens
- Registry of implementations with dynamic dispatch based on available features
- Fallback mechanisms when enterprise features aren't available
6. Database Model Patterns
- Toucan2-based model definitions
- Hooks for data validation, transformation
- Method-based customization with defmethod on model operations

These patterns create a highly extensible architecture that supports plugins, enterprise features, and clean separation of concerns.

What is the role of ClojureC and ClojureScript code in the codebase? In what places do the frontend and backend code share implementations?

Based on my examination of the Metabase codebase, here's how Clojure and ClojureScript code interact in the architecture:

Role of ClojureScript in the Codebase

The Metabase application follows a clear separation between:

1. Backend (Clojure): Server-side components handle database connections, query processing, and data management
2. Frontend (ClojureScript): Client-side interface rendering data visualizations and user interactions

Shared Code with .cljc Files

The codebase uses .cljc files to share implementation between frontend and backend. These files contain code that compiles to both Clojure (JVM) and ClojureScript (JavaScript).

Key shared components include:

1. Type System (metabase.types): Defines data types, hierarchies, and type coercion rules used in both frontend and backend
- Essential for consistent data interpretation across the stack
- Allows frontend components to understand data types returned by the backend
2. Query Language Components (metabase.lib.*): Used in both frontend and backend for query processing
- The "lib" namespace contains shared query manipulation functions
- Ensures consistency in query representation between client and server
3. Utility Functions (metabase.util): Common utilities for string manipulation, data transformation
- Platform-specific implementations with conditional reader macros (#?(:clj ..., :cljs ...))
- Shared interface with potentially different implementations
4. Data Formatting (metabase.util.formatting): Date, time, and number formatting used in both contexts
- Essential for consistent display of data across the application

Integration Mechanism

1. Shadow-cljs Configuration: The shadow-cljs.edn file specifies which namespaces are exposed to the JavaScript environment
- Entries like metabase.lib.js create JavaScript modules from Clojure(Script) code
2. Reader Conditionals: Code uses #?(:clj ... :cljs ...) to provide platform-specific implementations
3. Cross-Platform Design Patterns:
- Protocols defined in .cljc files with implementations for both platforms
- Type hierarchies shared between frontend and backend
- Utility functions with platform-specific implementations but common interfaces

Practical Examples

1. Type System: The shared type system ensures fields marked as dates are treated consistently everywhere
- Backend: Knows how to query and process date fields
- Frontend: Knows how to format and display date fields
2. Query Building: The frontend can build and manipulate queries using the same abstractions as the backend
- metabase.lib.* namespaces define a shared library for query manipulation
- This ensures queries built in the UI match what the backend expects
3. Data Formatting: Time/date/currency formatting logic is shared
- Ensures consistent display format regardless of where rendering happens

This architecture allows Metabase to maintain a consistent data model across client and server while leveraging platform-specific capabilities when needed.
