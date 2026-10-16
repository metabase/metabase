---
id: troubleshoot-login-sso
title: People can't log in (passwords, SSO, LDAP)
description: Login failures, SAML/JWT/OIDC/Google sign-in problems, or LDAP authentication and group-sync issues.
references:
  - troubleshooting-guide/cant-log-in.md
  - troubleshooting-guide/saml.md
  - troubleshooting-guide/ldap.md
  - people-and-groups/authenticating-with-saml.md
  - people-and-groups/ldap.md
  - people-and-groups/google-sign-in.md
---
1. Ask which login method they use and whether it affects everyone or specific people.
2. Everyone: suspect configuration (certificates, URLs, identity provider settings). Specific people: suspect the user account (deactivated, wrong email, group mapping).
3. Use the matching troubleshooting guide. Never ask for passwords, certificates' private keys or client secrets.
