## Debugging SQL logic

1. Get the [schemas][schema-def] for the data sources used in your query.
    - If you’re using tables from your database, get the schemas from the [data reference][data-reference-docs].
    - If you’re using nested queries such as subqueries, [CTEs][cte-def], [saved questions][saved-question-def], or [models][model-def], you'll need to run each nested query individually and [manually inspect the results](#how-to-get-the-schema-for-a-nested-query).
    - [I don’t know if I’m using a nested query](#how-to-identify-a-nested-query).
2. Review the [foreign keys][foreign-key-docs] of your tables or nested queries.
    - Is there more than one possible foreign key?
    - Have the foreign keys been renamed or moved to another schema?
    - If you’re not sure, ask the person who maintains the schema.
3. Check for [common SQL logic problems](#common-reasons-for-unexpected-query-results).

### Common reasons for unexpected query results

SQL logic describes the way that your query combines data from different tables or data sources (including temporary tables, such as the results of other queries). The most common ways of combining data are joins and [nested queries](#how-to-identify-a-nested-query).

Even if your SQL logic *used* to work, it can break when:

- The tables or data sources have changed.
- The nested queries have changed (if you’re building on top of a [saved question or model][saved-question-model-docs]).
- Your nested queries aren’t being computed as you expect (if you’ve written them from scratch).
- Your data includes edge cases, such as empty or `NULL` values.

Most of the time, these changes are introduced upstream by the systems that collect your data, or the lovely people who manage your databases and BI tools.

It’s extremely tricky for teams to anticipate ripple effects from such changes. Fixing SQL logic is not only about responding to change, but updating your approach to better guard against future updates.

If you’re getting a red error message that mentions SQL clauses or table and column names, you most likely have a SQL syntax problem. Go to [Troubleshooting SQL error messages][troubleshooting-sql-errors] instead.


### Common SQL logic problems

- [My result has duplicated data][troubleshooting-duplicated-data].
- [My result has missing data][troubleshooting-missing-data].
- [My aggregations (counts, sums, etc.) are wrong](#aggregated-results-counts-sums-etc-are-wrong).


#### Aggregated results (counts, sums, etc.) are wrong

1. If your aggregations are:
    - too high, check if your source tables or queries have [duplicated rows][troubleshooting-duplicated-data].
    - too low, check if your source tables or queries have [missing rows][troubleshooting-missing-data].
2. Check your source tables or queries for filters.
    - How are you handling empty or `NULL` rows in your aggregations?
    - How are you handling invalid, cancelled, or expired records? Ask your Metabase admin or data team about business logic that you might not know about.
3. If you're working with `COUNT_DISTINCT`, check if it is interacting with other aggregate functions.
    - For example, applying `SUM` on top of `COUNT_DISTINCT` may double-count unique values.
4. If you're working with time series data, [check your time zones][troubleshooting-datetimes].
5. If your data gets updated on a schedule, ask your Metabase admin [if your tables are up to date][troubleshooting-database-syncs].

**Explanation**

Aggregations are often the first place where you'll detect a problem caused by one of the [common reasons for unexpected query results](#common-reasons-for-unexpected-query-results). The steps above will help you catch any edge cases that may be skewing your results. If you find lots of edge cases, and you anticipate handling the same cases over and over again, you may want to bundle all of that logic into a [model][model-learn] so it can be easily re-used.

And sometimes, you might just need a pair of fresh eyes. If you can't locate the root cause using the steps above, ask a teammate to help you check your math!

**Further reading**

- [How Metabase executes SQL queries][how-metabase-executes-sql-queries]
- [How Metabase executes SQL variables][how-metabase-executes-sql-variables]


### How to identify a nested query

If your SQL contains:

- **More than one `SELECT` statement**

    You’re using subqueries.
    
- **A `WITH` clause**
    
    You’re using [CTEs (Common Table Expressions)][cte-def].
    
- **Notation that looks like `{% raw %}{{ variable }}{% endraw %}` in your `FROM` or `WITH` clause**
    
    You have a [SQL variable][sql-variable-def] that references a [saved question or model][saved-question-model-docs].


### How to get the schema for a nested query

1. Get a sample of data from your nested query.
    - For **subqueries** or **CTEs**, [run each `SELECT` block separately][how-to-run-query-selections] and use the`LIMIT` clause.
    - For **saved questions or models**, go to the underlying Metabase question from the variables panel or by pasting the ID number into the search bar. Add a row limit using the notebook editor, or add a `LIMIT` clause in the SQL editor.
2. Compare the column names and values between your samples to check for [foreign keys][foreign-key-def]. For example:
    - In the [Metabase Sample Database][sample-database-def], the `Products` table has an `ID` column, and the `Orders` table has a `Product ID` column.
    - `ID` and `Product ID` both contain integer values, and many of those values show up in both columns.
3. Compare the rows between your samples to check for [table relationships][table-relationships-learn]. For example:
    - The `Products` table has unique values in the `ID` column.
    - The `Orders` table has multiple rows with the same `Product ID`.
    - The table relationship from `Products` to `Orders` is [one-to-many][one-to-many] (assuming that the foreign key relationship is valid).
4. If you're using a [model][model-foreign-keys], you can look for explicitly defined metadata by hovering over the column name.
5. If you're building off of someone else's work, ask the original creator of the query, saved question, or model.


**Explanation**

A [schema][schema-def] describes the columns in a table, the data types of those columns, and the relationships between columns across different tables. This [metadata][metadata-def] is usually explicitly defined for tables stored in your database by the people who manage your data. 

Since the results of nested queries are only stored temporarily, the metadata about the results isn't defined or stored anywhere. The steps above will help you manually inspect the query results instead.

Once you have the schemas for your nested queries, you can follow the steps under [Debugging SQL logic][debugging-sql-logic].


**Further reading**

- [How to identify a nested query](#how-to-identify-a-nested-query)
- [What is a schema?][schema-def]
- [Database table relationships][table-relationships-learn]
- [How Metabase executes SQL queries][how-metabase-executes-sql-queries]
- [How Metabase executes SQL variables][how-metabase-executes-sql-variables]


## Do you have a different problem?

- [I’m getting an error message][troubleshooting-error-messages].
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].


## Are you still stuck?

Search or ask the [Metabase community][discourse].


[cte-def]: /glossary/cte
[data-reference-docs]: ../users-guide/12-data-model-reference.html
[debugging-sql-logic]: ./sql-logic.html#debugging-sql-logic
[discourse]: https://discourse.metabase.com/
[foreign-key-docs]: ../users-guide/12-data-model-reference.html#foreign-keys
[how-metabase-executes-sql-queries]: ../users-guide/writing-sql.html#how-metabase-executes-sql-queries
[how-metabase-executes-sql-variables]: ../users-guide/writing-sql.html#how-metabase-executes-sql-variables
[how-to-run-query-selections]: ../users-guide/writing-sql.html#running-query-selections
[how-to-view-sql]: /users-guide/04-asking-questions.html#viewing-the-sql-that-powers-your-question
[metadata-def]: /glossary/metadata
[model-def]: /glossary/model
[model-foreign-keys]: ../users-guide/models.html#database-column-this-maps-to
[model-metadata-learn]: /learn/getting-started/models#adding-metadata-to-a-model-is-key
[model-learn]: /learn/getting-started/models
[one-to-many]: /learn/databases/table-relationships#one-to-many-relationship
[sample-database-def]: /glossary/sample_database
[saved-question-def]: /glossary/saved_question
[saved-question-model-docs]: ../users-guide/referencing-saved-questions-in-queries.html#referencing-models-and-saved-questions-in-sql-queries
[schema-def]: /glossary/schema.html
[sql-variable-def]: /glossary/variable.html#example-variable-in-metabase
[table-relationships-learn]: /learn/databases/table-relationships
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html 
[troubleshooting-datetimes]: ./timezones.html
[troubleshooting-duplicated-data]: ./sql-logic-duplicated-data.html
[troubleshooting-error-messages]: ./error-message.html
[troubleshooting-missing-data]: ./sql-logic-missing-data.html
[troubleshooting-sql-errors]: ./sql-error-message.html