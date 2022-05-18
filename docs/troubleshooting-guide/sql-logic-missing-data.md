## Where is your data missing?
- [Rows](#missing-rows)
- [Columns](#missing-columns)


## Missing rows
Before you start, make sure you know the [schemas of your source tables or nested queries](#debugging-sql-logic).

1. Check if your source tables or nested queries have missing rows. 
2. Check the [table below](#how-joins-filter-out-unmatched-rows) to see if you are missing rows because of your join type.
3. Check your join conditions in the `ON` clause. For example:
    ```sql
    -- The join condition below will filter out
    -- all transactions from the Orders table 
    -- where the product category is 'Gizmo'.

    SELECT
        *
    FROM
        orders o
        JOIN products p ON o.product_id = p.id
            AND p.category <> 'Gizmo';
    ```
4. Check if your `WHERE` clause is interacting with your `JOIN` clause. For example:
    ```sql
    -- The WHERE clause below will filter out
    -- all transactions from the Orders table
    -- where the product category is 'Gizmo'.

    SELECT
        *
    FROM
        orders o
        JOIN products p ON o.product_id = p.id
                       AND p.category = 'Gizmo'
    WHERE
        p.category <> 'Gizmo'
    ```
5. If you want to *add* rows to your query result to fill in data that is empty, zero, or `NULL`, go to [How to fill in data for missing report dates](#how-to-fill-in-data-for-missing-report-dates).

### How joins filter out unmatched rows

```
+----------------+--------------------------------------+
| Join type      | If join condition isn't met          |
+----------------+--------------------------------------+
| A INNER JOIN B | Rows filtered out from both A and B. |
+----------------+--------------------------------------+
| A LEFT JOIN B  | Rows filtered out from B.            |
+----------------+--------------------------------------+
| B LEFT JOIN A  | Rows filtered out from A.            |
+----------------+--------------------------------------+
| A OUTER JOIN B | Rows filtered out from both A and B. |
+----------------+--------------------------------------+
| A FULL JOIN B  | No rows are filtered out.            |
+----------------+--------------------------------------+
```

**Explanation**

The order of the tables used in your `JOIN` clause matters. For example:

- When you write a `LEFT JOIN`, the table that comes *before* the `LEFT JOIN` clause in your query is “on the left".
- The rows from the table “on the right” (the table *after* the `LEFT JOIN` clause) will be filtered out if they don’t meet your join condition(s) in the `ON` clause.

The [execution order][sql-execution-order] of the query may combine your join conditions and `WHERE` clauses in ways that you might not expect.

**Further reading**

- [Common reasons for unexpected query results][common-reasons-for-sql-logic-errors]
- [Common problems with SQL joins][common-join-problems]
- [Join types][join-types-learn]
- [ETLs, ELTs, and Reverse ETLs][etl-learn]

## How to fill in data for missing report dates

If your source tables or nested queries only store rows for dates where something has happened, you'll get results with missing report dates. 

For example, the `Orders` table in the [Sample Database][sample-database-def] only stores rows for dates where orders were created. It doesn't store any rows for dates where there was no order activity.

```sql
-- The query below calculates the total sales 
-- for each day that had at least one order.

-- For example, note that there is no row
-- in the query results for May 5, 2016.


SELECT
    DATE_TRUNC('day', o.created_at)::date AS "order_created_date",
    SUM(p.price) AS "total_sales"
FROM
    orders o
    JOIN products p ON o.product_id = p.id
WHERE
    o.created_at BETWEEN'2016-05-01'::date
    AND '2016-05-30'::date
GROUP BY
    "order_created_date"
ORDER BY
    "order_created_date" ASC;
```

If you want a result like the table below, you'll need to start your `JOIN` with a table or column that has all the dates (or any other sequence) you want. Ask your database admin if there’s a table you can use for this.
```
+--------------------+-------------+
| report_date        | total_sales |
+--------------------+-------------+
| May 4, 2016        | 98.78       |
+--------------------+-------------+
| May 5, 2016        | 0.00        |
+--------------------+-------------+
| May 6, 2016        | 87.29       |
+--------------------+-------------+
| May 7, 2016        | 0.00        |
+--------------------+-------------+
| May 8, 2016        | 81.61       |
+--------------------+-------------+
```

If your SQL dialect supports the `GENERATE_SERIES` function, you can create a temporary column that stores your report dates.

```sql
-- The query below calculates the total sales 
-- for every day in the report period, 
-- including days with 0 orders.

-- The date_series CTE generates one row 
-- per date that you want in your final result.

WITH date_series AS (
    SELECT
        *
    FROM
        GENERATE_SERIES('2016-05-01'::date, '2020-05-30'::date, '1 day'::interval) report_date
)

-- The fact_orders CTE generates the total sales
-- for each date that had an order.

, fact_orders AS (
    SELECT
        DATE_TRUNC('day', o.created_at)::date AS "order_created_date",
        SUM(p.price) AS "total_sales"
    FROM
        orders o
        JOIN products p ON o.product_id = p.id
    GROUP BY
        "order_created_date"
    ORDER BY
        "order_created_date" ASC
)

-- The main query joins the two CTEs together 
-- and uses the COALESCE function to fill in the dates 
-- where there were no orders (i.e. a total sales value of 0).

SELECT
    d.report_date,
    o.order_created_date,
    COALESCE(o.total_sales, 0) AS total_sales
FROM
    date_series d
    LEFT JOIN fact_orders o ON d.date = o.order_created_date
;
```

## Missing columns

1. If you're joining data, check if your `SELECT` statement contains the columns you want.
   - Are you using the correct table aliases?
   - Are you missing the table in your `FROM` clause?
2. Check if your source tables or query results have missing columns by following step 1 under [Debugging SQL logic][debugging-sql-logic].
3. Learn more about [common reasons for unexpected query results][common-reasons-for-sql-logic-errors].

## Do you have a different problem?

- [I’m getting an error message][troubleshooting-error-messages].
- [My result has duplicated data][troubleshooting-duplicated-data].
- [My aggregations (counts, sums, etc.) are wrong][troubleshooting-aggregations].
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].


## Are you still stuck?

Search or ask the [Metabase community][discourse].


[common-join-problems]: /learn/sql-questions/sql-join-types#common-problems-with-sql-joins
[common-reasons-for-sql-logic-errors]: ./sql-logic.md#common-reasons-for-unexpected-query-results
[debugging-sql-logic]: ./sql-logic.html#debugging-sql-logic
[discourse]: https://discourse.metabase.com/
[etl-learn]: /learn/analytics/etl-landscape
[join-types-learn]: /learn/sql-questions/sql-join-types
[sample-database-def]: /glossary/sample_database
[sql-execution-order]: /learn/sql-questions/sql-best-practices.html#the-general-order-of-query-execution
[troubleshooting-aggregations]: ./sql-logic.html#aggregated-results-counts-sums-etc-are-wrong
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-duplicated-data]: ./sql-logic-duplicated-data.md
[troubleshooting-error-messages]: ./error-message.html