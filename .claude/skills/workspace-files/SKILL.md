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

Manages the local file representations in a data workspace project.

## Directory Structure

```
my-analysis/
├── .env                  # METABASE_API_KEY=...
├── workspace.yaml        # Workspace metadata
├── tables/               # Input table schemas
│   ├── orders.yaml
│   ├── customers.yaml
│   └── products.yaml
├── questions/            # Analysis queries (user-facing)
│   ├── q01_revenue_by_segment.sql
│   └── q02_top_customers.sql
└── transforms/           # Data pipeline transforms
    ├── enriched_orders.sql
    └── customer_cohorts.py
```

## SQL File Format

Use for both `questions/*.sql` and `transforms/*.sql`:

```sql
-- name: Revenue by Customer Segment
-- description: Calculates total revenue grouped by customer segment
-- target_schema: public
-- target_table: revenue_by_segment
-- ref_id: lucid-ferret-a852

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

### Header Fields (SQL)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name |
| `description` | No | What this transform does |
| `target_schema` | Yes | Target schema (e.g., `public`) |
| `target_table` | Yes | Target table name |
| `ref_id` | Auto | Assigned by API after sync - never set manually |

## Python File Format

Use for `transforms/*.py`:

```python
# name: Customer Cohort Analysis
# description: Assigns customers to monthly cohorts based on first purchase
# source_tables: {"orders": 1042, "customers": 1015}
# target_schema: public
# target_table: customer_cohorts
# ref_id: gentle-fox-b123

import pandas as pd

# First purchase date per customer
first_purchase = orders_df.groupby('customer_id')['created_at'].min().reset_index()
first_purchase.columns = ['customer_id', 'first_purchase_date']
first_purchase['cohort_month'] = pd.to_datetime(first_purchase['first_purchase_date']).dt.to_period('M')

# Join with customer data
result = customers_df.merge(first_purchase, left_on='id', right_on='customer_id')
result = result[['id', 'name', 'email', 'segment', 'cohort_month']]
```

### Header Fields (Python)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name |
| `description` | No | What this transform does |
| `source_tables` | Yes | JSON map: `{"df_name": table_id, ...}` |
| `target_schema` | Yes | Target schema |
| `target_table` | Yes | Target table name |
| `ref_id` | Auto | Assigned by API after sync |

The `source_tables` field maps DataFrame variable names to Metabase table IDs. Each table is loaded as `{name}_df` (e.g., `orders_df`, `customers_df`).

## Table Schema Format

Store in `tables/*.yaml`:

```yaml
name: orders
schema: public
database_id: 19
table_id: 1042
columns:
  - name: id
    type: integer
    description: Primary key
  - name: customer_id
    type: integer
    description: Foreign key to customers
  - name: product_id
    type: integer
  - name: total
    type: decimal
    description: Order total in USD
  - name: status
    type: varchar
    description: "completed, pending, cancelled"
  - name: created_at
    type: timestamp
```

## workspace.yaml Format

```yaml
id: 2856
name: "Customer Analysis"
database_id: 19
status: ready
metabase_url: http://localhost:3000
```

## .env Format

```
METABASE_API_KEY=mb_abc123def456...
```

## Fetching Table Metadata from API

```bash
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2-)
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')
TABLE_ID=1042

curl -s -H "x-api-key: $API_KEY" "$URL/api/table/$TABLE_ID/query_metadata" | \
  jq '{
    name: .name,
    schema: .schema,
    database_id: .db_id,
    table_id: .id,
    columns: [.fields[] | {name: .name, type: .base_type, description: .description}]
  }'
```

## Best Practices

1. **Filenames**: Use descriptive names
   - Questions: `q01_<topic>.sql`, `q02_<topic>.sql`
   - Transforms: `<descriptive_name>.sql` or `.py`

2. **ref_id**: Never manually set or modify - let the sync process manage it

3. **Questions vs Transforms**:
   - `questions/` = Analysis outputs, may or may not merge
   - `transforms/` = Pipeline building blocks, intended for production

4. **Table schemas**: Keep `tables/` updated for context when writing queries
