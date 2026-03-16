---
title: OIDC with Keycloak
summary: Step-by-step guide to setting up Keycloak as an OIDC identity provider for Metabase.
---

# OIDC with Keycloak

{% include plans-blockquote.html feature="OIDC authentication" %}

Keycloak is an open-source identity provider that supports [OpenID Connect (OIDC) authentication](./authenticating-with-oidc.md) out of the box.

1. [Set up OIDC in Keycloak](#setting-up-a-client-and-user-in-the-keycloak-console) (the identity provider).
2. [Set up OIDC in Metabase](./authenticating-with-oidc.md#set-up-oidc-in-metabase) (the service provider).

## Setting up a client and user in the Keycloak console

Here's a basic user setup to help you test a connection.

1. Go to the Keycloak admin console and sign in as an administrator.

1. Create a new [realm](https://www.keycloak.org/docs/latest/server_admin/index.html#core-concepts-and-terms): click the realm selector in the top-left and select **Create realm**. Set the realm name (like `metabase` ) and click **Create**.

1. Create a user in that realm from **Users** > **Add user**.

- Fill in **Email**, **First name**, and **Last name**. The email field must be set. Metabase uses this email as the account identifier.
  - Turn on **Email verified**. Without verification, Keycloak won't allow the person to log in.
  - Make sure **Required user actions** is empty. If any actions are listed, remove them. Keycloak blocks login until required actions are completed.
  - Click **Create**, then go to the user's **Credentials** (on the top menu, not the side menu).
  - Click **Set password**, enter a password, and turn off the **Temporary** toggle.

1. Create a new client from **Clients** > **Create client**.

- **Client type**: Select `OpenID Connect` .
  - **Client ID**: Enter a name for the client (e.g., `metabase-client` ).
  - Click **Next**.

1. On the **Capability config** page:

- Turn on **Client authentication** (this makes the client confidential and enables the client secret).
  - Turn on **Service accounts roles**. Metabase's **Check connection** test authenticates using the OAuth 2.0 client credentials grant, which requires service accounts. If service accounts aren't allowed, the test returns "the identity provider does not support the grant type used for testing". If you keep getting this error even with the setting on, double-check the client secret in Metabase. You can check the Keycloak event log (**Events** in the Keycloak sidebar) for a `CLIENT_LOGIN_ERROR` entry to confirm (you'll need to have turned on [event logging](https://www.keycloak.org/docs/latest/server_admin/index.html#configuring-auditing-to-track-events)).
  - Click **Next**.

1. On the **Login settings** page:

- **Valid redirect URIs**: `{metabase-url}/auth/sso/{key}/callback` , where `{key}` is the key you'll use when configuring OIDC in Metabase (like `keycloak` ).
  - **Web origins**: Your Metabase URL (like `https://metabase.your-company.com` ).
  - Click **Save**.

1. Go to the clients **Credentials** tab and copy the client secret.

## Configure OIDC in Metabase

If you're self-hosting Metabase, make sure you've set `MB_ENCRYPTION_SECRET_KEY` before enabling OIDC. See [OIDC-based authentication](./authenticating-with-oidc.md#self-hosted-metabases-must-encrypt-database-credentials) for details.

Go to **Admin settings** > **Authentication** > **OIDC** and enter:

| Field             | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| **Key**           | e.g., `keycloak`                                        |
| **Login prompt**  | e.g., `Sign in with Keycloak`                           |
| **Issuer URI**    | `{keycloak-url}/realms/{realm-name}`                    |
| **Client ID**     | The Client ID from step 4                               |
| **Client Secret** | The client secret from the client's **Credentials** tab |

The Issuer URI must be reachable from Metabase's server (not just from your browser). In Docker setups, the URI must resolve from inside Metabase's container. See [OIDC-based authentication](./authenticating-with-oidc.md#set-up-oidc-in-metabase) for more on the Issuer URI.

Click **Check connection**, then **Save and enable**.

If the connection check fails with "the identity provider does not support the grant type used for testing", check:

- **That service accounts are enabled**: Go back to Step 5 and make sure **Service accounts roles** is on. (Requires **Client authentication** to be on first.)
- **You have the correct client secret**: In Keycloak, go to **Clients** > your client > **Credentials** tab, click **Regenerate**. Then re-enter the new secret in Metabase.

To confirm which cause applies, check the [Keycloak event log](https://www.keycloak.org/docs/latest/server_admin/index.html#auditing-user-events) (**Events** in the Keycloak sidebar) for a `CLIENT_LOGIN_ERROR` entry. (You may need to enable event logging first under **Realm settings** > **Events** > **Event listeners**.)

- `unauthorized_client` means service accounts aren't enabled
- `invalid_client` means the secret is wrong.

## Map attributes from Keycloak to Metabase

Keycloak's default OIDC claims ( `email` , `given_name` , `family_name` ) match Metabase's defaults, so no extra configuration is needed. See [Attribute mapping](./authenticating-with-oidc.md#attribute-mapping).

## Verify the setup

1. Open an incognito window and go to your Metabase URL. The sign-in screen should show a button with your login prompt text.
2. Click the button. You should be redirected to Keycloak's login page.
3. Log in with the user you created. Metabase should create the account and log you in.
