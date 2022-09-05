---
title: "Session"
summary: |
  /api/session endpoints.
---

# Session

/api/session endpoints.

  - [DELETE /api/session/](#delete-apisession)
  - [GET /api/session/password_reset_token_valid](#get-apisessionpassword_reset_token_valid)
  - [GET /api/session/properties](#get-apisessionproperties)
  - [POST /api/session/](#post-apisession)
  - [POST /api/session/forgot_password](#post-apisessionforgot_password)
  - [POST /api/session/google_auth](#post-apisessiongoogle_auth)
  - [POST /api/session/reset_password](#post-apisessionreset_password)

## `DELETE /api/session/`

Logout.

### PARAMS:

*  **`metabase-session-id`**

## `GET /api/session/password_reset_token_valid`

Check is a password reset token is valid and isn't expired.

### PARAMS:

*  **`token`** value must be a string.

## `GET /api/session/properties`

Get all global properties and their values. These are the specific `Settings` which are meant to be public.

## `POST /api/session/`

Login.

### PARAMS:

*  **`username`** value must be a non-blank string.

*  **`password`** value must be a non-blank string.

*  **`request`**

## `POST /api/session/forgot_password`

Send a reset email when user has forgotten their password.

### PARAMS:

*  **`email`** value must be a valid email address.

*  **`request`**

## `POST /api/session/google_auth`

Login with Google Auth.

### PARAMS:

*  **`token`** value must be a non-blank string.

*  **`request`**

## `POST /api/session/reset_password`

Reset password with a reset token.

### PARAMS:

*  **`token`** value must be a non-blank string.

*  **`password`** password is too common.

*  **`request`**

---

[<< Back to API index](../api-documentation.md)