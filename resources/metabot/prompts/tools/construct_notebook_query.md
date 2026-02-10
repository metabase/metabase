# Tool: `construct_notebook_query`

**IMPORTANT TERMINOLOGY:**

Understand the difference between these terms (they are often confused):

1. **METRICS** = Higher-level business KPIs that combine aggregation + filters + time dimension
   - These are standalone, queryable entities using `QueryMetric`
   - Include the core calculation, any required filters, and often a primary time dimension
   - Can be projected onto different dimensions (x-axis, y-axis) and filtered
   - Example: "Monthly Revenue from Premium Customers", "Trial Conversion Rate"
   - Think of them as complete, business-facing numbers you track on dashboards

2. **MEASURES** = Named aggregation formulas ONLY (no filters, no dimensions)
   - These are NOT standalone - they're just aggregation formulas defined on specific tables/models
   - They are "macros for official aggregations" that live alongside columns
   - Use them in `AggregateDataSource` queries via `MeasureAggregation`
   - Example: `count(orders)`, `sum(revenue)`, `avg(time_to_resolution)` on a specific table
   - They replace custom field aggregations like `{"field_id": "8", "function": "avg"}`
   - Key difference from metrics: measures are JUST the aggregation, no filters or dimensions

3. **SEGMENTS** = Pre-defined filter conditions on tables/models
   - These are business-defined filters that identify meaningful data subsets
   - They live on tables/models alongside measures and columns
   - Can be used in ALL query types: metric, raw, aggregate
   - Use them in filters via `segment_id`
   - Example: "Active Customers" segment, "High Value Orders" segment
   - They replace custom filters like `{"filter_type": "multi_value", "field_id": "...", ...}`

4. **AGGREGATIONS** = The mathematical operations (sum, count, avg, min, max)
   - Can be custom (via custom aggregation formula) or pre-defined (via measures)

**Choosing the right query type:**

There are 3 query types based on what data source and operations you need:

1. **QueryMetric** - For pre-existing Metabase METRICS
   - Use when: A saved metric already exists that answers the user's question
   - Source: `metric_id` (e.g., "Total Revenue" metric, "Active Users" metric)
   - Capabilities: Filter and group by dimensions
   - **Segments**: Can use pre-defined segments when filtering metrics
     - Metrics may expose which segments are valid for filtering via their details
     - Use `segment_id` in the filters array when available
     - Example: Filter "Revenue" metric by "Premium Customers" segment
   - Sorting: Use `sort_order` within aggregations (metrics already have built-in aggregations)
   - Note: Don't rebuild metrics from scratch - always use existing metrics when available
   - For multiple metrics: Make separate tool calls, one per metric

2. **AggregateDataSource** - For computing aggregations on models/tables
   - Use when: You need custom aggregations (sum, count, avg, etc.) not covered by existing metrics
   - Source: `model_id` or `table_id`
   - Capabilities: Aggregate, filter, group by fields
   - Sorting: Use `sort_order` within each aggregation
   - Available fields: All fields from source + related tables (auto-joined)
   - Note: No `order_by` parameter - sorting is only via aggregation `sort_order`
   - **Measures & Segments**: Tables/models may have pre-defined measures and segments
     - **Measures**: Named aggregation formulas ONLY (no filters, no dimensions)
       - Think "macros for official aggregations" like count(orders), sum(revenue), avg(price)
       - They live on tables/models alongside columns
       - Use `measure_id` instead of a field aggregation when available
       - Example: `{"measure_id": 5}` instead of `{"field_id": "8", "function": "avg"}`
       - Remember: MEASURES ≠ METRICS! Measures are just aggregation formulas, Metrics are complete KPIs
     - **Segments**: Pre-defined filter conditions for business-defined data subsets
       - They live on tables/models alongside columns and measures
       - Example: "Active Customers", "High Value Orders", "Premium Tier Users"
       - Use `segment_id` instead of custom filters when available
       - Example: `{"segment_id": 10}` instead of custom field filters
     - **IMPORTANT**: Always prefer measures/segments over custom aggregations/filters when available
       - They encapsulate official business definitions and ensure consistency
       - Check table/model metadata for available measures and segments before creating custom queries
   - ⚠️ **CRITICAL**: Filters apply ONLY to raw data BEFORE aggregation (WHERE clause, not HAVING)
     - You CANNOT filter on aggregated results like count, sum, avg
     - Example: Cannot filter "where count > 1" or "where sum > 10000"
     - Solution: Return all results sorted by aggregation with a reasonable limit

3. **RawDataSource** - For listing individual records
   - Use when: You need to see individual rows/records (not aggregated/summarized)
   - Source: `model_id` or `table_id`
   - Capabilities: Select fields, filter, sort, limit
   - **Segments**: Can use pre-defined segments for filtering
     - Use `segment_id` instead of custom filters when available
     - Example: List all records in "Active Customers" segment
   - Sorting: Use `order_by` to sort by any field
   - Available fields: All fields from source + related tables (auto-joined)
   - Note: No aggregations - this returns row-level data

**Temporal grouping (`field_granularity` for `group_by`):**
When grouping by date/time fields, specify how to group:
- `year`: 2024-01-15T12:13:14 → 2024
- `quarter`: 2024-01-15T12:13:14 → 2024-Q1
- `month`: 2024-01-15T12:13:14 → 2024-01
- `week`: 2024-01-15T12:13:14 → 2024-W03
- `day`: 2024-01-15T12:13:14 → 2024-01-15
- `day-of-week`: 2024-01-15T12:13:14 → 2 (Monday)
- `hour`: 2024-01-15T12:13:14 → 2024-01-15T12
- `minute`: 2024-01-15T12:13:14 → 2024-01-15T12:13
- `second`: 2024-01-15T12:13:14 → 2024-01-15T12:13:14

**Temporal filtering (`bucket` for date/time filters):**
When filtering date/time fields, specify which component to filter on - e.g. given a datetime value of 2024-01-15T12:13:14:
- `year-of-era`: Extract year → 2024
- `quarter-of-year`: Extract quarter → 1
- `month-of-year`: Extract month → 1
- `week-of-year`: Extract week → 3
- `day-of-month`: Extract day → 15
- `day-of-week`: Extract weekday → 2 (Monday)
- `hour-of-day`: Extract hour → 12
- `minute-of-hour`: Extract minute → 13
- `second-of-minute`: Extract second → 14

**Note:** Filter values for temporal buckets must be integers (e.g., `year-of-era` with `values=[2024]` and `quarter-of-year` with `values=[1, 2, 3]` would filter for Q1-Q3 of 2024).


**Filtering Rules:**
- **Segment filters (`segment`):** Use pre-defined segments when available.
  - Must use `segment_id` field: `{"filter_type": "segment", "segment_id": 10}`
  - Preferred over custom filters when available for business consistency
- **Multi-value filters (`multi_value`):** Use for operations that support multiple values (combined with OR).
  - Allowed operations: `=`, `!=`, `starts-with`, `ends-with`, `contains`, `does-not-contain`
  - Must use `values` list (even for single values like operation `= 'USA'`, use `values=['USA']`)
- **Single-value filters (`single_value`):** Use for comparison operations that require exactly one value.
  - Allowed operations: `>`, `>=`, `<`, `<=`
  - Must use `value` field.
- **No-value filters (`no_value`):** Use for checks that don't require a value.
  - Allowed operations: `is-null`, `not-null`, `is-empty`, `not-empty`, `is-true`, `is-false`

**Visualization:**
You must provide a `visualization.chart_type` value that matches the query data:

For aggregations and metrics:
- Time series data (grouped by date/time) → `line` or `area` chart
- Categorical aggregations (grouped by category) → `bar` chart
- Percentage breakdowns/proportions → `pie` chart
- Single numeric result → `scalar`

**For raw data queries:**
- Individual records without aggregation → `table`

**Important:** Don't default to `table` for aggregated data. Use visual charts (bar, line, pie) to show aggregations effectively.

Note: Metabase will automatically map data to chart aesthetics (axes, labels). You only choose the chart type.

**Limitations:**
- **No post-aggregation filtering (HAVING clause)**: Cannot filter on count, sum, avg, etc.
  - ❌ "Find items appearing more than once" → Cannot filter count > 1
  - ✅ Instead: Group by item, count, sort descending, limit 100 (frequent items appear at top)
- No joins, unions, subqueries, or combining multiple sources
- No field calculations (e.g., field_a / field_b, field_a + field_b)
- No window functions, cohort analysis, or advanced analytics
- Filters are combined with AND logic; values within a filter use OR logic

**When NOT to use this tool:**
- Post-aggregation filtering needed (e.g., "categories where total sales > $10k")
- Joins or complex SQL required
- Field calculations or transformations needed
- User explicitly requests SQL

**Use SQL tools instead for these cases.**
