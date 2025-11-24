---
title: PostgreSQL
redirect_from:
  - /docs/latest/administration-guide/databases/postgresql
---

# PostgreSQL

> This page covers connecting to PostgreSQL as a _data warehouse_. For using PostgreSQL as Metabase's _application database_, see [Configuring the Metabase application database](../../installation-and-operation/configuring-application-database.md).

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

Fill out the fields for that database, and click **Save changes** at the bottom.

## Supported versions

Metabase supports the oldest supported version of PostgreSQL through the latest stable version. See [PostgreSQL versions](https://www.postgresql.org/support/versioning/).

## Connect to Supabase

To connect to a Supabase database, select PostgreSQL. For more details, check out the [Supabase docs](https://supabase.com/docs/guides/database/metabase).

## Connection and sync

After connecting to a database, you'll see the "Connection and sync" section that displays the current connection status and options to manage your database connection.

Here you can [sync the database schema and rescan field values](../sync-scan.md), and edit connection details.

## Edit connection details

You can edit these settings at any time. Just remember to save your changes.

### Connection string

Paste a connection string here to pre-fill the remaining fields below.

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

### Use an authentication provider

{% include plans-blockquote.html feature="Authenticating with a provider" %}

Instead of a password, you can authenticate with a supported provider.

Only for self-hosted Pro and Enterprise plans.

#### Azure Managed Identity

To use Azure Managed Identity, you'll need to input your [client ID](https://learn.microsoft.com/en-us/previous-versions/azure/postgresql/single-server/how-to-connect-with-managed-identity#retrieving-the-access-token-from-azure-instance-metadata-service).

#### Oauth

To use Oauth as a provider, you'll need to input your:

- Auth token URL
- Auth token request headers (a JSON map)

#### IAM authentication

To connect to Amazon RDS instances using IAM authentication instead of a password, see [IAM authentication for AWS RDS](./aws-rds.md#iam-authentication).

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

Metabase automatically tries to connect to databases with SSL first, then without if that doesn't work. If it's possible to connect to your database with an SSL connection, Metabase will make that the default setting for your database. If you prefer to connect without this layer of security, you can always change this setting later, but we recommend keeping SSL turned on to keep your data secure.

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

#### Authenticate client certificate

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

### Use an SSH tunnel

See our [guide to SSH tunneling](../ssh-tunnel.md).

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

Turn this option **OFF** if people want to click **Run** (the play button) before applying any [Summarize](../../questions/query-builder/summarizing-and-grouping.md) or filter selections.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [drill-through menu](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/drill-through). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when syncs and scans happen

See [syncs and scans](../sync-scan.md#choose-when-syncs-and-scans-happen).

### Periodically refingerprint tables

> Periodic refingerprinting will increase the load on your database.

Turn this option **ON** to scan a sample of values every time Metabase runs a [sync](../sync-scan.md#how-database-syncs-work).

A fingerprinting query examines the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. If you leave this option **OFF**, Metabase will only fingerprint your columns once during setup.

## Model features

Choose whether to enable features related to [Metabase models](../../data-modeling/models.md). These features will often require that the database user account, the one you use to connect to your database, has both read and write privileges.

### Model actions

Turn this setting on to allow [actions](../../actions/introduction.md) from models created from this data to be run. Actions can read, write, and delete data. Your database user will need write permissions.

### Model persistence

We'll create tables with model data and refresh them on a schedule you define. To enable [model persistence](../../data-modeling/model-persistence.md), you need to grant this connection's credentials read and write permissions on a schema Metabase provides.

## Editable table data

Turn this setting **ON** to enable editing of table data directly within Metabase. When enabled, Admins can create, update, and delete records in your tables through Metabase's interface.

Your database connection will need Write permissions to enable this feature. Meaning: the database user account that you use to connect Metabase to your database must have appropriate privileges to modify data in the tables you want to make editable.

See [privileges](../users-roles-privileges.md).

## Database routing

With database routing, an admin can build a question once using one database, and the question will run its query against a different database with the same schema depending on who is viewing the question.

See [Database routing](../../permissions/database-routing.md).

## Danger zone

See [Danger zone](../danger-zone.md).

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
