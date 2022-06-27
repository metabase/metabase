---
title: Troubleshooting database connections
---

# Troubleshooting database connections

If you can't connect to a database, you'll need to figure out if problem is happening with Metabase or your database server:

1. [Troubleshooting connections to Metabase](#troubleshooting-connections-to-metabase).
2. [Troubleshooting connections to your database server](#troubleshooting-connections-to-your-database-server).
3. [Check if your database connection is successful](../administration-guide/01-managing-databases.html#testing-connection-status).

## Troubleshooting connections to Metabase

1. Go to **Admin** > **Databases** to confirm that your connection hasn’t been changed or deleted.
2. If you’re setting up a new connection, go to **Admin** > **Databases** and select your database to check if:
    > Metabase has started syncing with your database. **If the sync hasn’t started**, click **Sync database schema now**.

    > Metabase is still syncing with your database. **If the sync is taking a long time**, go to [Troubleshooting syncs and scans](./sync-fingerprint-scan.html).
3. Go to **Admin** > **Troubleshooting** > **Logs** to check if Metabase failed to sync [due to an error](#common-database-connection-errors).

If you don't have access to the Metabase Admin panel, you'll need to ask the person who set up your Metabase.

## Troubleshooting connections to the database server

1. [Check that the data warehouse server is running](../administration-guide/01-managing-databases.html#checking-the-server-status).
2. Check if you can connect to the data warehouse from another client using the machine that you’re running Metabase on.

    > If you can access the server from a bastion host or another machine, [check if your Metabase's IP address has access to your database server](../administration-guide/01-managing-databases.html#checking-your-server-access).

    > If you're running Metabase Cloud, check that you've [whitelisted our IP addresses](/cloud/docs/ip-addresses-to-whitelist.html).

The steps here will help you detect whether the problem is occurring outside of Metabase. To _fix_ problems with your database server, you'll need to refer to the docs for your database or cloud service.

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