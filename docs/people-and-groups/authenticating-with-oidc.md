---
title: OIDC-based authentication
summary: Connect an OpenID Connect (OIDC) identity provider to Metabase for SSO login, automatic account provisioning, and user attribute mapping.
---

# OIDC-based authentication

{% include plans-blockquote.html feature="OIDC authentication" %}

By integrating your Open ID Connect (OIDC) provider with Metabase, you can:

- [Provision a Metabase account](#user-provisioning) when someone logs in via your identity provider (IdP).
- Let people access Metabase without re-authenticating.
- Automatically pass user attributes (name, email) from your IdP to Metabase.

## If you're self-hosting Metabase, you must encrypt your database credentials

> Metabase Cloud encrypts credentials by default, so this section only applies to self-hosted Metabases.

[`MB_ENCRYPTION_SECRET_KEY`](../configuring-metabase/environment-variables.md#mb_encryption_secret_key) must be set before enabling OIDC. Metabase uses this key to encrypt the OIDC state cookie. Without it, Metabase will return a 500 error when a person tries to log in via OIDC.

Set this key in your environment before starting Metabase:

```
MB_ENCRYPTION_SECRET_KEY=your-secret-key-at-least-16-characters
```

Once you set an encryption key, don't remove it. Metabase encrypts values in the database with this key and will refuse to start without it.

For more, see [Encrypting your database connection](../databases/encrypting-details-at-rest.md).

## Set up OIDC in Metabase

_Admin > Settings > Authentication > OIDC_

To add an OIDC provider to your Metabase, go to **Admin > Settings > Authentication > OIDC**. You'll need to input the following:

| Field             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key**           | A unique identifier for this provider. Lowercase letters, numbers, and hyphens only. Can't be changed after creation. Use a name that describes the provider (e.g., `keycloak` ), not the application. Metabase constructs the redirect URI as `{site-url}/auth/sso/{key}/callback` . Configure this exact URI in your IdP, so choose the key _before_ configuring your IdP for Metabase. The full redirect URI is shown in the admin UI after you enter the key. |
| **Login prompt**  | The button label on Metabase's sign-in screen. You can put something like "Sign in with Keycloak", or "Ye who wish to enter Metabase".                                                                                                                                                                                                                                                                                                                           |
| **Issuer URI**    | Your IdP's issuer URI. Metabase fetches the discovery document from `{issuer-uri}/.well-known/openid-configuration` . This request is made from Metabase's server, not from the browser. In containerized deployments (like Docker), the URI must be reachable from Metabase's container, not just from your browser.                                                                                                                                            |
| **Client ID**     | The Client ID assigned for Metabase in your OIDC provider.                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Client Secret** | The client secret from your OIDC provider. When editing an existing configuration, leave this blank to keep the current value.                                                                                                                                                                                                                                                                                                                                   |

## Optional settings

**Scopes**: The OIDC scopes to request. In the admin UI, enter scopes as a comma-separated string (e.g., `openid, email, profile`). Defaults to `openid, email, profile`. Most providers don't require changes here. If you're setting this with the `MB_OIDC_PROVIDERS` environment variable JSON, use an array (e.g., `["openid", "email", "profile"]`).

## Attribute mapping

Metabase maps OIDC claims to account fields. The defaults work for most providers:

| Metabase field | Default claim |
| -------------- | ------------- |
| Email          | `email`       |
| First name     | `given_name`  |
| Last name      | `family_name` |

If your IdP uses different claim names, update these fields to match.

## Check connection

The **Check connection** button verifies two things: 1) that Metabase can fetch the discovery document from your Issuer URI, and 2) that the client credentials are valid.

If the check reports "OIDC discovery succeeded, but credentials could not be verified", this could mean you need to configure the client to support the grant type Metabase uses for testing. In a Keycloak client, for example, you should turn on **Service accounts roles** and **Client authentication**.

## User provisioning

By default, Metabase creates accounts for people who authenticate successfully via OIDC but don't yet have a Metabase account. Metabase uses the email claim to identify and create accounts, so the `email` scope must be included in what your IdP returns.

You can turn auto-provisioning off under **Admin settings** > **Authentication** > **OpenID Connect** > **User provisioning**. If you've set up [User provisioning with SCIM](./user-provisioning.md), turn off automatic account creation to avoid conflicts.

### Auto-provisioning will link existing accounts or create a new account

If auto-provisioning is on, when someone logs in via OIDC, Metabase will look up the account by email (case-insensitive). If an account with that email already exists, Metabase links the OIDC identity to that existing account. On each OIDC login, Metabase updates the account's name from the IdP's claims. Otherwise, Metabase will create a new account automatically.

If no matching account exists, and auto-provisioning is off, the person gets an error, and can't log in.

## Environment variables

You can also configure OIDC via environment variables instead of the admin UI:

- [`MB_OIDC_ALLOWED_NETWORKS`](../configuring-metabase/environment-variables.md#mb_oidc_allowed_networks): controls which networks OIDC requests are allowed to reach. Possible values: `allow-all` (default), `allow-private`, or `external-only`.
- [`MB_OIDC_USER_PROVISIONING_ENABLED`](../configuring-metabase/environment-variables.md#mb_oidc_user_provisioning_enabled): toggle auto-provisioning (`true` by default).
- [`MB_OIDC_PROVIDERS`](../configuring-metabase/environment-variables.md#mb_oidc_providers): JSON string containing the full provider configuration. The value is an array of provider objects:

```json
[
  {
    "key": "keycloak",
    "login-prompt": "Sign in with Keycloak",
    "issuer-uri": "http://keycloak:2666/realms/metabase",
    "client-id": "metabase-client",
    "client-secret": "metabase-client-secret",
    "scopes": ["openid", "email", "profile"],
    "enabled": true,
    "attribute-map": {
      "email": "email",
      "first_name": "given_name",
      "last_name": "family_name"
    }
  }
]
```

| Field             | Required | Default                          |
| ----------------- | -------- | -------------------------------- |
| **key**           | Yes      |                                  |
| **login-prompt**  | Yes      |                                  |
| **issuer-uri**    | Yes      |                                  |
| **client-id**     | Yes      |                                  |
| **client-secret** | Yes      |                                  |
| **enabled**       | No       | `true`                           |
| **scopes**        | No       | `["openid", "email", "profile"]` |
| **attribute-map** | No       | See attribute map above          |

See [Environment variables](../configuring-metabase/environment-variables.md).

## Disable password logins

> **Avoid locking yourself out.** Disabling password logins applies to all accounts, including your Metabase admin account. Before doing this, verify that you can log in with SSO.

To require SSO for all logins, go to **Admin settings** > **Authentication** and turn off **Enable Password Authentication**.

## OIDC example provider guide

See a guide for setting up OIDC with [Keycloak](./oidc-keycloak.md).
