---
title: Assigning tenant users to tenants
description: How to automatically assign users to tenants using SSO authentication (JWT and SAML).
---

# Assigning tenant users to tenants

{% include plans-blockquote.html feature="Tenants" %}

If you're running a multi-tenant application, you can assign users to tenants based on a claim in the JWT token.

## Prerequisites

- Multi-tenant user strategy must be enabled in Metabase
- JWT authentication must be configured

## How it works

When a user logs in with JWT:

1. Metabase reads the tenant identifier from the JWT claim. By default, this is the `@tenant` key.
2. If the tenant doesn't exist, Metabase automatically creates it
3. New users are automatically assigned to the tenant from their JWT

## Example JWT with tenant claim

```json
{
  "email": "user@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "@tenant": "acme-corp"
}
```

## Important restrictions

**Users cannot change tenants.** Once an external user is assigned to a tenant, they cannot switch to other tenant.

If a user attempts to log in with mismatched tenant information, they will receive one of these errors:

- `Cannot add tenant claim to internal user` - JWT includes a tenant, but the user is an internal user. Only tenant users can have a tenant.
- `Tenant claim required for external user` - JWT lacks a tenant claim, but the user is an external user.
- `Tenant ID mismatch with existing user` - JWT has a different tenant than the user's assigned tenant
- `Tenant is not active` - The tenant exists but has been deactivated

# Configuring the tenant claim

By default, Metabase looks for a `@tenant` key in your JWT. You can customize this:

1. Go to **Admin** > **Settings** > **Authentication** > **JWT** > **User attribute configuration**
2. Change the **Tenant assignment attribute** key to your preferred identifier.
