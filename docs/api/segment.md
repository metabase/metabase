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

*  **`id`** 

*  **`revision_message`** value must be a non-blank string.

## `GET /api/segment/`

Fetch *all* `Segments`.

## `GET /api/segment/:id`

Fetch `Segment` with ID.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/segment/:id/related`

Return related entities.

### PARAMS:

*  **`id`**

## `GET /api/segment/:id/revisions`

Fetch `Revisions` for `Segment` with ID.

### PARAMS:

*  **`id`**

## `POST /api/segment/`

Create a new `Segment`.

### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`table_id`** value must be an integer greater than zero.

*  **`definition`** value must be a map.

## `POST /api/segment/:id/revert`

Revert a `Segement` to a prior `Revision`.

### PARAMS:

*  **`id`** 

*  **`revision_id`** value must be an integer greater than zero.

## `PUT /api/segment/:id`

Update a `Segment` with ID.

### PARAMS:

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`definition`** value may be nil, or if non-nil, value must be a map.

*  **`revision_message`** value must be a non-blank string.

*  **`show_in_getting_started`** value may be nil, or if non-nil, value must be a boolean.

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`caveats`** value may be nil, or if non-nil, value must be a string.

*  **`id`**

---

[<< Back to API index](../api-documentation.md)