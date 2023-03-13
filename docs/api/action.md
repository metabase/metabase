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

## `DELETE /api/action/:id/public_link`

Delete the publicly-accessible link to this Dashboard.

### PARAMS:

*  **`id`** integer greater than 0

## `GET /api/action/`

Returns actions that can be used for QueryActions. By default lists all viewable actions. Pass optional
  `?model-id=<model-id>` to limit to actions on a particular model.

### PARAMS:

*  **`model-id`** nullable value must be an integer greater than zero.

## `GET /api/action/:action-id`

### PARAMS:

*  **`action-id`**

## `GET /api/action/public`

Fetch a list of Actions with public UUIDs. These actions are publicly-accessible *if* public sharing is enabled.

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

*  **`template`** nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length >= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys

*  **`type`** nullable Unsupported action type

*  **`dataset_query`** nullable map

*  **`model_id`** integer greater than 0

*  **`kind`** nullable Unsupported implicit action kind

*  **`parameter_mappings`** nullable map

*  **`action`**

## `POST /api/action/:id/execute`

Execute the Action.

   `parameters` should be the mapped dashboard parameters with values.

### PARAMS:

*  **`id`** integer greater than 0

*  **`parameters`** nullable map from <keyword> to <anything>

*  **`_body`**

## `POST /api/action/:id/public_link`

Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this
  Action has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled.

You must be a superuser to do this.

### PARAMS:

*  **`id`** integer greater than 0

## `PUT /api/action/:id`

### PARAMS:

*  **`visualization_settings`** nullable map

*  **`parameters`** nullable sequence of map

*  **`description`** nullable string

*  **`archived`** nullable boolean

*  **`error_handle`** nullable string, and must be a valid json-query, something like '.item.title'

*  **`database_id`** nullable integer greater than 0

*  **`name`** nullable string

*  **`response_handle`** nullable string, and must be a valid json-query, something like '.item.title'

*  **`template`** nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length >= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys

*  **`type`** nullable Unsupported action type

*  **`dataset_query`** nullable map

*  **`model_id`** nullable integer greater than 0

*  **`id`** integer greater than 0

*  **`kind`** nullable Unsupported implicit action kind

*  **`parameter_mappings`** nullable map

*  **`action`**

---

[<< Back to API index](../api-documentation.md)