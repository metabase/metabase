## Where is your data missing?
- [Rows](#missing-rows)
- [Columns](#missing-columns)


## Missing rows
Before you start, make sure you know the [schemas of your source tables or nested queries](#debugging-sql-logic).

1. Check if your source tables or queries have missing rows. 
2. Check the [table below](#how-joins-filter-out-unmatched-rows) to see if you are missing rows because of your join type.
3. Check your join conditions in the `ON` clause. For example:
    ```sql
    -- The join condition below will remove:
    -- All transactions from the Orders table where the product category is 'Gizmo'.

    SELECT *
    FROM orders o 
    JOIN products p 
      ON o.product_id = p.id 
     AND p.category <> 'Gizmo'
    ;
    ```
4. Check if your `WHERE` clause is interacting with your `JOIN` clause. For example:
    ```sql
    -- The WHERE clause below will remove:
    -- All transactions from the Orders table where the product category is 'Gizmo'.

    SELECT *
    FROM orders o 
    JOIN products p 
      ON o.product_id = p.id 
    WHERE p.category <> 'Gizmo'
    ;
    ```
5. If you want to *add* rows to your query result to fill in data that is empty, zero, or `NULL`, you need to start your JOINs with a table or column that has all the rows you want. Ask your database admin if there’s a table you can use for this. If your SQL dialect supports the `GENERATE_SERIES` function, you can create a temporary column to for your report dates.
    ```sql
    -- The query below calculates the total sales for each day that had at least one order.
    -- For example, note that there is no row in the results for May 5, 2016.

    SELECT DATE_TRUNC('day', o.created_at)::DATE AS "order_created_date",
           SUM(p.price) AS "total_sales"
    FROM orders o 
    JOIN products p 
      ON o.product_id = p.id 
    GROUP BY "order_created_date"
    ORDER BY "order_created_date" ASC
    ;

    -- The query below calculates the total sales for every day in the report period, including days with 0 orders.
    -- The date_series CTE generates one row per date that you want in your final result.
    -- The fact_orders CTE generates the total sales for each date that had an order.
    -- The main query joins the two CTEs together and uses the COALESCE function to fill in the dates where there were no orders (i.e. a total sales value of 0).

    WITH date_series AS (
        SELECT *
        FROM GENERATE_SERIES('2016-05-01'::DATE,'2020-05-30'::DATE, '1 day'::INTERVAL) report_date
    )

    , fact_orders AS (
        SELECT DATE_TRUNC('day', o.created_at)::DATE AS "order_created_date",
               SUM(p.price) AS "total_sales"
        FROM orders o 
        JOIN products p 
        ON o.product_id = p.id 
        GROUP BY "order_created_date"
        ORDER BY "order_created_date" ASC
    )

    SELECT 
      d.report_date,
      o.order_created_date,
      COALESCE(o.total_sales, 0) AS total_sales
    FROM date_series d
    LEFT JOIN fact_orders o
    ON d.date = o.order_created_date
    ;
    ```

### How joins filter out unmatched rows
| Join type | Rows that are filtered out |
| --- | --- |
| Table A INNER JOIN Table B | You will lose rows from both table A and table B if the join condition is not met. |
| Table A LEFT JOIN Table B | You will lose rows from table B if the join condition is not met. |
| Table B LEFT JOIN Table A | You will lose rows from table A if the join condition is not met. |
| Table A OUTER JOIN Table B | You will lose rows from both table A and table B if the join condition is met. |
| Table A FULL JOIN Table B | This join does not remove any rows from table A or table B. |

**Explanation**

Rows can get removed by accident when data gets refreshed in upstream systems or ETL jobs. 

The order of the tables used in your `JOIN` clause matters. For example:

- When you write a `LEFT JOIN`, the table that comes *before* the `JOIN` clause in your query is “on the left".
- The rows from the table “on the right” will be filtered out if they don’t meet your join condition in the `ON` clause.

The execution order of the query may combine your join conditions and `WHERE` clauses in ways that you might not expect.

**Further reading**

- [Common reasons for unexpected query results][common-reasons-for-sql-logic-errors]
- [Common problems with SQL joins][common-join-problems]
- [ETLs, ELTs, and Reverse ETLs][etl-learn]


## Do you have a different problem?

- [I’m getting an error message][troubleshooting-error-messages].
- [My result has duplicated data][troubleshooting-duplicated-data].
- [My aggregations (counts, sums, etc.) are wrong][troubleshooting-aggregations].
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].

If you’re not having one of the problems above, go to [Troubleshooting SQL logic](#troubleshooting-sql-logic).


## Missing columns

1. If you are joining data, check if your `SELECT` statement contains the column you want.
2. Check if your source tables or query results have missing columns by following step 1 under [Debugging SQL logic][debugging-sql-logic].
3. Learn more about [common reasons for unexpected query results][common-reasons-for-sql-logic-errors].


## Are you still stuck?

Search or ask the [Metabase community][discourse].


[common-join-problems]: /learn/sql-questions/sql-join-types#common-problems-with-sql-joins
[common-reasons-for-sql-logic-errors]: ./sql-logic.md#common-reasons-for-unexpected-query-results
[debugging-sql-logic]: ./sql-logic.html#debugging-sql-logic
[discourse]: https://discourse.metabase.com/
[etl-learn]: /learn/analytics/etl-landscape
[troubleshooting-aggregations]: ./sql-logic.html#aggregated-results-counts-sums-etc-are-wrong
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-duplicated-data]: ./sql-logic-duplicated-data.md
[troubleshooting-error-messages]: ./error-message.html