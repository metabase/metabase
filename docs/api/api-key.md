---
title: "API key"
summary: |
  /api/api-key endpoints for CRUD management of API Keys.
---

# API key

/api/api-key endpoints for CRUD management of API Keys.

## `DELETE /api/api-key/:id`

Delete an ApiKey.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/api-key/`

Get a list of API keys. Non-paginated.

You must be a superuser to do this.

## `GET /api/api-key/count`

Get the count of API keys in the DB.

You must be a superuser to do this.

### PARAMS:

-  **`_body`**

## `POST /api/api-key/`

Create a new API key (and an associated `User`) with the provided name and group ID.

You must be a superuser to do this.

### PARAMS:

-  **`group_id`** value must be an integer greater than zero.

-  **`name`** value must be a non-blank string.

-  **`_body`**

## `PUT /api/api-key/:id`

Update an API key by changing its group and/or its name.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`group_id`** nullable value must be an integer greater than zero.

-  **`name`** nullable value must be a non-blank string.

-  **`_body`**

## `PUT /api/api-key/:id/regenerate`

Regenerate an API Key.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)