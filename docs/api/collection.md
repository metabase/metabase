---
title: "Collection"
summary: |
  `/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
    the namespace that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
    `:snippet` namespace, ('Snippet folders' in the UI). These namespaces are independent hierarchies. To use these
    endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g., `?namespace=snippet`).
---

# Collection

`/api/collection` endpoints. By default, these endpoints operate on Collections in the 'default' namespace, which is
  the namespace that has things like Dashboards and Cards. Other namespaces of Collections exist as well, such as the
  `:snippet` namespace, ('Snippet folders' in the UI). These namespaces are independent hierarchies. To use these
  endpoints for other Collections namespaces, you can pass the `?namespace=` parameter (e.g., `?namespace=snippet`).

## `GET /api/collection/`

Fetch a list of all Collections that the current user has read permissions for (`:can_write` is returned as an
  additional property of each Collection so you can tell which of these you have write permissions for.)

  By default, this returns non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`.

  By default, admin users will see all collections. To hide other user's collections pass in
  `?exclude-other-user-collections=true`.

### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`exclude-other-user-collections`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

## `GET /api/collection/:id`

Fetch a specific Collection with standard details added.

### PARAMS:

*  **`id`**

## `GET /api/collection/:id/items`

Fetch a specific Collection's items with the following options:

  *  `models` - only include objects of a specific set of `models`. If unspecified, returns objects of all models
  *  `archived` - when `true`, return archived objects *instead* of unarchived ones. Defaults to `false`.
  *  `pinned_state` - when `is_pinned`, return pinned objects only.
                   when `is_not_pinned`, return non pinned objects only.
                   when `all`, return everything. By default returns everything.

### PARAMS:

*  **`id`** 

*  **`models`** value may be nil, or if non-nil, value must satisfy one of the following requirements: 1) value must be an array. Each value must be one of: `card`, `collection`, `dashboard`, `dataset`, `no_models`, `pulse`, `snippet`, `timeline`. 2) value must be one of: `card`, `collection`, `dashboard`, `dataset`, `no_models`, `pulse`, `snippet`, `timeline`.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`pinned_state`** value may be nil, or if non-nil, value must be one of: `all`, `is_not_pinned`, `is_pinned`.

*  **`sort_column`** value may be nil, or if non-nil, value must be one of: `last_edited_at`, `last_edited_by`, `model`, `name`.

*  **`sort_direction`** value may be nil, or if non-nil, value must be one of: `asc`, `desc`.

## `GET /api/collection/:id/timelines`

Fetch a specific Collection's timelines.

### PARAMS:

*  **`id`** 

*  **`include`** value may be nil, or if non-nil, value must be one of: `events`.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

## `GET /api/collection/graph`

Fetch a graph of all Collection Permissions.

You must be a superuser to do this.

### PARAMS:

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

## `GET /api/collection/root`

Return the 'Root' Collection object with standard details added.

### PARAMS:

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

## `GET /api/collection/root/items`

Fetch objects that the current user should see at their root level. As mentioned elsewhere, the 'Root' Collection
  doesn't actually exist as a row in the application DB: it's simply a virtual Collection where things with no
  `collection_id` exist. It does, however, have its own set of Permissions.

  This endpoint will actually show objects with no `collection_id` for Users that have Root Collection
  permissions, but for people without Root Collection perms, we'll just show the objects that have an effective
  location of `/`.

  This endpoint is intended to power a 'Root Folder View' for the Current User, so regardless you'll see all the
  top-level objects you're allowed to access.

  By default, this will show the 'normal' Collections namespace; to view a different Collections namespace, such as
  `snippets`, you can pass the `?namespace=` parameter.

### PARAMS:

*  **`models`** value may be nil, or if non-nil, value must satisfy one of the following requirements: 1) value must be an array. Each value must be one of: `card`, `collection`, `dashboard`, `dataset`, `no_models`, `pulse`, `snippet`, `timeline`. 2) value must be one of: `card`, `collection`, `dashboard`, `dataset`, `no_models`, `pulse`, `snippet`, `timeline`.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`pinned_state`** value may be nil, or if non-nil, value must be one of: `all`, `is_not_pinned`, `is_pinned`.

*  **`sort_column`** value may be nil, or if non-nil, value must be one of: `last_edited_at`, `last_edited_by`, `model`, `name`.

*  **`sort_direction`** value may be nil, or if non-nil, value must be one of: `asc`, `desc`.

## `GET /api/collection/root/timelines`

Fetch the root Collection's timelines.

### PARAMS:

*  **`include`** value may be nil, or if non-nil, value must be one of: `events`.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

## `GET /api/collection/tree`

Similar to `GET /`, but returns Collections in a tree structure, e.g.

  ```
  [{:name     "A"
  :below    #{:card :dataset}
  :children [{:name "B"}
             {:name     "C"
              :here     #{:dataset :card}
              :below    #{:dataset :card}
              :children [{:name     "D"
                          :here     #{:dataset}
                          :children [{:name "E"}]}
                         {:name     "F"
                          :here     #{:card}
                          :children [{:name "G"}]}]}]}
  {:name "H"}]
  ```

  The here and below keys indicate the types of items at this particular level of the tree (here) and in its
  subtree (below).

### PARAMS:

*  **`exclude-archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`exclude-other-user-collections`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

## `POST /api/collection/`

Create a new Collection.

### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`color`** value must be a string that matches the regex `^#[0-9A-Fa-f]{6}$`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`parent_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`authority_level`** value may be nil, or if non-nil, value must be one of: `official`.

## `PUT /api/collection/:id`

Modify an existing Collection, including archiving or unarchiving it, or moving it.

### PARAMS:

*  **`id`** 

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`color`** value may be nil, or if non-nil, value must be a string that matches the regex `^#[0-9A-Fa-f]{6}$`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`parent_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`authority_level`** value may be nil, or if non-nil, value must be one of: `official`.

*  **`collection-updates`**

## `PUT /api/collection/graph`

Do a batch update of Collections Permissions by passing in a modified graph.
  Will overwrite parts of the graph that are present in the request, and leave the rest unchanged.

You must be a superuser to do this.

### PARAMS:

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`body`** value must be a map.

---

[<< Back to API index](../api-documentation.md)