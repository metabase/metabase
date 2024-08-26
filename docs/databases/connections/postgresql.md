---
title: PostgreSQL
redirect_from:
  - /docs/latest/administration-guide/databases/postgresql
---

# PostgreSQL

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

Fill out the fields for that database, and click **Save changes** at the bottom.

## Settings

You can edit these settings at any time. Just remember to save your changes.

### Display name

The display name for the database in the Metabase interface.

### Host

Your database's IP address, or its domain name (e.g., esc.mydatabase.com).

### Port

The database port. E.g., 5432.

### Database name

The name of the database you're connecting to.

### Username

The database username for the account that you want to use to connect to your database. You can set up multiple connections to the same database using different user accounts to connect to the same database, each with different sets of [privileges](../users-roles-privileges.md).

### Password

The password for the username that you use to connect to the database.

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

### Use a secure connection (SSL)

Metabase automatically tries to connect to databases with SSL first, then without if that doesn't work. If it's possible to connect to your database with an SSL connection, Metabase will make that the default setting for your database. If you prefer to connect without this layer of security, you can always change this setting later, but we highly recommend keeping SSL turned on to keep your data secure.

#### SSL Mode

PostgreSQL databases support different levels of security with their connections, with different levels of overhead.

SSL Mode options include:

- allow
- prefer
- require
- verify-ca
- verify-full

See the PostgreSQL docs for a table about the different [SSL Modes](https://jdbc.postgresql.org/documentation/ssl/#configuring-the-client), and select the option that works for you.

#### SSL root certificate (PEM)

If you set the SSL Mode to either "verify-ca" or "verify-full", you'll need to specify a root certificate (PEM). You have the option of using a **Local file path** or an **Uploaded file path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

### Use an SSH tunnel

See our [guide to SSH tunneling](../ssh-tunnel.md).

### Authenticate client certificate

Toggle on to bring up client certificate options.

#### SSL Client Certificate (PEM)

You have the option of using a **Local file path** or an **Uploaded file path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

#### SSL Client Key (PKCS-8/DER)

Again, you have the option of using a **Local file path** or an **Uploaded file path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate. You'll also need to input your **SSL Client Key Password**.

The private key must be PKCS8 and stored in DER format.

If you instead have a PEM SSL client key, you can convert that key to the PKCS-8/DER format using [openssl](https://www.openssl.org/). The command would look something like:

```
openssl pkcs8 -topk8 -inform PEM -outform DER -in client-key.pem -out client-key.der -nocrypt
```

Note: if you're using GCP and you managed to issue client certificates, everything will be given in PEM format, you only need to transform the client-key.pem into a client-key.der for the "SSL Client Key"

### Unfold JSON Columns

For PostgreSQL databases, Metabase can unfold JSON columns into component fields to yield a table where each JSON key becomes a column. JSON unfolding is on by default, but you can turn off JSON unfolding if performance is slow.

If you turn on JSON unfolding, you can also toggle the unfolding for individual columns in [table metadata](../../data-modeling/metadata-editing.md#unfold-json).

### Additional JDBC connection string options

You can append options to the connection string that Metabase uses to connect to your database. Use the format:

```
options=-c%20key=value
```

PostgreSQL connection URIs expect [percent-encoding](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding) for whitespaces and symbols.

### Re-run queries for simple explorations

Turn this option **OFF** if people want to click **Run** (the play button) before applying any [Summarize](../../questions/query-builder/introduction.md#grouping-your-metrics) or filter selections.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [drill-through menu](https://www.metabase.com/learn/questions/drill-through). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when Metabase syncs and scans

Turn this option **ON** to manage the queries that Metabase uses to stay up to date with your database. For more information, see [Syncing and scanning databases](../sync-scan.md).

#### Database syncing

If you've selected **Choose when syncs and scans happen** > **ON**, you'll be able to set:

- The frequency of the [sync](../sync-scan.md#how-database-syncs-work): hourly (default) or daily.
- The time to run the sync, in the timezone of the server where your Metabase app is running.

### Scanning for filter values

Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database.

If you've selected **Choose when syncs and scans happen** > **ON**, you'll see the following options under **Scanning for filter values**:

- **Regularly, on a schedule** allows you to run [scan queries](../sync-scan.md#how-database-scans-work) at a frequency that matches the rate of change to your database. The time is set in the timezone of the server where your Metabase app is running. This is the best option for a small database, or tables with distinct values that get updated often.
- **Only when adding a new filter widget** is a great option if you want scan queries to run on demand. Turning this option **ON** means that Metabase will only scan and cache the values of the field(s) that are used when a new filter is added to a dashboard or SQL question.
- **Never, I'll do this manually if I need to** is an option for databases that are either prohibitively large, or which never really have new values added. Use the [Re-scan field values now](../sync-scan.md#manually-scanning-column-values) button to run a manual scan and bring your filter values up to date.

### Periodically refingerprint tables

> Periodic refingerprinting will increase the load on your database.

Turn this option **ON** to scan a sample of values every time Metabase runs a [sync](../sync-scan.md#how-database-syncs-work).

A fingerprinting query examines the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. If you leave this option **OFF**, Metabase will only fingerprint your columns once during setup.

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
