---
title: "Alert"
summary: |
  /api/alert endpoints.
---

# Alert

/api/alert endpoints.

## `DELETE /api/alert/:id/subscription`

For users to unsubscribe themselves from the given alert.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/alert/`

Fetch all alerts.

### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`user_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `GET /api/alert/:id`

Fetch an alert by ID.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/alert/question/:id`

Fetch all questions for the given question (`Card`) id.

### PARAMS:

*  **`id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

## `POST /api/alert/`

Create a new Alert.

### PARAMS:

*  **`alert_condition`** value must be one of: `goal`, `rows`.

*  **`card`** value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`alert_first_only`** value must be a boolean.

*  **`alert_above_goal`** value may be nil, or if non-nil, value must be a boolean.

*  **`new-alert-request-body`**

## `PUT /api/alert/:id`

Update a `Alert` with ID.

### PARAMS:

*  **`id`** 

*  **`alert_condition`** value may be nil, or if non-nil, value must be one of: `goal`, `rows`.

*  **`alert_first_only`** value may be nil, or if non-nil, value must be a boolean.

*  **`alert_above_goal`** value may be nil, or if non-nil, value must be a boolean.

*  **`card`** value may be nil, or if non-nil, value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`.

*  **`channels`** value may be nil, or if non-nil, value must be an array. Each value must be a map. The array cannot be empty.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`alert-updates`**

---

[<< Back to API index](../api-documentation.md)