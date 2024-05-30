---
title: "Segment"
summary: |
  /api/segment endpoints.
---

# Segment

/api/segment endpoints.

## `DELETE /api/segment/:id`

Archive a Segment. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.).

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`revision_message`** value must be a non-blank string.

## `GET /api/segment/`

Fetch *all* `Segments`.

## `GET /api/segment/:id`

Fetch `Segment` with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/segment/:id/related`

Return related entities.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/segment/:id/revisions`

Fetch `Revisions` for `Segment` with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/segment/`

Create a new `Segment`.

### PARAMS:

-  **`name`** value must be a non-blank string.

-  **`description`** nullable string.

-  **`table_id`** value must be an integer greater than zero.

-  **`definition`** Value must be a map.

## `POST /api/segment/:id/revert`

Revert a `Segement` to a prior `Revision`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`revision_id`** value must be an integer greater than zero.

## `PUT /api/segment/:id`

Update a `Segment` with ID.

### PARAMS:

-  **`points_of_interest`** nullable string.

-  **`description`** nullable string.

-  **`archived`** nullable boolean.

-  **`definition`** nullable map.

-  **`revision_message`** value must be a non-blank string.

-  **`show_in_getting_started`** nullable boolean.

-  **`name`** nullable value must be a non-blank string.

-  **`caveats`** nullable string.

-  **`id`** value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)