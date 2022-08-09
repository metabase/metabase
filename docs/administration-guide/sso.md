---
title: Setting up Single Sign-on (SSO)
---

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
  - [Auth0][saml-auth0]
  - [Azure AD][azure-ad]
  - [Google][saml-google]
  - [Keycloak][saml-keycloak]
  - [Okta][saml-okta] 

[azure-ad]: ../enterprise-guide/authenticating-with-saml-azure-ad.html
[google-sign-in]: ./10-single-sign-on.html#enabling-google-sign-in
[jwt]: ../enterprise-guide/authenticating-with-jwt
[ldap]: ./10-single-sign-on.html#enabling-ldap-authentication
[ldap-group-membership-filter]: ./10-single-sign-on.html#ldap-group-membership-filter
[ldap-user-attributes]: ./10-single-sign-on.html#syncing-user-attributes-with-ldap
[saml-okta]: ../enterprise-guide/saml-okta.html
[saml]: ../enterprise-guide/authenticating-with-saml.html
[saml-auth0]: ../enterprise-guide/saml-auth0.html
[saml-google]: ../enterprise-guide/saml-google.html
[saml-keycloak]: ../enterprise-guide/saml-keycloak.html
[sso-def]: /glossary/sso.html
