---
title: "SSO"
summary: |
  `/auth/sso` Routes.  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so we can have a uniform interface both via the API and code.
---

# SSO

`/auth/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code.

  - [GET /auth/sso/](#get-authsso)
  - [POST /auth/sso/](#post-authsso)

## `GET /auth/sso/`

SSO entry-point for an SSO user that has not logged in yet.

### PARAMS:

*  **`req`**

## `POST /auth/sso/`

Route the SSO backends call with successful login details.

### PARAMS:

*  **`req`**

---

[<< Back to API index](../../api-documentation.md)