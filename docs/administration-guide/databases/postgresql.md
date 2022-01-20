# Connecting to a PostgreSQL database

In addition to specifying the host, port, database name and user credentials for the database connection, you have the option of securing that connection.

## Use a secure connection (SSL)

### SSL Mode

PostgreSQL databases support different levels of security with their connections, with different levels of overhead. See the PostgreSQL docs for a table about the different [SSL Modes][ssl-modes], and select the option that works for you.

### Authenticate client certificate

#### SSL Client Certificate (PEM)

You have the option of using a **Local file path** or an **Uploaded filed path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

#### SSL Client KEY (PKCS-8/DER or PKCS-12)

Again, you have the option of using a **Local file path** or an **Uploaded filed path**. If you're on Metabase Cloud, you'll need to select **Uploaded file path** and upload your certificate.

You'll also need to input your **SSL Client Key Password**.

## Use an SSH tunnel

You can set up an SSH tunnel by supplying the tunnel host, port, tunnel username, and SSH authentication credentials, either using an SSH Key and passphrase, or a password.

## Advanced options

### Additional JDBC connection string options

Here you can add on to your connection string.

### Rerun queries for simple exploration

We execute the underlying query when you explore data using Summarize or Filter. This is on by default but you can turn it off if performance is slow.

### Choose when syncs and scans happen

This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.

### Periodically refingerprint tables

This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.

For more, see [SSH tunneling in Metabase][ssh-tunnel].

[ssl-modes]: https://www.postgresql.org/docs/current/libpq-ssl.html
[ssh-tunnel]: ../administration-guide/ssh-tunnel-for-database-connections.html
