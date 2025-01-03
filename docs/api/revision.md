---
title: "Revision"
summary: |
  API endpoints for Revision.
---

# Revision

> You can view live OpenAPI docs in your own running Metabase at `/api/docs`.
   So if your Metabase is at https://www.your-metabase.com you could view
   the API docs at https://www.your-metabase.com/api/docs.

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