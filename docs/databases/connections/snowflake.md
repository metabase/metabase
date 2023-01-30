---
title: Snowflake
redirect_from:
  - /docs/latest/administration-guide/databases/snowflake
---

# Snowflake

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

## Settings

You can edit these settings at any time. Just remember to save your changes.

### Display name

What you want Metabase to call the database in its user interface.

### Account name

Enter your Account ID with the region that your Snowflake cluster is running on. E.g., `xxxxxxxxx.us-east-3.aws`.

This field requires the alphanumeric account ID _with_ the region that your Snowflake cluster is running on. For example, if you're running Snowflake on AWS and your account URL is `https://az12345.ca-central-1.snowflakecomputing.com`, then the `Account` would be `az12345.ca-central-1.aws` (note the `.aws` suffix). There are some regions that don't need this suffix, so please [refer to the official Snowflake documentation](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html#locator-formats-by-cloud-platform-and-region) for this

### Username

The database username for the account that you want to use to connect to your database. You can set up multiple connections to the same database using different user accounts to connect to the same database, each with different sets of privileges.

### Password

The password for the username that you use to connect to the database.

### RSA private key (PEM)

You have the option of using a **Local file path** or an **Uploaded file path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

### Warehouse

Snowflake warehouse. If the user lacks a default warehouse, you'll need to enter the warehouse to connect to.

### Database name (case sensitive)

The name of the database you want to connect to in Snowflake.

### Schemas (optional)

You can specify which schemas you want to sync and scan. If no schema is passed, then all schema available to that user and role will be listed as folders in Metabase.

Schema options include:

- All
- Only these...
- All except...

For the **Only these** and **All except** options, you can input a comma-separated list of values to tell Metabase which schemas you want to include (or exclude). For example:

```
FOO,BAR,BAZ
```

You can use the `*` wildcard to match multiple schemas.

Let's say you have three schemas: FOO, BAR, and BAZ.

- If you have **Only these...** set, and enter the string `B*`, you'll sync with bar and baz.
- If you have **All except...** set, and enter the string `B*`, you'll just sync foo.

Note that only the `*` wildcard is supported; you can't use other special characters or regexes.

### Role (optional)

Specify a role to override the database user's default role. For example, if the database user is `REPORTER` with default role `REPORTER`, but the user also has access to role `REPORTERPRODUCT`, then filling in `REPORTERPRODUCT` in the `Role` field will ensure that the `REPORTERPRODUCT` role is used instead of the user's default `REPORTER` role.

## Use an SSH tunnel

See our [guide to SSH tunneling](./ssh-tunnel.md).

### Additional JDBC connection string options

Some databases allow you to append options to the connection string that Metabase uses to connect to your database.

### Re-run queries for simple explorations

Turn this option **OFF** if people want to click **Run** (the play button) before applying any [Summarize](../questions/query-builder/introduction.md#grouping-your-metrics) or filter selections.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [action menu](https://www.metabase.com/glossary/action_menu). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when Metabase syncs and scans

Turn this option **ON** to manage the queries that Metabase uses to stay up to date with your database. For more information, see [Syncing and scanning databases](#syncing-and-scanning-databases).

#### Database syncing

If you've selected **Choose when syncs and scans happen** > **ON**, you'll see the following options under **Database syncing**:

- **Scan** sets the frequency of the [sync query](#how-database-syncs-work) to hourly (default) or daily.
- **at** sets the time when your sync query will run against your database (in the timezone of the server where your Metabase app is running).

#### Scanning for filter values

Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database.

If you've selected **Choose when syncs and scans happen** > **ON**, you'll see the following options under **Scanning for filter values**:

![Scanning options](./images/scanning-options.png)

- **Regularly, on a schedule** allows you to run [scan queries](#how-database-scans-work) at a frequency that matches the rate of change to your database. The time is set in the timezone of the server where your Metabase app is running. This is the best option for a small database, or tables with distinct values that get updated often.
- **Only when adding a new filter widget** is a great option if you want scan queries to run on demand. Turning this option **ON** means that Metabase will only scan and cache the values of the field(s) that are used when a new filter is added to a dashboard or SQL question.
- **Never, I'll do this manually if I need to** is an option for databases that are either prohibitively large, or which never really have new values added. Use the [Re-scan field values now](#manually-scanning-column-values) button to run a manual scan and bring your filter values up to date.

### Periodically refingerprint tables

Turn this option **ON** to scan a _sample_ of values every time Metabase runs a [sync](#how-database-syncs-work).

A fingerprinting query examines the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. If you turn this option **OFF**, Metabase will only fingerprint your columns once during setup.

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
