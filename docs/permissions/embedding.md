---
title: Configuring permissions for embedding
summary: Learn about which permissions tooling you should use depending on whether your customer data is in one database or split across multiple databases.
---

# Configuring permissions for embedding

You can use a single Metabase to manage permissions for all of your customers. Which Metabase permissions tool you use depends on how you store your customer data.

- [One database for all customers (commingled setups)](#one-database-for-all-customers-commingled-setups)
- [One database per customer](#one-database-per-customer)
- [One schema per customer](#multiple-schemas-one-schema-per-customer)

## One database for all customers (commingled setups)

If all your customer data is in the same schema and on the same tables (often referred to as "data commingling"):

| Tenant_ID | Column 1 | Column 2 |
| --------- | -------- | -------- |
| A         | ...      | ...      |
| B         | ...      | ...      |
| C         | ...      | ...      |

You could use:

- [Row and column security](./row-and-column-security.md) to restrict rows and columns.
- [Connection impersonation](./impersonation.md) to mimic roles set by your database. Impersonation is a good choice if you want to grant native SQL access to your data.

### Restricting rows based on tenant ID

Let's say you have a table called **Data** that looks like this:

| Tenant_ID | Metrics | Insights |
| --------- | ------- | -------- |
| A         | ...     | ...      |
| B         | ...     | ...      |
| C         | ...     | ...      |

To display a filtered version of **Data** to different tenants based on a `Tenant_ID`, you can apply [row and column security](./row-and-column-security.md).

That means Tenant A will see the rows where `Tenant_ID = A`, and Tenant B will see the rows where `Tenant_ID = B`.

Here's how the basic row-level security will work:

1. **Create a group**, for example "Restricted Tenants", and add people's Metabase accounts to that group.
2. **Add a user attribute**. For each person's account, [add a user attribute](../people-and-groups/managing.md#adding-a-user-attribute) like `Tenant_ID`, with the user attribute value set to "A", "B", or "C".
3. **Add row-level security** to the table for that group. See [row and column security](./row-and-column-security.md)

### Restricting columns based on tenancy

Let's say your **Insights** column is a premium feature, and Tenant B is the only customer paying to see these **Insights**.

| Tenant ID | Metrics | Insights                          |
| --------- | ------- | --------------------------------- |
| A         | ...     | {% include svg-icons/cross.svg %} |
| B         | ...     | ...                               |
| C         | ...     | {% include svg-icons/cross.svg %} |

To keep A and C from viewing the `Insights` column, you can add [column-level security](./row-and-column-security.md) to restrict both the rows and columns they see when they view the table.

1. **Create a group** called "Metrics-Only Tenants".
2. **Add Tenants A and C to the group**. When restricting data, make sure that each Metabase account only belongs to a single group.
3. [Add a user attribute](../people-and-groups/managing.md#adding-a-user-attribute) like `Tenant_ID`, with the user attribute value set to "A" or "C".
4. Next, you'll create a SQL question using the **Data** table like this:

   ```sql
   SELECT Tenant_ID, Metrics
   FROM data
   WHERE Tenant_ID = {%raw%} {{ tenant_user_attribute }} {%endraw%}
   ```

5. Save the SQL question as "Customer Metrics".
6. [Add row and column security](./row-and-column-security.md#custom-row-and-column-security-use-a-sql-question-to-create-a-custom-view-of-a-table) using the "Metrics-Only Tenants" group and "Customer Metrics" SQL question.

When, for example, Tenant A logs in, they'll only see the `Tenant_ID` and `Metrics` columns, and only the rows where `Tenant_ID = A`.

### Impersonation lets you manage access with database roles

Impersonation lets you map user attributes to database roles, which lets you do row-level security based on the database privileges you give each role.

Check out this [article on impersonation](https://www.metabase.com/learn/metabase-basics/administration/permissions/impersonation).

## One database per customer

If each of your customers has their own database, you can use [database routing](./database-routing.md) to swap out the data source for queries. With DB routing, you just need to build a dashboard once, and Metabase will switch the database it queries depending on who's logged in.

For database routing to work, however, the schemas in each database must be identical.

For more fine-grained control over what individuals can see, even within the same tenants, you can also use the other tools Metabase provides, like [row and column security](./row-and-column-security.md) and [connection impersonation](./impersonation.md), in combination with database routing.

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

Unlike commingled data, one-schema-per-customer data is incompatible with row and column security, because it works at the table level, not the schema level.

### Granting customers self-service or view-only access to their schema

Say you have a single database with ten different tables, each corresponding to a different customer (company). You want each customer to only access their own table.

1. **Create a group** for your first customer in **Admin settings** > **People**. If you need different permission levels within a company (some employees can ask questions, others can only view), create multiple groups like **Company A (Self-service)** and **Company A (View only)**.

2. **Grant table access** by going to **Permissions** > **Data** > **Databases** and granting your new group access to the customer's table. If you want customers to create questions and dashboards within their table, set **Create query** permissions to **Query builder**.

   For employees who should only view data and create collections to house those specific questions and dashboards, see [collection permissions](./collections.md).

   Avoid granting native SQL editor access — it lets people query tables they shouldn't see.

   If you scope each group's permissions to a single table, Metabase will hide any new tables you add to the database.

3. **Invite your first user** and add them to the appropriate group. If you're using [SSO](../people-and-groups/google-sign-in.md), you can skip this step.

4. **Repeat the process** for each customer by following steps 1–3.

### Granting customers native SQL access to their schema

If you need native SQL queries:

1. **Create a database-level user account** for your first customer (in your database, not in Metabase). This database user should only have access to their specific tables or schema. For PostgreSQL for example, you could add a user via psql and only grant them permissions to their tables.

2. **Connect Metabase to your database** using the database user account you just created. See [databases](../databases/connecting.md).

3. **Create a new group** in Metabase and grant it access to the new database connection. Since the database user role controls what's visible, you can grant the group **Can view** access to the database and **Query builder and native** access. See [groups](../people-and-groups/managing.md#groups).

   Group members will see all tables that the database user can access. To hide tables later, you'll need to change permissions in the database itself, not Metabase.

4. **Invite your first user** and add them to the appropriate group. If you're using [SSO](../people-and-groups/google-sign-in.md), you can skip this step.

5. **Repeat the process** for each customer by following steps 1-4. You'll end up with as many database connections as customers.
