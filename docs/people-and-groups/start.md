---
title: "People overview"
redirect_from:
  - /docs/latest/administration-guide/sso
---

# People overview

User accounts, groups, and authentication. For permissions, see [Permissions overview](../permissions/start.md).

## [Editing your account settings](./account-settings.md)

Edit your profile and password, and view your login history.

## [Managing people and groups](./managing.md)

Admin controls for setting up user accounts and organizing them into groups.

## [Changing password complexity](./changing-password-complexity.md)

Make people use longer and more complex passwords.

## [Changing session expiration](./changing-session-expiration.md)

Tell Metabase how long it should wait before asking people to log in again.

## Authentication

Metabase offers several options for single sign-on (SSO) authentication.

> If you need to set up 2-step or multi-factor authentication (2FA or MFA) for your Metabase, consider using one of the SSO options below.

### SSO for Metabase Open Source and Starter plans

- [Google Sign-in][google-sign-in]
- [LDAP][ldap]

### SSO for Metabase Pro and Enterprise plans

With [Pro and Enterprise plans](https://www.metabase.com/pricing/), you have more options to help orchestrate lots of people and groups.

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

## [API keys](./api-keys.md)

Create keys to authenticate API calls.

[azure-ad]: ./saml-azure.md
[google-sign-in]: ./google-and-ldap.md#enabling-google-sign-in
[jwt]: ./authenticating-with-jwt.md
[ldap]: ./google-and-ldap.md#enabling-ldap-authentication
[ldap-group-membership-filter]: ./google-and-ldap.md#ldap-group-membership-filter
[ldap-user-attributes]: ./google-and-ldap.md#syncing-user-attributes-with-ldap
[saml-okta]: ./saml-okta.md
[saml]: ./authenticating-with-saml.md
[saml-auth0]: ./saml-auth0.md
[saml-google]: ./saml-google.md
[saml-keycloak]: ./saml-keycloak.md
[sso-def]: https://www.metabase.com/glossary/sso

## [Accessibility](./accessibility.md)

Notes on Metabase's accessibility.
