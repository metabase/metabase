---
title: Database feature support
summary: Which Metabase features each officially supported database can use, from joins and custom expressions to uploads, actions, and permissions.
---

# Database feature support

_This documentation was generated from source by running:_

```
clojure -M:ee:drivers:doc driver-features-documentation
```

Some Metabase features depend on what your database can do. The tables below list which [officially supported databases](./connecting.md#connecting-to-supported-databases) can use which features.

- ✅: Metabase supports the feature on this database.
- ❌: Metabase doesn't support the feature on this database.
- ✅ (1): Metabase supports the feature on some versions or editions of this database. Check the numbered note below the table.

A ✅ means that Metabase can use the feature with this database, not that the feature is on. Some features have other requirements. For example, uploads and actions need a connection with write access, and some features are only available on [Pro and Enterprise plans](https://www.metabase.com/pricing/). Check the docs for each feature.

For databases that aren't on this page, check out [Community drivers](../developers-guide/community-drivers.md).

## Joins

| Feature                                                | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| ------------------------------------------------------ | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [Left outer join](../questions/query-builder/join.md)  | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Right outer join](../questions/query-builder/join.md) | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ❌      | ✅         | ✅       |
| [Inner join](../questions/query-builder/join.md)       | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Full outer join](../questions/query-builder/join.md)  | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ❌       | ❌     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ❌      | ✅         | ✅       |

## Query builder

| Feature                                                                                                         | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| --------------------------------------------------------------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [Saved questions and models as data sources](../questions/query-builder/editor.md#pick-data)                    | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Custom columns](../questions/query-builder/editor.md#custom-columns)                                           | ✅      | ✅        | ✅          | ✅          | ✅     | ✅ (1)   | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Custom expressions in summaries](../questions/query-builder/expressions.md)                                    | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Binning numbers and coordinates](../questions/query-builder/summarizing-and-grouping.md#grouping-your-metrics) | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| Case-sensitive text filters                                                                                     | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ❌       | ❌     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ❌          | ❌      | ✅         | ✅       |

1. MongoDB 4.2 and later.

## Aggregations

| Feature                                                                                             | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| --------------------------------------------------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [Count, sum, average, min, and max](../questions/query-builder/expressions-list.md#aggregations)    | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [StandardDeviation and Variance](../questions/query-builder/expressions-list.md#standarddeviation)  | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ❌      | ✅         | ✅       |
| [Percentile and Median](../questions/query-builder/expressions-list.md#percentile)                  | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ❌       | ❌     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅ (1)      | ❌      | ✅         | ❌       |
| [DistinctIf](../questions/query-builder/expressions-list.md#distinctif)                             | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [CumulativeCount and CumulativeSum](../questions/query-builder/expressions-list.md#cumulativecount) | ✅      | ✅        | ✅          | ✅          | ✅     | ✅ (2)   | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ❌        | ✅          | ✅      | ✅         | ✅       |
| [Offset](../questions/query-builder/expressions/offset.md)                                          | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ❌       | ❌     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |

1. SQL Server 2022 (version 16) and later.
2. MongoDB 5.0 and later.

## Custom expression functions

| Feature                                                                                                 | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| ------------------------------------------------------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [exp, log, power, and sqrt](../questions/query-builder/expressions-list.md#math-functions)              | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ❌      | ✅         | ✅       |
| [regexExtract](../questions/query-builder/expressions/regexextract.md)                                  | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ❌          | ❌      | ✅         | ✅       |
| [Lookaheads and lookbehinds in regexExtract](../questions/query-builder/expressions/regexextract.md)    | ❌      | ❌        | ❌          | ✅          | ✅     | ❌       | ❌       | ✅     | ❌      | ✅          | ❌      | ❌        | ❌         | ✅        | ❌          | ❌      | ✅         | ❌       |
| [splitPart](../questions/query-builder/expressions-list.md#splitpart)                                   | ❌      | ✅        | ✅          | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ✅         | ❌        | ❌          | ❌      | ❌         | ❌       |
| [integer](../questions/query-builder/expressions-list.md#integer)                                       | ❌      | ✅        | ✅          | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ✅         | ❌        | ❌          | ❌      | ❌         | ❌       |
| [float](../questions/query-builder/expressions-list.md#float)                                           | ❌      | ✅        | ✅          | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ✅         | ❌        | ❌          | ❌      | ❌         | ❌       |
| [text](../questions/query-builder/expressions-list.md#text)                                             | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [date](../questions/query-builder/expressions-list.md#date)                                             | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ❌      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [datetime](../questions/query-builder/expressions-list.md#datetime)                                     | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [year, month, day, and other date parts](../questions/query-builder/expressions-list.md#date-functions) | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [datetimeAdd and datetimeSubtract](../questions/query-builder/expressions/datetimeadd.md)               | ✅      | ✅        | ✅          | ✅          | ✅     | ✅ (1)   | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [datetimeDiff](../questions/query-builder/expressions/datetimediff.md)                                  | ✅      | ✅        | ✅          | ✅          | ❌     | ✅ (1)   | ✅       | ✅     | ✅      | ✅          | ❌      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [convertTimezone](../questions/query-builder/expressions/converttimezone.md)                            | ❌      | ✅        | ❌          | ❌          | ❌     | ❌       | ✅       | ✅     | ✅      | ✅          | ❌      | ✅        | ✅         | ❌        | ✅          | ❌      | ✅         | ✅       |
| [now](../questions/query-builder/expressions/now.md)                                                    | ❌      | ✅        | ✅          | ✅          | ❌     | ✅ (2)   | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [today](../questions/query-builder/expressions-list.md#today)                                           | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |

1. MongoDB 5.0 and later.
2. MongoDB 4.2 and later.

## SQL editor

| Feature                                                                                           | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| ------------------------------------------------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [SQL variables](../questions/native-editor/sql-parameters.md)                                     | ✅      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Saved question references](../questions/native-editor/referencing-saved-questions-in-queries.md) | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Table variables](../questions/native-editor/table-variables.md)                                  | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Time grouping parameters](../questions/native-editor/time-grouping-parameters.md)                | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |

## Data modeling

| Feature                                                           | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| ----------------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [Model persistence](../data-modeling/models/model-persistence.md) | ❌      | ❌        | ❌          | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ❌         | ❌        | ❌          | ❌      | ❌         | ❌       |
| [JSON unfolding](../data-modeling/metadata/json-unfolding.md)     | ❌      | ✅        | ❌          | ❌          | ✅     | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ❌        | ❌         | ❌        | ❌          | ❌      | ❌         | ❌       |
| [Query transforms](../data-modeling/transforms/query.md)          | ❌      | ✅        | ✅          | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ✅         | ❌        | ✅          | ❌      | ❌         | ❌       |
| [Python transforms](../data-modeling/transforms/python.md)        | ❌      | ✅        | ✅          | ❌          | ❌     | ✅       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ✅         | ❌        | ✅          | ❌      | ❌         | ❌       |

## Writing data

| Feature                                                    | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| ---------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [CSV uploads](uploads.md)                                  | ❌      | ❌        | ✅ (1)      | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ✅         | ❌        | ❌          | ❌      | ❌         | ❌       |
| [Actions](../data-modeling/models/actions/introduction.md) | ❌      | ❌        | ❌          | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ❌        | ❌         | ❌        | ❌          | ❌      | ❌         | ❌       |
| [Editable tables](../data-modeling/editable-tables.md)     | ❌      | ❌        | ❌          | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ❌        | ❌         | ❌        | ❌          | ❌      | ❌         | ❌       |

1. ClickHouse Cloud only.

## Permissions

| Feature                                                                                                                                                          | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [Custom row and column security](../permissions/row-and-column-security.md#custom-row-and-column-security-use-a-sql-question-to-create-a-custom-view-of-a-table) | ✅      | ✅        | ✅          | ✅          | ✅     | ❌       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ✅        | ✅          | ✅      | ✅         | ✅       |
| [Connection impersonation](../permissions/impersonation.md)                                                                                                      | ❌      | ❌        | ✅ (1)      | ❌          | ❌     | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅        | ✅         | ❌        | ✅          | ❌      | ✅         | ❌       |
| [Database routing](../permissions/database-routing.md)                                                                                                           | ✅      | ✅        | ❌          | ✅          | ✅     | ✅       | ✅       | ✅     | ❌      | ✅          | ✅      | ✅        | ✅         | ❌        | ✅          | ✅      | ✅         | ❌       |

1. ClickHouse 24.4 and later.

## Database settings

| Feature                                                                                         | Athena | BigQuery | ClickHouse | Databricks | Druid | MongoDB | MariaDB | MySQL | Oracle | PostgreSQL | Presto | Redshift | Snowflake | SparkSQL | SQL Server | SQLite | Starburst | Vertica |
| ----------------------------------------------------------------------------------------------- | ------ | -------- | ---------- | ---------- | ----- | ------- | ------- | ----- | ------ | ---------- | ------ | -------- | --------- | -------- | ---------- | ------ | --------- | ------- |
| [Report timezone](../configuring-metabase/localization.md#set-default-instance-report-timezone) | ❌      | ✅        | ✅          | ✅          | ✅     | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅        | ✅         | ❌        | ❌          | ❌      | ✅         | ✅       |
