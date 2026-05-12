---
title: OIDC with Keycloak
summary: Step-by-step guide to setting up Keycloak as an OIDC identity provider for Metabase.
---

# OIDC with Keycloak

{% include plans-blockquote.html feature="OIDC authentication" %}

Keycloak is an open-source identity provider that supports [OpenID Connect (OIDC) authentication](./authenticating-with-oidc.md) out of the box.

1. [Set up OIDC in Keycloak](#set-up-oidc-in-keycloak) (the identity provider).
2. [Set up OIDC in Metabase](./authenticating-with-oidc.md#set-up-oidc-in-metabase) (the service provider).
3. [Sync groups from Keycloak to Metabase](#sync-groups-from-keycloak-to-metabase) (optional).

## Set up OIDC in Keycloak

Set up a realm, user, and client in Keycloak for Metabase.

1. In Keycloak, sign in as an administrator and go to the admin console.

2. Create a new [realm](https://www.keycloak.org/docs/latest/server_admin/index.html#core-concepts-and-terms) for Metabase.

3. Create a user in that realm from **Users** > **Add user**.

   1. Fill in **Email**, **First name**, and **Last name**. The email field is required because Metabase uses this email as the account identifier. Metabase maps these fields to user properties.
   2. Turn on **Email verified**. Without verification, Keycloak won't allow the person to log in.
   3. Make sure **Required user actions** is empty. If any actions are listed, remove them. Keycloak blocks login until required actions are completed.
   4. Click **Create**, then go to the user's **Credentials** (on the top menu, not the side menu).
   5. Click **Set password**, enter a password, and turn off the **Temporary** toggle.

4. Create a new client from **Clients** > **Create client**.

   1. Set **Client type** to `OpenID Connect`.
   2. Enter a **Client ID** (e.g., `metabase-client`).
   3. Click **Next**.

5. On the **Capability config** page:

   1. Turn on **Client authentication** (this makes the client confidential and enables the client secret).
   2. Turn on **Service accounts roles**. Metabase's **Check connection** test authenticates using the OAuth 2.0 client credentials grant, which requires service accounts. If service accounts aren't allowed, the test returns "the identity provider does not support the grant type used for testing".
   3. Click **Next**.

   > If you keep getting the "grant type" error even with **Service accounts roles** on, double-check the client secret in Metabase. You can check the Keycloak event log (**Events** in the Keycloak sidebar) for a `CLIENT_LOGIN_ERROR` entry to confirm (you'll need to have turned on [event logging](https://www.keycloak.org/docs/latest/server_admin/index.html#configuring-auditing-to-track-events)).

6. On the **Login settings** page:

   1. Set **Valid redirect URIs** to `{metabase-url}/auth/sso/{key}/callback`, where `{key}` is the key you'll use when configuring OIDC in Metabase (like `keycloak`).
   2. Set **Web origins** to your Metabase URL (like `https://metabase.your-company.com`).
   3. Click **Save**.

7. Go to the client's **Credentials** tab and copy the client secret.

## Set up OIDC in Metabase

If you're self-hosting Metabase, make sure you've set `MB_ENCRYPTION_SECRET_KEY` before enabling OIDC. See [OIDC-based authentication](./authenticating-with-oidc.md#self-hosted-metabases-must-set-an-encryption-key) for details.

Go to **Admin settings** > **Authentication** > **OIDC** and enter:

| Field             | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| **Key**           | e.g., `keycloak`                                        |
| **Login prompt**  | e.g., `Sign in with Keycloak`                           |
| **Issuer URI**    | `{keycloak-url}/realms/{realm-name}`                    |
| **Client ID**     | The Client ID from step 4                               |
| **Client Secret** | The client secret from the client's **Credentials** tab |

See [OIDC-based authentication](./authenticating-with-oidc.md#set-up-oidc-in-metabase) for more on the Issuer URI (including container/Docker networking considerations).

Click **Check connection**, then **Save and enable**.

If the connection check fails with "the identity provider does not support the grant type used for testing", check:

- **Service accounts are enabled**: Make sure **Service accounts roles** is on in Keycloak's **Capability config** settings for this client. (Requires **Client authentication** to be on first.)
- **You have the correct client secret**: In Keycloak, go to **Clients** > your client > **Credentials** tab, click **Regenerate**. Then re-enter the new secret in Metabase.

Check the [Keycloak event log](https://www.keycloak.org/docs/latest/server_admin/index.html#auditing-user-events) (**Events** in the Keycloak sidebar) for a `CLIENT_LOGIN_ERROR` entry to narrow down the issue. (You may need to enable event logging first under **Realm settings** > **Events** > **Event listeners**.)

- `unauthorized_client` means service accounts aren't enabled.
- `invalid_client` means the secret is wrong.

## Map attributes from Keycloak to Metabase

Keycloak's default OIDC claims (`email`, `given_name`, `family_name`) match Metabase's defaults, so no extra configuration is needed. See [Attribute mapping](./authenticating-with-oidc.md#attribute-mapping).

## Sync groups from Keycloak to Metabase

You can configure Keycloak to include a groups claim in the OIDC token, then set up Metabase to sync group memberships based on that claim.

### Add a groups claim in Keycloak

1. In the Keycloak admin console, go to **Clients** and select your Metabase client (e.g., `metabase-client`).
2. Go to the **Client scopes** tab and click the dedicated scope (e.g., `metabase-client-dedicated`).
3. Click **Add mapper** > **By configuration**.
4. Select **Group Membership** from the list.
5. Configure the mapper:
   - **Name**: `groups` (or any descriptive name).
   - **Token Claim Name**: `groups`. This is the claim name Metabase will look for. It must match the **Group attribute name** you set in Metabase.
   - **Full group path**: When on, group names include the full path (e.g., `/engineering`). The group name in your Metabase mapping must exactly match the value in the token.
   - **Add to ID token**: On.
6. Click **Save**.

### Configure group sync in Metabase

Once Keycloak includes the groups claim in the token, set up the mapping in Metabase. See [Configure group sync in Metabase](./authenticating-with-oidc.md#configure-group-sync-in-metabase) for the steps.

## Verify the setup

1. Open an incognito window and go to your Metabase URL. The sign-in screen should show a button with your login prompt text.
2. Click the button. You should be redirected to Keycloak's login page.
3. Log in with the user you created. Metabase should create the account and log you in. If you've configured group sync, check that they've been added to the correct group.
