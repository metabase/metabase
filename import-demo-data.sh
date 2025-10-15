#!/usr/bin/env bash

set -euo pipefail

# Script to import demo data into a local Postgres instance running in Docker
# This script sets up the same database configuration as the Dockerfile:
# - Creates a 'metabase' user with password 'metabase'
# - Creates 'metabase' and 'AdventureWorks2014' databases owned by the metabase user
# - Imports default_app.sql and adventureworks2014.sql data
#
# Required environment variables:
#   AI_SERVICE_REPO - Path to the ai-service repository (default: ../ai-service)
#
# Optional environment variables:
#   PGHOST     - Postgres host (default: localhost)
#   PGPORT     - Postgres port (default: 5432)
#   PGUSER     - Postgres admin user (default: mbuser)
#   PGPASSWORD - Postgres admin password (default: password)

# Set defaults
AI_SERVICE_REPO="${AI_SERVICE_REPO:-../ai-service}"
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-mbuser}"
export PGPASSWORD="${PGPASSWORD:-password}"

DEFAULT_APP_SQL="${AI_SERVICE_REPO}/benchmarks/environment/data/default_app.sql"
ADVENTUREWORKS_SQL="${AI_SERVICE_REPO}/benchmarks/environment/data/adventureworks2014.sql"
PSQL=${PSQL:-psql}

echo "Checking for SQL files..."
if [[ ! -f "$DEFAULT_APP_SQL" ]]; then
    echo "Error: default_app.sql not found at $DEFAULT_APP_SQL"
    exit 1
fi

if [[ ! -f "$ADVENTUREWORKS_SQL" ]]; then
    echo "Error: adventureworks2014.sql not found at $ADVENTUREWORKS_SQL"
    exit 1
fi

echo "Connecting to Postgres at ${PGHOST}:${PGPORT} as user ${PGUSER}..."

# Terminate existing connections to databases we're about to drop
echo "Terminating existing database connections..."
$PSQL -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('metabase', 'AdventureWorks2014') AND pid <> pg_backend_pid();" 2>/dev/null || true

# Drop databases first (before dropping the user who owns them)
echo "Dropping existing databases..."
$PSQL -d postgres -c "DROP DATABASE IF EXISTS metabase;" 2>/dev/null || true
$PSQL -d postgres -c "DROP DATABASE IF EXISTS \"AdventureWorks2014\";" 2>/dev/null || true

# Drop and recreate the metabase user with password 'metabase' (matching Dockerfile)
echo "Recreating metabase user..."
$PSQL -d postgres -c "DROP USER IF EXISTS metabase;" 2>/dev/null || true
$PSQL -d postgres -c "CREATE USER metabase WITH PASSWORD 'metabase';"

# Create metabase database
echo "Creating metabase database..."
$PSQL -d postgres -c "CREATE DATABASE metabase OWNER metabase;"

# Create AdventureWorks2014 database
echo "Creating AdventureWorks2014 database..."
$PSQL -d postgres -c "CREATE DATABASE \"AdventureWorks2014\" OWNER metabase;"

# Import default app data into metabase database
echo "Importing default app data into metabase database..."
PGUSER=metabase PGPASSWORD=metabase $PSQL -d metabase -f "$DEFAULT_APP_SQL"

# Import AdventureWorks data
echo "Importing AdventureWorks2014 data..."
PGUSER=metabase PGPASSWORD=metabase $PSQL -d AdventureWorks2014 -f "$ADVENTUREWORKS_SQL"

echo ""
echo "✅ Demo data import completed successfully!"
echo ""
echo "Database configuration (matching Dockerfile):"
echo "  • User: metabase"
echo "  • Password: metabase"
echo "  • Databases: metabase, AdventureWorks2014"
