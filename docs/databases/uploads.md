---
title: Setting up data uploads
---

# Setting up data uploads

This page covers how admins can set up data uploads so people can upload CSVs to your Metabase. For _how_ to upload data once this is set up, check out [Uploading data](../exploration-and-organization/uploads.md).

![Upload CSV data to a collection in Metabase](./images/upload-to-collection.png)

Uploading CSV data is best suited for ad hoc analysis of spreadsheet data. If you have a lot of data, or will need to update or add to that data regularly, we recommend setting up a way to load that data into a database directly, then connecting Metabase to that database.

## Managing upload settings

To manage upload settings, admins can hit cmd/ctrl + K and search for "Settings - Uploads", or click on the **gear** icon in the upper right and click through **Admin settings** > **Settings** > **Uploads**.

## Databases that support uploads

- [PostgreSQL](../databases/connections/postgresql.md)
- [MySQL](../databases/connections/mysql.md)
- [Redshift](../databases/connections/redshift.md)
- [ClickHouse](../databases/connections/clickhouse.md) (only supported on ClickHouse Cloud)

## Setting up uploads

There are a few things admins need to do to support CSV uploads:

- [Connect to a database using a database user account with write access](#connect-to-a-database-using-a-database-user-account-with-write-access). This way Metabase will be able to store the uploaded data somewhere.
- [Select the database and schema you want to store the uploaded data in](#select-the-database-and-schema-that-you-want-to-store-the-data-in).
- [(Optional) Specify a prefix for Metabase to prepend to the uploaded tables](#specify-a-prefix-for-metabase-to-prepend-to-the-uploaded-tables).
- [Add people to a group with view data and create query access to the upload schema database](#add-people-to-a-group-with-data-access-to-the-upload-schema).

## Connect to a database using a database user account with write access

To upload data to Metabase, an admin will need to connect your Metabase to a database that supports uploads using a database user account that has write access to that database.

You can also upload data to the Sample Database included with Metabase (an H2 database), though we don't recommend using the Sample Database for any data that you want to keep around.

For more, check out:

- [Adding and managing databases](./connecting.md)
- [Database users, roles, and privileges](./users-roles-privileges.md#privileges-to-enable-uploads)

## Select the database and schema that you want to store the data in

If Metabase is connected to a database using a database user account with write access, Admins can enable uploads by:

- Clicking on the **gear** icon in the upper right on the home page and navigating to **Admin settings** > **Settings** > **Uploads**.
- Selecting the database Metabase should use to store the data.

When people upload a CSV to a collection, Metabase will:

- Create a table to store that data in the database and schema that the Admin selected to store uploads.
- Create a [model](../data-modeling/models.md) that wraps the uploaded table, and save that model to the collection the person uploaded the CSV data to.

## Specify a prefix for Metabase to prepend to the uploaded tables

Admins can optionally specify a string of text to add in front of the table that Metabase creates to store the uploaded data.

## Add people to a group with data access to the upload schema

In order to upload CSVs, a person must be in a group with **View data** access of "Can view" and **Create queries** of Query builder access or higher to the schema you've selected to store your uploaded data. See [groups](../people-and-groups/managing.md) and [data permissions](../permissions/data.md).

## Note on uploading data to a MySQL database

For speeding up uploads to a MySQL database, we recommend that you set a `local_infile` to `ON`. You'll need to set this `local_infile` in MySQL, not Metabase. The command-line format is `--local-infile=ON`.

If `local_infile` is disabled (set to `OFF`), Metabase will automatically fall back to uploading CSVs in a much slower way.

For more context, check out:

- [Non-LOCAL Versus LOCAL Operation](https://dev.mysql.com/doc/refman/8.0/en/load-data.html#load-data-local)
- [Reference docs for the local_infile variable](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_local_infile)
- [Security Considerations for LOAD LOCAL DATA](https://dev.mysql.com/doc/refman/8.0/en/load-data-local-security.html)
