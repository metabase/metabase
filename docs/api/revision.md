---
title: "Revision"
summary: |
  API endpoints for Revision.
---

# Revision

API endpoints for Revision.

## `GET /api/revision/`

Get revisions of an object.

### PARAMS:

-  **`entity`** enum of card, dashboard.

-  **`id`** value must be an integer greater than zero.

## `POST /api/revision/revert`

Revert an object to a prior revision.

### PARAMS:

-  **`entity`** enum of card, dashboard.

-  **`id`** value must be an integer greater than zero.

-  **`revision_id`** value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)