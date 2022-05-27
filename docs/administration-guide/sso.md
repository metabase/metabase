## Setting up Single Sign-on (SSO)

We recommend that you set up [Single Sign-on][sso-def] for your Metabase installation.

## SSO for Metabase Open Source Edition

- [Google Sign-in][google-sign-in]
- [LDAP][ldap]

## SSO for Metabase paid versions

With paid versions, you have more options to help manage lots of people and groups.

- [JWT][jwt]
- LDAP advanced features
  - [Group membership filter][ldap-group-membership-filter]
  - [Syncing user attributes][ldap-user-attributes]
- [SAML][saml]
  - [Setting up SAML with Auth0][saml-auth0]
  - [Setting up SAML with Google][saml-google]
  - [Setting up SAML with Keycloak][saml-keycloak]
  - [Okta documentation](https://developer.okta.com/docs/guides/saml-application-setup/overview/)
  - [OneLogin documentation](https://onelogin.service-now.com/support?id=kb_article&sys_id=83f71bc3db1e9f0024c780c74b961970)

[google-sign-in]: ./10-single-sign-on.html#enabling-google-sign-in
[jwt]: ../enterprise-guide/jwt.html
[ldap]: ./10-single-sign-on.html#enabling-ldap-authentication
[ldap-group-membership-filter]: ./10-single-sign-on.html#ldap-group-membership-filter
[ldap-user-attributes]: ./10-single-sign-on.html#syncing-user-attributes-with-ldap
[saml]: ../enterprise-guide/saml.html
[saml-auth0]: ../enterprise-guide/saml-auth0.html
[saml-google]: ../enterprise-guide/saml-google.html
[saml-keycloak]: ../enterprise-guide/saml-keycloak.html
[sso-def]: /glossary/sso.html
