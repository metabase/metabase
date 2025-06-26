---
title: Configuring permissions for embedding
---

# Configuring permissions for embedding

You can use a single Metabase to manage permissions for all of your customers. Which Metabase permissions tool you use depends on how you store your customer data.

- [One database for all customers (commingled setups)](#one-database-for-all-customers-commingled-setups)
- [One database per customer (single-tenant setups)](#one-database-per-customer-single-tenant-setups)
- [One schema per customer](#multiple-schemas-one-schema-per-customer)

## Block the All users group

Before you apply more specific permissions, you'll want to make sure that no one can see any data.

Everyone's automatically in the All Users group. For your permissions to apply, you'll want to block the group from seeing any data.

In the **Admin settings** > **Permissions** > **Data**, block the All Users group's access to the database.

From here, you can selectively grant privileges to different groups.

## One database for all customers (commingled setups)

If all your customer data is in the same schema and on the same tables (often referred to as "data commingling"):

| Tenant_ID | Column 1 | Column 2 |
| --------- | -------- | -------- |
| A         | ...      | ...      |
| B         | ...      | ...      |
| C         | ...      | ...      |

You could use:

- [Data sandboxing](./data-sandboxes.md) to restrict rows and columns.
- [Connection impersonation](./impersonation.md) to mimic roles set by your database. A good choice if you want to grant native SQL access to your data.

### Restricting rows based on tenant ID

Let's say you have a table called **Data** that looks like this:

| Tenant_ID | Metrics | Insights |
| --------- | ------- | -------- |
| A         | ...     | ...      |
| B         | ...     | ...      |
| C         | ...     | ...      |

To display a filtered version of **Data** to different tenants based on a `Tenant_ID`. You can create a [basic sandbox](./data-sandboxes.md#types-of-data-sandboxes).

That means Tenant A will see the rows where `Tenant_ID = A`, and Tenant B will see the rows where `Tenant_ID = B`.

Here's how the basic sandbox will work:

1. **Create a group**, for example "Sandboxed Tenants", and add people's Metabase accounts to that group.
2. **Add a user attribute**. For each person's account, [add a user attribute](../people-and-groups/managing.md#adding-a-user-attribute) like `Tenant_ID`, with the user attribute value set to "A", "B", or "C".
3. **Sandbox the table** to apply the [row-level security based on user attributes](./data-sandboxes.md#types-of-data-sandboxes).

### Restricting columns based on tenancy

Let's say your **Insights** column is a premium feature, and Tenant B is the only customer paying to see these **Insights**. 

| Tenant ID | Metrics | Insights                          |
| --------- | ------- | --------------------------------- |
| A         | ...     | {% include svg-icons/cross.svg %} |
| B         | ...     | ...                               |
| C         | ...     | {% include svg-icons/cross.svg %} |

To keep A and C from viewing the `Insights` column, you can create a [custom sandbox](./data-sandboxes.md#types-of-data-sandboxes) to restrict both the rows and columns they see when they view the table.

1. **Create a group** called "Metrics-Only Tenants".
2. **Add Tenants A and C to the group**. Note that when you're sandboxing the **Data** table in different ways for different groups, make sure that each Metabase account only belongs to a single group.
3. [Add a user attribute](../people-and-groups/managing.md#adding-a-user-attribute) like `Tenant_ID`, with the user attribute value set to "A" or "C".
4. Next, you'll create a SQL question using the **Data** table like this:

   ```sql
   SELECT Tenant_ID, Metrics
   FROM data
   WHERE Tenant_ID = {%raw%} {{ tenant_user_attribute }} {%endraw%}
   ```
5. Save the SQL question as "Customer Metrics".
6. [Create a custom sandbox](./data-sandboxes.md#types-of-data-sandboxes) using the "Metrics-Only Tenants" group and "Customer Metrics" SQL question.

When, for example, Tenant A logs in, they'll only see the `Tenant_ID` and `Metrics` columns, and only the rows where `Tenant_ID = A`.

## One database per customer (single-tenant setups)

If each of your customers has their own database, you can use [database routing](./database-routing.md) to swap out the data source for queries. With DB routing, you just need to build a dashboard once, and Metabase will switch the database it queries depending on who's logged in.

For database routing to work, however, the schemas in each database must be identical.

On top of database routing, you can also use all the other tools Metabase provides, like [data sandboxing](./data-sandboxes.md) and [connection impersonation](./impersonation.md), for more fine-grained control over what individuals can see, even within the same tenants.

## Multiple schemas (one schema per customer)

If your customer data is stored in separate tables in the same schema or different schemas within one database, like this:

**Tenant A's schema**

| Tenant A | Column 1 | Column 2 |
| -------- | -------- | -------- |
| Row 1    | ...      | ...      |
| Row 2    | ...      | ...      |
| Row 3    | ...      | ...      |

**Tenant B's schema**

| Tenant B | Column 1 | Column 2 |
| -------- | -------- | -------- |
| Row 1    | ...      | ...      |
| Row 2    | ...      | ...      |
| Row 3    | ...      | ...      |

You could:

- [Grant self-service or view-only access to a schema](#granting-customers-self-service-or-view-only-access-to-their-schema).
- [Grant native SQL access to a schema](#granting-customers-native-sql-access-to-their-schema).

Unlike commingled data, one-schema-per-customer data is incompatible with data sandboxes, because a sandbox can only assign permissions at the row and column level, not the schema level.

### Granting customers self-service or view-only access to their schema

Say you have a single database with ten different tables, each corresponding to a different customer (company). You want each customer to only access their own table.

1. **Create a group** for your first customer in **Admin settings** > **People**. If you need different permission levels within a company (some employees can ask questions, others can only view), create multiple groups like **Company A (Self-service)** and **Company A (View only)**.

2. **Grant table access** by going to **Permissions** > **Data** > **Databases** and granting your new group access to the customer's table. If you want customers to create questions and dashboards within their table, set **Create query** permissions to **Query builder**.

   For employees who should only view data, create collections to house those specific questions and dashboards. See [collection permissions](./collections.md).

   Don't grant native SQL editor access — it lets people query tables they shouldn't see.
   
   If you scope each group's permissions to a single table, Metabase will hide any new tables you add to the database.

3. **Invite your first user** and add them to the appropriate group. Skip this step if you're using [SSO](../people-and-groups/google-sign-in.md).

4. **Repeat the process** for each customer by following steps 1–3.

### Granting customers native SQL access to their schema

The SQL editor needs unrestricted database access, so the above method would let customers query tables they shouldn't see. If you need native SQL queries:

1. Create a database-level user account for your first customer (not in Metabase). This user should only have access to their specific tables or schema. For Postgres, add a user via psql and grant them permissions only to their tables.

2. In Metabase, [add a connection to your database](../databases/connecting.md) using the database user account you just created.

3. Create a new [group](../people-and-groups/managing.md#groups) in Metabase and grant it access to the new database connection. Since the database user role controls what's visible, you can grant the group **Can view** access to the database and **Query builder and native** access.

   Group members will see all tables that the database user can access. To hide tables later, change permissions in the database itself, not Metabase.

4. Invite your first user and add them to the appropriate group. Skip this if using [SSO](../people-and-groups/google-sign-in.md).

5. Repeat steps 1–4 for each customer. You'll end up with as many database connections as customers.

