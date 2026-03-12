# External Integrations

**Analysis Date:** 2026-03-11

## APIs & External Services

**Analytics/Tracking:**
- Snowplow Analytics - Product analytics and usage tracking
  - Backend SDK: `com.snowplowanalytics/snowplow-java-tracker` 1.0.1 (`src/metabase/analytics/stats.clj`)
  - Frontend SDK: `@snowplow/browser-tracker` ^3.1.6
  - Tracks product usage events for telemetry

**AI/LLM Integration:**
- Anthropic Claude API - AI-assisted SQL generation and natural language queries
  - Client: Custom HTTP client (`src/metabase/llm/anthropic.clj`)
  - Settings: `src/metabase/llm/settings.clj`
  - Auth env var: `llm-anthropic-api-key` (setting, starts with `sk-ant-`)
  - Default model: `claude-opus-4-5-20251101`
  - API URL: `https://api.anthropic.com`
- OpenAI API - Additional LLM integration
  - SDK: `net.clojars.wkok/openai-clojure` 0.23.0
  - Token counting: `com.knuddels/jtokkit` 1.1.0

**Enterprise AI Features (EE):**
- AI SQL Generation: `enterprise/backend/src/metabase_enterprise/ai_sql_generation/`
- AI SQL Fixer: `enterprise/backend/src/metabase_enterprise/ai_sql_fixer/`
- AI Entity Analysis: `enterprise/backend/src/metabase_enterprise/ai_entity_analysis/`
- Semantic Search with pgvector: `enterprise/backend/src/metabase_enterprise/semantic_search/`
- MetaBot v3 (conversational AI): `enterprise/backend/src/metabase_enterprise/metabot_v3/`

**Cloud Services:**
- AWS S3 - Cloud migration storage
  - SDK: `software.amazon.awssdk/s3` 2.40.13, `software.amazon.awssdk/sts` 2.36.2
  - Used for: Cloud migration data transfer (`src/metabase/cloud_migration/`)
  - AWS JDBC Wrapper: `software.amazon.jdbc/aws-advanced-jdbc-wrapper` 2.6.5 (IAM auth for databases)
  - RDS CA certificates bundled in Docker image

**Google Services (EE):**
- Google Sheets Integration: `enterprise/backend/src/metabase_enterprise/gsheets/`
  - Settings: `enterprise/backend/src/metabase_enterprise/gsheets/settings.clj`
- Google OAuth: `@react-oauth/google` ^0.11.1 (frontend), `src/metabase/sso/google.clj` (backend)

**Metabase Cloud:**
- Premium Features/License Server: `src/metabase/premium_features/token_check.clj`
- Cloud Proxy: `enterprise/backend/src/metabase_enterprise/cloud_proxy/`
- Billing: `enterprise/backend/src/metabase_enterprise/billing/`
- Harbormaster: `enterprise/backend/src/metabase_enterprise/harbormaster/`

## Data Storage

**Application Database:**
- H2 (default, embedded) - `com.h2database/h2` 2.1.214 - for development/small deployments
- PostgreSQL - `org.postgresql/postgresql` 42.7.8 - recommended for production
- MySQL/MariaDB - `org.mariadb.jdbc/mariadb-java-client` 2.7.10 - alternative production option
- Connection config: `MB_DB_TYPE`, `MB_DB_CONNECTION_URI`, `MB_DB_HOST`, `MB_DB_PORT`, `MB_DB_DBNAME`, `MB_DB_USER`, `MB_DB_PASS`
- Connection pooling: C3P0 (`com.mchange/c3p0` 0.11.2, `metabase/connection-pool` 1.2.0)
- Migrations: Liquibase 4.33.0 with session-level locking (`com.github.blagerweij/liquibase-sessionlock` 1.6.9)
- ORM: Toucan2 (`io.github.camsaul/toucan2` 1.0.570)
- SQL generation: HoneySQL 2 (`com.github.seancorfield/honeysql` 2.7.1350)
- Config: `src/metabase/app_db/env.clj`, `src/metabase/app_db/data_source.clj`

**Connected Data Warehouses (Query Targets):**
- 17+ database drivers as plugins (`modules/drivers/`): PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, Athena, MongoDB, Oracle, SQL Server, ClickHouse, Databricks, Druid, Presto/Trino, Spark SQL, SQLite, Starburst, Vertica
- SSH tunneling supported: `org.apache.sshd/sshd-core` 3.0.0-M2

**File Storage:**
- Local filesystem for default operations
- AWS S3 for cloud migration data

**Caching:**
- In-memory caching via `org.clojure/core.memoize` 1.1.266
- Enterprise caching: `enterprise/backend/src/metabase_enterprise/cache/`

## Authentication & Identity

**Built-in Auth:**
- Email/password with bcrypt: `org.mindrot/jbcrypt` 0.4
- Session-based authentication
- API key authentication
- JWT embedding tokens: `buddy/buddy-sign` 3.6.1-359
- Implementation: `src/metabase/session/api.clj`

**SSO Providers (Core):**
- Google OAuth: `src/metabase/sso/google.clj`, `@react-oauth/google` ^0.11.1
- LDAP: `src/metabase/sso/ldap.clj`, `src/metabase/sso/providers/ldap.clj`
  - Client: `org.clojars.pntblnk/clj-ldap` 0.0.17
- OIDC: `src/metabase/sso/oidc/`
- SSO settings: `src/metabase/sso/settings.clj`

**SSO Providers (Enterprise):**
- SAML 2.0: `metabase/saml20-clj` 4.2.1
  - Enterprise SSO: `enterprise/backend/src/metabase_enterprise/sso/`
- SCIM (user provisioning): `enterprise/backend/src/metabase_enterprise/scim/`

**Embedding Auth:**
- JWT-based embedding: `src/metabase/embedding/jwt.clj`
- Embedding settings: `src/metabase/embedding/settings.clj`

## Monitoring & Observability

**Metrics:**
- Prometheus metrics: `clj-commons/iapetos` 0.1.14, `io.prometheus/simpleclient_hotspot` 0.16.0
- JVM allocation monitoring: `com.clojure-goes-fast/jvm-alloc-rate-meter` 0.1.4
- JVM hiccup monitoring: `com.clojure-goes-fast/jvm-hiccup-meter` 0.1.1

**Tracing:**
- OpenTelemetry: `com.github.steffan-westcott/clj-otel-api` 0.2.8

**Logging:**
- Log4j2 (`org.apache.logging.log4j/log4j-core` 2.25.3)
- SLF4J bridge (`org.apache.logging.log4j/log4j-slf4j2-impl` 2.25.2)
- JSON logging format support (`org.apache.logging.log4j/log4j-layout-template-json` 2.25.2)
- Clojure tools.logging (`org.clojure/tools.logging` 1.3.0)

**Error Tracking:**
- No external error tracking service detected (errors handled internally)

## Notification Channels

**Email (SMTP):**
- Library: `com.draines/postal` 2.0.5 (SMTP client)
- Implementation: `src/metabase/channel/email/`, `src/metabase/channel/impl/email.clj`
- Template engine: Handlebars (`com.github.jknack/handlebars` 4.3.1), Stencil/Mustache (`stencil/stencil` 0.5.0)
- HTML rendering: `net.sf.cssbox/cssbox` 5.0.2

**Slack:**
- Direct API integration (HTTP): `src/metabase/channel/slack.clj`, `src/metabase/channel/impl/slack.clj`
- Uses `clj-http` for Slack Web API calls
- Settings: `src/metabase/channel/settings.clj`

**HTTP Webhooks:**
- Generic HTTP channel: `src/metabase/channel/impl/http.clj`
- Used for alert/subscription notifications

**Notification System:**
- Core: `src/metabase/notification/`
- Notification API: `src/metabase/notification/api/notification.clj`
- Task scheduling: `src/metabase/notification/task/`
- Event-driven: `src/metabase/notification/events/`

## CI/CD & Deployment

**CI Pipeline:**
- GitHub Actions - 95+ workflow files in `.github/workflows/`
- Key workflows: `backend.yml`, `app-db.yml`, individual driver tests (e.g., `athena.yml`)
- `build-for-release.yml` - Release builds

**Hosting/Deployment:**
- Docker container (`Dockerfile`) - multi-stage build
- Base image: `eclipse-temurin:21-jre-alpine`
- Single uberjar deployment: `target/uberjar/metabase.jar`
- Entrypoint: `/app/run_metabase.sh`
- Default port: 3000

**Build System:**
- `bin/build.sh` - Main build script
- `bin/mage` - Task runner (custom)

## Environment Configuration

**Required env vars (minimum production):**
- `MB_DB_TYPE` - Application database type (`postgres`, `mysql`, `h2`)
- `MB_DB_HOST`, `MB_DB_PORT`, `MB_DB_DBNAME`, `MB_DB_USER`, `MB_DB_PASS` (or `MB_DB_CONNECTION_URI`)

**Common env vars:**
- `MB_JETTY_PORT` - HTTP port (default: 3000)
- `MB_EDITION` - `oss` or `ee`
- `MB_ENCRYPTION_SECRET_KEY` - Encryption key for sensitive settings
- `MB_PREMIUM_EMBEDDING_TOKEN` - Enterprise license token
- `MB_EMBEDDING_APP_ORIGIN` - Allowed embedding origins

**Secrets management:**
- Settings with `:encryption :when-encryption-key-set` are encrypted at rest in app DB
- Encryption key: `MB_ENCRYPTION_SECRET_KEY` env var

## Webhooks & Callbacks

**Incoming:**
- No external webhook endpoints detected (API-driven architecture)

**Outgoing:**
- HTTP notification channel: `src/metabase/channel/impl/http.clj` - sends alert/subscription payloads to configured URLs
- Slack API calls: `src/metabase/channel/slack.clj` - posts messages/files to Slack channels
- Snowplow analytics events: sent to configured Snowplow collector
- Premium feature token validation: calls Metabase license server

## Embedding

**Embedding SDK:**
- React-based embedding SDK for third-party applications
- Package: `@metabase/embedding-sdk-react` (built from `enterprise/frontend/src/embedding-sdk-package/`)
- Bundle config: `rspack.embedding-sdk-package.config.js`, `rspack.embedding-sdk-bundle.config.js`
- CLI tool: `rspack.embedding-sdk-cli.config.js`
- iframe-based embed: `rspack.iframe-sdk-embed.config.js`
- TypeDoc documentation generation configured in `.typedoc/`

**Static Visualization:**
- Server-side chart rendering using GraalVM Polyglot JS engine
- Build: `rspack.static-viz.config.js`
- Used for email/Slack notifications with chart images
- SVG rendering: `org.apache.xmlgraphics/batik-all` 1.19
- PDF generation: `jspdf` ^4.2.0 (frontend), `html2canvas-pro` 1.5.0

---

*Integration audit: 2026-03-11*
