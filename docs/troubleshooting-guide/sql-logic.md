## What’s wrong with your query results?

- [My query doesn’t run, and I’m getting an error message][troubleshooting-error-messages].
- My query runs successfully, but I’m not getting the data results I expect.
    - [My dates and times are wrong][troubleshooting-datetimes].
    - [My data isn't up to date][troubleshooting-database-syncs].

If you’re not having one of the problems above, go to [Troubleshooting SQL logic](#troubleshooting-sql-logic).

## Debugging SQL logic

1. Get the schemas for the tables or nested queries used in your query.
    - If you’re using tables in your database, get the schemas from the [data reference][data-reference-docs].
    - If you’re using nested queries such as subqueries, CTEs, Metabase saved questions, or Metabase models:
      - [Run each `SELECT` block separately][how-to-run-query-selections].
      - If you're not sure, see [how to find nested query schema](#how-to-get-the-schema-for-a-nested-query).
    - [I don’t know if I’m using a nested query](#how-to-find-out-if-you-have-a-nested-query).
2. Review the [foreign keys][foreign-key-docs] of your tables or nested queries.
    - Is there more than one possible foreign key?
    - Have the foreign keys been renamed or moved to another schema?
    - If you’re not sure, ask the person who maintains the schema.
3. Check for [common SQL logic problems][common-sql-logic-problems].
4. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].

### Common reasons for unexpected query results

SQL logic describes the way that your query combines data from different tables or data sources. The most common ways of combining data are joins and nested queries (using the results of subqueries, CTEs, or SQL variables in Metabase).

Even if your SQL logic *used* to work, it can break when:

- The tables or data sources have changed.
- The nested queries have changed (if you’re building on top of a [saved question or model][saved-question-model-docs].
- Your nested queries aren’t being computed as you expect (if you’ve written them from scratch).
- Your data includes edge cases, such as empty or `NULL` values.

Most of the time, these changes are introduced upstream by the systems that collect your data or the lovely people who manage your databases and BI tools.

It’s extremely tricky for teams to anticipate ripple effects from such changes. Fixing SQL logic is not only about responding to change, but updating your approach to better guard against future updates.

If you’re getting a red error message that mentions SQL clauses or table and column names, you most likely have a SQL syntax problem. Go to [Troubleshooting SQL error messages][troubleshooting-sql-errors] instead.

### Common SQL logic problems

- [My result has duplicated rows][troubleshooting-duplicated-data].
- [My result has missing rows][troubleshooting-missing-data].
- [My aggregations (counts, sums, etc.) are too high](#aggregated-results-counts-sums-etc-are-too-high).
- [My aggregations (counts, sums, etc.) are too low](#aggregated-results-counts-sums-etc-are-too-low).

If your problem isn't listed above, search or ask the [Metabase community][discourse].

#### Aggregated results (counts, sums, etc.) are too high.

1. Check if your source tables or upstream queries have [duplicated rows][troubleshooting-duplicated-data].
2. Check your source tables or upstream queries for rows that should be filtered out.
    - Are you including empty or `NULL` rows in your aggregations?
    - Ask your Metabase admin or data team about business logic that defines invalid, cancelled, or expired records that should be filtered out in queries.
3. If you’re aggregating unique values, check that you’re not double-counting them.
    - Do you need to use `COUNT_DISTINCT` instead of `COUNT`?
    - Are you applying a `SUM` on top of a `COUNT_DISTINCT`?
4. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].
5. If you’re still stuck, search or ask the [Metabase community][discourse].

#### Aggregated results (counts, sums, etc.) are too low.

1. Check if your source tables or upstream queries have [missing rows][troubleshooting-missing-data].
2. If you’re getting an error message, go to [Troubleshooting error messages][troubleshooting-error-messages].
3. If you’re still stuck, search or ask the [Metabase community][discourse].

### How to find out if you have a nested query

You have a nested query if your SQL contains:

- **More than one `SELECT` statement**

    You’re using subqueries.
    
- **A `WITH` clause**
    
    You’re using [CTEs (Common Table Expressions)][cte-def].
    
- **Notation that looks like `{{ variable_name }}`** in your `FROM` or `WITH` clause.
    
    You have a Metabase SQL variable that references a [saved question or model][saved-question-model-docs].
    
**Further reading**

- [How Metabase executes SQL queries][how-metabase-executes-sql-queries]
- [How Metabase executes SQL variables][how-metabase-executes-sql-variables]

### How to get the schema for a nested query

**Subqueries** or **CTEs**

[Run each `SELECT` block separately][how-to-run-query-selections]. Use the `LIMIT` clause to get a small sample of data.

**Metabase saved question or model**

Go to the saved question or model from the variables panel or by pasting the ID number into the Metabase search bar. Add a row limit using the notebook editor, or add a `LIMIT` clause in the SQL editor to get a small sample of data.

**To find foreign keys or schema relationships for nested queries**
1. Look for explicitly defined metadata (models only).
2. If you're building off of someone else's work, ask the original owner of the query, saved question, or model.
3. Compare the rows from your data samples.

## Are you still stuck?

Search or ask the [Metabase community][discourse].

[common-join-problems]: /learn/sql-questions/sql-join-types#common-problems-with-sql-joins
[cte-def]: /glossary/cte
[data-reference-docs]: ../users-guide/12-data-model-reference.html
[discourse]: https://discourse.metabase.com/
[etl-learn]: /learn/analytics/etl-landscape
[foreign-key-docs]: ../12-data-model-reference.html#foreign-keys
[how-metabase-executes-sql-queries]: ../users-guide/writing-sql.html#how-metabase-executes-sql-queries
[how-metabase-executes-sql-variables]: ../users-guide/referencing-saved-questions-in-queries.html#saved-question-as-a-common-table-expression-cte
[how-to-find-nested-query-type]: #i-dont-know-if-im-using-a-nested-query
[how-to-run-query-selections]: ../users-guide/writing-sql.html#running-query-selections
[saved-question-model-docs]: ../users-guide/referencing-saved-questions-in-queries.html#referencing-models-and-saved-questions-in-sql-queries
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-duplicated-data]: ./sql-logic-duplicated-data.md
[troubleshooting-error-messages]: ./error-message.html
[troubleshooting-missing-data]: ./sql-logic-missing-data.md
[troubleshooting-sql-errors]: ./sql-error-message.html