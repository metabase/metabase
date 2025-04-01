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
2. Create a user from **Manage** > **Users**. You'll need to populate the fields with an email, first name, and last name.
3. Once you've created at least one user, navigation tabs will appear at the top of the **Users** page. Go to **Credentials** to set password for your user.
   - Turn off the **Temporary** toggle.
   - Click **Set Password** to save your changes.
4. Create a new SSO client from **Manage** > **Clients** > **Create**

   - **Client ID**: Enter `metabase` in lowercase.
   - **Client type**: Select `SAML` from the dropdown.
   - Click **Next**.
   - **Valid Redirect URIs**: The URL where you are hosting your Metabase instance followed by a slash (/) and an asterisk (*). For example, if you are hosting Metabase locally at `http://localhost:3000`, the URL would be `http://localhost:3000/*`.
   - **Home URL**: In your Metabase, go to **Admin settings** > **Authentication** > **SAML**. You'll find your Home URL in the field **URL the IdP should redirect back to**.
   - Click **Save**.

5. (Optional, but recommended on test environments) Disable key signing for SSO client. See [settings for signing SSO requests](https://www.metabase.com/docs/latest/people-and-groups/authenticating-with-saml#settings-for-signing-sso-requests-optional).

   - Click **Keys** tab.
   - **Client signature required:** Off.

6. Map user attributes from Metabase to SSO client.
   - Click **Client scopes** tab.
   - Click `metabase-dedicated`.
   - Click **Add predefined mappers**.
   - [Map attributes from users in Keycloak to Metabase](#mapping-attributes-from-users-in-keycloak-to-metabase).
7. Configure the service provider (Metabase) from **Configure** > **Realm Settings**.
   - From **Endpoints**, select “SAML 2.0 Identity Provider Metadata”.
   - An XML file will open in a new tab.
   - Keep this for reference, we will use it in the next section to configure Metabase.

## Mapping fields from Keycloak to Metabase

1. Go to your Metabase **Admin settings** > **Authentication** > **SAML**.
2. From the XML file from Step 7 above:
   - **SAML Identity Provider URL**: Insert the URL that appears right after the following string: `Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location=`
   - **SAML Identity Provider Issuer**: Insert the URL that appears right after `entityID=`.
   - **SAML Identity Provider Certificate**: Input the long string that appears after the `<X509Certificate>` tag. Take care when inserting this string: if any letters or special characters are added or off, the setup won't work.
   - **SAML Application Name**: `metabase`
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

You can edit the attribute values from your Metabase **Admin settings** > **Authentication** > **SAML** > **Attributes**.

## Configure group mappings between Keycloak and Metabase

You can configure Metabase to automatically assign people to Metabase groups based on their Keycloak groups. 

### Set up group mapping in Keycloak

In your Keycloak client:

1. Click on **Client Scopes** tab 
2. Click on the **metabase-dedicated** client scope that has been created already.
3. Click on **Add Mapper > "By Configuration**.
4. Select **Group list**.
5. Change the name of the attribute to `member_of`.
6. Deselect the option to use the "Full group path" (so it's easier to configure in Metabase later).
7. Click on **Save**.

### Set up group mapping in Metabase

1. In Admin settings, go to **Authentication > SAML**.
2. In SAML settings, toggle on **Synchronize Group Memberships**
3. For each of the Keycloak groups, set up a new mapping to a Metabase group.

   Currently,  Keycloak groups will show up in Metabase with the slash character ("/") prepended to the group name. So, for example, a group named `sales` in Keycloak show up in Metabase as  `/sales`.

4. In **Group attribute name**, enter `member_of` (the name for the attribute with the group list in your Keycloack configuration).
## Troubleshooting SAML issues

For common issues, go to [Troubleshooting SAML](../troubleshooting-guide/saml.md).
