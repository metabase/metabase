---
title: "Sandbox table"
summary: |
  API endpoints for Sandbox table.
---

# Sandbox table

API endpoints for Sandbox table.

## `GET /api/table/:id/query_metadata`

This endpoint essentially acts as a wrapper for the OSS version of this route. When a user has sandboxed permissions
  that only gives them access to a subset of columns for a given table, those inaccessable columns should also be
  excluded from what is show in the query builder. When the user has full permissions (or no permissions) this route
  doesn't add/change anything from the OSS version. See the docs on the OSS version of the endpoint for more
  information.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include_sensitive_fields`** nullable value must be a valid boolean string ('true' or 'false').

-  **`include_hidden_fields`** nullable value must be a valid boolean string ('true' or 'false').

-  **`include_editable_data_model`** nullable value must be a valid boolean string ('true' or 'false').

---

[<< Back to API index](../../api-documentation.md)