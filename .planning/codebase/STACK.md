# Technology Stack

**Analysis Date:** 2026-03-11

## Languages

**Primary:**
- Clojure 1.12.3 - Backend server, API, query processing, drivers (`src/`, `enterprise/backend/src/`)
- TypeScript ^5.9.2 - Frontend application, embedding SDK (`frontend/src/`, `enterprise/frontend/src/`)
- ClojureScript - Shared logic compiled to JS via shadow-cljs, used for query library (`metabase.lib`), formatting, types (`shadow-cljs.edn` entries)

**Secondary:**
- Java 21 (Temurin) - Runtime for Clojure backend, JDBC drivers (`Dockerfile` uses `temurin-21-jdk`)
- JavaScript - Legacy frontend code, build scripts, Cypress E2E tests (`e2e/`)
- SQL - Database migrations via Liquibase (`resources/`)

## Runtime

**Environment:**
- JVM (Eclipse Temurin 21) - Backend server runtime
- Node.js >= 22 (v22.13.1 pinned in `.nvmrc`) - Frontend build tooling
- GraalVM Polyglot 25.0.1 - JavaScript and Python execution within JVM for static-viz rendering and Python transforms

**Package Manager:**
- Bun 1.3.7 - Frontend package manager (enforced via `preinstall` script in `package.json`)
- Clojure CLI (tools.deps) - Backend dependency management via `deps.edn`
- Lockfile: `bun.lockb` (present), `deps.edn` uses Maven coordinates

## Frameworks

**Core:**
- Ring 1.15.3 + Compojure 1.7.2 - HTTP server and routing (`ring/ring-core`, `compojure/compojure`)
- Jetty 12.1.3 - Embedded web server (`org.eclipse.jetty/jetty-server`)
- React 18.2.x - Frontend UI framework
- Redux Toolkit ^2.5.0 - State management (`@reduxjs/toolkit`)
- Mantine 8.3.5 - UI component library (`@mantine/core`, `@mantine/dates`, `@mantine/hooks`)
- React Router 3 - Client-side routing (legacy version)

**Testing:**
- Jest ^30.0.0 - Frontend unit testing (`jest.config.js`)
- Cypress ^15.10.0 - E2E testing (`e2e/`)
- Testing Library ^16.0.0 - React component testing (`@testing-library/react`)
- Storybook ^8.5.0 - Component development and visual testing
- Loki ^0.35.1 - Visual regression testing
- Hawk 1.0.13 - Clojure test runner (`io.github.metabase/hawk`)
- Eastwood 1.4.3 - Clojure linting

**Build/Dev:**
- Rspack ^1.5.8 - Frontend bundler (migrated from Webpack, `rspack.config.js`, `rspack.main.config.js`)
- shadow-cljs ^2.28.20 - ClojureScript compiler (`shadow-cljs.edn`)
- SWC ^1.13.5 - TypeScript/JS transpilation (`@swc/core`)
- Babel 7.28.4 - JS transpilation (legacy, `babel.config.json`)
- PostCSS ^8.5.6 - CSS processing (`postcss.config.js`)
- ESLint ^9.17.0 - JS/TS linting (`eslint.config.mjs`)
- Prettier ^3.3.3 - Code formatting
- Stylelint ^16.25.0 - CSS linting
- Husky ^9.1.7 + lint-staged ^14 - Pre-commit hooks

## Key Dependencies

**Critical (Backend):**
- `com.github.seancorfield/honeysql` 2.7.1350 - SQL generation from Clojure data structures
- `com.github.seancorfield/next.jdbc` 1.3.1070 - JDBC database access
- `io.github.camsaul/toucan2` 1.0.570 - ORM / model layer
- `metosin/malli` (forked) - Schema validation and data-driven schemas
- `methodical/methodical` 1.0.127 - Advanced multimethods (driver system)
- `org.liquibase/liquibase-core` 4.33.0 - Database migrations
- `io.github.metabase/macaw` 0.2.36 - Native SQL query parsing
- `buddy/buddy-sign` 3.6.1-359 - JWT token signing
- `buddy/buddy-core` 1.12.0-430 - Cryptographic functions
- `com.mchange/c3p0` 0.11.2 - JDBC connection pooling
- `net.clojars.wkok/openai-clojure` 0.23.0 - OpenAI API client
- `com.knuddels/jtokkit` 1.1.0 - Token counting for LLM context

**Critical (Frontend):**
- `echarts` 6.0.0 - Charting/visualization library
- `d3` ^7.9.0 - Data visualization primitives
- `@visx/*` ^3.x - React visualization components
- `@codemirror/*` ^6.x - Code editor (SQL, JSON, etc.)
- `@tiptap/*` ^3.x - Rich text editor
- `leaflet` ^1.2.0 - Map visualizations
- `ttag` 1.7.21 - Internationalization/i18n
- `formik` ^2.4.5 - Form management
- `@emotion/styled` ^11.11.0 - CSS-in-JS styling
- `ts-pattern` ^5.9.0 - Pattern matching
- `@xyflow/react` ^12.8.5 - Flow/graph visualizations
- `@snowplow/browser-tracker` ^3.1.6 - Product analytics

**Infrastructure:**
- `com.snowplowanalytics/snowplow-java-tracker` 1.0.1 - Server-side analytics tracking
- `clj-commons/iapetos` 0.1.14 - Prometheus metrics
- `com.github.steffan-westcott/clj-otel-api` 0.2.8 - OpenTelemetry instrumentation
- `software.amazon.awssdk/s3` 2.40.13 - AWS S3 for cloud storage/migration
- `com.draines/postal` 2.0.5 - SMTP email sending
- `org.apache.sshd/sshd-core` 3.0.0-M2 - SSH tunneling for database connections
- `clojurewerkz/quartzite` 2.2.0 - Task scheduling (Quartz)

## Configuration

**Environment:**
- `.env` file present - contains local environment configuration
- `.env.example` present - documents available env vars
- Backend uses `environ/environ` for env var access
- Key env var prefixes: `MB_` (Metabase settings), e.g., `MB_DB_TYPE`, `MB_DB_HOST`, `MB_DB_CONNECTION_URI`, `MB_JETTY_PORT`
- Application database configured via `MB_DB_TYPE` (h2, postgres, mysql), `MB_DB_HOST`, `MB_DB_PORT`, `MB_DB_DBNAME`, `MB_DB_USER`, `MB_DB_PASS`, or `MB_DB_CONNECTION_URI`
- `MB_EDITION` controls OSS vs EE edition (default: `oss`, set to `ee` for Enterprise)

**Build:**
- `rspack.config.js` - Main frontend build config
- `rspack.main.config.js` - Main app bundle
- `rspack.static-viz.config.js` - Static visualization bundle (server-side chart rendering)
- `rspack.embedding-sdk-package.config.js` - Embedding SDK package build
- `rspack.embedding-sdk-bundle.config.js` - Embedding SDK bundle build
- `rspack.shared.config.js` - Shared build config
- `shadow-cljs.edn` - ClojureScript build config (targets: `app`, `test`)
- `tsconfig.json` - TypeScript config, extends `tsconfig.base.json`
- `tsconfig.sdk.json` - TypeScript config for embedding SDK
- `babel.config.json` - Babel transpilation config
- `postcss.config.js` - PostCSS processing config
- `jest.config.js` - Jest test config
- `eslint.config.mjs` - ESLint config (flat config format)

## Database Drivers (Plugin System)

Metabase supports multiple database drivers as modular plugins in `modules/drivers/`:

- `athena` - Amazon Athena
- `bigquery-cloud-sdk` - Google BigQuery
- `clickhouse` - ClickHouse
- `databricks` - Databricks
- `druid` / `druid-jdbc` - Apache Druid
- `hive-like` - Hive-compatible databases
- `mongo` - MongoDB
- `oracle` - Oracle Database
- `presto-jdbc` - Presto/Trino
- `redshift` - Amazon Redshift
- `snowflake` - Snowflake
- `sparksql` - Apache Spark SQL
- `sqlite` - SQLite
- `sqlserver` - Microsoft SQL Server
- `starburst` - Starburst
- `vertica` - Vertica

Built-in drivers (in core `deps.edn`):
- H2 (`com.h2database/h2` 2.1.214) - Default embedded database
- PostgreSQL (`org.postgresql/postgresql` 42.7.8)
- MySQL/MariaDB (`org.mariadb.jdbc/mariadb-java-client` 2.7.10)

## Platform Requirements

**Development:**
- Java 21 (Temurin recommended)
- Node.js >= 22 (v22.13.1)
- Bun >= 1.0.0 (v1.3.7 specified)
- Clojure CLI 1.12.0.1488+

**Production:**
- JRE 21 (Alpine-based Docker: `eclipse-temurin:21-jre-alpine`)
- Single JAR deployment (`target/uberjar/metabase.jar`)
- Default port: 3000
- Docker image available (`Dockerfile`)

---

*Stack analysis: 2026-03-11*
