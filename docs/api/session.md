---
title: "Session"
summary: |
  /api/session endpoints.
---

# Session

/api/session endpoints.

## `DELETE /api/session/`

Logout.

### PARAMS:

-  **`metabase-session-id`**

## `GET /api/session/password_reset_token_valid`

Check if a password reset token is valid and isn't expired.

### PARAMS:

-  **`token`** value must be a non-blank string.

## `GET /api/session/properties`

Get all properties and their values. These are the specific `Settings` that are readable by the current user, or are
  public if no user is logged in.

## `POST /api/session/`

Login.

### PARAMS:

-  **`username`** value must be a non-blank string.

-  **`password`** value must be a non-blank string.

-  **`request`**

## `POST /api/session/forgot_password`

Send a reset email when user has forgotten their password.

### PARAMS:

-  **`email`** value must be a valid email address.

-  **`request`**

## `POST /api/session/google_auth`

Login with Google Auth.

### PARAMS:

-  **`token`** value must be a non-blank string.

-  **`request`**

## `POST /api/session/pulse/unsubscribe`

Allow non-users to unsubscribe from pulses/subscriptions, with the hash given through email.

### PARAMS:

-  **`email`** string.

-  **`hash`** string.

-  **`pulse-id`** value must be an integer greater than zero.

-  **`request`**

## `POST /api/session/pulse/unsubscribe/undo`

Allow non-users to undo an unsubscribe from pulses/subscriptions, with the hash given through email.

### PARAMS:

-  **`email`** string.

-  **`hash`** string.

-  **`pulse-id`** value must be an integer greater than zero.

-  **`request`**

## `POST /api/session/reset_password`

Reset password with a reset token.

### PARAMS:

-  **`token`** value must be a non-blank string.

-  **`password`** password is too common.

-  **`request`**

---

[<< Back to API index](../api-documentation.md)