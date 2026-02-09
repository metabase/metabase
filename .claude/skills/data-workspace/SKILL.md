---
name: data-workspace
description: Unified workflow for data analysis and pipeline building in workspaces
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# Data Workspace

Autonomous workflow for data analysis and pipeline building. When the user asks a question or requests a transform, execute the full loop without prompting:

1. **Discover tables** - Fetch metadata for relevant tables, save to `tables/*.yaml`
2. **Write the file** - Create SQL/Python with proper headers
3. **Sync to workspace API** - POST/PUT the transform
4. **Run the transform** - Execute and check results
5. **Present results** - Show sample data to user

## Project Organization

**One workspace = one analysis project.** Each project directory is a self-contained analysis:

```
cohort-retention-analysis/      # Created by /new-workspace
├── .env                        # API key for this workspace
├── workspace.yaml              # Workspace ID, database, URL
├── tables/                     # Table schemas for THIS analysis
│   ├── orders.yaml
│   └── people.yaml
├── questions/                  # Ad-hoc analysis queries
│   └── q01_cohort_sizes.sql
└── transforms/                 # Pipeline transforms
    └── retention_cohort.sql
```

**For a new analysis topic, create a new workspace:**
```bash
cd ~/projects
claude
# /new-workspace → creates "customer-churn-analysis/"
```

This keeps each analysis isolated with its own:
- Workspace (isolated schema in the database)
- API credentials
- Table metadata
- Transforms

**Do NOT mix unrelated analyses in one project.** If you're switching topics, create a new workspace.

## Reading Configuration

Always read config at the start:

```bash
# Read .env properly (handles values containing =)
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2-)
WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
DB_ID=$(grep '^database_id:' workspace.yaml | awk '{print $2}')
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')
```

## Step 1: Discover Tables

Before writing any queries, fetch metadata for tables the user mentions or that are relevant to the question.

### Using fetch_table.py (Recommended)

Use the fetch_table.py script for fetching table metadata:

```bash
# List all available tables
python3 ~/.claude/skills/workspace-admin/fetch_table.py --list

# Fetch a specific table by ID
python3 ~/.claude/skills/workspace-admin/fetch_table.py 1042

# Fetch a table by name
python3 ~/.claude/skills/workspace-admin/fetch_table.py --name orders

# Fetch all tables at once
python3 ~/.claude/skills/workspace-admin/fetch_table.py --all
```

This creates clean YAML files in `tables/`:

```yaml
name: orders
schema: public
database_id: 19
table_id: 1042
columns:
  - name: id
    type: Integer
    semantic_type: PK
  - name: customer_id
    type: Integer
    semantic_type: FK
  - name: total
    type: Decimal
  - name: created_at
    type: DateTime
```

### Check Existing Table Metadata

Before fetching, check what we already have:

```bash
ls tables/
```

Read existing YAML files to understand available columns.

## File Format Examples

### SQL Question (questions/*.sql)

```sql
-- name: Revenue by Customer Segment
-- description: Calculates total revenue grouped by customer segment
-- target_schema: public
-- target_table: revenue_by_segment

SELECT
    c.segment,
    COUNT(DISTINCT o.customer_id) AS customer_count,
    SUM(o.total) AS total_revenue,
    AVG(o.total) AS avg_order_value
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'completed'
GROUP BY c.segment
ORDER BY total_revenue DESC
```

### SQL Transform (transforms/*.sql)

```sql
-- name: Enriched Orders
-- description: Orders joined with customer and product details
-- target_schema: public
-- target_table: enriched_orders

SELECT
    o.id AS order_id,
    o.created_at AS order_date,
    o.total AS order_total,
    c.id AS customer_id,
    c.name AS customer_name,
    c.segment AS customer_segment,
    p.id AS product_id,
    p.name AS product_name,
    p.category AS product_category
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
```

### Python Transform (transforms/*.py)

```python
# name: Customer Cohort Analysis
# description: Assigns customers to monthly cohorts based on first purchase
# source_tables: {"orders": 1042, "customers": 1015}
# target_schema: public
# target_table: customer_cohorts

import pandas as pd

# First purchase date per customer
first_purchase = orders_df.groupby('customer_id')['created_at'].min().reset_index()
first_purchase.columns = ['customer_id', 'first_purchase_date']
first_purchase['cohort_month'] = pd.to_datetime(first_purchase['first_purchase_date']).dt.to_period('M')

# Join with customer data
result = customers_df.merge(first_purchase, left_on='id', right_on='customer_id')
result = result[['id', 'name', 'email', 'segment', 'cohort_month']]
```

## Autonomous Workflow

When user asks a question or requests a transform:

### Step 1: Discover and Fetch Table Metadata

First, identify which tables are needed for this request. Then:

1. Check if `tables/*.yaml` already exists for those tables
2. If not, fetch from API and create the YAML files
3. Read the YAML files to understand available columns

```bash
# Check existing
ls tables/

# If needed tables are missing, fetch them (see Step 1: Discover Tables above)
```

### Step 2: Understand the Request

Determine:
- Analysis mode (question) → `questions/` folder
- Pipeline mode (transform) → `transforms/` folder
- SQL or Python

### Step 3: Write the File

Create the SQL or Python file with proper header comments. Use descriptive filenames:
- Questions: `q01_revenue_by_segment.sql`
- Transforms: `enriched_orders.sql`, `customer_cohorts.py`

### Step 4: Sync and Run

Use sync_transform.py to sync files to the workspace and run them:

```bash
# Sync a single file
python3 ~/.claude/skills/workspace-admin/sync_transform.py questions/q01_analysis.sql

# Sync and run
python3 ~/.claude/skills/workspace-admin/sync_transform.py --run questions/q01_analysis.sql

# Sync all files
python3 ~/.claude/skills/workspace-admin/sync_transform.py --all

# Sync all and run
python3 ~/.claude/skills/workspace-admin/sync_transform.py --all --run
```

The script:
- Parses file headers automatically
- Creates new transforms (POST) or updates existing (PUT)
- Writes ref_id back to the file after creation
- Optionally runs the transform with `--run`

### Step 5: Preview Results with Dry-Run

Use dry-run to preview transform output WITHOUT persisting to the isolated table:

```bash
# After syncing, use the ref_id to dry-run
REF_ID="lucid-ferret-a852"  # From sync response or file header

curl -s -X POST \
  -H "x-api-key: $API_KEY" \
  "$URL/api/ee/workspace/$WS_ID/transform/$REF_ID/dry-run" | jq '.rows[:10]'
```

Dry-run returns up to 2000 rows of preview data without writing to the database.

### Step 6: Run and Verify

Once satisfied with dry-run results, run the transform to persist:

```bash
curl -s -X POST \
  -H "x-api-key: $API_KEY" \
  "$URL/api/ee/workspace/$WS_ID/transform/$REF_ID/run"
```

The run response includes row count and status.

### Step 7: Present Results

Show the user:
- What was created/updated
- Row count from run response
- Sample data from dry-run (first 10-20 rows as a table)
- Any errors or warnings

## Scratch Queries

For quick exploratory queries, create a temporary transform and dry-run it:

1. Create a scratch transform file
2. Sync it to get a ref_id
3. Dry-run to see results
4. Delete if not needed

Or use the sync_transform.py script which handles this:

```bash
# Create a quick scratch query
echo '-- name: scratch
-- target_schema: public
-- target_table: _scratch

SELECT COUNT(*) as total FROM orders' > /tmp/scratch.sql

# Sync it
python3 ~/.claude/skills/workspace-admin/sync_transform.py /tmp/scratch.sql
```

**Note:** The dry-run endpoint is per-transform: `POST /api/ee/workspace/:ws/transform/:ref/dry-run`

## Error Handling

If transform fails:
1. Show the error message
2. Identify the issue (SQL syntax, missing table, etc.)
3. Fix the file
4. Re-sync and re-run

Common errors:
- `relation "X" does not exist` → Check table name in schema
- `column "X" does not exist` → Check column names in tables/*.yaml
- `syntax error` → Fix SQL syntax
