---
title: Troubleshooting SQL questions
---

# Troubleshooting SQL questions

## Incorrect results

- [Aggregations (counts, sums, etc.) are wrong](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-logic#aggregated-results-counts-sums-etc-are-wrong).
- [Results have duplicated rows](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-logic-duplicated-data).
- [Results are missing rows](https://www.metabase.com/learn/debugging-sql/sql-logic-missing-data).
- [Dates and times are wrong](./timezones.md).
- [Data isn't up to date](./sync-fingerprint-scan.md).

## SQL variables and field filters

- [Filter widget doesn't display a dropdown menu of values](../data-modeling/metadata-editing.md#changing-a-search-box-filter-to-a-dropdown-filter).
- [SQL query contains table aliases](../questions/native-editor/sql-parameters.md#field-filters-dont-work-with-table-aliases).
- [SQL syntax error: missing `FROM` clause](../questions/native-editor/sql-parameters.md#field-filters-must-be-connected-to-fields-included-in-the-query).
- [No option to display a filter widget](../questions/native-editor/sql-parameters.md#field-filter-compatible-types).
- [I don't know the SQL variable type](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/working-with-sql/sql-variables#the-different-types-of-variables-available-for-native-sql-queries).

## SQL syntax errors

For some common error messages, see [error messages](./error-message.md).

## Working with JSON in SQL

Using the `?` operator for working with JSON in SQL may cause queries to fail. On PostgreSQL, you can use `??` instead.

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
- Hire a [Metabase Expert](https://www.metabase.com/partners/){:target="\_blank"}.
