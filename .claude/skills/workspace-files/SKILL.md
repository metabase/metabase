---
name: workspace-files
description: Manage local file representations of transforms and table schemas
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Workspace Files

This skill manages the local file representations in a data workspace project:
- Question files (`questions/*.sql`)
- Transform files (`transforms/*.sql`, `transforms/*.py`)
- Table schema files (`tables/*.yaml`)
- Project configuration (`workspace.yaml`, `.env`)

## Directory Structure

```
my-analysis/
├── .env                  # METABASE_API_KEY=...
├── workspace.yaml        # Workspace metadata
├── tables/               # Input table schemas
│   ├── orders.yaml
│   ├── users.yaml
│   └── products.yaml
├── questions/            # User-facing analysis outputs
│   ├── q1_rating_variance.sql
│   └── q2_top_reviewers.sql
└── transforms/           # Intermediate data transforms
    ├── cleaned_reviews.sql
    └── user_order_summary.py
```

## File Formats

### workspace.yaml

```yaml
id: 2856
name: "Review Analysis"
database_id: 19
status: ready
metabase_url: http://localhost:3000
```

### SQL Transform (questions/*.sql or transforms/*.sql)

```sql
-- name: Rating Variance by Initial
-- description: Analyzes rating variance grouped by first letter of reviewer name
-- target_schema: public
-- target_table: rating_variance_by_initial
-- ref_id: lucid-ferret-a852

SELECT
  UPPER(LEFT(reviewer, 1)) AS initial,
  COUNT(*) AS review_count,
  AVG(rating) AS avg_rating,
  VAR_POP(rating) AS variance
FROM reviews
WHERE reviewer IS NOT NULL AND reviewer != ''
GROUP BY UPPER(LEFT(reviewer, 1))
ORDER BY initial
```

**Header fields:**
- `name` (required): Human-readable name for the transform
- `description` (optional): What this transform does
- `target_schema` (optional): Target schema, defaults to workspace default
- `target_table` (required): Target table name
- `ref_id` (optional): Assigned by API after first sync, used for updates

### Python Transform (transforms/*.py)

```python
# name: User Order Summary
# description: Joins users with their orders
# source_tables: {"users": 1015, "orders": 1042}
# target_schema: public
# target_table: user_order_summary
# ref_id: gentle-fox-b123

import pandas as pd

result = users_df.merge(orders_df, on='user_id')
```

**Header fields:**
- `name` (required): Human-readable name
- `description` (optional): What this transform does
- `source_tables` (required): JSON map of dataframe name to table ID
- `target_schema` (optional): Target schema
- `target_table` (required): Target table name
- `ref_id` (optional): Assigned by API after first sync

### Table Schema (tables/*.yaml)

```yaml
name: orders
schema: public
database_id: 19
table_id: 1042
columns:
  - name: id
    type: integer
    semantic_type: pk
  - name: user_id
    type: integer
    semantic_type: fk
    fk_target: users.id
  - name: total
    type: decimal
    semantic_type: currency
  - name: created_at
    type: timestamp
    semantic_type: creation_timestamp
```

## Operations

### Creating a Question File

When user asks an analytical question:

1. Generate a descriptive filename (e.g., `q1_rating_variance.sql`)
2. Write SQL with header comments
3. Place in `questions/` directory

```sql
-- name: Question 1: What is the rating variance by reviewer initial?
-- description: Groups reviews by first letter of reviewer name and calculates variance
-- target_schema: public
-- target_table: q1_rating_variance

SELECT
  UPPER(LEFT(reviewer, 1)) AS initial,
  COUNT(*) AS review_count,
  AVG(rating) AS avg_rating,
  VAR_POP(rating) AS variance
FROM reviews
GROUP BY UPPER(LEFT(reviewer, 1))
ORDER BY initial
```

### Creating a Transform File

When user wants to build a data pipeline:

1. Generate a descriptive filename (e.g., `enriched_orders.sql`)
2. Write SQL/Python with header comments
3. Place in `transforms/` directory

### Fetching Table Metadata

To populate `tables/` with schema info from the API:

```bash
# Read API key from .env
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2)
METABASE_URL=$(grep metabase_url workspace.yaml | awk '{print $2}')

# Fetch table metadata
curl -s -H "x-api-key: $API_KEY" \
  "$METABASE_URL/api/table/$TABLE_ID/query_metadata" | \
  jq '{
    name: .name,
    schema: .schema,
    database_id: .db_id,
    table_id: .id,
    columns: [.fields[] | {
      name: .name,
      type: .base_type,
      semantic_type: .semantic_type
    }]
  }'
```

Then convert JSON to YAML and save to `tables/<table_name>.yaml`.

### Updating ref_id After Sync

After `workspace-sync` creates a transform, it returns the `ref_id`. Update the file header:

```sql
-- name: Rating Variance
-- target_table: rating_variance
-- ref_id: lucid-ferret-a852   <-- Add this line
```

### Parsing File Headers

To extract metadata from a SQL file:

```bash
# Extract all header fields
grep '^-- [a-z_]*:' file.sql | sed 's/^-- //'
```

To extract a specific field:

```bash
# Get target_table
grep '^-- target_table:' file.sql | sed 's/^-- target_table: //'
```

### Listing All Transforms

```bash
# List all question files
ls questions/*.sql 2>/dev/null

# List all transform files
ls transforms/*.sql transforms/*.py 2>/dev/null
```

## Best Practices

1. **Naming**: Use descriptive filenames that reflect the content
   - Questions: `q1_<topic>.sql`, `q2_<topic>.sql`
   - Transforms: `<descriptive_name>.sql` or `.py`

2. **Headers**: Always include at minimum `name` and `target_table`

3. **ref_id**: Never manually set `ref_id` on new files - let sync assign it

4. **Table schemas**: Keep `tables/` up to date for context when writing queries

5. **Questions vs Transforms**:
   - `questions/` = User-facing analysis, may or may not be merged
   - `transforms/` = Data pipeline building blocks, intended for production
