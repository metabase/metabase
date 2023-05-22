---
title: "Google"
summary: |
  /api/google endpoints.
---

# Google

/api/google endpoints.

## `PUT /api/google/settings`

Update Google Sign-In related settings. You must be a superuser to do this.

### PARAMS:

*  **`google-auth-client-id`** value may be nil, or if non-nil, value must be a string.

*  **`google-auth-enabled`** value may be nil, or if non-nil, value must be a boolean.

*  **`google-auth-auto-create-accounts-domain`** value may be nil, or if non-nil, value must be a string.

---

[<< Back to API index](../api-documentation.md)