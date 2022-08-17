---
title: "People and groups"
redirect_from:
  - /docs/latest/administration-guide/sso
---

# People and groups

## [Editing your account settings](./account-settings.md)

Edit your profile and password, and view your login history.

## [Managing people and groups](./managing.md)

## Authentication

### Setting up Single Sign-on (SSO)

We recommend that you set up [Single Sign-on][sso-def] for your Metabase installation.

### SSO for Metabase Open Source Edition

- [Google Sign-in][google-sign-in]
- [LDAP][ldap]

### SSO for Metabase paid plans

With some paid plans, you have more options to help orchestrate lots of people and groups.

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

[azure-ad]: ./saml-azure-ad.md
[google-sign-in]: ./google-and-ldap.md#enabling-google-sign-in
[jwt]: ./authenticating-with-jwt
[ldap]: ./google-and-ldap.md#enabling-ldap-authentication
[ldap-group-membership-filter]: ./google-and-ldap.md#ldap-group-membership-filter
[ldap-user-attributes]: ./google-and-ldap.md#syncing-user-attributes-with-ldap
[saml-okta]: ./saml-okta.md
[saml]: ./authenticating-with-saml.md
[saml-auth0]: ./saml-auth0.md
[saml-google]: ./saml-google.md
[saml-keycloak]: ./saml-keycloak.md
[sso-def]: /glossary/sso
