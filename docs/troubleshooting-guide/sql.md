---
title: Troubleshooting SQL questions
---

# Troubleshooting SQL questions

## [I'm getting a SQL syntax error][debugging-sql-syntax]

The error message:

- Appears in red text when you run a question that uses the [SQL editor][sql-editor].
- Contains part of your SQL query, such as a column or table name.
- May also contain a three-digit API error code, such as `400` or `404`.

## [My SQL query results are incorrect][debugging-sql-logic]

- [Aggregations (counts, sums, etc.) are wrong][debugging-aggregations].
- [Results have duplicated rows][debugging-duplicated-data].
- [Results are missing rows][debugging-missing-data].
- [Dates and times are wrong][troubleshooting-datetimes].
- [Data isn't up to date][troubleshooting-database-syncs].

## My SQL variables aren't working

What type of [SQL variable][sql-variable-def] are you using?

### Field filter variables

- [Filter widget doesn't display a dropdown menu of values](../data-modeling/metadata-editing.md#changing-a-search-box-filter-to-a-dropdown-filter).
- [SQL query contains a subquery (nested query) or CTE](../questions/native-editor/sql-parameters.md#field-filters-dont-work-with-table-aliases).
- [400 error from BigQuery](../questions/native-editor/sql-parameters.md#some-databases-require-the-schema-in-the-from-clause).
- [SQL syntax error: missing `FROM` clause](../questions/native-editor/sql-parameters.md#include-dependencies-in-your-query).

### Text, number, or date variables

- [No option to display a filter widget](../questions/native-editor/sql-parameters.md#field-filter-compatible-types).

### I don't know the variable type

- [Different types of SQL variables][sql-variable-type].

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[debugging-aggregations]: https://www.metabase.com/learn/debugging-sql/sql-logic#aggregated-results-counts-sums-etc-are-wrong
[debugging-duplicated-data]: https://www.metabase.com/learn/debugging-sql/sql-logic-duplicated-data
[debugging-missing-data]: https://www.metabase.com/learn/debugging-sql/sql-logic-missing-data
[debugging-sql-logic]: https://www.metabase.com/learn/debugging-sql/sql-logic
[debugging-sql-syntax]: https://www.metabase.com/learn/debugging-sql/sql-syntax
[discourse]: https://discourse.metabase.com/
[known-issues]: ./known-issues.md
[sql-editor]: https://www.metabase.com/glossary/native_query_editor
[sql-variable-def]: https://www.metabase.com/glossary/variable#example-variable-in-metabase
[sql-variable-type]: https://www.metabase.com/learn/sql-questions/sql-variables#the-different-types-of-variables-available-for-native-sql-queries
[troubleshooting-database-syncs]: ./sync-fingerprint-scan.md
[troubleshooting-datetimes]: ./timezones.md
