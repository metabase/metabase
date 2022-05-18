## Where is your data being duplicated?
- [Rows](#duplicated-rows)
- [Columns](#duplicated-columns)


## Duplicated rows
Before you start, make sure you know the [schemas of your source tables or nested queries][debugging-sql-logic].

1. Are you missing a `GROUP BY` clause?
2. Check if your source tables or nested queries have duplicated rows. You'll need to repeat the steps below for every table or query result that contains duplicate rows.
    ```sql
    -- If the row_count is greater than 1,
    -- you have duplicated rows in your results.

    SELECT <your_columns>, COUNT(*) AS row_count
    FROM <your_table_or_upstream_query>
    GROUP BY <your_columns>
    ORDER BY row_count DESC
    ;
    ```
4. Check your [table below](#join-types-and-schema-relationships) to see how your join type interacts with your table relationships.
5. [Change your join type or reduce your table relationships](#how-to-reduce-table-relationships).

### Join types and table relationships

How [join types][join-types-learn] interact with [table-relationships][table-relationships-learn] to produce duplicates when matching rows are found.

```
+----------------+------------------------+-----------------------------------+------------------------------+
|                | A is one-to-one with B | A is one-to-many with B           | A is many-to-many with B     |
+----------------+------------------------+-----------------------------------+------------------------------+
| A INNER JOIN B | No duplicate rows.     | No duplicate rows.                | Duplicated rows from A or B. |
+----------------+------------------------+-----------------------------------+------------------------------+
| A LEFT JOIN B  | No duplicate rows.     | Possible duplicates from table B. | Duplicated rows from A or B. |
+----------------+------------------------+-----------------------------------+------------------------------+
| B LEFT JOIN A  | No duplicate rows.     | Possible duplicates from table B. | Duplicated rows from A or B. |
+----------------+------------------------+-----------------------------------+------------------------------+
| A OUTER JOIN B | No duplicate rows.     | Possible duplicates from table B. | Duplicated rows from A or B. |
+----------------+------------------------+-----------------------------------+------------------------------+
| A FULL JOIN B  | No duplicate rows.     | Duplicate rows from table B.      | Duplicated rows from A or B. |
+----------------+------------------------+-----------------------------------+------------------------------+
```

**Explanation**

Rows can get duplicated by accident when data gets refreshed in upstream systems or ETL jobs. 

Some tables have rows that look like duplicates at a glance. This is common with tables that track state changes (e.g. an order status table that adds a row every time the status changes). State tables may have have rows that look exactly the same, except for the timestamp of the row. It can be difficult to detect if you have tables with a lot of columns, so be sure to run through Step 2 above or ask your database admin if you're unsure.

If you’ve written your joins assuming a [one-to-one][one-to-one] relationship for tables that actually have a [one-to-many][one-to-many] or [many-to-many][many-to-many] relationship, you'll get duplicated rows for _each_ match in the "many" table.

**Further reading**

- [Common reasons for unexpected query results][common-reasons-for-sql-logic-errors]
- [Combining tables with joins][joins-learn]
- [Common problems with SQL joins][common-join-problems]
- [What is a schema?][schema-def]
- [Database table relationships][table-relationships-learn]


## Duplicated columns

1. If you are joining data, check if your `SELECT` statement is including both [primary key][primary-key-def] and [foreign key][foreign-key-def] columns.
2. Check if your source tables or query results have duplicated columns by following step 1 under [Debugging SQL logic][debugging-sql-logic].
3. Learn more about [common reasons for unexpected query results][common-reasons-for-sql-logic-errors].


## How to reduce table relationships

If you have duplicated rows because you're assuming a [one-to-one][one-to-one] relationship when you actually have tables that are [one-to-many][one-to-many] or [many-to-many][many-to-many], you can remove the duplicates using:

- An [INNER JOIN](#option-1-use-an-inner-join-with-a-one-to-many-relationship) for a one-to-many relationship.
- A [CTE with an aggregate function](#option-2-use-a-cte-to-reduce-the-table-relationship) for a one-to-many or many-to-many relationship.

For example:
```sql
-- Assume table_a is a one-to-many with table_b.

-- The query below will duplicate rows from table_b 
-- for every matching row in table_a.

SELECT
    < your_columns >
FROM
    table_a
    LEFT JOIN table_b ON key_a = key_b;
```

### Option 1: Use an `INNER JOIN` with a one-to-many relationship.

```sql
-- The query below will get one row from table_b
-- for every matching row in table_a.

SELECT
    < your_columns >
FROM
    table_a
    INNER JOIN table_b ON key_a = key_b;
```

### Option 2: Use a CTE to reduce the table relationship.

```sql
-- The query below will get aggregated values from table_b
-- for every matching row in table_a.

WITH table_b_reduced AS (
    SELECT
        AGGREGATE_FUNCTION (< your_columns >)
    FROM
        table_b_reduced
    GROUP BY
        < your_columns >
)
SELECT
    < your_columns >
FROM
    table_a
    JOIN table_b_reduced ON key_a = key_b_reduced;
```

## Do you have a different problem?

- [I’m getting an error message][troubleshooting-error-messages].
- [My result has missing data][troubleshooting-missing-data].
- [My aggregations (counts, sums, etc.) are wrong][troubleshooting-aggregations].
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].


## Are you still stuck?

Search or ask the [Metabase community][discourse].


[common-join-problems]: /learn/sql-questions/sql-join-types#common-problems-with-sql-joins
[common-reasons-for-sql-logic-errors]: ./sql-logic.md#common-reasons-for-unexpected-query-results
[debugging-sql-logic]: ./sql-logic.html#debugging-sql-logic
[discourse]: https://discourse.metabase.com/
[foreign-key-def]: /glossary/foreign_key
[joins-learn]: /learn/sql-questions/sql-joins.html
[join-types-learn]: /learn/sql-questions/sql-join-types
[many-to-many]: /learn/databases/table-relationships#many-to-many-relationship
[one-to-many]: /learn/databases/table-relationships#one-to-many-relationship
[one-to-one]: /learn/databases/table-relationships#one-to-one-relationship
[primary-key-def]: /glossary/primary_key
[schema-def]: /glossary/schema.html
[table-relationships-learn]: /learn/databases/table-relationships
[troubleshooting-aggregations]: ./sql-logic.html#aggregated-results-counts-sums-etc-are-wrong
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-error-messages]: ./error-message.html
[troubleshooting-missing-data]: ./sql-logic-missing-data.html
[troubleshooting-sql-logic]: ./sql-logic.html