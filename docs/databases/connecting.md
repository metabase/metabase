---
title: Adding and managing databases
redirect_from:
  - /docs/latest/administration-guide/01-managing-databases
  - /docs/latest/databases/connections/sql-server
---

# Adding and managing databases

Connect Metabase to your data sources.

## Adding a database connection

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

Fill out the fields for that database, and click **Save changes** at the bottom.

The connection settings differ database to database. For the list of connection settings available for your database, click on the link to your database below.

## Connecting to supported databases

The databases listed below have official drivers maintained by the Metabase team. Customers on [paid plans](https://www.metabase.com/pricing) will get official support.

- [Amazon Athena](./connections/athena.md)
- [BigQuery](./connections/bigquery.md) (Google Cloud Platform)
- [Druid](./connections/druid.md)
- [H2](./connections/h2.md)
- [MongoDB (version 4.2 or higher)](./connections/mongodb.md)
- [MySQL (version 5.7 or higher, as well as MariaDB version 10.2 or higher)](./connections/mysql.md)
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

## Connecting to databases hosted by a cloud provider

For provider-specific connection details, like connecting to a PostgreSQL data warehouse on RDS:

- [AWS's Relational Database Service (RDS)](./connections/aws-rds.md)

## Database roles, users, and privileges

For Metabase to connect, query, or write to your database, you must give Metabase a database user account with the correct database privileges.

The easiest way to set this up in a Postgres database:

- Create a `metabase` database user.
- Give `metabase` read and write access to the entire database.

```sql
CREATE USER metabase;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "your_schema" TO metabase;
```

You can always revoke specific privileges later. If you'd prefer to set things up with a little more structure, see the next couple of sections on:

- [Database roles and users](#database-roles-and-users)
- [Database privileges](#database-privileges)

### Database roles and users

To organize your database privileges, you can create database roles for each type of application that needs access to your database.

For example, most BI tools need the same privileges to connect and read from your database, so you can:

- Create a database role called `bi_tool`.
- Create a database user called `metabase`.
- Give `metabase` the `bi_tool` role.

In PostgreSQL, you'd log in as an admin and run the SQL statements:

```sql
CREATE ROLE bi_tool;
CREATE USER metabase;
GRANT bi_tool TO metabase;
```

> If you're setting up multi-tenant permissions for people who need SQL access to specific schemas or tables, you may want to create [multiple database users](https://www.metabase.com/learn/permissions/multi-tenant-permissions#option-2-granting-customers-native-sql-access-to-their-schema) for Metabase, such as `metabase_customer_1` and `metabase_customer_2`.

### Database privileges

Once you've set up your [database roles and users](#database-roles-and-users), you can assign database privileges to those roles. When you grant privileges to a role, all users with that role will get those privileges.

At minimum, the `bi_tool` role should be able to connect to and query your database:

```sql
GRANT CONNECT ON DATABASE "your_database" TO bi_tool;
GRANT pg_read_all_data TO bi_tool;
```

If you don't want to give read access to the entire database at once, you can set up read permissions to specific schemas or tables. The example below grants access to a specific table (not the entire schema):

```sql
GRANT USAGE ON SCHEMA "your_schema" TO bi_tool;
GRANT SELECT ON "your_table" IN SCHEMA "your_schema" TO bi_tool;
```

If you plan on using [model caching](../data-modeling/models.md#model-caching) or [actions](../actions/introduction.md) in Metabase, you'll need to give the `metabase` user extra privileges to write to the table used in your model:

```sql
GRANT USAGE ON SCHEMA "your_schema" TO metabase;
GRANT INSERT, UPDATE, DELETE ON "your_model's_table" IN SCHEMA "your_schema" TO metabase;
```

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
