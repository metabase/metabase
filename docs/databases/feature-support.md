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

## Query builder

Metabase supports these features on every database on this page:

- [Saved questions and models as data sources](../questions/query-builder/editor.md#pick-data)
- [Left outer join](../questions/query-builder/join.md)
- [Inner join](../questions/query-builder/join.md)
- [Custom expressions in columns and filters](../questions/query-builder/expressions.md)
- [Custom expressions in summaries](../questions/query-builder/expressions.md#aggregations)

| Feature                                                                                                         | Amazon Athena | Amazon Redshift | BigQuery | ClickHouse | Databricks | Druid JDBC | MariaDB | MongoDB | MySQL | Oracle | PostgreSQL | Presto | Snowflake | Spark SQL | SQL Server | SQLite | Starburst (Trino) | Vertica |
| --------------------------------------------------------------------------------------------------------------- | ------------- | --------------- | -------- | ---------- | ---------- | ---------- | ------- | ------- | ----- | ------ | ---------- | ------ | --------- | --------- | ---------- | ------ | ----------------- | ------- |
| [Right outer join](../questions/query-builder/join.md)                                                          | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ❌       | ✅     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ❌      | ✅                 | ✅       |
| [Full outer join](../questions/query-builder/join.md)                                                           | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ❌       | ❌       | ❌     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ❌      | ✅                 | ✅       |
| [Binning numbers and coordinates](../questions/query-builder/summarizing-and-grouping.md#grouping-your-metrics) | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ❌       | ✅     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ✅      | ✅                 | ✅       |
| Case-sensitive text filters                                                                                     | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ❌       | ✅       | ❌     | ✅      | ✅          | ✅      | ✅         | ✅         | ❌          | ❌      | ✅                 | ✅       |

## Aggregations

Metabase supports these features on every database on this page:

- [Count, Sum, Average, Min, and Max](../questions/query-builder/expressions-list.md#aggregations)

| Feature                                                                                            | Amazon Athena | Amazon Redshift | BigQuery | ClickHouse | Databricks | Druid JDBC | MariaDB | MongoDB | MySQL | Oracle | PostgreSQL | Presto | Snowflake | Spark SQL | SQL Server | SQLite | Starburst (Trino) | Vertica |
| -------------------------------------------------------------------------------------------------- | ------------- | --------------- | -------- | ---------- | ---------- | ---------- | ------- | ------- | ----- | ------ | ---------- | ------ | --------- | --------- | ---------- | ------ | ----------------- | ------- |
| [StandardDeviation and Variance](../questions/query-builder/expressions-list.md#standarddeviation) | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ❌      | ✅                 | ✅       |
| [Percentile and Median](../questions/query-builder/expressions-list.md#percentile)                 | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ❌       | ❌       | ❌     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅ (1)      | ❌      | ✅                 | ❌       |
| [DistinctIf](../questions/query-builder/expressions-list.md#distinctif)                            | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ❌       | ✅     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ✅      | ✅                 | ✅       |
| [Offset](../questions/query-builder/expressions/offset.md)                                         | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ❌       | ❌       | ❌     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ✅      | ✅                 | ✅       |

1. SQL Server 2022 and later.

## Custom expression functions

Metabase supports these features on every database on this page:

- [text](../questions/query-builder/expressions-list.md#text)
- [datetime](../questions/query-builder/expressions-list.md#datetime)
- [today](../questions/query-builder/expressions-list.md#today)

| Feature                                                                                    | Amazon Athena | Amazon Redshift | BigQuery | ClickHouse | Databricks | Druid JDBC | MariaDB | MongoDB | MySQL | Oracle | PostgreSQL | Presto | Snowflake | Spark SQL | SQL Server | SQLite | Starburst (Trino) | Vertica |
| ------------------------------------------------------------------------------------------ | ------------- | --------------- | -------- | ---------- | ---------- | ---------- | ------- | ------- | ----- | ------ | ---------- | ------ | --------- | --------- | ---------- | ------ | ----------------- | ------- |
| [exp, log, power, and sqrt](../questions/query-builder/expressions-list.md#math-functions) | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ❌       | ✅     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ❌      | ✅                 | ✅       |
| [regexExtract](../questions/query-builder/expressions/regexextract.md)                     | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ❌       | ✅     | ✅      | ✅          | ✅      | ✅         | ✅         | ❌          | ❌      | ✅                 | ✅       |
| [domain, subdomain, host, and path](../questions/query-builder/expressions-list.md#domain) | ❌             | ❌               | ❌        | ❌          | ✅          | ✅          | ❌       | ❌       | ✅     | ❌      | ✅          | ❌      | ❌         | ✅         | ❌          | ❌      | ❌                 | ❌       |
| [splitPart](../questions/query-builder/expressions-list.md#splitpart)                      | ❌             | ✅               | ✅        | ✅          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ✅         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| collate                                                                                    | ❌             | ❌               | ❌        | ❌          | ❌          | ❌          | ❌       | ❌       | ❌     | ❌      | ❌          | ❌      | ✅         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| [integer](../questions/query-builder/expressions-list.md#integer)                          | ❌             | ✅               | ✅        | ✅          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ✅         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| [float](../questions/query-builder/expressions-list.md#float)                              | ❌             | ✅               | ✅        | ✅          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ✅         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| [date](../questions/query-builder/expressions-list.md#date)                                | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ✅       | ✅     | ❌      | ✅          | ✅      | ✅         | ✅         | ✅          | ✅      | ✅                 | ✅       |
| [datetimeDiff](../questions/query-builder/expressions/datetimediff.md)                     | ✅             | ✅               | ✅        | ✅          | ✅          | ❌          | ✅       | ✅       | ✅     | ✅      | ✅          | ❌      | ✅         | ✅         | ✅          | ✅      | ✅                 | ✅       |
| [convertTimezone](../questions/query-builder/expressions/converttimezone.md)               | ❌             | ✅               | ✅        | ❌          | ❌          | ❌          | ✅       | ❌       | ✅     | ✅      | ✅          | ❌      | ✅         | ❌         | ✅          | ❌      | ✅                 | ✅       |

## Data modeling

| Feature                                                           | Amazon Athena | Amazon Redshift | BigQuery | ClickHouse | Databricks | Druid JDBC | MariaDB | MongoDB | MySQL | Oracle | PostgreSQL | Presto | Snowflake | Spark SQL | SQL Server | SQLite | Starburst (Trino) | Vertica |
| ----------------------------------------------------------------- | ------------- | --------------- | -------- | ---------- | ---------- | ---------- | ------- | ------- | ----- | ------ | ---------- | ------ | --------- | --------- | ---------- | ------ | ----------------- | ------- |
| [Model persistence](../data-modeling/models/model-persistence.md) | ❌             | ✅               | ❌        | ❌          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ❌         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| [JSON unfolding](../data-modeling/metadata/json-unfolding.md)     | ❌             | ❌               | ✅        | ❌          | ❌          | ✅          | ❌       | ✅       | ✅     | ❌      | ✅          | ❌      | ❌         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| [Query transforms](../data-modeling/transforms/query.md)          | ❌             | ✅               | ✅        | ✅          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ✅         | ❌         | ✅          | ❌      | ❌                 | ❌       |
| [Python transforms](../data-modeling/transforms/python.md)        | ❌             | ✅               | ✅        | ✅          | ❌          | ❌          | ✅       | ✅       | ✅     | ❌      | ✅          | ❌      | ✅         | ❌         | ✅          | ❌      | ❌                 | ❌       |
| [Transform tests](../data-modeling/transforms/tests.md)           | ❌             | ✅               | ❌        | ✅          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ❌         | ❌         | ✅          | ❌      | ❌                 | ❌       |

## Writing data

| Feature                                                    | Amazon Athena | Amazon Redshift | BigQuery | ClickHouse | Databricks | Druid JDBC | MariaDB | MongoDB | MySQL | Oracle | PostgreSQL | Presto | Snowflake | Spark SQL | SQL Server | SQLite | Starburst (Trino) | Vertica |
| ---------------------------------------------------------- | ------------- | --------------- | -------- | ---------- | ---------- | ---------- | ------- | ------- | ----- | ------ | ---------- | ------ | --------- | --------- | ---------- | ------ | ----------------- | ------- |
| [CSV uploads](uploads.md)                                  | ❌             | ✅               | ❌        | ✅ (1)      | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ✅         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| [Actions](../data-modeling/models/actions/introduction.md) | ❌             | ❌               | ❌        | ❌          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ❌         | ❌         | ❌          | ❌      | ❌                 | ❌       |
| [Editable tables](../data-modeling/editable-tables.md)     | ❌             | ❌               | ❌        | ❌          | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ❌         | ❌         | ❌          | ❌      | ❌                 | ❌       |

1. ClickHouse Cloud and self-managed single-node deployments.

## Permissions

| Feature                                                                                                                                                          | Amazon Athena | Amazon Redshift | BigQuery | ClickHouse | Databricks | Druid JDBC | MariaDB | MongoDB | MySQL | Oracle | PostgreSQL | Presto | Snowflake | Spark SQL | SQL Server | SQLite | Starburst (Trino) | Vertica |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------- | -------- | ---------- | ---------- | ---------- | ------- | ------- | ----- | ------ | ---------- | ------ | --------- | --------- | ---------- | ------ | ----------------- | ------- |
| [Custom row and column security](../permissions/row-and-column-security.md#custom-row-and-column-security-use-a-sql-question-to-create-a-custom-view-of-a-table) | ✅             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ❌       | ✅     | ✅      | ✅          | ✅      | ✅         | ✅         | ✅          | ✅      | ✅                 | ✅       |
| [Connection impersonation](../permissions/impersonation.md)                                                                                                      | ❌             | ✅               | ❌        | ✅ (1)      | ❌          | ❌          | ✅       | ❌       | ✅     | ❌      | ✅          | ❌      | ✅         | ❌         | ✅          | ❌      | ✅                 | ❌       |
| [Database routing](../permissions/database-routing.md)                                                                                                           | ✅             | ✅               | ✅        | ❌          | ✅          | ✅          | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅         | ❌         | ✅          | ✅      | ✅                 | ❌       |

1. ClickHouse 24.4 and later.

## Database settings

| Feature                                                                                         | Amazon Athena | Amazon Redshift | BigQuery | ClickHouse | Databricks | Druid JDBC | MariaDB | MongoDB | MySQL | Oracle | PostgreSQL | Presto | Snowflake | Spark SQL | SQL Server | SQLite | Starburst (Trino) | Vertica |
| ----------------------------------------------------------------------------------------------- | ------------- | --------------- | -------- | ---------- | ---------- | ---------- | ------- | ------- | ----- | ------ | ---------- | ------ | --------- | --------- | ---------- | ------ | ----------------- | ------- |
| [Report timezone](../configuring-metabase/localization.md#set-default-instance-report-timezone) | ❌             | ✅               | ✅        | ✅          | ✅          | ✅          | ✅       | ✅       | ✅     | ✅      | ✅          | ✅      | ✅         | ❌         | ❌          | ❌      | ✅                 | ✅       |
