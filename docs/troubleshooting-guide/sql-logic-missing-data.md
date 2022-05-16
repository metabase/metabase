## Where is your data missing?
- [Rows](#missing-rows)
- [Columns](#missing-columns)


## Missing rows

1. Check if your source tables or query results have missing rows. 
2. Check the [table below](#how-joins-filter-out-unmatched-rows) to see if you are missing rows because of your join type.
3. Check your join conditions in the `ON` clause. For example:
    ```sql
    -- The join condition below will remove:
    -- All rows from table A where key_a = "foo"
    -- All rows from table B where key_b = "foo"

    SELECT *
    FROM table_a
    JOIN table_b
    ON key_a = key_b
    AND key_b <> "foo"
    ```
4. Check if your `WHERE` clause is interacting with your `JOIN` clause. For example:
    ```sql
    # The WHERE clause below will remove:
    # All rows from table A where key_a = "foo"
    # All rows from table B where key_b = "foo"

    SELECT *
    FROM table_a
    JOIN table_b
    WHERE key_b <> "foo"
    ```
5. If you want to *add* rows to your query result to fill in data that is empty, zero, or `NULL`, you need to start your JOINs with a table or column that has all the rows you want. Ask your database admin if there’s a table you can use for this, or can create a temporary column using `GENERATE_SERIES`.
    ```sql
    -- This result has one row for every day with at least one transaction.
    SELECT 
    o.date
    , SUM(p.price) AS total_sales
    FROM orders o
    LEFT JOIN products p
    ON o.product_id = p.id
    GROUP BY 1
    ;

    -- This result has one row for every day, including days with 0 transactions.
    WITH date_series AS (
    GENERATE_SERIES(...)
    )

    SELECT 
      d.date
    , SUM(p.price) AS total_sales
    FROM date_series d
    LEFT JOIN orders o
        ON d.date = o.order_date
    LEFT JOIN products p
        ON o.product_id = p.id
    GROUP BY 1
    ;
    ```
6. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].
7. If you're still stuck, search or ask the [Metabase community][discourse].

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
- [My result has duplicated data][troubleshooting-duplicated-data].
- [My aggregations (counts, sums, etc.) are too high](#aggregated-results-counts-sums-etc-are-too-high).
- [My aggregations (counts, sums, etc.) are too low](#aggregated-results-counts-sums-etc-are-too-low).
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].
- [My query doesn’t run, and I’m getting an error message][troubleshooting-error-messages].

If you’re not having one of the problems above, go to [Troubleshooting SQL logic](#troubleshooting-sql-logic).


## Missing columns

1. If you are joining data, check if your `SELECT` statement contains the column you want.
2. Check if your source tables or query results have missing columns by following step 1 under [Debugging SQL logic][debugging-sql-logic].
3. For more information, read about [common reasons for unexpected query results][common-reasons-for-sql-logic-errors].


## Are you still stuck?

Search or ask the [Metabase community][discourse].


[debugging-sql-logic]: ./sql-logic.html#debugging-sql-logic
[discourse]: https://discourse.metabase.com/
[troubleshooting-aggregations-too-high]: ./sql-logic.html#aggregated-results-counts-sums-etc-are-too-high
[troubleshooting-aggregations-too-low]: ./sql-logic.html#aggregated-results-counts-sums-etc-are-too-low
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-duplicated-data]: ./sql-logic-duplicated-data.md
[troubleshooting-error-messages]: ./error-message.html