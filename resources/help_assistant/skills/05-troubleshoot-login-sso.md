---
id: troubleshoot-login-sso
title: People can't log in (passwords, SSO, LDAP)
description: People can't log in, password resets don't work, or SAML, JWT, OIDC, Google sign-in or LDAP login or group sync fails.
references:
  - troubleshooting-guide/cant-log-in.md
  - troubleshooting-guide/saml.md
  - troubleshooting-guide/ldap.md
  - people-and-groups/authenticating-with-saml.md
  - people-and-groups/authenticating-with-jwt.md
  - people-and-groups/authenticating-with-oidc.md
  - people-and-groups/ldap.md
  - people-and-groups/google-sign-in.md
---
Never ask for passwords, private keys or client secrets.

Ask one question at a time, and skip any the user has already answered.

First questions, in this order:
1. Which login method: password, SAML, JWT, OIDC, Google or LDAP?
2. Is it everyone, or specific people?
3. The exact error message, if there is one.
4. Is this a new setup, or did it work before?

Causes to check, most common first:

Everyone, new setup
- The settings don't match between Metabase and the identity provider: the issuer or entity ID, the SSO URL, or the certificate. The SAML troubleshooting page walks through each.

Everyone, worked before
- The identity provider's certificate was rotated or expired.
- Metabase's site URL changed.

Specific people
- Their account is deactivated.
- Their email in the identity provider doesn't match their Metabase account.
- Group mapping puts them in the wrong groups.

Passwords
- Use the password reset and "no access to the login page" sections of the login troubleshooting page.
- On Metabase Cloud, logging in to the Cloud account (billing) is separate from logging in to the Metabase instance.
