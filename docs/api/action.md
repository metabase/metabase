---
title: "Action"
summary: |
  `/api/action/` endpoints.
---

# Action

`/api/action/` endpoints.

## `DELETE /api/action/:action-id`

### PARAMS:

*  **`action-id`**

## `GET /api/action/`

Returns cards that can be used for QueryActions.

### PARAMS:

*  **`model-id`** value must be an integer greater than zero.

## `GET /api/action/:action-id`

### PARAMS:

*  **`action-id`**

## `POST /api/action/`

Create a new action.

### PARAMS:

*  **`visualization_settings`** value may be nil, or if non-nil, value must be a map.

*  **`parameters`** value may be nil, or if non-nil, value must be an array. Each value must be a map.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`error_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`database_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`name`** value must be a string.

*  **`response_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`template`** value may be nil, or if non-nil, value must be a map with schema: (
  body (optional) : value may be nil, or if non-nil, value must be a string.
  headers (optional) : value may be nil, or if non-nil, value must be a string.
  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.
  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.
  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.
  url : value must be a string.
)

*  **`type`** Unsupported action type

*  **`dataset_query`** value may be nil, or if non-nil, value must be a map.

*  **`model_id`** value must be an integer greater than zero.

*  **`kind`** value may be nil, or if non-nil, Unsupported implicit action kind

*  **`parameter_mappings`** value may be nil, or if non-nil, value must be a map.

*  **`action`**

## `PUT /api/action/:id`

### PARAMS:

*  **`visualization_settings`** value may be nil, or if non-nil, value must be a map.

*  **`parameters`** value may be nil, or if non-nil, value must be an array. Each value must be a map.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`error_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`database_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`name`** a nullable string

*  **`response_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`template`** value may be nil, or if non-nil, value must be a map with schema: (
  body (optional) : value may be nil, or if non-nil, value must be a string.
  headers (optional) : value may be nil, or if non-nil, value must be a string.
  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.
  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.
  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.
  url : value must be a string.
)

*  **`type`** value may be nil, or if non-nil, Unsupported action type

*  **`dataset_query`** value may be nil, or if non-nil, value must be a map.

*  **`model_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`id`** value must be an integer greater than zero.

*  **`kind`** value may be nil, or if non-nil, Unsupported implicit action kind

*  **`parameter_mappings`** value may be nil, or if non-nil, value must be a map.

*  **`action`**

---

[<< Back to API index](../api-documentation.md)