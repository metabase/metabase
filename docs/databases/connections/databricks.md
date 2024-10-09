---
title: Databricks
---

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**. Then select **Databricks**.

You can edit these settings at any time. Just remember to save your changes.

## Display name

The display name for the database in the Metabase interface.

## Host

Your database's IP address, or its domain name (e.g., esc.mydatabase.com). This is the value of your Databrick's compute resource's Server Hostname.

See [Compute settings for the Databricks JDBC Driver](https://docs.databricks.com/en/integrations/jdbc/compute.html).

## HTTP path

This is the Databrick's compute resources HTTP Path value.

See [Compute settings for the Databricks JDBC Driver](https://docs.databricks.com/en/integrations/jdbc/compute.html).

## Personal access token

See [Personal Access Token (PAT)](https://docs.databricks.com/en/dev-tools/auth/pat.html).

## Catalog

For now, you can only select one catalog. Metabase doesn't support multi-catalog connections.

## Schemas

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

## Additional JDBC connection string options

You can append options to the connection string that Metabase uses to connect to your database. E.g., `IgnoreTransactions=0`.

See [Compute settings for the Databricks JDBC Driver](https://docs.databricks.com/en/integrations/jdbc/compute.html).
