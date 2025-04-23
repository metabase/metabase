---
title: Databricks
---

# Databricks

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**. Then select **Databricks**.

You can edit these settings at any time. Just remember to save your changes.

## Edit connection details

### Display name

The display name for the database in the Metabase interface.

### Host

Your database's IP address, or its domain name (e.g., `xxxxxxxxxx.cloud.databricks.com` or `adb-xxxxx.azuredatabricks.net`). This is the value of your Databrick's compute resource's Server Hostname.

See [Compute settings for the Databricks JDBC Driver](https://docs.databricks.com/en/integrations/jdbc/compute.html).

### HTTP path

This is the Databrick's compute resources HTTP Path value. This value is often a SQL warehouse endpoint in the format `/sql/1.0/endpoints/abcdef1234567890`. See [Connect to a SQL warehouse](https://docs.databricks.com/en/compute/sql-warehouse/index.html).

Additionally, see [Compute settings for the Databricks JDBC Driver](https://docs.databricks.com/en/integrations/jdbc/compute.html).

### Authentication

There are two ways to authenticate with Databricks. You can use a personal access token (PAT) or a service principal using OAuth (OAuth M2M).

The Databricks driver supports both options. Use the toggle to select the authentication method you want to use.

#### Personal access token authentication
See [Personal Access Token (PAT)](https://docs.databricks.com/en/dev-tools/auth/pat.html).

#### Authenticate access with a service principal using OAuth (OAuth M2M)

See [Authenticate access with a service principal using OAuth](https://docs.databricks.com/en/dev-tools/auth/oauth-m2m.html).

### Catalog
For now, you can only select one catalog. Metabase doesn't support multi-catalog connections. If you want to use more than one catalog in Metabase, you can set up multiple connections, each selecting a different catalog.

You can't sync Databricks's legacy catalogs, however, including the `samples` or `hive_metastore` catalogs.

### Schemas

You can specify which schemas you want to sync and scan. Options are:

- All
- Only these...
- All except...

For the **Only these** and **All except** options, you can input a comma-separated list of values to tell Metabase which schemas you want to include (or exclude). For example:

```
foo,bar,baz
```

You can use the `*` wildcard to match multiple schemas.

Let's say you have three schemas: foo, bar, and baz.

- If you have **Only these...** set, and enter the string `b*`, you'll sync with bar and baz.
- If you have **All except...** set, and enter the string `b*`, you'll just sync foo.

Note that only the `*` wildcard is supported; you can't use other special characters or regexes.

### Additional JDBC connection string options

You can append options to the connection string that Metabase uses to connect to your database. E.g., `IgnoreTransactions=0`.

See [Compute settings for the Databricks JDBC Driver](https://docs.databricks.com/en/integrations/jdbc/compute.html).

### Re-run queries for simple explorations

Turn this option **OFF** if people want to click **Run** (the play button) before applying any summarizations or filters in the query builder.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [drill-through menu](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/drill-through). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when syncs and scans happen

See [syncs and scans](../sync-scan.md#choose-when-syncs-and-scans-happen).

### Periodically refingerprint tables

> Periodic refingerprinting will increase the load on your database.

Turn this option **ON** to scan a sample of values every time Metabase runs a [sync](../sync-scan.md#how-database-syncs-work).

A fingerprinting query examines the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. If you leave this option **OFF**, Metabase will only fingerprint your columns once during setup.

## Model features

There aren't (yet) any model features available for Databricks.

## Danger zone

See [Danger zone](../danger-zone.md).

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
