---
title: "Pulse"
summary: |
  /api/pulse endpoints.
---

# Pulse

/api/pulse endpoints.

## `DELETE /api/pulse/:id/subscription`

For users to unsubscribe themselves from a pulse subscription.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/pulse/`

Fetch all dashboard subscriptions. By default, returns only subscriptions for which the current user has write
  permissions. For admins, this is all subscriptions; for non-admins, it is only subscriptions that they created.

  If `dashboard_id` is specified, restricts results to subscriptions for that dashboard.

  If `created_or_receive` is `true`, it specifically returns all subscriptions for which the current user
  created *or* is a known recipient of. Note that this is a superset of the default items returned for non-admins,
  and a subset of the default items returned for admins. This is used to power the /account/notifications page.
  This may include subscriptions which the current user does not have collection permissions for, in which case
  some sensitive metadata (the list of cards and recipients) is stripped out.

### PARAMS:

-  **`archived`** nullable value must be a valid boolean string ('true' or 'false').

-  **`dashboard_id`** nullable value must be an integer greater than zero.

-  **`creator_or_recipient`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/pulse/:id`

Fetch `Pulse` with ID. If the user is a recipient of the Pulse but does not have read permissions for its collection,
  we still return it but with some sensitive metadata removed.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/pulse/form_input`

Provides relevant configuration information and user choices for creating/updating Pulses.

## `GET /api/pulse/preview_card/:id`

Get HTML rendering of a Card with `id`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/pulse/preview_card_info/:id`

Get JSON object containing HTML rendering of a Card with `id` and other information.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/pulse/preview_card_png/:id`

Get PNG rendering of a Card with `id`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/pulse/preview_dashboard/:id`

Get HTML rendering of a Dashboard with `id`.

  This endpoint relies on a custom middleware defined in `metabase.pulse.preview/style-tag-nonce-middleware` to
  allow the style tag to render properly, given our Content Security Policy setup. This middleware is attached to these
  routes at the bottom of this namespace using `metabase.api.common/define-routes`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/pulse/`

Create a new `Pulse`.

### PARAMS:

-  **`name`** value must be a non-blank string.

-  **`cards`** one or more value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)`, or value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`., or value must be a map with the keys `include_csv`, `include_xls`, and `dashboard_card_id`.

-  **`channels`** one or more map.

-  **`skip_if_empty`** nullable boolean.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`collection_position`** nullable value must be an integer greater than zero.

-  **`dashboard_id`** nullable value must be an integer greater than zero.

-  **`parameters`** nullable sequence of map.

## `POST /api/pulse/test`

Test send an unsaved pulse.

### PARAMS:

-  **`name`** value must be a non-blank string.

-  **`cards`** one or more value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)`, or value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`., or value must be a map with the keys `include_csv`, `include_xls`, and `dashboard_card_id`.

-  **`channels`** one or more map.

-  **`skip_if_empty`** nullable boolean.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`collection_position`** nullable value must be an integer greater than zero.

-  **`dashboard_id`** nullable value must be an integer greater than zero.

## `PUT /api/pulse/:id`

Update a Pulse with `id`.

### PARAMS:

-  **`skip_if_empty`** nullable boolean.

-  **`parameters`** nullable sequence of Value must be a map.

-  **`archived`** nullable boolean.

-  **`channels`** nullable one or more map.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`name`** nullable value must be a non-blank string.

-  **`id`** value must be an integer greater than zero.

-  **`cards`** nullable one or more value must be a map with the following keys `(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)`, or value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`., or value must be a map with the keys `include_csv`, `include_xls`, and `dashboard_card_id`.

-  **`pulse-updates`**

---

[<< Back to API index](../api-documentation.md)