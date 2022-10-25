---
title: "App"
summary: |
  API endpoints for App.
---

# App

API endpoints for App.

## `GET /api/app/`

Fetch a list of all Apps that the current user has read permissions for.

  By default, this returns Apps with non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`.

### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

## `GET /api/app/:id`

Fetch a specific App.

### PARAMS:

*  **`id`**

## `GET /api/app/global-graph`

Fetch the global graph of all App Permissions.

You must be a superuser to do this.

## `GET /api/app/graph`

Fetch the graph of all App Permissions.

You must be a superuser to do this.

## `POST /api/app/`

Endpoint to create an app.

### PARAMS:

*  **`options`** value may be nil, or if non-nil, value must be a map.

*  **`namespace`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`dashboard_id`** value may be nil, or if non-nil, value must be an integer greater than or equal to zero.

*  **`nav_items`** value may be nil, or if non-nil, value must be an array. Each value may be nil, or if non-nil, value must be a map.

*  **`authority_level`** value may be nil, or if non-nil, value must be one of: `official`.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`color`** value must be a string that matches the regex `^#[0-9A-Fa-f]{6}$`.

*  **`name`** value must be a non-blank string.

*  **`app`**

## `POST /api/app/:app-id/scaffold`

Endpoint to scaffold a new table onto an existing data-app.

### PARAMS:

*  **`app-id`** 

*  **`table-ids`**

## `POST /api/app/scaffold`

Endpoint to scaffold a fully working data-app.

### PARAMS:

*  **`table-ids`** 

*  **`app-name`**

## `PUT /api/app/:app-id`

Endpoint to change an app.

### PARAMS:

*  **`app-id`** value must be an integer greater than or equal to zero.

*  **`dashboard_id`** value may be nil, or if non-nil, value must be an integer greater than or equal to zero.

*  **`options`** value may be nil, or if non-nil, value must be a map.

*  **`nav_items`** value may be nil, or if non-nil, value must be an array. Each value may be nil, or if non-nil, value must be a map.

## `PUT /api/app/global-graph`

Do a batch update of the global App Permissions by passing in a modified graph.

You must be a superuser to do this.

### PARAMS:

*  **`body`** value must be a map.

## `PUT /api/app/graph`

Do a batch update of the advanced App Permissions by passing in a modified graph.

You must be a superuser to do this.

### PARAMS:

*  **`body`** value must be a map.

---

[<< Back to API index](../api-documentation.md)