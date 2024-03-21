---
title: "Metric"
summary: |
  /api/legacy-metric endpoints.
---

# Metric

/api/legacy-metric endpoints.

## `DELETE /api/legacy-metric/:id`

Archive a Metric. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.).

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`revision_message`** value must be a non-blank string.

## `GET /api/legacy-metric/`

Fetch *all* `Metrics`.

## `GET /api/legacy-metric/:id`

Fetch `Metric` with ID.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/legacy-metric/:id/related`

Return related entities.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/legacy-metric/:id/revisions`

Fetch `Revisions` for `Metric` with ID.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `POST /api/legacy-metric/`

Create a new `Metric`.

### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`description`** nullable string

*  **`table_id`** value must be an integer greater than zero.

*  **`definition`** map

## `POST /api/legacy-metric/:id/revert`

Revert a `Metric` to a prior `Revision`.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`revision_id`** value must be an integer greater than zero.

## `PUT /api/legacy-metric/:id`

Update a `Metric` with ID.

### PARAMS:

*  **`points_of_interest`** nullable string

*  **`description`** nullable string

*  **`archived`** nullable boolean

*  **`definition`** nullable map

*  **`revision_message`** value must be a non-blank string.

*  **`show_in_getting_started`** nullable boolean

*  **`name`** nullable value must be a non-blank string.

*  **`caveats`** nullable string

*  **`id`** value must be an integer greater than zero.

*  **`how_is_this_calculated`** nullable string

## `PUT /api/legacy-metric/:id/important_fields`

Update the important `Fields` for a `Metric` with ID.
   (This is used for the Getting Started guide).

You must be a superuser to do this.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`important_field_ids`** sequence of value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)
