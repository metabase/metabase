---
title: Troubleshooting database connections
---

# Troubleshooting database connections

If you can't connect to your database, you'll need to figure out if the problem is happening with Metabase or your database server:

1. [Troubleshooting connections to Metabase](#troubleshooting-connections-to-metabase).
2. [Troubleshooting connections to the database server](#troubleshooting-connections-to-the-database-server).
3. [Checking if your database connection is successful](../administration-guide/01-managing-databases.html#testing-the-connection-status).

If your database connection is successful, but the tables aren't showing up in the [Data Browser](/learn/getting-started/data-browser), go to [Troubleshooting missing tables](./cant-see-tables.html).

## Troubleshooting connections to Metabase

1. Go to **Admin** > **Databases** and select your database to confirm that your connection hasn’t been changed or deleted.

    > If Metabase hasn't started syncing with your database, click **Sync database schema now**.

    > If Metabase is taking a long time to sync, go to [Troubleshooting syncs and scans](./sync-fingerprint-scan.html).

2. Go to **Admin** > **Troubleshooting** > **Logs** to check if Metabase failed to sync [due to an error](#common-database-connection-errors). 

    > If the logs feel overwhelming, check out [How to read the server logs](./server-logs.html).

If you don't have access to the Metabase Admin panel, you'll need to ask the person who set up your Metabase.

## Troubleshooting connections to the database server

1. [Check that the data warehouse server is running](../administration-guide/01-managing-databases.html#checking-the-server-status).

2. Check if you can connect to the data warehouse from another client using the machine that you’re running Metabase on.

    > If you can access the server from a bastion host or another machine, [check if your Metabase's IP address has access to your database server](../administration-guide/01-managing-databases.html#checking-your-server-access).

    > If you're running Metabase Cloud, check that you've [whitelisted our IP addresses](/cloud/docs/ip-addresses-to-whitelist.html).

The steps above will help you detect whether the problem is occurring outside of Metabase. To _fix_ problems with your database server, you'll need to refer to the docs for your database or cloud service.

If you don't have access to the data warehouse server, you’ll need to ask the person who manages your database or data warehouse.

## Common database connection errors

**From the Metabase interface:**
- [Your question took too long](./timeout.html).

**From the logs:**
- [Connections cannot be acquired from the underlying database](#connections-cannot-be-acquired-from-the-underlying-database).

### Connections cannot be acquired from the underlying database

1. Go to **Admin** > **Databases** and select your database.
2. Go to **Advanced options** > **Additional JDBC connection string options** and add `trustServerCertificate=true`.
3. Click **Save**.

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[discourse]: https://discourse.metabase.com/
[known-issues]: ./known-issues.html