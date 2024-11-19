---
title: "Action"
summary: |
  `/api/action/` endpoints.
---

# Action

`/api/action/` endpoints.

## `DELETE /api/action/:action-id`

Delete an Action.

### PARAMS:

-  **`action-id`** value must be an integer greater than zero.

## `DELETE /api/action/:id/public_link`

Delete the publicly-accessible link to this Dashboard.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/action/`

Returns actions that can be used for QueryActions. By default lists all viewable actions. Pass optional
  `?model-id=<model-id>` to limit to actions on a particular model.

### PARAMS:

-  **`model-id`** nullable value must be an integer greater than zero.

## `GET /api/action/:action-id`

Fetch an Action.

### PARAMS:

-  **`action-id`** value must be an integer greater than zero.

## `GET /api/action/:action-id/execute`

Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

### PARAMS:

-  **`action-id`** value must be an integer greater than zero.

-  **`parameters`** value must be a valid JSON string.

## `GET /api/action/public`

Fetch a list of Actions with public UUIDs. These actions are publicly-accessible *if* public sharing is enabled.

## `POST /api/action/`

Create a new action.

### PARAMS:

-  **`visualization_settings`** nullable map.

-  **`parameters`** nullable sequence of map.

-  **`description`** nullable string.

-  **`error_handle`** nullable string, and must be a valid json-query, something like '.item.title'.

-  **`database_id`** nullable value must be an integer greater than zero.

-  **`name`** string.

-  **`response_handle`** nullable string, and must be a valid json-query, something like '.item.title'.

-  **`template`** nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length >= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys.

-  **`type`** nullable Unsupported action type.

-  **`dataset_query`** nullable map.

-  **`model_id`** value must be an integer greater than zero.

-  **`kind`** nullable Unsupported implicit action kind.

-  **`parameter_mappings`** nullable map.

-  **`action`**

## `POST /api/action/:id/execute`

Execute the Action.

   `parameters` should be the mapped dashboard parameters with values.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`parameters`** nullable map from <keyword> to <anything>.

-  **`_body`**

## `POST /api/action/:id/public_link`

Generate publicly-accessible links for this Action. Returns UUID to be used in public links. (If this
  Action has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `PUT /api/action/:id`

Update an Action.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`action`** map where {:archived (optional) -> <nullable boolean>, :database_id (optional) -> <nullable value must be an integer greater than zero.>, :dataset_query (optional) -> <nullable map>, :description (optional) -> <nullable string>, :error_handle (optional) -> <nullable string, and must be a valid json-query, something like '.item.title'>, :kind (optional) -> <nullable Unsupported implicit action kind>, :model_id (optional) -> <nullable value must be an integer greater than zero.>, :name (optional) -> <nullable string>, :parameter_mappings (optional) -> <nullable map>, :parameters (optional) -> <nullable sequence of map>, :response_handle (optional) -> <nullable string, and must be a valid json-query, something like '.item.title'>, :template (optional) -> <nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length >= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys>, :type (optional) -> <nullable Unsupported action type>, :visualization_settings (optional) -> <nullable map>}.

---

[<< Back to API index](../api-documentation.md)