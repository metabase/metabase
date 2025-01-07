---
title: "User key value"
summary: |
  API endpoints for User key value.
---

# User key value

API endpoints for User key value.

## `DELETE /api/user-key-value/namespace/:namespace/key/:key`

Deletes a KV-pair for the user.

### PARAMS:

-  **`namespace`** 

-  **`key`**

## `GET /api/user-key-value/namespace/:namespace`

Returns all KV pairs in a given namespace for the current user.

### PARAMS:

-  **`namespace`** value must be a non-blank string.

## `GET /api/user-key-value/namespace/:namespace/key/:key`

Get a value for the user.

### PARAMS:

-  **`namespace`** value must be a non-blank string.

-  **`key`** value must be a non-blank string.

## `PUT /api/user-key-value/namespace/:namespace/key/:key`

Upsert a KV-pair for the user.

### PARAMS:

-  **`v`** anything.

-  **`expires_at`** nullable regex pattern matching #"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$", or regex pattern matching #"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|(?:[+-]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?))$".

-  **`namespace`** value must be a non-blank string.

-  **`k`** value must be a non-blank string.

---

[<< Back to API index](../api-documentation.md)