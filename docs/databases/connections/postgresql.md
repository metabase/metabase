---
title: Connecting to a PostgreSQL database
redirect_from:
  - /docs/latest/administration-guide/databases/postgresql
---

# Connecting to a PostgreSQL database

In addition to specifying the host, port, database name and user credentials for the database connection, you have the option of securing that connection.


## Schemas

Here you can specify which schemas you want to sync and scan. Options are:

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

## Use a secure connection (SSL)

### SSL Mode

PostgreSQL databases support different levels of security with their connections, with different levels of overhead.

SSL Mode options include:

- allow
- prefer
- require
- verify-ca
- verify-full

See the PostgreSQL docs for a table about the different [SSL Modes][ssl-modes], and select the option that works for you.

### SSL root certificate (PEM)

If you set the SSL Mode to either "verify-ca" or "verify-full", you'll need to specify a root certificate (PEM). You have the option of using a **Local file path** or an **Uploaded file path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

### Authenticate client certificate

#### SSL Client Certificate (PEM)

You have the option of using a **Local file path** or an **Uploaded file path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

#### SSL Client KEY (PKCS-8/DER or PKCS-12)

Again, you have the option of using a **Local file path** or an **Uploaded file path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

You'll also need to input your **SSL Client Key Password**.

## Use an SSH tunnel

You can set up an SSH tunnel by supplying the tunnel host, port, tunnel username, and SSH authentication credentials, either using an SSH Key and passphrase, or a password.

For more, see [SSH tunneling in Metabase][ssh-tunnel].

## Advanced options

### Additional JDBC connection string options

Here you can add on to your connection string.

### Rerun queries for simple exploration

We execute the underlying query when you explore data using Summarize or Filter. This is on by default, but you can turn it off if performance is slow.

### Choose when syncs and scans happen

This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.

### Periodically refingerprint tables

This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.

## Note on syncing records that include JSON

**Metabase will infer the JSON "schema" based on the keys in the first five hundred rows of a table.** PostgreSQL JSON fields lack schema, so Metabase can’t rely on table metadata to define which keys a JSON field has. To work around the lack of schema, Metabase will get the first five hundred records and parse the JSON in those records to infer the JSON's "schema". The reason Metabase limits itself to five hundred records is so that syncing metadata doesn't put unnecessary strain on your database.

The problem is that if the keys in the JSON vary record to record, the first five hundred rows may not capture all the keys used by JSON objects in that JSON field. To get Metabase to infer all the JSON keys for that table, you'll need to add the additional keys to the JSON objects in the first five hundred rows.

## Model caching

Metabase can create tables with model data in your database and refresh them on a schedule you define. Metabase's connection's credentials to that database must be able to read and write to the schema displayed in the info tooltip.

See [Models](../../data-modeling/models.md).

[ssl-modes]: https://jdbc.postgresql.org/documentation/head/ssl-client
[ssh-tunnel]: ../ssh-tunnel.md

