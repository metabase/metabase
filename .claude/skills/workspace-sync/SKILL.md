---
name: workspace-sync
description: Sync local transform files with the workspace API
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Workspace Sync

Syncs local transform files with the Metabase workspace API.

## Behavior

- **Local files are source of truth** - API state is overwritten
- **New files** (no `ref_id`): POST to create, then update file with returned `ref_id`
- **Existing files** (has `ref_id`): PUT to update
- **Deleted files**: Transforms in API but not locally are deleted

## Reading Configuration

```bash
# Read .env properly (handles values containing =)
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2-)
WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
DB_ID=$(grep '^database_id:' workspace.yaml | awk '{print $2}')
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')
```

## Syncing a SQL File

```bash
FILE="questions/q01_revenue.sql"

# Extract metadata from header comments
NAME=$(grep '^-- name:' "$FILE" | sed 's/^-- name: //')
DESC=$(grep '^-- description:' "$FILE" | sed 's/^-- description: //')
SCHEMA=$(grep '^-- target_schema:' "$FILE" | sed 's/^-- target_schema: //')
TABLE=$(grep '^-- target_table:' "$FILE" | sed 's/^-- target_table: //')
REF_ID=$(grep '^-- ref_id:' "$FILE" | sed 's/^-- ref_id: //')

# Extract SQL body (everything after header comments)
SQL=$(sed -n '/^[^-]/,$p' "$FILE" | jq -Rs .)

# Build JSON request
JSON=$(cat <<EOF
{
  "name": "$NAME",
  "description": "$DESC",
  "source": {
    "type": "query",
    "query": {
      "type": "native",
      "native": {"query": $SQL},
      "database": $DB_ID
    }
  },
  "target": {
    "type": "table",
    "schema": "$SCHEMA",
    "name": "$TABLE"
  }
}
EOF
)

if [ -z "$REF_ID" ]; then
  # CREATE: POST new transform
  RESPONSE=$(curl -s -X POST \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$JSON" \
    "$URL/api/ee/workspace/$WS_ID/transform")

  # Extract ref_id from response and add to file
  NEW_REF_ID=$(echo "$RESPONSE" | jq -r '.ref_id')
  if [ "$NEW_REF_ID" != "null" ]; then
    # Insert ref_id after target_table line
    sed -i '' "/^-- target_table:/a\\
-- ref_id: $NEW_REF_ID
" "$FILE"
    echo "Created: $FILE -> $NEW_REF_ID"
  else
    echo "Error creating $FILE: $RESPONSE"
  fi
else
  # UPDATE: PUT existing transform
  curl -s -X PUT \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$JSON" \
    "$URL/api/ee/workspace/$WS_ID/transform/$REF_ID"
  echo "Updated: $FILE ($REF_ID)"
fi
```

## Syncing a Python File

```bash
FILE="transforms/cohorts.py"

# Extract metadata
NAME=$(grep '^# name:' "$FILE" | sed 's/^# name: //')
DESC=$(grep '^# description:' "$FILE" | sed 's/^# description: //')
SOURCE_TABLES=$(grep '^# source_tables:' "$FILE" | sed 's/^# source_tables: //')
SCHEMA=$(grep '^# target_schema:' "$FILE" | sed 's/^# target_schema: //')
TABLE=$(grep '^# target_table:' "$FILE" | sed 's/^# target_table: //')
REF_ID=$(grep '^# ref_id:' "$FILE" | sed 's/^# ref_id: //')

# Extract Python body (everything after header comments)
BODY=$(sed -n '/^[^#]/,$p' "$FILE" | jq -Rs .)

JSON=$(cat <<EOF
{
  "name": "$NAME",
  "description": "$DESC",
  "source": {
    "type": "python",
    "source-tables": $SOURCE_TABLES,
    "body": $BODY
  },
  "target": {
    "type": "table",
    "schema": "$SCHEMA",
    "name": "$TABLE"
  }
}
EOF
)

# Same POST/PUT logic as SQL...
```

## Deleting Orphaned Transforms

```bash
# Get all ref_ids from API
API_REFS=$(curl -s -H "x-api-key: $API_KEY" \
  "$URL/api/ee/workspace/$WS_ID/transform" | jq -r '.transforms[].ref_id')

# Get all ref_ids from local files
LOCAL_REFS=$(grep -rh '^-- ref_id:\|^# ref_id:' questions/ transforms/ 2>/dev/null | \
  sed 's/^-- ref_id: //; s/^# ref_id: //')

# Find orphans (in API but not local)
for ref in $API_REFS; do
  if ! echo "$LOCAL_REFS" | grep -q "^$ref$"; then
    curl -s -X DELETE \
      -H "x-api-key: $API_KEY" \
      "$URL/api/ee/workspace/$WS_ID/transform/$ref"
    echo "Deleted orphan: $ref"
  fi
done
```

## Full Sync Script

```bash
#!/bin/bash
set -e

API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2-)
WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
DB_ID=$(grep '^database_id:' workspace.yaml | awk '{print $2}')
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')

echo "Syncing to workspace $WS_ID..."

# Sync all SQL files
for f in questions/*.sql transforms/*.sql 2>/dev/null; do
  [ -f "$f" ] || continue
  # ... sync logic
done

# Sync all Python files
for f in transforms/*.py 2>/dev/null; do
  [ -f "$f" ] || continue
  # ... sync logic
done

# Delete orphans
# ... orphan deletion logic

echo "Sync complete"
```
