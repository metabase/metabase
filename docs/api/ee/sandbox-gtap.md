---
title: "Sandbox GTAP"
summary: |
  `/api/mt/gtap` endpoints, for CRUD operations and the like on GTAPs (Group Table Access Policies).
---

# Sandbox GTAP

`/api/mt/gtap` endpoints, for CRUD operations and the like on GTAPs (Group Table Access Policies).

  - [DELETE /api/mt/gtap/:id](#delete-apimtgtapid)
  - [GET /api/mt/gtap/](#get-apimtgtap)
  - [GET /api/mt/gtap/:id](#get-apimtgtapid)
  - [POST /api/mt/gtap/](#post-apimtgtap)
  - [PUT /api/mt/gtap/:id](#put-apimtgtapid)

## `DELETE /api/mt/gtap/:id`

Delete a GTAP entry.

### PARAMS:

*  **`id`**

## `GET /api/mt/gtap/`

Fetch a list of all the GTAPs currently in use.

## `GET /api/mt/gtap/:id`

Fetch GTAP by `id`.

### PARAMS:

*  **`id`**

## `POST /api/mt/gtap/`

Create a new GTAP.

### PARAMS:

*  **`table_id`** value must be an integer greater than zero.

*  **`card_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`group_id`** value must be an integer greater than zero.

*  **`attribute_remappings`**

## `PUT /api/mt/gtap/:id`

Update a GTAP entry. The only things you're allowed to update for a GTAP are the Card being used (`card_id`) or the
  paramter mappings; changing `table_id` or `group_id` would effectively be deleting this entry and creating a new
  one. If that's what you want to do, do so explicity with appropriate calls to the `DELETE` and `POST` endpoints.

### PARAMS:

*  **`id`** 

*  **`card_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

---

[<< Back to API index](../../api-documentation.md)