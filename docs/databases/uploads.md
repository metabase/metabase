---
title: Uploading data
---

# Uploading data

You can upload data in CSV format to Metabase and start asking questions about it.

## Enabling uploads

There are a few things admins need to do to support CSV uploads:

- [Connect to a database using a database user account with write access](#connect-to-a-database-using-a-database-user-account-with-write-access). This way Metabase will be able to store the uploaded data somewhere.
- [Select the database and schema you want to store the uploaded data in](#select-the-database-and-schema-that-you-want-to-store-the-data-in).
- (Optional) [specify a prefix for Metabase to prepend to the uploaded tables](#specify-a-prefix-for-metabase-to-prepend-to-the-uploaded-tables)

### Databases that support uploads

- [PostgreSQL](../databases/connections/postgresql.md)
- [MySQL](../databases/connections/mysql.md)

### Connect to a database using a database user account with write access

To upload data to Metabase, an admin will need to connect your Metabase to a database that supports  uploads using a database user account that has write access to that database.

You can also upload data to the Sample Database included with Metabase (an H2 database), though we don't recommend using the Sample Database for any data that you want to keep around.

For more, check out:

- [Adding and managing databases](./connecting.md)
- [Database users, roles, and privileges](./users-roles-privileges.md).

### Select the database and schema that you want to store the data in

If Metabase is connected to a database using a database user account with write access, Admins can  enable uploads by:

- Clicking on the **gear** icon in the upper right on the home page and navigating to **Admin settings** > **Settings** > **Uploads**.
- Selecting the database Metabase should use to store the data.

When people upload a CSV to a collection, Metabase will:

- Create a table to store that data in the database and schema that the Admin selected to store uploads.
- Create a [model](../data-modeling/models.md) that wraps the uploaded table, and save that model to the collection the person uploaded the CSV data to.

### Specify a prefix for Metabase to prepend to the uploaded tables

Admins can optionally specify a string of text to add in front of the table that Metabase creates to store the uploaded data.

## File size limit

CSV files cannot exceed 200 MB in size. 

> Note that while Metabase limits uploads to 200 MB, the server you use to run your Metabase may impose a separate limit. You may need to change your server settings to allow uploads up to 200 MB. People on Metabase Cloud don't have to worry about this.

If you have a file larger than 200 MB, the workaround here is to:

1. Split the data into multiple files.
2. Upload those files one by one. Metabase will create a new model for each sheet.
3. Consolidate that data by creating a new question or model that joins the data from those constituent models created by each upload.

## Deleting models and tables created by uploads

### Models 

You can archive a model by clicking on the three dots in the upper right and selecting **Archive**.

For deleting models completely, see [Deleting items permanently](../exploration-and-organization/history#deleting-items-permanently)

### Tables

You'll need to drop that table in the database itself (not in Metabase). For how to delete tables, see your database's documentation.

## Note on uploading data to a MySQL database

For speeding up uploads to a MySQL database, we recommend that you set a `local_infile` to `ON`. You'll need to set this `local_infile` in MySQL, not Metabase. The command-line format is `--local-infile=ON`.

 If `local_infile` is disabled (set to `OFF`), Metabase will automatically fall back to uploading CSVs in a much slower way.

For more context, check out:

- [Non-LOCAL Versus LOCAL Operation]( https://dev.mysql.com/doc/refman/8.0/en/load-data.html#load-data-local)
- [Reference docs for the local_infile variable](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_local_infile)
- [Security Considerations for LOAD LOCAL DATA](https://dev.mysql.com/doc/refman/8.0/en/load-data-local-security.html