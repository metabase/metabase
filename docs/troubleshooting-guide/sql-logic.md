## What’s wrong with your query results?

- [My query doesn’t run, and I’m getting an error message][troubleshooting-error-messages].
- My query runs successfully, but I’m not getting the data results I expect.
    - [My dates and times are wrong][troubleshooting-datetimes].
    - [My data isn't up to date][troubleshooting-database-syncs].
    - If you’re not having one of the problems above, go to [Troubleshooting SQL logic](#troubleshooting-sql-logic).

## Troubleshooting SQL logic

1. Get the schemas for the tables or nested queries used in your query.
    - If you’re using tables in your database, get the schemas from the [data reference][data-reference-docs].
    - If you’re using nested queries such as subqueries, CTEs, Metabase saved questions, or Metabase models:
      - Run each `SELECT` block in a new SQL editor.
      - If you're not sure, you can follow the [instructions here][how-to-find-nested-query-schema].
    - [I don’t know if I’m using a nested query][how-to-find-nested-query-type].
2. Review the [foreign keys][foreign-key-docs] of your tables or nested queries.
    - Is there more than one possible foreign key?
    - Have the foreign keys been re-named or moved to another schema?
    - If you’re not sure, ask the owner of the schema.
3. Check for [common SQL logic problems][common-sql-logic-problems].
4. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].
5. If you’re still stuck, search or ask the [Metabase community][discourse].

### How does troubleshooting SQL logic work?

SQL logic describes the way that your query combines data from different tables or data sources. The most common ways of combining data are joins and nested queries (using the results of subqueries, CTEs, or SQL variables in Metabase).

Even if your SQL logic *used* to work, it can break when:

- The tables or data sources have changed.
- The nested queries have changed (if you’re building on top of a [saved question or model][[saved-question-model-docs]).
- Your nested queries aren’t being computed as you expect (if you’ve written them from scratch).
- Your data includes edge cases, such as empty or `NULL` values.

Most of the time, these changes are introduced upstream by the systems that collect your data or the lovely people who manage your databases and BI tools.

It’s extremely tricky for teams to anticipate ripple effects from such changes. Fixing SQL logic is not only about responding to change, but updating your approach to better guard against future updates.

If you’re getting a red error message that mentions SQL clauses or table and column names, you most likely have a SQL syntax problem. Go to [Troubleshooting SQL error messages][troubleshooting-sql-errors] instead.

### Common SQL logic problems

- [My result has duplicated rows](#my-result-has-duplicated-rows).
- [My result has missing rows](#my-result-has-missing-rows).
- [My aggregations (counts, sums, etc.) are too high](#my-aggregations-counts-sums-etc-are-too-high).
- [My aggregations (counts, sums, etc.) are too low](#too-low).
- If your problem isn't listed above, search or ask the [Metabase community][discourse].

#### My result has duplicated rows

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

#### Join types and schema relationships
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

- [What is a schema?][schema-def]
- [SQL join types][types-of-joins]

#### My result has missing rows

1. Check if your source tables or query results have missing rows. 
2. Check the [table below](#how-joins-filter-out-unmatched-rows) to see if you are missing rows because of your join type.
3. Check your join conditions in the `ON` clause. For example:
    ```sql
    # The join condition below will remove:
    # All rows from table A where key_a = "foo"
    # All rows from table B where key_b = "foo"

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
    # This result has one row for every day with at least one transaction.
    SELECT 
    o.date
    , SUM(p.price) AS total_sales
    FROM orders o
    LEFT JOIN products p
    ON o.product_id = p.id
    GROUP BY 1
    ;

    # This result has one row for every day, including days with 0 transactions.
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

#### How joins filter out unmatched rows
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

The execution order of the query may combine your join conditions and WHERE clauses in ways that you might not expect.

**Further reading**

- [Common problems with SQL joins][common-join-problems] 

#### My aggregations (counts, sums, etc.) are too high.

1. Check if your source tables or upstream queries have [duplicated rows](#my-result-has-duplicated-rows).
2. Check your source tables or upstream queries for rows that should be filtered out.
    - Are you including empty or `NULL` rows in your aggregations?
    - Ask your Metabase admin or data team about business logic that defines invalid, cancelled, or expired records that should be filtered out in queries.
3. If you’re aggregating unique values, check that you’re not double-counting them.
    - Do you need to use `COUNT_DISTINCT` instead of `COUNT`?
    - Are you applying a `SUM` on top of a `COUNT_DISTINCT`?
4. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].
5. If you’re still stuck, search or ask the [Metabase community][discourse].

#### My aggregations (counts, sums, etc.) are too low.

1. Check if your source tables or upstream queries have [missing rows](#my-result-has-missing-rows).
2. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].
3. If you’re still stuck, search or ask the [Metabase community][discourse].

### I don’t know if I’m using a nested query.

You have a nested query if your SQL contains:

- **More than one `SELECT` statement**

    You’re using subqueries.
    
- **A `WITH` clause**
    
    You’re using CTEs (Common Table Expressions).
    
- **Notation that looks like `{{ variable_name }}`** in your `FROM` or `WITH` clause.
    
    You have a Metabase SQL variable that references a saved question or model.
    
**Further reading**

- [How Metabase executes SQL queries][how-metabase-executes-sql-queries]
- [How Metabase executes SQL variables][how-metabase-executes-sql-variables]

### I don’t know how to get the schema for my nested query

**Subqueries** or **CTEs**

You’ll need to manually run SELECT statements in a new SQL editor. Use the `LIMIT` clause to get a small sample of data.

**Metabase saved question or model**

Go to the saved question or model from the variables panel or by pasting the ID number into the Metabase search bar. Convert it to a SQL question and run the query with a `LIMIT` clause to get a small sample of data.

**To find foreign keys or schema relationships for nested queries**
1. Look for explicitly defined metadata (models only).
2. If you're building off of someone else's work, ask the original owner of the query, saved question, or model.
3. Compare the rows from your data samples.

## Are you still stuck?

Search or ask the [Metabase community](https://discourse.metabase.com/search?q=sql%20error%20message).

[common-join-problems]: /learn/sql-questions/sql-join-types#common-problems-with-sql-joins
[data-reference-docs]: ../users-guide/12-data-model-reference.html
[discourse]: https://discourse.metabase.com/
[foreign-key-docs]: ../12-data-model-reference.html#foreign-keys
[how-metabase-executes-sql-queries]: ../users-guide/writing-sql.html#how-metabase-executes-sql-queries
[how-metabase-executes-sql-variables]: ../users-guide/referencing-saved-questions-in-queries.html#saved-question-as-a-common-table-expression-cte
[how-to-find-nested-query-schema]: #i-dont-know-how-to-get-the-schema-for-my-nested-query
[how-to-find-nested-query-type]: #i-dont-know-if-im-using-a-nested-query
[saved-question-model-docs]: ../users-guide/referencing-saved-questions-in-queries.html#referencing-models-and-saved-questions-in-sql-queries
[schema-def]: /glossary/schema.html
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-error-messages]: ./error-message.html
[troubleshooting-sql-errors]: ./sql-error-message.html
[types-of-joins]: /learn/sql-questions/sql-join-types.html