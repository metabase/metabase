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

The display name for the database in the Metabase interface.

### Account name

Enter your Account ID with the region that your Snowflake cluster is running on. E.g., `xxxxxxxxx.us-east-3.aws`.

Enter your Snowflake [Account Identifier](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html). For example, if you're running Snowflake on AWS and your account URL is `https://az12345.ca-central-1.snowflakecomputing.com`:
- `<account_identifier>`: `az12345.ca-central-1`.
- `<cloud_platform>`: `aws`.

You'd enter `az12345.ca-central-1.aws` as the account name in Metabase.

> Not all regions require the cloud platform identifier. If you are in `us-west-2`, you would enter `az12345` as the account name. For the requirements per region, see [the official Snowflake's documentation](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html#non-vps-account-locator-formats-by-cloud-platform-and-region).

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

Specify a role to override the database user's default role. For example, if the database user `METABASE` has the roles:
- Default role `APPLICATION`.
- Additional role `ANALYTICS`.

You can enter `ANALYTICS` in the Role field to ensure that the `METABASE` user connects to Snowflake using the `ANALYTICS` role by default.

## Use an SSH tunnel

See our [guide to SSH tunneling](../ssh-tunnel.md).

### Additional JDBC connection string options

Some databases allow you to append options to the connection string that Metabase uses to connect to your database.

### Re-run queries for simple explorations

Turn this option **OFF** if people want to click **Run** (the play button) before applying any [Summarize](../../questions/query-builder/introduction.md#grouping-your-metrics) or filter selections.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [drill-through menu](https://www.metabase.com/glossary/action_menu). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when Metabase syncs and scans

Turn this option **ON** to manage the queries that Metabase uses to stay up to date with your database. For more information, see [Syncing and scanning databases](../connecting.md#syncing-and-scanning-databases).

#### Database syncing

If you've selected **Choose when syncs and scans happen** > **ON**, you'll see the following options under **Database syncing**:

- **Scan** sets the frequency of the [sync query](../connecting.md#how-database-syncs-work) to hourly (default) or daily.
- **at** sets the time when your sync query will run against your database (in the timezone of the server where your Metabase app is running).

#### Scanning for filter values

Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database.

If you've selected **Choose when syncs and scans happen** > **ON**, you'll see the following options under **Scanning for filter values**:

- **Regularly, on a schedule** allows you to run [scan queries](../connecting.md#how-database-scans-work) at a frequency that matches the rate of change to your database. The time is set in the timezone of the server where your Metabase app is running. This is the best option for a small database, or tables with distinct values that get updated often.
- **Only when adding a new filter widget** is a great option if you want scan queries to run on demand. Turning this option **ON** means that Metabase will only scan and cache the values of the field(s) that are used when a new filter is added to a dashboard or SQL question.
- **Never, I'll do this manually if I need to** is an option for databases that are either prohibitively large, or which never really have new values added. Use the [Re-scan field values now](../connecting.md#manually-scanning-column-values) button to run a manual scan and bring your filter values up to date.

### Periodically refingerprint tables

Turn this option **ON** to scan a _sample_ of values every time Metabase runs a [sync](../connecting.md#how-database-syncs-work).

A fingerprinting query examines the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. If you turn this option **OFF**, Metabase will only fingerprint your columns once during setup.

### Default result cache duration

{% include plans-blockquote.html feature="Database-specific caching" %}

How long to keep question results. By default, Metabase will use the value you supply on the [cache settings page](../../configuring-metabase/caching.md), but if this database has other factors that influence the freshness of data, it could make sense to set a custom duration. You can also choose custom durations on individual questions or dashboards to help improve performance.

Options are:

- **Use instance default (TTL)**. TTL is time to live, meaning how long the cache remains valid before Metabase should run the query again.
- **Custom**.

If you are on a paid plan, you can also set cache duration per questions. See [Advanced caching controls](../../configuring-metabase/caching.md#advanced-caching-controls).

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
