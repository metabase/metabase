---
title: "Sandbox GTAP"
summary: |
  `/api/mt/gtap` endpoints, for CRUD operations and the like on GTAPs (Group Table Access Policies).
---

# Sandbox GTAP

`/api/mt/gtap` endpoints, for CRUD operations and the like on GTAPs (Group Table Access Policies).

## `DELETE /api/mt/gtap/:id`

Delete a GTAP entry.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/mt/gtap/`

Fetch a list of all GTAPs currently in use, or a single GTAP if both `group_id` and `table_id` are provided.

### PARAMS:

-  **`group_id`** nullable value must be an integer greater than zero.

-  **`table_id`** nullable value must be an integer greater than zero.

## `GET /api/mt/gtap/:id`

Fetch GTAP by `id`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/mt/gtap/`

Create a new GTAP.

### PARAMS:

-  **`table_id`** value must be an integer greater than zero.

-  **`card_id`** nullable value must be an integer greater than zero.

-  **`group_id`** value must be an integer greater than zero.

-  **`attribute_remappings`**

## `POST /api/mt/gtap/validate`

Validate a sandbox which may not have yet been saved. This runs the same validation that is performed when the
  sandbox is saved, but doesn't actually save the sandbox.

### PARAMS:

-  **`table_id`** value must be an integer greater than zero.

-  **`card_id`** nullable value must be an integer greater than zero.

## `PUT /api/mt/gtap/:id`

Update a GTAP entry. The only things you're allowed to update for a GTAP are the Card being used (`card_id`) or the
  paramter mappings; changing `table_id` or `group_id` would effectively be deleting this entry and creating a new
  one. If that's what you want to do, do so explicity with appropriate calls to the `DELETE` and `POST` endpoints.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`card_id`** nullable value must be an integer greater than zero.

---

[<< Back to API index](../../api-documentation.md)