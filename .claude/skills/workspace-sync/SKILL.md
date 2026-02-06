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

This skill synchronizes local transform files with the Metabase workspace API:
- Push local changes to the workspace
- Create new transforms (POST) or update existing (PUT)
- Write back `ref_id` to files after creation
- Delete orphaned transforms (transforms in API but not in local files)

## Sync Behavior

- **Local files are the source of truth** - API state is overwritten
- **New files** (no `ref_id`): POST to create, then update file with returned `ref_id`
- **Existing files** (has `ref_id`): PUT to update
- **Deleted files**: Transforms in API but not locally are deleted

## Prerequisites

Must be run from inside an analysis project directory with:
- `workspace.yaml` - Contains workspace ID and Metabase URL
- `.env` - Contains `METABASE_API_KEY`

## Commands

### `/sync` - Sync All Files

Syncs all files in `questions/` and `transforms/` to the workspace.

**Workflow:**

1. Read configuration:
   ```bash
   API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2)
   WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
   METABASE_URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')
   ```

2. List local files:
   ```bash
   find questions transforms -name "*.sql" -o -name "*.py" 2>/dev/null
   ```

3. For each file, extract metadata and sync:
   - Parse header comments for `name`, `target_table`, `ref_id`, etc.
   - If no `ref_id`: POST to create
   - If has `ref_id`: PUT to update

4. Get list of transforms from API and delete orphans

5. Report results

## API Calls

### Create Transform (no ref_id)

```bash
curl -s -X POST \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rating Variance",
    "description": "...",
    "source": {
      "type": "query",
      "query": {
        "type": "native",
        "native": {"query": "SELECT ..."},
        "database": '$DB_ID'
      }
    },
    "target": {
      "type": "table",
      "schema": "public",
      "name": "rating_variance"
    }
  }' \
  "$METABASE_URL/api/ee/workspace/$WS_ID/transform"
```

Response includes `ref_id` - update the local file with it.

### Update Transform (has ref_id)

```bash
curl -s -X PUT \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rating Variance",
    "source": {...},
    "target": {...}
  }' \
  "$METABASE_URL/api/ee/workspace/$WS_ID/transform/$REF_ID"
```

### List Transforms

```bash
curl -s -H "x-api-key: $API_KEY" \
  "$METABASE_URL/api/ee/workspace/$WS_ID/transform"
```

### Delete Transform

```bash
curl -s -X DELETE \
  -H "x-api-key: $API_KEY" \
  "$METABASE_URL/api/ee/workspace/$WS_ID/transform/$REF_ID"
```

## Building the Request Body

### SQL File to API Request

Given a SQL file:
```sql
-- name: Rating Variance
-- description: Calculate variance by initial
-- target_schema: public
-- target_table: rating_variance
-- ref_id: lucid-ferret-a852

SELECT UPPER(LEFT(reviewer, 1)) AS initial, VAR_POP(rating) AS variance
FROM reviews
GROUP BY 1
```

Build the API request:
```json
{
  "name": "Rating Variance",
  "description": "Calculate variance by initial",
  "source": {
    "type": "query",
    "query": {
      "type": "native",
      "native": {
        "query": "SELECT UPPER(LEFT(reviewer, 1)) AS initial, VAR_POP(rating) AS variance\nFROM reviews\nGROUP BY 1"
      },
      "database": 19
    }
  },
  "target": {
    "type": "table",
    "schema": "public",
    "name": "rating_variance"
  }
}
```

### Python File to API Request

Given a Python file:
```python
# name: User Order Summary
# description: Join users with orders
# source_tables: {"users": 1015, "orders": 1042}
# target_schema: public
# target_table: user_order_summary

result = users_df.merge(orders_df, on='user_id')
```

Build the API request:
```json
{
  "name": "User Order Summary",
  "description": "Join users with orders",
  "source": {
    "type": "python",
    "source-tables": {"users": 1015, "orders": 1042},
    "body": "result = users_df.merge(orders_df, on='user_id')"
  },
  "target": {
    "type": "table",
    "schema": "public",
    "name": "user_order_summary"
  }
}
```

## Parsing File Headers

### SQL Files

```bash
# Extract SQL body (everything after header comments)
sed -n '/^[^-]/,$p' file.sql

# Extract header field
get_header() {
  grep "^-- $1:" "$2" | sed "s/^-- $1: //"
}

NAME=$(get_header "name" file.sql)
TARGET_TABLE=$(get_header "target_table" file.sql)
REF_ID=$(get_header "ref_id" file.sql)
```

### Python Files

```bash
# Extract Python body (everything after header comments)
sed -n '/^[^#]/,$p' file.py

# Extract header field
get_header() {
  grep "^# $1:" "$2" | sed "s/^# $1: //"
}
```

## Updating ref_id After Creation

After POST returns, update the file:

```bash
# Add ref_id to SQL file header (after target_table line)
sed -i '' "/^-- target_table:/a\\
-- ref_id: $REF_ID
" file.sql
```

Or use the Edit tool to insert the line.

## Sync Report Format

```
Syncing 5 files to workspace 2856...

Created:
  questions/q1_rating_variance.sql -> lucid-ferret-a852
  transforms/enriched_orders.sql -> gentle-fox-b123

Updated:
  questions/q2_top_reviewers.sql (calm-tiger-c456)
  transforms/user_summary.sql (swift-hawk-d789)

Deleted (orphaned):
  old-transform (brave-lion-e012)

Sync complete: 2 created, 2 updated, 1 deleted
```

## Error Handling

- **400 Bad Request**: Check SQL syntax, target table conflicts
- **403 Forbidden**: Check API key permissions
- **404 Not Found**: Workspace or transform doesn't exist
- **409 Conflict**: Target table already exists (another transform)

On error, report which file failed and continue with remaining files.

## Dry Run

To preview what would happen without making changes:

1. Parse all files and build requests
2. Compare ref_ids with API transform list
3. Report what would be created/updated/deleted
4. Don't make any API calls
