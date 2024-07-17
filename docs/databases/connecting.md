---
title: Adding and managing databases
redirect_from:
  - /docs/latest/administration-guide/01-managing-databases
  - /docs/latest/databases/connections/sql-server
  - /docs/latest/administration-guide/databases/h2
  - /docs/latest/databases/connections/h2
---

# Adding and managing databases

Connect Metabase to your data sources.

## Adding a database connection

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

Fill out the fields for that database, and click **Save changes** at the bottom.

The connection settings differ database to database. For the list of connection settings available for your database, click on the link to your database below.

## Connecting to supported databases

The databases listed below have official drivers maintained by the Metabase team. Customers on [Pro and Enterprise](https://www.metabase.com/pricing) will get official support.

- [Amazon Athena](./connections/athena.md)
- [BigQuery](./connections/bigquery.md) (Google Cloud Platform)
- [Druid](./connections/druid.md)
- [MongoDB (recommend version 4.2 or higher)](./connections/mongodb.md)
- [MariaDB](./connections/mariadb.md)
- [MySQL](./connections/mysql.md)
- [Oracle](./connections/oracle.md)
- [PostgreSQL](./connections/postgresql.md)
- [Presto](./connections/presto.md)
- [Redshift (Amazon Web Services)](./connections/redshift.md)
- [Snowflake](./connections/snowflake.md)
- [SparkSQL](./connections/sparksql.md)
- [SQL Server](./connections/sql-server.md)
- [SQLite](./connections/sqlite.md)
- [Vertica](./connections/vertica.md)

If you don't see your database listed here, see [partner and community drivers](../developers-guide/partner-and-community-drivers.md#partner-drivers).

As of version 46.6.4, Metabase [no longer supports H2 connections](https://www.metabase.com/blog/security-incident-summary). But Metabase still ships with an H2 database to include an embedded application database, as well as to provide some sample data out of the box.

## Connecting to databases hosted by a cloud provider

For provider-specific connection details, like connecting to a PostgreSQL data warehouse on RDS:

- [AWS's Relational Database Service (RDS)](./connections/aws-rds.md)

## Granting database privileges

For Metabase to connect, query, or write to your database, you must give Metabase a database user account with the correct database privileges. See [Database roles, users, and privileges](./users-roles-privileges.md).

## Syncing and scanning databases

See [Syncing and scanning](./sync-scan.md).

## Deleting databases

**Caution: Deleting a database is irreversible! All saved questions and dashboard cards based on the database will be deleted as well!**

Go to **Admin settings** > **Databases** > your database and click **Remove this database**.

## Restoring the Sample Database

If you've deleted the Metabase [Sample Database](https://www.metabase.com/glossary/sample_database), go to **Admin settings** > **Databases** and click **Bring the Sample Database back**.

## Troubleshooting

- [Troubleshooting database connections](../troubleshooting-guide/db-connection.md)
- [Troubleshooting syncs, scans, and fingerprinting](../troubleshooting-guide/sync-fingerprint-scan.md)
- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](../troubleshooting-guide/known-issues.md).

## Further reading

- [Metadata editing](../data-modeling/metadata-editing.md).
- [Setting data access permissions](../permissions/data.md).
- [Metabase at scale](https://www.metabase.com/learn/administration/metabase-at-scale).
