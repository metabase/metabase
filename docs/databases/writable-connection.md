---
title: Writable connection
summary: Add an optional separate database connection for write operations like transforms or editable tables to keep the main Metabase connection read-only for analytics.
redirect_from:
  - /docs/latest/databases/writeable-connection
---

## Writable connection

> Writable connection requires the **Advanced transforms (SQL + Python)** add-on

_Admin > Databases > Writable connection_

Writable connection is an optional connection that Metabase will use for functionality that involves writing into the database (for example, transforms or CSV uploads). This allows you to keep your main Metabase connection read-only, and only to switch to connection with write permissions for the operations that require write access.

![Writable connection in database settings](./images/writeable-connection.png)

## How writable connection works

Writable connection is an additional connection option added to an existing database connection.

When a writable connection is configured for a database, Metabase automatically switches between connections behind the scenes based on what people are doing with the database. The main connection is used for querying, and the writable connection is used for [features that require writes](#features-that-use-writable-connection).

Writable connection can use a different database user than the main connection, or even connect to a different database. For example, your main connection (used for querying) can go to a read replica, but the writable connection can be to a primary database.

## Add a writable connection

To add a writable connection to a database:

1. Go to **Admin > Databases**.
2. Select the database to add a writable connection to.
3. Under **Writable connection**, click **Add writable connection**.
4. Metabase will pre-fill some fields with information from your main connection. Input the credentials for the writable connection.
5. Click **Save**. Metabase will try to connect using the new connection.

## Remove a writable connection

To remove a writable connection from a database:

1. Go to **Admin > Databases**.
2. Select the database you want to remove the writable connection from.
3. Under **Writable connection**, click **Remove writable connection**.

Once writable connection is removed, Metabase will revert to using the main connection for [features that need write access](#features-that-use-writable-connection), so your main connection will need to have appropriate database permissions, see [Users, roles, and privileges](./users-roles-privileges.md)

## Features that use writable connection

When configured, writable connection will be used for:

- [Transforms](../data-studio/transforms/transforms-overview.md)
- [CSV uploads](../databases/uploads.md)
- [Editable tables](../data-modeling/editable-tables.md)
- [Actions](../actions/introduction.md)
- [Model persistence](../data-modeling/model-persistence.md)

Your writable connection will need to have the privileges required for these operations. See [Users, roles, and privileges](./users-roles-privileges.md).

## Limitations

- Writable connection can't be used with [database routing](../permissions/database-routing.md).

- Writable connection must use the same database engine as the primary connection - so for example, if the primary connection is to a PostgreSQL database, the writable connection must be to a PostgreSQL database as well.
