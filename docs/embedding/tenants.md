---
title: Tenants
---

# Tenants

{% include plans-blockquote.html feature="Tenants" is_plural=true %}

Tenants simplify user provisioning and configuration, especially in embedding contexts.

You can use tenants to:

- simplify bulk permissions through tenant groups and attributes
- create collections of shared assets to avoid duplicating dashboards,
- and provision tenants with SSO.

To get started with tenants:

1. [Get familiar with tenant concepts](LINK)
2. [Enable tenants](LINK)
3. Create a [tenant](LINK) and [tenant users](LINK), or [provision them with SSO](LINK)
4. [Create shared collections](LINK)
5. Set up [data](LINK) and [collection](LINK) permissions

You can also

## Concepts

**Tenant** is an abstraction representing groups of users that share some properties but should be isolated from other users. For example, if you're building a SaaS app with embedded Metabase dashboards, the customers of your SaaS are tenants.

While working with tenants in Metabase, you'll encounter different user and group types, and some some special collection types. Let's establish some terminology.

### User types

- **Tenant users** are the end users. In a B2B SaaS context, these are the your customer's user. Usually they will be interacting with Metabase through an intermediate app (for example, through an embedded dashboard).

- **Internal users** are Metabase users who don't belong to any tenant. Think Metabase admins, or devs building the dashboards that will be shared with tenants.

### Group types

Tenant users and and internal users can be organized into Metabase [groups](LINK).

[SCREENSHOT]

- **All tenant users** is a special group representing all individual end users across all tenants.

  This group can be used to [configure permissions](LINK) for tenant users. If you need more granular permission controls within each tenant, you can also created tenant groups.

- **Tenant groups** can be used to create additional permission levels for tenant users.

  For example, if you're making recruiting software, every end user can be a recruiter (with access to all data about all open roles) or a hiring manager (with access to analytics for a specific role). So in Metabase, you can create two tenant groups - "Recruiters" and "Hiring managers" and configure appropriate permissions.

  Every tenant will be able to use tenant groups (so for example, every customer can have "Recruiters" and "Hiring managers").

- **All internal users** is a special group for all people who _aren't_ members of a tenant.

  These are the people working directly in Metabase. This group is equivalent to "All users" group when multi-tenancy is not enabled.

- **Internal groups** are additional groups for internal users.

  For example, you might have a special group for your internal group "Analytics developers" who only have access to create dashboards that will be later shared with tenants, but don't have full admin access to your whole Metabase.

Tenant users can't be added to internal user groups, and internal users can't be added to tenant groups.

### Collection types

Collections in Metabase is where you put charts, dashboard, and models. They also serve as an organizational unit for permission management: if a certain group of people should have access to a certain set of assets, you should put those assets into a collection.

[SCREENSHOT]

- **Shared collections** contain dashboards and charts that are shared between all tenants.

  For example, every tenant of a recruiting app should be able to see number of job applications by date. you can create a [Metabase question](LINK) for "Count of applications by date" and save it into a shared collection.

  You'll need to [configure appropriate data permissions](LINK) so that each tenant only sees _their_ job applications, and not _everyone's_ job applications (that would be bad).

  You can create many shared collections (or no shared collections at all, for that matter). For example, you can have a shared collection for analytics around recruitment and a separate shared collection for analytics around interviews.

  Shared collections can be optionally [synced to GitHub](LINK).

- **Tenant collections** are collection specific to each tenant. They are created automatically for each tenant.

  If you have special customers with bespoke analytics that only this customer gets, you can put those bespoke dashboards and charts into the tenant's collection. For tenant's end users, tenant collections can also serve as a place to create and save new questions that can be shared with other tenant users (but not with users from other tenants).

- **Internal collections**. Internal collections are exclusively an internal user concern. This is where you can put the stuff that you don't want your end users to see (dashboards in development, internal metrics, maybe even analytics _about_ your tenants). Tenant users will never have access to internal collections.

- **Personal collection**. Every Metabase user, including tenant users, gets a personal collection - their own space to save new questions and dashboards (of course, if they otherwise have the permissions to build and save new questions).

See [Collection permissions](LINK) for configuring access to different collection types.

### Enable multi-tenant strategy

You can create and manage you tenants exclusively through Metabase UI, or, if that's not your jam, [through SSO](LINK). Regardless of how you manage your tenants, you'll need to enable multi-tenant strategy in Metabase first.

[SCREENSHOT]

1. Go to **Admin settings > People**.
2. Click on the **gear** icon above the list of people.
3. Choose **Multi-tenant strategy**.

Changing to multi-tenant strategy will enable special [user types](LINK) and [collection types](LINK). You'll be able to create new tenants, tenant groups, and collection, and you'll get some additional options in People and Permissions admin settings.

If you have an existing permissions and collection setup that you'd like to translate to use tenants, see [Changing tenant strategy](LINK).

Once you enable multi-tenant strategy, keep in mind that switching _from_ multi-tenant to single-tenant is a destructive action: all your tenant users and your tenant and shared collections will be disabled. See [Changing tenant strategy](LINK).

## Create new tenants in Metabase

To create new tenants in Metabase:

1. [Enable multi-tenant strategy](LINK), if you haven't yet.
2. Go to **Admin settings > People** .
3. Select **Tenants** on the left sidebar and click **New tenant**
4. Fill out the information for the tenant:
   - **Tenant name**: Display name for the tenant that will be displayed to _internal_ users. Not exposed to external users. This name can be changed later.
   - **Tenant slug**: unique identifier of the tenant. It can be used to [match JWT claims](LINK) and for setting up [data permissions](LINK). Tenant slug can't be changed.
   - **Tenant attributes**: you can define tenant attributes that will be inherited by every tenant user, see [Tenant attributes](LINK).

You can avoid manually setting up tenants in Metabase by [provisioning tenants with JWT](LINK).

## Create tenant groups

Tenant groups are groups that are applicable across tenants. For example, you can have tenant groups "Basic users" and "Premium users", and every tenant will be able to user those groups. Groups can be used to configure permissions.

To create a tenant group:

1. [Enable multi-tenant strategy](LINK), if you haven't yet.
2. Go to **Admin settings > People** .
3. Select **Tenant groups** on the left sidebar and click **Create a group**.
4. Name your group.

To add people to tenant groups, see [Add people to groups](Link)

## Create tenant users in Metabase

To add tenant users in Metabase:

1. [Create a tenant](LINK).
2. Go to **Admin settings > People** .
3. Select **Tenants users** on the left sidebar and click **New tenant user**.
4. Fill out the user information, including the tenant and tenant groups.

   If your tenant has [tenant attributes](LINK), they'll be inherited by the user, but you can override the value in "Attributes".

You can also [provision tenant users with JWT](LINK).

## Create shared collections for tenants

Shared collections contain dashboards and charts that are shared between all tenants. If you're using shared collections, make sure that you configure [data permissions](LINK) so that tenants can only see _their data_ in the shared collections.

To create a shared collection:

1. [Enable multi-tenant strategy](LINK), if you haven't yet.
2. Open Metabase navigation sidebar by clicking on the **three lines** in top left (that's regular Metabase, not Admin settings).
3. You should see "External collections" in the sidebar. If you don't make sure you have enabled multi-tenant strategy.
4. Click on the **+** next to "External collections" to create a shared collection.

You can have multiple shared collections and nested shared collections. You can also [sync shared collections to GitHub](LINK).

## Tenant attributes

You can create tenant-level [user attributes](LINK) which will be inherited by all the users of the tenant. This is useful for configuring attribute-based data permissions like [row-level security](LINK), [impersonation](LINK), or [database routing](LINK).

To add a tenant attribute:

1. Go to **Admin setting > People**
2. Select **Tenants** on the left sidebar.
3. Click on **three dots** next to the tenant.
4. Input the attribute key and value.

Once you add a tenant attribute, all users of that tenant will inherit the attribute, but the value can overridden for any particular user, see [Edit user attributes](LINK).

Currently, you can't assign custom tenant attributes with SSO - the only way to assign attributes is through to tenants through Metabase UI (but you can provision attributes for _individual users_ through SSO, see [JWT user attributes](LINK)). However, if the reason you need user attributes is for permission configuration, then you can use the [special slug attribute](LINK) which is created automatically.

### Special tenant slug attribute

Each tenant user will get system-defined attribute `@tenant.slug` that corresponds to the slug of the tenant. For example, if you created a tenant "Meowdern Solutions" with the slug `meowdern_solutions`, then every user from this tenant will get a special attribute `@tenant.slug : "meowdern_solutions"`.

If you create Metabase tenants through Metabase UI, you can choose the slug when creating the tenant. If you're [using JWT to provision tenants](LINK), tenant slug is the value of the `@tenant` claim for JWT (or another tenant assignment attribute you selected). Slug cannot be changed later.

The special `@tenant.slug` attribute can be used just like a normal attribute to configure attribute-based permissions like [row-level security](LINK), [impersonation](LINK), or [database routing](LINK). Keep in mind that for this to work, your chosen tenant slug should correspond to how the tenant is actually identified in your setup.

For example, if you want to use row-level security, and tenants are identified in your tables by their IDs (instead of names), then your tenant slug should be an ID as well.

For example, if your data looks like this

| Customer ID | Order number | Order date | Order total |
| ----------- | ------------ | ---------- | ----------- |
| 175924      | 3            | 2025-10-13 | 175.34      |
| 680452      | 7            | 2025-10-13 | 34.56       |

and you want to enforce row-level security by `Customer ID`, then the tenant slug should have the form `175924` so that it could be matched to the Customer ID in your table.

Similarly, if you want to use tenant slug for impersonation, you'll have to map the tenant slug to a database role, and for database routing - to a database.

## Provisioning and assigning tenants with JWT

### Use tenant claim to sign in users

You can [set up JWT SSO](LINK) and usethe JWT to sign in tenant users.

Once you [enable multi-tenant user strategy](LINK), Metabase will look for a `@tenant` claim in your JWT to determine if the user is a tenant user, and which tenant the user belongs to. The value of `@tenant` key should be the tenant's slug. Here's an example of a JWT claim to sign in a tenant user:

```json
{
  "email": "mittens@example.com",
  "first_name": "Mister",
  "last_name": "Mittens",
  "@tenant": "meowdern_solutions"
}
```

If the user has already been assigned to a tenant (for example, through Metabase UI), then the JWT _must_ contain the tenant claim to sign the user in.

### Customize tenant claim

By default, Metabase looks for a `@tenant` key in your JWT. To set up a different key

1. Go to **Admin** > **Settings** > **Authentication** > **JWT** > **User attribute configuration**
2. Change the **Tenant assignment attribute** key to your preferred identifier.

### Provisioning tenants and users

You can [turn on JWT user provisioning](LINK) so that Metabase will automatically create users and tenants mentioned in the JWT.

When user provisioning with JWT is enabled:

1. Metabase reads the tenant identifier from the JWT claim. By default, this is the `@tenant` key (you can configure this)
2. If the tenant doesn't exist, Metabase automatically creates it. Metabase will use the value of the `@tenant` key (or your chosen assignemnt attribute) as the tenant slug.
3. New users are automatically assigned to the tenant from their JWT.

### Troubleshooting JWT authentication with tenants

Some auth common error messages and what they mean:

- **Cannot add tenant claim to internal user**: JWT includes a tenant, but the user is an internal user. Only tenant users can have a tenant.
- **Tenant claim required for external user**: JWT lacks a tenant claim, but the user is an external user.
- **Tenant ID mismatch with existing user**: JWT has a different tenant than the user's assigned tenant.
- **Tenant is not active**: The tenant exists but has been deactivated.

## Data permissions for tenants

Data permissions control what data people can see on charts and dashboards, and what they can do with that data. To control _which_ charts people see, you can use [collection permissions](INK) instead.

### Data permission overview

For an overview of how data permissions work in Metabase, see [Data permissions](LINK). Here are the highlights (but please do read the full Data permissions documentation):

- **"View data"** controls what exact data each user group can see in the on on charts.

  For example, if your tenant data is comingled in one database, then you can use [**Row and column security**](LINK) or [**Impersonation**](LINK) "View data" permissions to provide tenant users with access to only certain rows and columns.

  If every tenant has their data in a separate database, then instead of using permissions for data access control, you can use [**database routing**](LINK) to route queries to appropriate databases directly.

- **Create queries** controls whether tenant users can create queries on the data they see. If you want to give your tenant users the ability to drill through (e.g. through `drills` parameter in [modular embedding](LINK)), you need to give them "Create queries" permissions, because a drill through is a new query.

- **Download results** controls, unsurprisingly, whether people can download results of queries. You need to set download permissions if you want to give your users the option to download their data as a spreadsheet (for example, through `with-downloads` parameter in [modular embedding](LINK))

Data permissions in Metabase are can be specified on database or table level and are granted to groups. You'll need to use the special **All tenant users**, and your tenant groups (if any) to assign data permissions. Keep in mind that Metabase permissions are additive, so if someone is a member of two different groups, they will be granted the _most_ permissive access. In particular, if "All tenant users" has "Can view" access to an entire table, but another tenant group has restricted access (e.g. "Row and column security"), then the users of the tenant group will still see all the data in the table because they get it via the "All tenant users" group. If you're using tenant groups, we recommend revoking access for "All tenant users" and configuring access on group-by-group basis.

Please review [Data permissions documentation](LINK) for more details on permissions setup.

### Use tenant attributes for data permissions

[Row and column security](LINK), [Impersonation](LINK), and Database routing require user attributes. You can [specify custom tenant attributes](LINK) to configure data permissions based on attribute values. See [Tenant attributes](LINK). Alternatively, you can use the special tenant slug attribute, see [Special slug attribute](LINK).

## Collection permissions for tenants

Collection permissions control which entities (dashboards, questions, models etc) people can see.

To configure what _data_ can people see in those entities, and what they can do with that data, see [Data permissions](LINK) instead.

In Metabase, there are 3 levels of collection permissions: **No** access, **View**-only access, and **Curate** access (allows for creating and saving new entities like dashboards). For more general information about collection permissions in Metabase, see [Collection permissions](LINK).

Permissions are granted to groups. Which permissions are available to each group depend on the type of the group (external/tenant or internal) and the type of the collection.

### Tenant user collection permissions

- For **internal collection**, tenant users will have **No** access.
- For **shared collections**, tenant users can only have **View** or **No** access. This means that at _most_, tenant users can can see existing entities but not create new ones.

  Different tenant groups can have different levels access to different shared collections. For example, you can have a "Basic analytics" shared collection viewable by all users, and "Advanced analytics" collection only viewable by tenant group "Premium users".

  See [Configuring shared collection permissions](LINK).

- For **tenant collections**, tenant users will always have **Curate** permissions, which means that tenant users will always be able to save new questions in their tenant collection.

  If you don't want your tenant users to create and save their own charts, you'll need to disable "Create queries" [data permissions](LINK) for tenant users, and, if you're embedding Metabase, configure the embedded UI components to disable saving.

- For their own **personal collections**, tenant users will always have **Curate** permissions.

### Internal user collection permissions

- Metabase Admins will have **Curate** access to all shared collections and all tenant collections.
- Other internal groups can be granted **View** or **Curate** access to **shared collections**, see [Configuring shared collection permissions](LINK),
- Non-admin internal users will have **No** access to tenant-specific collections. Currently, this can't be configured.

For configuring permissions to _internal_ collections for internal users, see [general docs on collection permissions](LINK)

### Configuring shared collections permissions

To configure access to shared collections for tenant and internal groups, go to **Admin settings > Permissions > Shared collections**.

You can configure access for each shared collections and their subcollections for both internal and external users. See general docs on [collection permissions](LINK).

Special **Root shared collection** controls who has access to _all_ shared collections. For example, if you want to make sure you internal users don't have access to any tenant shared collections, you can revoke permissions from Root shared collection.

When configuring permissions, remember that in Metabase, all permissions are additive, so if someone is a member of two different groups, they will be granted the _most_ permissive access. In particular, if "All tenant users" has "View" access to a shared collection, but another tenant group has "No" access to that collection specified in the permission settings, the users of the tenant group will still get "View" access because they have it via the "All tenant groups". If you're using tenant groups, we recommend revoking access for "All tenant users" and configuring access on group-by-group basis.

[SCREENSHOT]

## Subscription permissions for tenants

By default, all tenant users will be created with **No** [subscription permissions](LINK). If you want your users to be able to create subscriptions (either in full-app embedding, modular embedding, or by logging in directly to Metabase), you'll need to change the Subscription and alerts permissions to "Yes".

## Deactivate a tenant

**Deactivating a tenant will also deactivate all users who belong to this tenant**.

To deactivate a tenant:

1. Go to **Admin settings > People**.
2. Select **Tenants** on the left sidebar.
3. Click on **three dots** next to the tenant.
4. Choose **Deactivate tenant**

All tenant users will be deactivated and won't be able to sign in anymore. Tenant users will not be permanently deleted (Metabase does not delete users, only deactivates), so even though the tenant users will be deactivated, you won't be able to create new users with the same email.

## Changing tenant strategy

### From single-tenant to multi-tenant

When you enable multi-tenant strategy, all users that currently exist in Metabase will be considered "internal" users. If you don't want any of those users to become [tenant users](tenant), you can just proceed with tenant setup as if you had a fresh new instance (create tenants, create collections, set up permissions, etc).

However, if you want to assign some existing users to tenants, you'll need to:

1. Mark them as tenant users using the API call:

   ```
   PUT /api/user/:id
   {"tenant_id": 1}
   ```

2. If you're using JWT for SSO, [add a `@tenant` claim to your JWT](LINK).
3. Set up [tenant groups][LINK], [data permissions][LINK], and [collection permissions](LINK) because you won't be able to use existing internal groups for tenant permissions.

### From multi-tenant to single-tenant

If you disable multi-tenant strategy, _all your tenant users will be deactivated_ and _all collections will be deleted_ (although you'll get both users and collections back if you reactivate multi-tenant strategy later). So if you want to wish to keep the active users but just disable tenancy features, you'll need some extra prep.

1. Replicate the tenant setup you have with regular groups and collections (instead of tenant groups and shared collections). Review documentation for Data permissions, Collection permissions, and User groups. Make sure to thoroughly test your setup with test users. A [development instance](LINK) might come in handy.
2. If you're using any tenant groups, remove the tenant group memberships of all tenant users.
3. Change the tenant users to internal users using API:

   ```
   PUT /api/user/:id
   {"tenant_id": null}
   ```

4. Finally, disable the feature once everything is verified to work

If you don't do step 3, all your users will be deactivated.

## End user experience

End users who are members of tenants will not know that they are members of tenants.
In the experiences that expose users to to Metabase collections (e.g. when using full-app embedding, modular embedding components with save enabled, or if tenant users are logging in directly into metabase), tenant users see all the tenant and shared collections they have access to as just collections:

[SCREENSHOT]

## Limitations

- **Tenant collections and personal collections can't be disabled**.

  If you don't want your tenant users to create and save their own charts, you can disable "Create queries" [data permissions](LINK), and, if you're embedding Metabase, configure the embedded UI components to disable saving.

- **Tenant users can't change tenants.** Once an external user is assigned to a tenant, they cannot switch to another tenant.

- **If you disable multi-tenant strategy, deactivated tenant users will not show up in 'Deactivated users**, but Metabase will still keep track of them and won't allow creating new users with the same email. If you want to

- **There are no tenant-specific groups**. Tenant groups are are shared between all tenants. If you need a special group for just some of your tenants, create a tenant group but don't add any members from the tenants that the group isn't applicable to.

## Further reading

- Embedding overview
- JWT authentication
- Permissions overview
