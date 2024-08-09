---
title: "SSO"
summary: |
  `/auth/sso` Routes.
  
    Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
    we can have a uniform interface both via the API and code.
---

# SSO

`/auth/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code.

## `GET /auth/sso/`

SSO entry-point for an SSO user that has not logged in yet.

### PARAMS:

-  **`req`**

## `POST /auth/sso/`

Route the SSO backends call with successful login details.

### PARAMS:

-  **`req`**

## `POST /auth/sso/handle_slo`

Handles client confirmation of saml logout via slo.

### PARAMS:

-  **`req`**

## `POST /auth/sso/logout`

Logout.

### PARAMS:

-  **`cookies`** map where {metabase.SESSION -> <map where {:value -> <value must be a non-blank string.>}>}.

---

[<< Back to API index](../../api-documentation.md)