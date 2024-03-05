---
title: SAML with Keycloak
redirect_from:
  - /docs/latest/enterprise-guide/saml-keycloak
---

# SAML with Keycloak

Keycloak is an open source platform that can be used as a user directory to save user data while acting as the IdP for single sign-on.

1. [Set up SAML in Keycloak](#working-in-the-keycloak-console) (the identity provider).
2. [Set up SAML in Metabase](./authenticating-with-saml.md#enabling-saml-authentication-in-metabase) (the service provider).

For more information, check out our guide for [authenticating with SAML](./authenticating-with-saml.md).

## Working in the Keycloak console

1. Go to the Keycloak admin console and sign in as an administrator.
2. Create a test user from **Manage** > **Users**. You'll need to populate the fields with an email, first name, and last name.
3. Once you've created at least one user, navigation tabs will appear at the top of the **Users** page. Go to **Credentials** to set password for your test user.
    - Turn off the **Temporary** toggle.
    - Click **Set Password** to save your changes.
4. Create a new SSO client from **Manage** > **Clients** > **Create**.
    - **Client ID**: Enter “metabase” in lowercase.
    - **Client Protocol**: Select “saml” from the dropdown.
    - Click **Save**.
5. Configure the SSO client from the form that appears after saving:
    - **Client Signature Required**: DISABLE
    - **Valid Redirect URIs**: URL where you are hosting your Metabase instance followed by
     a slash (/) and an asterisk (*). For example, `http://localhost:3000/*`.
    - **Base URL**: Fill this in with the value under “URL the IdP should redirect back to” from your Metabase **Admin settings** > **Authentication** > **SAML**.
    - Click **Save**.
6. Map user data to your SSO client from **Mappers** > **Add Builtin**.
    - [Mapping attributes from users in Keycloak to Metabase](#mapping-attributes-from-users-in-keycloak-to-metabase)
7. Configure the service provider (Metabase) from **Configure** > **Realm Settings**.
    - From **Endpoints**, select “SAML 2.0 Identity Provider Metadata”.
    - An XML file will open in a new tab.
8. Configure the Single Logout service (if you intend to use Single Logout)
    1. in **Clients** > **Valid post logout redirect URIs** put your server's uri (this usually matches **Valid redirect URIs**)
    2. in **Clients** > **Advanced** > **Logout Service POST Binding URL** put your server URI appended with `/auth/sso/handle_slo`
9. From the XML file, note the following:
    1. The URL that appears right after the following string:
    ```
    md:SingleSignOnServiceBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location=
    ```
    2. The URL that appears right after `entityID`.
    3. The long string that appears after the `<X509Certificate>` tag.

## Mapping fields from Keycloak to Metabase

1. Go to your Metabase **Admin settings** > **Authentication** > **SAML**.
2. Enter the information from step 8 above:
    - **SAML Identity Provider URL**: the URL from 8.1.
    - **SAML Identity Provider Issuer**: the URL from 8.2.
    - **SAML Identity Provider Certificate**: the string from 8.3. Take care when inserting this string -- the setup won't work if any letters or special characters are wrong!
    - **SAML Application Name**: metabase
3. Click **Save Changes**.
4. Check that **SAML Authentication** is toggled **ON** at the top of the page.

## Mapping attributes from users in Keycloak to Metabase

Keycloak can import four user attributes by default: name, surname, email and role.

Let's say we want email, name, and surname to be passed between the client (Metabase) and the authentication server (Keycloak).

1. Select “X500 email”, “X500 givenName” and “X500 surname” from the checkboxes that are on the right side of the console.
2. Click **Add Selected**.
3. Click **Edit** beside each attribute and make the following changes:
    - **SAML Attribute Name**: the name that Metabase expects to receive.
    - **SAML Attribute NameFormat**: select “Basic” from the dropdown menu.

You can find the attribute values from your Metabase **Admin settings** > **Authentication** > **SAML** > **Attributes**.

## Troubleshooting SAML issues

For common issues, go to [Troubleshooting SAML](../troubleshooting-guide/saml.md).
