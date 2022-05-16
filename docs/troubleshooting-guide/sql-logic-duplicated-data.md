## Where is your data being duplicated?
- [Rows](#duplicated-rows)
- [Columns](#duplicated-columns)


## Duplicated rows

1. Are you missing a `GROUP BY` clause?
2. Check if your source tables or upstream queries have duplicated rows.
    ```sql
    SELECT <your_columns>, COUNT(*) AS row_count
    FROM <your_table_or_upstream_query>
    GROUP BY <your_columns>
    ORDER BY row_count DESC
    ;
    ```
3. If your source tables or query results have duplicated rows:
    - Treat your schema relationships as one-to-many or many-to-many.
    - If the duplicates don’t seem intentional, let your database or Metabase admin know.
4. Check the [table below](#join-types-and-schema-relationships) to see how your join type interacts with your schema relationships.
5. Reduce one or both of your schemas to fit one of the situations where duplicates are not possible. See the code snippet below for some options.
    ```sql
    # Put the "many" table(s) in a CTE.

    WITH table_b_reduced AS (
    SELECT <your_columns>
    FROM table_b_reduced
    GROUP BY <your_columns>
    )

    SELECT <your_columns>
    FROM table_a
    JOIN table_b_reduced
    ON key_a = key_b_reduced
    ;
    ```
6. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].
7. If you're still stuck, search or ask the [Metabase community][discourse].

### Join types and schema relationships
|  | A is one-to-one with B | A is one-to-many with B | A is many-to-many with B |
| --- | --- | --- | --- |
| A `INNER JOIN` B | No duplicate rows. | No duplicate rows. | You will get duplicated rows from A or B. |
| A `LEFT JOIN` B | No duplicate rows. | You may get duplicated rows because of matches from table B. | You will get duplicated rows from A or B. |
| B `LEFT JOIN` A | No duplicate rows. | You will get duplicated rows because of matches from table B. | You will get duplicated rows from A or B. |
| A `OUTER JOIN` B | No duplicate rows. | You may get duplicated rows because of matches from table B. | You will get duplicated rows from A or B. |
| A `FULL JOIN` B | No duplicate rows. | You will get duplicated rows because of matches from table B. | You will get duplicated rows from A or B. |


**Explanation**

Rows can get duplicated by accident when data gets refreshed in upstream systems or ETL jobs. 

Some tables have rows that look like duplicates at a glance. This is common with tables that track state changes (e.g. an order status table that adds a row every time the status changes) may have have rows that look exactly the same, except for the timestamp of the row. It can be difficult to detect if you have tables with a lot of columns, so be sure to run through Step 2 above or ask your database admin if you're unsure.

If you’ve written your joins assuming a one-to-one relationship for tables that actually have a one-to-many or many-to-many relationship, you'll get duplicated rows for _each_ match in the "many" table.

**Further reading**

- [Common reasons for unexpected query results][common-reasons-for-sql-logic-errors]
- [What is a schema?][schema-def]
- [SQL join types][types-of-joins]


## Duplicated columns

1. If you are joining data, check if your `SELECT` statement is including both primary and foreign key columns.
2. Check if your source tables or query results have duplicated columns by following step 1 under [Debugging SQL logic][debugging-sql-logic].
3. For more information, read about [common reasons for unexpected query results][common-reasons-for-sql-logic-errors].


## Do you have a different problem?

- [My result has missing rows][troubleshooting-missing-data].
- [My aggregations (counts, sums, etc.) are too high][troubleshooting-aggregations-too-high].
- [My aggregations (counts, sums, etc.) are too low][troubleshooting-aggregations-too-low].
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].
- [My query doesn’t run, and I’m getting an error message][troubleshooting-error-messages].

If you’re not having one of the problems above, go to [Troubleshooting SQL logic][troubleshooting-sql-logic].


## Are you still stuck?

Search or ask the [Metabase community][discourse].

[debugging-sql-logic]: ./sql-logic.html#debugging-sql-logic
[discourse]: https://discourse.metabase.com/
[common-reasons-for-sql-logic-errors]: ./sql-logic.md#common-reasons-for-unexpected-query-results
[schema-def]: /glossary/schema.html
[troubleshooting-aggregations-too-high]: ./sql-logic.html#aggregated-results-counts-sums-etc-are-too-high
[troubleshooting-aggregations-too-low]: ./sql-logic.html#aggregated-results-counts-sums-etc-are-too-low
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-error-messages]: ./error-message.html
[troubleshooting-missing-data]: ./sql-logic-missing-data.html
[types-of-joins]: /learn/sql-questions/sql-join-types.html