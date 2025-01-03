---
title: "Setting"
summary: |
  /api/setting endpoints.
---

# Setting

> You can view live OpenAPI docs in your own running Metabase at `/api/docs`.
   So if your Metabase is at https://www.your-metabase.com you could view
   the API docs at https://www.your-metabase.com/api/docs.

/api/setting endpoints.

## `GET /api/setting/`

Get all `Settings` and their values. You must be a superuser or have `setting` permission to do this.
  For non-superusers, a list of visible settings and values can be retrieved using the /api/session/properties endpoint.

## `GET /api/setting/:key`

Fetch a single `Setting`.

### PARAMS:

-  **`key`** keyword.

## `PUT /api/setting/`

Update multiple `Settings` values. If called by a non-superuser, only user-local settings can be updated.

### PARAMS:

-  **`settings`** map from <keyword> to <anything>.

## `PUT /api/setting/:key`

Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`.

### PARAMS:

-  **`key`** keyword.

-  **`value`**

---

[<< Back to API index](../api-documentation.md)