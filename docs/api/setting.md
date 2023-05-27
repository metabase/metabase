---
title: "Setting"
summary: |
  /api/setting endpoints.
---

# Setting

/api/setting endpoints.

## `GET /api/setting/`

Get all `Settings` and their values. You must be a superuser or have `setting` permission to do this.
  For non-superusers, a list of visible settings and values can be retrieved using the /api/session/properties endpoint.

## `GET /api/setting/:key`

Fetch a single `Setting`.

### PARAMS:

*  **`key`** value must be a non-blank string.

## `PUT /api/setting/`

Update multiple `Settings` values. If called by a non-superuser, only user-local settings can be updated.

### PARAMS:

*  **`settings`**

## `PUT /api/setting/:key`

Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`.

### PARAMS:

*  **`key`** value must be a non-blank string.

*  **`value`**

---

[<< Back to API index](../api-documentation.md)