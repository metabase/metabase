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

[ssl-modes]: https://jdbc.postgresql.org/documentation/head/ssl-client.html
[ssh-tunnel]: ../ssh-tunnel-for-database-connections.html
