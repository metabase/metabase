---
title: Database roles, users, and privileges
---

# Database roles, users, and privileges

Database privileges should fit into your overall [permissions strategy](https://www.metabase.com/learn/permissions/strategy). 

If you've never set up database privileges, start by [organizing privileges with roles](#organize-privileges-with-roles).

## Organize privileges with roles

Database roles can be used to group database privileges for related apps or use cases.One user can belong to multiple roles and get the total set of privileges across those roles.

We recommend creating a `metabase` user with the following roles:

- [`analytics`](#granting-read-access-to-analytics-tables) for read access to any tables used for analysis.
- Optional [`metabase_actions`](#actions) for write access to tables used for Metabase actions.
- Optional [`metabase_model_caching`](#model-caching) for write access to the schema used for Metabase model caching.

Packaging your privileges into roles based on use cases means that you can do things like:

- Use the same `analytics` role for other BI tools in your [data stack](https://www.metabase.com/learn/databases/data-landscape#data-analysis-layer) that need read-only access to your analytics tables.
- Revoke the write access for `metabase_model_caching` without affecting the write access for `metabase_actions`.

## Granting read access to analytics tables

Most analytics tools will need the same [minimum privileges](#minimum-privileges) to connect and read from analytics tables in your database.

To organize those minimum privileges, you'll:

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

-- Add query privileges to the role (options 1-3):
-- Option 1: Let users with the analytics role query anything in the DATABASE.
GRANT SELECT ON DATABASE "your_database" TO analytics;

-- Option 2: Let users with the analytics role query anything in a specific SCHEMA.
-- GRANT SELECT ON ALL TABLES IN SCHEMA "schema" TO analytics;

-- Option 3: Let users with the analytics role query anything in a specific TABLE.
-- GRANT SELECT ON ALL TABLES IN SCHEMA "schema" TO analytics;
```

Remember that when you grant privileges to a role, all users with that role will get those privileges. This is especially useful if you're managing database users for [multiple tenants or customers](#multi-tenant).

## Minimum privileges

The minimum privileges for Metabase's database user:

- `CONNECT` to your database.
- `SELECT` privileges to any schemas or tables that you want to use in Metabase.

Depending on how you use Metabase, you may also want to grant:

- `TEMPORARY` privileges to create temp tables.
- `EXECUTE` privileges to use stored procedures or user-defined functions.

## Grant all privileges

To give Metabase access to connect, query, and write to the entire database (useful for local development or testing):

- Create a `metabase` database user.
- Give `metabase` all privileges to the database.

```sql
-- Create a database user named "metabase".
CREATE USER metabase WITH PASSWORD "your_password";

-- Give the user read and write privileges to anything in the database.
GRANT ALL PRIVILEGES ON "database" TO metabase;
```

## Actions

[Actions](../actions/introduction.md) let Metabase write back to specific tables in your database. In addition to the minimum privileges, you'll need to grant write access to any tables used with actions.

Assuming you've already [created a `metabase` user](#organize-privileges-with-roles):

- Create a new role called `metabase_actions`.
- Give the role `INSERT`, `UPDATE`, and `DELETE` privileges to any tables used with Metabase actions.
- Add your `metabase` user to the `metabase_actions` role. 

```sql
-- Create a role to bundle database privileges for Metabase actions.
CREATE ROLE metabase_actions WITH LOGIN;

-- Grant write privileges to the TABLE used with Metabase actions.
GRANT INSERT, UPDATE, DELETE ON "your_table" IN SCHEMA "your_schema" TO metabase_actions;

-- Grant role to the metabase user.
GRANT metabase_actions TO metabase;
```

## Model caching

[Model caching](../data-modeling/models.md#model-caching) lets Metabase save query results to a specific schema in your database. Metabase's database user will need the `CREATE` privilege to set up a new schema for model caching, as well as write access (`INSERT`, `UPDATE`, `DELETE`) to that schema.

Assuming you've already [created a `metabase` user](#organize-privileges-with-roles):

- Create a role called `metabase_model_caching`.
- Give the role `CREATE` access to the database.
- Give the role `INSERT`, `UPDATE`, and `DELETE` privileges to the schema used for model caching.
- Add your `metabase` user to the `metabase_actions` role. 

```sql
-- Create a role to bundle database privileges for Metabase model caching.
CREATE ROLE metabase_model_caching WITH LOGIN;

-- If you don't want to give CREATE access to your database,
-- add the schema manually before enabling modeling caching.
GRANT CREATE ON "database" TO metabase_model_caching;

-- Grant write privileges to the SCHEMA used for model caching.
GRANT INSERT, UPDATE, DELETE ON "your_model's_table" IN SCHEMA "your_schema" TO metabase_model_caching;

-- Grant role to the metabase user.
GRANT metabase_model_caching TO metabase;
```

## Multi-tenant permissions

If you're setting up multi-tenant permissions for customers who need SQL access, you can [create one database connection per customer](https://www.metabase.com/learn/permissions/multi-customer-permissions#option-2-granting-customers-native-sql-access-to-their-schema). That means each customer will connect to the database using their own database user.

You can set up these privileges on top of the [minimum privileges](#organize-privileges-with-roles), or from scratch. 

For example, if you have two customers named Lemon and Orange:

- Create two users: `metabase_customer_lemon` and `metabase_customer_orange`.
- Create roles to bundle privileges specific to each customer. Say that:
  - Customer Lemon needs `SELECT` and `EXECUTE` access to query and create stored procedures against the Lemon schema.
  - Customer Orange needs `SELECT` access to query all tables in Schema Orange.
  - Customer Orange also needs the ability to create [actions](#actions) on an Actions table in the Orange schema.
- Add each user to their respective roles.

```sql
-- Create one database user per customer
CREATE USER metabase_lemon WITH LOGIN;
CREATE USER metabase_orange WITH LOGIN;

-- Privileges for all customers
CREATE ROLE customer_facing_analytics;
GRANT CONNECT ON DATABASE "your_database" TO customer_facing_analytics;
GRANT customer_facing_analytics TO metabase_lemon, metabase_orange;

-- Query privileges for Customer Lemon
CREATE ROLE lemon_queries;
GRANT SELECT, EXECUTE ON ALL TABLES IN SCHEMA "lemon" TO lemon_queries;
GRANT lemon_queries TO metabase_lemon;

-- Query privileges for Customer Orange
CREATE ROLE orange_queries;
GRANT SELECT ON ALL TABLES IN SCHEMA "orange" TO orange_queries;
GRANT orange_queries TO metabase_orange;

-- Action privileges for Customer Orange
CREATE ROLE metabase_actions_orange;
GRANT SELECT ON TABLE "action_table" IN SCHEMA "orange" TO metabase_actions_orange;
GRANT metabase_actions_orange TO metabase_customer_orange;
```

We recommend bundling privileges into roles based on your product's use cases so that you can incrementally grant or revoke customer access to data or features. This will make it easier for you to manage customer privileges in the future, for example:

- If Customer Lemon needs query privileges to the Lemon schema from an additional analytics tool, you can use the `lemon_queries` role when connecting that additional tool.
- If Customer Orange decides that they don't want to pay for Metabase actions anymore, you can simply revoke or drop the `metabase_actions_orange` privilege from the `metabase_orange` user.

## Further reading

- [Syncing and scanning databases](./sync-scan.md)
- [Permissions](../permissions/introduction.md)
- [People and groups](../people-and-groups/start.md)
