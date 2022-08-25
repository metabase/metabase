---
title: "Pulse"
summary: |
  /api/pulse endpoints.
---

# Pulse

/api/pulse endpoints.

  - [DELETE /api/pulse/:id/subscription](#delete-apipulseidsubscription)
  - [GET /api/pulse/](#get-apipulse)
  - [GET /api/pulse/:id](#get-apipulseid)
  - [GET /api/pulse/form_input](#get-apipulseform_input)
  - [GET /api/pulse/preview_card/:id](#get-apipulsepreview_cardid)
  - [GET /api/pulse/preview_card_info/:id](#get-apipulsepreview_card_infoid)
  - [GET /api/pulse/preview_card_png/:id](#get-apipulsepreview_card_pngid)
  - [POST /api/pulse/](#post-apipulse)
  - [POST /api/pulse/test](#post-apipulsetest)
  - [PUT /api/pulse/:id](#put-apipulseid)

## `DELETE /api/pulse/:id/subscription`

For users to unsubscribe themselves from a pulse subscription.

### PARAMS:

*  **`id`**

## `GET /api/pulse/`

Fetch all Pulses. If `dashboard_id` is specified, restricts results to dashboard subscriptions
  associated with that dashboard. If `user_id` is specified, restricts results to pulses or subscriptions
  created by the user, or for which the user is a known recipient.

### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`dashboard_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`user_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `GET /api/pulse/:id`

Fetch `Pulse` with ID.

### PARAMS:

*  **`id`**

## `GET /api/pulse/form_input`

Provides relevant configuration information and user choices for creating/updating Pulses.

## `GET /api/pulse/preview_card/:id`

Get HTML rendering of a Card with `id`.

### PARAMS:

*  **`id`**

## `GET /api/pulse/preview_card_info/:id`

Get JSON object containing HTML rendering of a Card with `id` and other information.

### PARAMS:

*  **`id`**

## `GET /api/pulse/preview_card_png/:id`

Get PNG rendering of a Card with `id`.

### PARAMS:

*  **`id`**

## `POST /api/pulse/`

Create a new `Pulse`.

### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`cards`** value must be an array. Each value must satisfy one of the following requirements: 1) value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)` 2) value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`. The array cannot be empty.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`dashboard_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`parameters`** value must be an array. Each value must be a map.

## `POST /api/pulse/test`

Test send an unsaved pulse.

### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`cards`** value must be an array. Each value must satisfy one of the following requirements: 1) value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)` 2) value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`. The array cannot be empty.

*  **`channels`** value must be an array. Each value must be a map. The array cannot be empty.

*  **`skip_if_empty`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`dashboard_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `PUT /api/pulse/:id`

Update a Pulse with `id`.

### PARAMS:

*  **`skip_if_empty`** value may be nil, or if non-nil, value must be a boolean.

*  **`parameters`** value must be an array. Each value must be a map.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`channels`** value may be nil, or if non-nil, value must be an array. Each value must be a map. The array cannot be empty.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`id`** 

*  **`cards`** value may be nil, or if non-nil, value must be an array. Each value must satisfy one of the following requirements: 1) value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)` 2) value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`. The array cannot be empty.

*  **`pulse-updates`**

---

[<< Back to API index](../api-documentation.md)