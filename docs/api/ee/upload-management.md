---
title: "Upload management"
summary: |
  API endpoints for Upload management.
---

# Upload management

API endpoints for Upload management.

## `DELETE /api/ee/upload-management/tables/:id`

Delete the uploaded table from the database, optionally archiving cards for which it is the primary source.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`archive-cards`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/ee/upload-management/tables`

Get all `Tables` visible to the current user which were created by uploading a file.

---

[<< Back to API index](../../api-documentation.md)