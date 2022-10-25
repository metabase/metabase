---
title: "Model action"
summary: |
  API endpoints for Model action.
---

# Model action

API endpoints for Model action.

## `DELETE /api/model-action/:model-action-id`

Endpoint to delete an action.

### PARAMS:

*  **`model-action-id`**

## `GET /api/model-action/`

Endpoint to fetch actions for a model, must filter with card-id=.

### PARAMS:

*  **`card-id`** value must be an integer greater than zero.

## `POST /api/model-action/`

Endpoint to associate an action with a model.

### PARAMS:

*  **`card_id`** value must be an integer greater than zero.

*  **`action_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`slug`** value must be a non-blank string.

*  **`requires_pk`** value must be a boolean.

*  **`parameter_mappings`** value may be nil, or if non-nil, value must be an array. Each parameter_mapping must be a map with :parameter_id and :target keys

*  **`visualization_settings`** value may be nil, or if non-nil, value must be a map.

## `PUT /api/model-action/:model-action-id`

Endpoint to modify an action of a model.

### PARAMS:

*  **`model-action-id`** 

*  **`action_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`slug`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`requires_pk`** value may be nil, or if non-nil, value must be a boolean.

*  **`parameter_mappings`** value may be nil, or if non-nil, value must be an array. Each parameter_mapping must be a map with :parameter_id and :target keys

*  **`visualization_settings`** value may be nil, or if non-nil, value must be a map.

---

[<< Back to API index](../api-documentation.md)