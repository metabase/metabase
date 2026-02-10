---
title: Database users, roles, and privileges
---

# Database users, roles, and privileges

We recommend creating a `metabase` database user with the following database roles:

- [`analytics` for read access](#minimum-database-privileges) to any schemas or tables used for analysis.
- Optional [`metabase_actions` for write access](#privileges-to-enable-actions-and-editable-table-data) to tables used for Metabase actions.
- Optional [`metabase_model_persistence` for write access](#privileges-to-enable-model-persistence) to the schema used for Metabase model persistence.
- Optional [`metabase_transforms` for write access](#privileges-to-enable-transforms) to the schema used for Metabase transforms.

Bundling your privileges into roles based on use cases makes it easier to manage privileges in the future (especially in [multi-tenant situations](#multi-tenant-permissions)). For example, you could:

- Use the same `analytics` role for other BI tools in your [data stack](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-landscape) that need read-only access to the analytics tables in your database.
- Revoke the write access for `metabase_model_persistence` without affecting the write access for `metabase_actions`.

## Minimum database privileges

In order to view and query your tables in Metabase, you'll have to give Metabase's database user:

- `CONNECT` to your database.
- `SELECT` privileges to any schemas or tables that you want to use in Metabase.

To organize these privileges (and make maintenance easier down the line):

- Create a database role called `analytics`.
- Create a database user called `metabase`.
- Add `metabase` to the `analytics` role.
- Add privileges to the `analytics` role.

For example, if you're using a Postgres database, you'd log in as an admin and run the SQL statements:

```sql
-- Create a role named "analytics".
CREATE ROLE analytics WITH LOGIN;

-- Add the CONNECT privilege to the role.
GRANT CONNECT ON DATABASE "your_database" TO analytics;

-- Create a database user named "metabase".
CREATE USER metabase WITH PASSWORD "your_password";

-- Give the role to the metabase user.
GRANT analytics TO metabase;

-- Add query privileges to the role (options 1-4):

-- Option 1: Uncomment the line below to let users with the analytics role query ALL DATA (In Postgres 14 or higher. See [Predefined Roles](https://www.postgresql.org/docs/current/predefined-roles.html#PREDEFINED-ROLES)).
-- GRANT pg_read_all_data TO analytics;

-- Option 2: Uncomment the line below to let users with the analytics role query anything in the DATABASE.
-- GRANT USAGE ON DATABASE "your_schema" TO analytics;
-- GRANT SELECT ON DATABASE "your_schema"  TO analytics;

-- Option 3: Uncomment the line below to let users with the analytics role query anything in a specific SCHEMA.
-- GRANT USAGE ON SCHEMA "your_schema" TO analytics;
-- GRANT SELECT ON ALL TABLES IN SCHEMA "your_schema" TO analytics;

-- Option 4: Uncomment the line below to let users with the analytics role query anything in a specific TABLE.
-- GRANT USAGE ON SCHEMA "your_schema" TO analytics;
-- GRANT SELECT ON "your_table" IN SCHEMA "your_schema" TO analytics;
```

Depending on how you use Metabase, you can also additionally grant:

- `TEMPORARY` privileges to create temp tables.
- `EXECUTE` privileges to use stored procedures or user-defined functions.

Remember that when you grant privileges to a role, all users with that role will get those privileges.

## Grant all database privileges

If you don't want to structure your database privileges yet:

- Create a `metabase` database user.
- Give `metabase` all privileges to the database.

```sql
-- Create a database user named "metabase".
CREATE USER metabase WITH PASSWORD "your_password";

-- Give the user read and write privileges to anything in the database.
GRANT ALL PRIVILEGES ON "database" TO metabase;
```

This is a good option if you're connecting to a local database for development or testing.

## Privileges to enable actions and editable table data

Both [actions](../actions/introduction.md) and the [editable table data](../data-modeling/editable-tables.md) let Metabase write back to specific tables in your database.

In addition to the [minimum database privileges](#minimum-database-privileges), you'll need to grant write access to any tables you want to be able to write to.

- Create a new role called `metabase_writer`.
- Give the role `INSERT`, `UPDATE`, and `DELETE` privileges to the relevant tables.
- Give the `metabase_writer` role to the `metabase` user.

```sql
-- Create a role to bundle database privileges for Metabase writing to your database.
CREATE ROLE metabase_writer WITH LOGIN;

-- Grant write privileges to the TABLE
GRANT INSERT, UPDATE, DELETE ON "your_table" IN SCHEMA "your_schema" TO metabase_writer;

-- Grant role to the metabase user.
GRANT metabase_writer TO metabase;
```

## Privileges to enable model persistence

[Model persistence](../data-modeling/model-persistence.md) lets Metabase save query results to a specific schema in your database. Metabase's database user will need the `CREATE` privilege to set up the dedicated schema for model persistence, as well as write access (`INSERT`, `UPDATE`, `DELETE`) to that schema.

In addition to the [minimum database privileges](#minimum-database-privileges):

- Create a new role called `metabase_model_persistence`.
- Give the role `CREATE` access to the database.
- Give the role `INSERT`, `UPDATE`, and `DELETE` privileges to the schema used for model persistence.
- Give the `metabase_model_persistence` role to the `metabase` user.

```sql
-- Create a role to bundle database privileges for Metabase model persistence.
CREATE ROLE metabase_model_persistence WITH LOGIN;

-- If you don't want to give CREATE access to your database,
-- add the schema manually before enabling modeling persistence.
GRANT CREATE ON "database" TO metabase_model_persistence;

-- Grant write privileges to the SCHEMA used for model persistence.
GRANT USAGE ON "your_schema" TO metabase_model_persistence;
GRANT INSERT, UPDATE, DELETE ON "your_model's_table" IN SCHEMA "your_schema" TO metabase_model_persistence;

-- Grant role to the metabase user.
GRANT metabase_model_persistence TO metabase;
```

## Privileges to enable transforms

[Transforms](../data-studio/transforms/transforms-overview.md) let Metabase write query results back to your database. We suggest that you create a dedicated schema for your transforms. Metabase's database user will need to be able to create and drop transform tables.

In addition to the [minimum database privileges](#minimum-database-privileges):

- Create a new role called `metabase_transforms`.
- Create a dedicated schema for transforms.
- Give the `metabase_transforms` role `CREATE TABLE` / `ALTER` / `DROP` privileges for the specified schema.
- Give the `metabase_transforms` role to the `metabase` user.

In certain cases, Metabase will give you an option to create new schemas for transforms, in which case you'll also need `CREATE SCHEMA` privileges for your metabase users (or `CREATE DATABASE` for ClickHouse).

## Privileges to enable uploads

You can [upload CSVs](../databases/uploads.md) to supported databases. Metabase's database user should have write access (`INSERT`, `UPDATE`, `DELETE`) to the schema where you want to store the uploads.

You'll first need to create a schema to store uploads (or use an existing schema) and tell Metabase that you want to [use that schema to store uploads](./uploads.md#select-the-database-and-schema-that-you-want-to-store-the-data-in).

In addition to the [minimum database privileges](#minimum-database-privileges):

- Create a new role called `metabase_uploads`.
- Give the role `INSERT`, `UPDATE`, and `DELETE` privileges to the schema where you want to store uploads.
- Give the `metabase_uploads` role to the `metabase` user.

```sql
-- Create a role to bundle database privileges for uploads.
CREATE ROLE metabase_uploads WITH LOGIN;

-- Grant write privileges to the SCHEMA used for uploads.
GRANT USAGE ON "your_schema" TO metabase_uploads;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "your_schema" TO metabase_uploads;

-- Grant role to the metabase user.
GRANT metabase_uploads TO metabase;
```

## Multi-tenant permissions

If you're setting up multi-tenant permissions for customers who need SQL access, you can [create one database connection per customer](../permissions/embedding.md#granting-customers-native-sql-access-to-their-schema). That means each customer will connect to the database using their own database user.

Let's say you have customers named Tangerine and Lemon:

- Create new database users `metabase_tangerine` and `metabase_lemon`.
- Create a `customer_facing_analytics` role with the `CONNECT` privilege.
- Create roles to bundle privileges specific to each customer's use case. For example:
  - `tangerine_queries` to bundle read privileges for people to query and create stored procedures against the Tangerine schema.
  - `lemon_queries` to bundle read privileges for people to query tables in the Lemon schema.
  - `lemon_actions` to bundle the write privileges needed to create [actions](#privileges-to-enable-actions-and-editable-table-data) on a Lemonade table in the Lemon schema.
- Add each user to their respective roles.

```sql
-- Create one database user per customer.
CREATE USER metabase_tangerine WITH PASSWORD "orange";
CREATE USER metabase_lemon WITH PASSWORD "yellow";

-- Create a role to bundle privileges for all customers.
CREATE ROLE customer_facing_analytics;
GRANT CONNECT ON DATABASE "citrus" TO customer_facing_analytics;
GRANT customer_facing_analytics TO metabase_tangerine, metabase_lemon;

-- Create a role to bundle analytics read access for customer Tangerine.
CREATE ROLE tangerine_queries;
GRANT USAGE ON SCHEMA "tangerine" TO tangerine_queries;
GRANT SELECT, EXECUTE ON ALL TABLES IN SCHEMA "tangerine" TO tangerine_queries;
GRANT tangerine_queries TO metabase_tangerine;

-- Create a role to bundle analytics read access for customer Lemon.
CREATE ROLE lemon_queries;
GRANT USAGE ON SCHEMA "lemon" TO lemon_queries;
GRANT SELECT ON ALL TABLES IN SCHEMA "lemon" TO lemon_queries;
GRANT lemon_queries TO metabase_lemon;

-- Create a role to bundle privileges to Metabase actions for customer Lemon.
CREATE ROLE lemon_actions;
GRANT INSERT, UPDATE, DELETE ON TABLE "lemonade" IN SCHEMA "lemon" TO lemon_actions;
GRANT lemon_actions TO metabase_lemon;
```

We recommend bundling privileges into roles based on use cases per customer. That way, you can reuse common privileges across customers while still being able to grant or revoke granular privileges per customer. For example:

- If customer Tangerine needs to query the Tangerine schema from another analytics tool, you can use the `tangerine_queries` role when setting up that tool.
- If customer Lemon decides that they don't want to use Metabase actions anymore (but they still want to ask questions), you can simply revoke or drop the `lemon_actions` role.

## Further reading

- [Permissions strategies](https://www.metabase.com/learn/metabase-basics/administration/permissions/strategy)
- [Permissions introduction](../permissions/introduction.md)
- [People overview](../people-and-groups/start.md)
