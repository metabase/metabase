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

Create a new HTTP action.

### PARAMS:

*  **`type`** Only http actions are supported at this time.

*  **`name`** value must be a string.

*  **`template`** value must be a map with schema: (
  body (optional) : value may be nil, or if non-nil, value must be a string.
  headers (optional) : value may be nil, or if non-nil, value must be a string.
  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.
  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.
  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.
  url : value must be a string.
)

*  **`response_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`error_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`action`**

## `POST /api/action/:action-namespace/:action-name`

Generic API endpoint for executing any sort of Action.

### PARAMS:

*  **`action-namespace`** 

*  **`action-name`**

## `POST /api/action/:action-namespace/:action-name/:table-id`

Generic API endpoint for executing any sort of Action with source Table ID specified as part of the route.

### PARAMS:

*  **`action-namespace`** 

*  **`action-name`** 

*  **`table-id`**

## `PUT /api/action/:id`

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`type`** Only http actions are supported at this time.

*  **`name`** value may be nil, or if non-nil, value must be a string.

*  **`template`** value may be nil, or if non-nil, value must be a map with schema: (
  body (optional) : value may be nil, or if non-nil, value must be a string.
  headers (optional) : value may be nil, or if non-nil, value must be a string.
  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.
  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.
  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.
  url : value must be a string.
)

*  **`response_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`error_handle`** value may be nil, or if non-nil, must be a valid json-query

*  **`action`**

---

[<< Back to API index](../api-documentation.md)