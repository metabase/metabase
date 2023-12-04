---
title: "Metric"
summary: |
  /api/metric endpoints.
---

# Metric

/api/metric endpoints.

## `DELETE /api/metric/:id`

Archive a Metric. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.).

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`revision_message`** value must be a non-blank string.

## `GET /api/metric/`

Fetch *all* `Metrics`.

## `GET /api/metric/:id`

Fetch `Metric` with ID.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/metric/:id/related`

Return related entities.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/metric/:id/revisions`

Fetch `Revisions` for `Metric` with ID.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `POST /api/metric/`

Create a new `Metric`.

### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`description`** nullable string

*  **`table_id`** value must be an integer greater than zero.

*  **`definition`** map

## `POST /api/metric/:id/revert`

Revert a `Metric` to a prior `Revision`.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`revision_id`** value must be an integer greater than zero.

## `PUT /api/metric/:id`

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

## `PUT /api/metric/:id/important_fields`

Update the important `Fields` for a `Metric` with ID.
   (This is used for the Getting Started guide).

You must be a superuser to do this.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`important_field_ids`** sequence of value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)