# Troubleshooting SQL questions

## [I'm getting a SQL syntax error][debugging-sql-syntax]

- The error message appears in red text when you run a question that uses the [SQL editor][sql-editor].
- The error message contains part of your SQL query, such as a column or table name.
- The error message may also contain a three-digit API error code, such as `400` or `404`.

## [My SQL query results are incorrect][debugging-sql-logic]

- [My aggregations (counts, sums, etc.) are wrong][debugging-aggregations].
- [My query results have duplicated rows][debugging-duplicated-data].
- [My query results have missing rows][debugging-missing-data].
- [My dates and times are wrong][troubleshooting-datetimes].
- [My data isn't up to date][troubleshooting-database-syncs].

## My SQL variables aren't working

What type of [SQL variable][sql-variable-def] are you using?

### Field filter variables

- [My filter widget doesn't display a dropdown menu of values](./filters.html#are-you-seeing-a-different-kind-of-input-widget-than-you-expected).
- [My SQL query contains a subquery (nested query) or CTE](../users-guide/13-sql-parameters.html#field-filters-dont-work-with-table-aliases).
- [I'm getting a 400 error from BigQuery](../users-guide/13-sql-parameters.html#some-databases-require-the-schema-in-the-from-clause).

### Text, number, or date variables

- [I don't see the option to display a filter widget](../users-guide/13-sql-parameters.html#field-filter-compatible-types).

### I don't know the variable type

- [Visit Metabase Learn to read about the different types of SQL variables][sql-variable-type].

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides, search or ask the [Metabase community][discourse].

[debugging-aggregations]: /learn/debugging-sql/sql-logic.html#aggregated-results-counts-sums-etc-are-wrong
[debugging-duplicated-data]: /learn/debugging-sql/sql-logic-duplicated-data.html
[debugging-missing-data]: /learn/debugging-sql/sql-logic-missing-data.html
[debugging-sql-logic]: /learn/debugging-sql/sql-logic.html
[debugging-sql-syntax]: /learn/debugging-sql/sql-syntax.html
[discourse]: https://discourse.metabase.com/
[sql-editor]: /glossary/native_query_editor.html
[sql-variable-def]: /glossary/variable.html#example-variable-in-metabase
[sql-variable-type]: /learn/sql-questions/sql-variables.html#the-different-types-of-variables-available-for-native-sql-queries
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.html
[troubleshooting-datetimes]: ./timezones.html
