---
title: "Model index"
summary: |
  API endpoints for Model index.
---

# Model index

> You can view live OpenAPI docs in your own running Metabase at `/api/docs`.
   So if your Metabase is at https://www.your-metabase.com you could view
   the API docs at https://www.your-metabase.com/api/docs.

API endpoints for Model index.

## `DELETE /api/model-index/:id`

Delete ModelIndex.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/model-index/`

Retrieve list of ModelIndex.

### PARAMS:

-  **`model_id`** value must be an integer greater than zero.

## `GET /api/model-index/:id`

Retrieve ModelIndex.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/model-index/`

Create ModelIndex.

### PARAMS:

-  **`model_id`** value must be an integer greater than zero.

-  **`pk_ref`** anything.

-  **`value_ref`** anything.

-  **`_model-index`**

---

[<< Back to API index](../api-documentation.md)