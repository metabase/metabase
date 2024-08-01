---
title: "Advanced permissions impersonation"
summary: |
  API endpoints for Advanced permissions impersonation.
---

# Advanced permissions impersonation

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