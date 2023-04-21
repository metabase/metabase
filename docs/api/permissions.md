---
title: "Permissions"
summary: |
  /api/permissions endpoints.
---

# Permissions

/api/permissions endpoints.

## `DELETE /api/permissions/group/:group-id`

Delete a specific `PermissionsGroup`.

### PARAMS:

*  **`group-id`**

## `DELETE /api/permissions/membership/:id`

Remove a User from a PermissionsGroup (delete their membership).

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/permissions/execution/graph`

Fetch a graph of execution permissions.

You must be a superuser to do this.

## `GET /api/permissions/graph`

Fetch a graph of all v1 Permissions (excludes v2 query and data permissions).

You must be a superuser to do this.

## `GET /api/permissions/graph-v2`

Fetch a graph of all v2 Permissions (excludes v1 data permissions).

You must be a superuser to do this.

## `GET /api/permissions/group`

Fetch all `PermissionsGroups`, including a count of the number of `:members` in that group.
  This API requires superuser or group manager of more than one group.
  Group manager is only available if `advanced-permissions` is enabled and returns only groups that user
  is manager of.

## `GET /api/permissions/group/:id`

Fetch the details for a certain permissions group.

### PARAMS:

*  **`id`**

## `GET /api/permissions/membership`

Fetch a map describing the group memberships of various users.
   This map's format is:

    {<user-id> [{:membership_id    <id>
                 :group_id         <id>
                 :is_group_manager boolean}]}.

## `POST /api/permissions/group`

Create a new `PermissionsGroup`.

You must be a superuser to do this.

### PARAMS:

*  **`name`** value must be a non-blank string.

## `POST /api/permissions/membership`

Add a `User` to a `PermissionsGroup`. Returns updated list of members belonging to the group.

### PARAMS:

*  **`group_id`** value must be an integer greater than zero.

*  **`user_id`** value must be an integer greater than zero.

*  **`is_group_manager`** nullable boolean

## `PUT /api/permissions/execution/graph`

Do a batch update of execution permissions by passing in a modified graph. The modified graph of the same
  form as returned by the corresponding GET endpoint.

  Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party
  modifies it before you can submit you revisions, the endpoint will instead make no changes and return a
  409 (Conflict) response. In this case, you should fetch the updated graph and make desired changes to that.

You must be a superuser to do this.

### PARAMS:

*  **`body`** value must be a map.

## `PUT /api/permissions/graph`

Do a batch update of Permissions by passing in a modified graph. This should return the same graph, in the same
  format, that you got from `GET /api/permissions/graph`, with any changes made in the wherever necessary. This
  modified graph must correspond to the `PermissionsGraph` schema. If successful, this endpoint returns the updated
  permissions graph; use this as a base for any further modifications.

  Revisions to the permissions graph are tracked. If you fetch the permissions graph and some other third-party
  modifies it before you can submit you revisions, the endpoint will instead make no changes and return a
  409 (Conflict) response. In this case, you should fetch the updated graph and make desired changes to that.

  The optional `sandboxes` key contains a list of sandboxes that should be created or modified in conjunction with
  this permissions graph update. Since data sandboxing is an Enterprise Edition-only feature, a 402 (Payment Required)
  response will be returned if this key is present and the server is not running the Enterprise Edition, and/or the
  `:sandboxes` feature flag is not present.

You must be a superuser to do this.

### PARAMS:

*  **`body`** map

## `PUT /api/permissions/group/:group-id`

Update the name of a `PermissionsGroup`.

### PARAMS:

*  **`group-id`** 

*  **`name`** value must be a non-blank string.

## `PUT /api/permissions/membership/:group-id/clear`

Remove all members from a `PermissionsGroup`. Returns a 400 (Bad Request) if the group ID is for the admin group.

### PARAMS:

*  **`group-id`** value must be an integer greater than zero.

## `PUT /api/permissions/membership/:id`

Update a Permission Group membership. Returns the updated record.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`is_group_manager`** boolean

---

[<< Back to API index](../api-documentation.md)