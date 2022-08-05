---
title: "Revision"
summary: |
  API endpoints for Revision.
---

# Revision

API endpoints for Revision.

  - [GET /api/revision/](#get-apirevision)
  - [POST /api/revision/revert](#post-apirevisionrevert)

## `GET /api/revision/`

Get revisions of an object.

### PARAMS:

*  **`entity`** value must be one of: `card`, `dashboard`.

*  **`id`** value must be an integer.

## `POST /api/revision/revert`

Revert an object to a prior revision.

### PARAMS:

*  **`entity`** value must be one of: `card`, `dashboard`.

*  **`id`** value must be an integer.

*  **`revision_id`** value must be an integer.

---

[<< Back to API index](../api-documentation.md)