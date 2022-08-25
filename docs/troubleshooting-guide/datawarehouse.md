---
title: Troubleshooting database connections
---

# Troubleshooting database connections

If you can't connect to your database, you'll need to figure out if the problem is happening with Metabase or your database server.

- [Troubleshooting connections to Metabase](#troubleshooting-connections-to-metabase).
- [Troubleshooting connections to the database server](#troubleshooting-connections-to-the-database-server).
- [Common database connection errors](#common-database-connection-errors).
- [Testing a database connection](#testing-a-database-connection).

If your database connection is successful, but the tables aren't showing up in the [Data Browser](/learn/getting-started/data-browser), go to [Troubleshooting missing tables](./cant-see-tables.html).

## Troubleshooting connections to Metabase

1. Go to **Admin** > **Databases** and select your database to confirm that your connection hasn’t been changed or deleted.

    - If Metabase hasn't started syncing with your database, click **Sync database schema now**.

    - If Metabase is taking a long time to sync, go to [Troubleshooting syncs and scans](./sync-fingerprint-scan.html).

2. Go to **Admin** > **Troubleshooting** > **Logs** to check if Metabase failed to sync [due to an error](#common-database-connection-errors). 

    - If the logs feel overwhelming, check out [How to read the server logs](./server-logs.html).

If you don't have access to the Metabase Admin panel, you'll need to ask the person who set up your Metabase.

## Troubleshooting connections to the database server

1. [Check that the data warehouse server is running](#checking-the-server-status).

2. Check if you can connect to the data warehouse from another client using the machine that you’re running Metabase on.

    - If you can access the server from a bastion host or another machine, [check if your Metabase's IP address has access to your database server](#checking-your-server-access).

    - If you're running Metabase Cloud, check that you've [whitelisted our IP addresses](/cloud/docs/ip-addresses-to-whitelist.html).

The steps above will help you detect whether the problem is occurring outside of Metabase. To _fix_ problems with your database server, you'll need to refer to the docs for your database or cloud service. Remember to [test your database connection](#testing-the-connection-status) after you make changes.

If you don't have access to the data warehouse server, you’ll need to ask the person who manages your database or data warehouse.

## Common database connection errors

### Your question took too long

If you see this error message in the Metabase interface, go to [Troubleshooting timeouts](./timeout.html).

### Connections cannot be acquired from the underlying database

If you see this error messages in the [logs](./server-logs.html) (**Admin** > **Troubleshooting** > **Logs**):

1. Go to **Admin** > **Databases** and select your database.
2. Go to **Advanced options** > **Additional JDBC connection string options** and add `trustServerCertificate=true`.
3. Click **Save**.

## Testing a database connection

As you work through the troubleshooting steps in this guide, you can check if each component is working as expected: 

- [Server status](#checking-the-server-status)
- [Server access](#checking-your-server-access)
- [Connection status](#testing-the-connection-status)

### Checking the server status

If you’re using a hosted database service, go to the console and verify its status.

If you have direct access to a command-line interface, log in and make sure that your database is running and accepting queries.

### Checking your server access

To verify that your Metabase's IP address can access the database server:

1. Use the [netcat](https://en.wikipedia.org/wiki/Netcat) command  `nc` (or your operating system’s equivalent) to check if you can connect to the host on a given port. Note that different databases use different ports by default.

2. If you're running Metabase Cloud, check that you've [whitelisted our IP addresses](/cloud/docs/ip-addresses-to-whitelist.html).

3. Check that your database credentials are correct.

#### Example commands

To verify the port used in a default PostgreSQL configuration (which listens on port 5432):

```
nc -v your-db-host 5432
```

To verify your credentials for a PostgreSQL database (you'll see an error if the database name or the user/password are incorrect):

```
psql -h HOSTNAME -p PORT -d DATABASENAME -U DATABASEUSER
```
### Testing the connection status

1. Go to the Metabase [SQL editor](../questions/native-editor/writing-sql.md).
2. Test the connection to your database by running:
    ```
    SELECT 1
    ```

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[discourse]: https://discourse.metabase.com/
[known-issues]: ./known-issues.md
