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

*  **`model-id`** integer greater than 0

## `GET /api/action/:action-id`

### PARAMS:

*  **`action-id`**

## `POST /api/action/`

Create a new action.

### PARAMS:

*  **`visualization_settings`** nullable map

*  **`parameters`** nullable sequence of map

*  **`description`** nullable string

*  **`error_handle`** nullable string, and must be a valid json-query, something like '.item.title'

*  **`database_id`** nullable integer greater than 0

*  **`name`** string

*  **`response_handle`** nullable string, and must be a valid json-query, something like '.item.title'

*  **`template`** nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length <= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys

*  **`type`** nullable Unsupported action type

*  **`dataset_query`** nullable map

*  **`model_id`** integer greater than 0

*  **`kind`** nullable Unsupported implicit action kind

*  **`parameter_mappings`** nullable map

*  **`action`**

## `PUT /api/action/:id`

### PARAMS:

*  **`visualization_settings`** nullable map

*  **`parameters`** nullable sequence of map

*  **`description`** nullable string

*  **`error_handle`** nullable string, and must be a valid json-query, something like '.item.title'

*  **`database_id`** nullable integer greater than 0

*  **`name`** nullable string

*  **`response_handle`** nullable string, and must be a valid json-query, something like '.item.title'

*  **`template`** nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length <= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys

*  **`type`** nullable Unsupported action type

*  **`dataset_query`** nullable map

*  **`model_id`** nullable integer greater than 0

*  **`id`** integer greater than 0

*  **`kind`** nullable Unsupported implicit action kind

*  **`parameter_mappings`** nullable map

*  **`action`**

---

[<< Back to API index](../api-documentation.md)