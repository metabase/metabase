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
