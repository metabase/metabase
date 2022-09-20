---
title: "Emitter"
summary: |
  API endpoints for Emitter.
---

# Emitter

API endpoints for Emitter.

## `DELETE /api/emitter/:emitter-id`

Endpoint to delete an emitter.

### PARAMS:

*  **`emitter-id`**

## `POST /api/emitter/`

Endpoint to create an emitter.

### PARAMS:

*  **`action_id`** value must be an integer greater than zero.

*  **`card_id`** value may be nil, or if non-nil, value must be an integer greater than or equal to zero.

*  **`dashboard_id`** value may be nil, or if non-nil, value must be an integer greater than or equal to zero.

*  **`options`** value may be nil, or if non-nil, value must be a map.

*  **`parameter_mappings`** value may be nil, or if non-nil, value must be a map.

## `POST /api/emitter/:id/execute`

Execute a custom emitter.

### PARAMS:

*  **`id`** 

*  **`parameters`** value may be nil, or if non-nil, map of parameter name or ID -> map of parameter `:value` and `:type` of the value

## `PUT /api/emitter/:emitter-id`

Endpoint to update an emitter.

### PARAMS:

*  **`emitter-id`** 

*  **`emitter`**

---

[<< Back to API index](../api-documentation.md)