# Enabling SSO with Keycloak
Keycloak is an open source platform that can be used as a user directory to save user data while acting as the IdP for single sign-on.


## Working in the Keycloak console
1. Go to the Keycloak admin console and sign in as an administrator.
2. Create a test user from **Manage** > **Users**. You'll need to populate the fields with an email, first name, and last name.
3. Once you've created at least one user, navigation tabs will appear at the top of the **Users** page. Go to **Credentials** to set password for your test user.
  - Turn off the **Temporary** toggle. 
  - Click **Set Password** to save your changes. 
4. Create a new SSO client from **Manage** > **Clients** > **Create**.
  - Client ID: Enter “metabase” in lowercase.
  - Client Protocol: Select “saml” from the dropdown.
  - Click **Save**.
5. Configure the SSO client from the form that appears after saving:
  - Client Signature Required: DISABLE
  - Valid Redirect URIs: URL where you are hosting your Metabase instance followed by
a slash (/) and an asterisk (*). For example, `http://localhost:3000/*`.
  - Base URL: “URL the IdP should redirect back to” under Metabase **Admin settings** > **Authentication** > **<your SSO provider>**. For example, `“http://localhost:3000/auth/sso”`.
  - Click **Save**.
6. Map user data to your SSO client from **Mappers** > **Add Builtin**.
  - [Mapping attributes from users in Keycloak to Metabase](#mapping-attributes-from-users-in-keycloak-to-metabase)
7. Configure the service provider (Metabase) from **Configure** > **Realm Settings**.
  - Look for **Endpoints** and select “SAML 2.0 Identity Provider Metadata”. An XML file will open in a new tab.
8. From the XML file, note the following:
  a. The URL that appears right after `md:SingleSignOnServiceBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location=`
  b. The URL that appears right after `“entityID”`.
  c. The long string that appears after the `<X509Certificate>` tag.


## Mapping fields from Keycloak to Metabase

1. Go to **Admin settings** > **Authentication** > **<your SSO provider>**.
2. Enter the information from step 8 above:
  - SAML Identity Provider URL: the URL from 8a.
  - SAML Identity Provider Issuer: the URL from 8b.
  - SAML Identity Provider Certificate: the string from 8c. Take care when inserting this string -- the setup won't work if any letters or special characters are wrong!
  - SAML Application Name: metabase
3. Click **Save Changes** button. Check that **SAML Authentication** is toggled ON at the top of the page.


## Mapping attributes from users in Keycloak to Metabase
Keycloak can import four user attributes by default: name, surname, email and role.

Let's say we want email, name, and surname to be passed between the client (Metabase) and the authentication server (Keycloak).

1. Select “X500 email”, “X500 givenName” and “X500 surname” with the checkboxes that are on the right side of the screen.
2. Click **Add Selected**.
3. Click **Edit** beside each attribute and make the following changes:
  - SAML Attribute Name: the name that Metabase expects to receive.
  - SAML Attribute NameFormat: select “Basic” from the dropdown menu.

Note: You can find the attribute values from **Admin settings** > **Authentication** > **<your SSO provider>** > **<Attributes>**.


## Check if SSO is working correctly
Go to your Metabase login page. If SSO is working correctly, you should see a single button to sign-in with your IdP. Once you are authenticated, you should be automatically redirected to the Metabase home page.

If you're having trouble, go to [Troubleshooting logins](../troubleshooting-guide/cant-log-in.md).