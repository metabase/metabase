---
title: "Advanced permissions application"
summary: |
  `/advanced-permisisons/application` Routes.
    Implements the Permissions routes needed for application permission - a class of permissions that control access to features
    like access Setting pages, access monitoring tools ... etc.
---

# Advanced permissions application

`/advanced-permisisons/application` Routes.
  Implements the Permissions routes needed for application permission - a class of permissions that control access to features
  like access Setting pages, access monitoring tools ... etc.

## `GET /api/ee/advanced-permissions/application/graph`

Fetch a graph of Application Permissions.

You must be a superuser to do this.

## `PUT /api/ee/advanced-permissions/application/graph`

Do a batch update of Application Permissions by passing a modified graph.

You must be a superuser to do this.

### PARAMS:

-  **`skip-graph`** nullable value must be a valid boolean string ('true' or 'false').

-  **`force`** nullable value must be a valid boolean string ('true' or 'false').

-  **`body`** map.

---

[<< Back to API index](../../api-documentation.md)