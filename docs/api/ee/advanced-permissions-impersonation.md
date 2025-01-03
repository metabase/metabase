---
title: "Advanced permissions impersonation"
summary: |
  API endpoints for Advanced permissions impersonation.
---

# Advanced permissions impersonation

> You can view live OpenAPI docs in your own running Metabase at `/api/docs`.
   So if your Metabase is at https://www.your-metabase.com you could view
   the API docs at https://www.your-metabase.com/api/docs.

API endpoints for Advanced permissions impersonation.

## `DELETE /api/ee/advanced-permissions/impersonation/:id`

Delete a Connection Impersonation entry.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/ee/advanced-permissions/impersonation/`

Fetch a list of all Impersonation policies currently in effect, or a single policy if both `group_id` and `db_id`
  are provided.

You must be a superuser to do this.

### PARAMS:

-  **`group_id`** nullable value must be an integer greater than zero.

-  **`db_id`** nullable value must be an integer greater than zero.

---

[<< Back to API index](../../api-documentation.md)