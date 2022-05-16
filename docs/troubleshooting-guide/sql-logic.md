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

- [My result has duplicated data][troubleshooting-duplicated-data].
- [My result has missing data][troubleshooting-missing-data].
- [My aggregations (counts, sums, etc.) are wrong](#aggregated-results-counts-sums-etc-are-wrong).

If your problem isn't listed above, search or ask the [Metabase community][discourse].

#### Aggregated results (counts, sums, etc.) are wrong.
Before you start, make sure you know the [schemas of your source tables or nested queries](#debugging-sql-logic).

1. If your aggregations are:
    - too high, check if your source tables or queries have [duplicated rows][troubleshooting-duplicated-data].
    - too low, check if your source tables or queries have [missing rows][troubleshooting-missing-data].
2. Check your source tables or queries for filters.
    - How are you handling empty or `NULL` rows in your aggregations?
    - How are you handling invalid, cancelled, or expired records? Ask your Metabase admin or data team about business logic that you might not know about.
3. If you're working with unique values, check if your use `COUNT_DISTINCT` is interacting with other functions.
    - For example, applying `SUM` on top of `COUNT_DISTINCT` may double-count unique values.
4. If you're working with time series data, [check if your time zones are set correctly][troubleshooting-datetimes].
5. If your source tables get updated on a schedule, ask your Metabase admin [if your data is up to date][troubleshooting-database-syncs].

**Explanation**

Aggregations are often the first place where you'll detect a problem caused by one of the [common reasons for unexpected query results](#common-reasons-for-unexpected-query-results). The steps above will help you catch any edge cases that may be skewing your results. If you find lots of edge cases, and you anticipate handling the same cases over and over again, you may want to [bundle all of the logic together in a model][model-learn] so it can be easily re-used.

And sometimes, you might just need a pair of fresh eyes. If you can't locate the root cause using the steps above, ask a teammate to help you check your math!

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
2. If you're building off of someone else's work, ask the original creator of the query, saved question, or model.
3. Compare the rows from your data samples.


## Do you have a different problem?

- [I’m getting an error message][troubleshooting-error-messages].
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].


## Are you still stuck?

Search or ask the [Metabase community][discourse].


[cte-def]: /glossary/cte
[data-reference-docs]: ../users-guide/12-data-model-reference.html
[discourse]: https://discourse.metabase.com/
[foreign-key-docs]: ../12-data-model-reference.html#foreign-keys
[how-metabase-executes-sql-queries]: ../users-guide/writing-sql.html#how-metabase-executes-sql-queries
[how-metabase-executes-sql-variables]: ../users-guide/referencing-saved-questions-in-queries.html#saved-question-as-a-common-table-expression-cte
[how-to-find-nested-query-type]: #i-dont-know-if-im-using-a-nested-query
[how-to-run-query-selections]: ../users-guide/writing-sql.html#running-query-selections
[model-learn]: /learn/getting-started/models
[saved-question-model-docs]: ../users-guide/referencing-saved-questions-in-queries.html#referencing-models-and-saved-questions-in-sql-queries
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-duplicated-data]: ./sql-logic-duplicated-data.md
[troubleshooting-error-messages]: ./error-message.html
[troubleshooting-missing-data]: ./sql-logic-missing-data.md
[troubleshooting-sql-errors]: ./sql-error-message.html