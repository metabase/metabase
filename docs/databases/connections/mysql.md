---
title: MySQL
redirect_from:
  - /docs/latest/administration-guide/databases/mysql
---

# MySQL

> We recommend using MySQL version 8.0.33 or higher.

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

## Settings

You can edit these settings at any time. Just remember to save your changes.

### Display name

The display name for the database in the Metabase interface.

### Host

Your database's IP address, or its domain name (e.g., esc.mydatabase.com).

### Port

The database port. E.g., 3306.

### Username

The database username for the account that you want to use to connect to your database. You can set up multiple connections to the same database using different user accounts to connect to the same database, each with different sets of [privileges](../users-roles-privileges.md).

### Password

The password for the username that you use to connect to the database.

### Use a secure connection (SSL)

You can paste your server's SSL certification chain.

### Use an SSH tunnel

See our [guide to SSH tunneling](../ssh-tunnel.md).

### Unfold JSON Columns

For MySQL databases, Metabase can unfold JSON columns into component fields to yield a table where each JSON key becomes a column. JSON unfolding is on by default, but you can turn off JSON unfolding if performance is slow.

If you turn on JSON unfolding, you can also toggle the unfolding for individual columns in [table metadata](../../data-modeling/metadata-editing.md#unfold-json).

### Additional JDBC connection string options

You can append options to the connection string that Metabase uses to connect to your database.

### Re-run queries for simple explorations

Turn this option **OFF** if people want to click **Run** (the play button) before applying any [Summarize](../../questions/query-builder/introduction.md#grouping-your-metrics) or filter selections.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [drill-through menu](https://www.metabase.com/learn/questions/drill-through). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when Metabase syncs and scans

Turn this option **ON** to manage the queries that Metabase uses to stay up to date with your database. For more information, see [Syncing and scanning databases](../sync-scan.md).

#### Database syncing

If you've selected **Choose when syncs and scans happen** > **ON**, you'll be able to set:

- The frequency of the [sync](../sync-scan.md#how-database-syncs-work): hourly (default) or daily.
- The time to run the sync, in the timezone of the server where your Metabase app is running.

#### Scanning for filter values

Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database.

If you've selected **Choose when syncs and scans happen** > **ON**, you'll see the following options under **Scanning for filter values**:

- **Regularly, on a schedule** allows you to run [scan queries](../sync-scan.md#how-database-scans-work) at a frequency that matches the rate of change to your database. The time is set in the timezone of the server where your Metabase app is running. This is the best option for a small database, or tables with distinct values that get updated often.
- **Only when adding a new filter widget** is a great option if you want scan queries to run on demand. Turning this option **ON** means that Metabase will only scan and cache the values of the field(s) that are used when a new filter is added to a dashboard or SQL question.
- **Never, I'll do this manually if I need to** is an option for databases that are either prohibitively large, or which never really have new values added. Use the [Re-scan field values now](../sync-scan.md#manually-scanning-column-values) button to run a manual scan and bring your filter values up to date.

### Periodically refingerprint tables

> Periodic refingerprinting will increase the load on your database.

Turn this option **ON** to scan a sample of values every time Metabase runs a [sync](../sync-scan.md#how-database-syncs-work).

A fingerprinting query examines the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. If you leave this option **OFF**, Metabase will only fingerprint your columns once during setup.

## Connecting to MySQL 8+ servers

Metabase uses the MariaDB connector to connect to MySQL servers. The MariaDB connector lacks support for MySQL 8's default authentication plugin. In order to connect, you'll need to change the plugin used by the Metabase user:

```
mysql_native_password`: `ALTER USER 'metabase'@'%' IDENTIFIED WITH mysql_native_password BY 'thepassword';
```

### Unable to log in with correct credentials

**How to detect this:** Metabase fails to connect to your MySQL server with the error message "Looks like the username or password is incorrect", but you're sure that the username and password is correct. You may have created the MySQL user with an allowed host other than the host you're connecting from.

For example, if the MySQL server is running in a Docker container, and your `metabase` user was created with `CREATE USER 'metabase'@'localhost' IDENTIFIED BY 'thepassword';`, the `localhost` will be resolved to the Docker container, and not the host machine, causing access to be denied.

You can identify this issue by looking in the Metabase server logs for the error message:

```
Access denied for user 'metabase'@'172.17.0.1' (using password: YES).
```

Note the host name `172.17.0.1` (in this case a Docker network IP address), and `using password: YES` at the end.

You'll see the same error message when attempting to connect to the MySQL server with the command-line client: `mysql -h 127.0.0.1 -u metabase -p`.

**How to fix this:** Recreate the MySQL user with the correct host name:

```
CREATE USER 'metabase'@'172.17.0.1' IDENTIFIED BY 'thepassword';
```

Otherwise, if necessary, a wildcard may be used for the host name:

```
CREATE USER 'metabase'@'%' IDENTIFIED BY 'thepassword';
```

That user's permissions will need to be set:

```sql
GRANT SELECT ON targetdb.* TO 'metabase'@'172.17.0.1';
FLUSH PRIVILEGES;
```

Remember to drop the old user:

```
DROP USER 'metabase'@'localhost';
```

## Syncing records that include JSON

**Metabase will infer the JSON "schema" based on the keys in the first five hundred rows of a table.** MySQL JSON fields lack schema, so Metabase can't rely on table metadata to define which keys a JSON field has. To work around the lack of schema, Metabase will get the first five hundred records and parse the JSON in those records to infer the JSON's "schema". The reason Metabase limits itself to five hundred records is so that syncing metadata doesn't put unnecessary strain on your database.

The problem is that, if the keys in the JSON vary record to record, the first five hundred rows may not capture all the keys used by JSON objects in that JSON field. To get Metabase to infer all the JSON keys, you'll need to add the additional keys to the JSON objects in the first five hundred rows.

## Raising a MySQL Docker container of MySQL 8+

If you are spinning up a new MySQL container, and:

- you want Metabase to connect to the container without having to manually create the user or change the authentication mechanism,
- or you're facing a `RSA public key is not available client side (option serverRsaPublicKeyFile not set)` error,

Use the `['--default-authentication-plugin=mysql_native_password']` modifiers when you run the container, like so:

- a simple docker run: `docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=xxxxxx mysql:8.xx.xx --default-authentication-plugin=mysql_native_password`

- or in docker-compose:

```
mysql:
    image: mysql:8.xx.xx
    container_name: mysql
    hostname: mysql
    ports:
      - 3306:3306
    environment:
      - "MYSQL_ROOT_PASSWORD=xxxxxx"
      - "MYSQL_USER=metabase"
      - "MYSQL_PASSWORD=xxxxxx"
      - "MYSQL_DATABASE=metabase"
    volumes:
      - $PWD/mysql:/var/lib/mysql
    command: ['--default-authentication-plugin=mysql_native_password']
```

## Further reading

- [MariaDB](./mariadb.md)
- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
