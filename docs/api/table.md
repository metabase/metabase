---
title: "Table"
summary: |
  /api/table endpoints.
---

# Table

/api/table endpoints.

## `GET /api/table/`

Get all `Tables`.

## `GET /api/table/:id`

Get `Table` with ID.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`include_editable_data_model`** nullable boolean

## `GET /api/table/:id/fks`

Get all foreign keys whose destination is a `Field` that belongs to this `Table`.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/table/:id/query_metadata`

Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  Passing `include_hidden_fields=true` will include any hidden `Fields` in the response. Defaults to `false`
  Passing `include_sensitive_fields=true` will include any sensitive `Fields` in the response. Defaults to `false`.

  Passing `include_editable_data_model=true` will check that the current user has write permissions for the table's
  data model, while `false` checks that they have data access perms for the table. Defaults to `false`.

  These options are provided for use in the Admin Edit Metadata page.

### PARAMS:

*  **`id`** 

*  **`include_sensitive_fields`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`include_hidden_fields`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`include_editable_data_model`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

## `GET /api/table/:id/related`

Return related entities.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `GET /api/table/card__:id/fks`

Return FK info for the 'virtual' table for a Card. This is always empty, so this endpoint
   serves mainly as a placeholder to avoid having to change anything on the frontend.

## `GET /api/table/card__:id/query_metadata`

Return metadata for the 'virtual' table for a Card.

### PARAMS:

*  **`id`**

## `POST /api/table/:id/discard_values`

Discard the FieldValues belonging to the Fields in this Table. Only applies to fields that have FieldValues. If
   this Table's Database is set up to automatically sync FieldValues, they will be recreated during the next cycle.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `POST /api/table/:id/rescan_values`

Manually trigger an update for the FieldValues for the Fields belonging to this Table. Only applies to Fields that
   are eligible for FieldValues.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

## `PUT /api/table/`

Update all `Table` in `ids`.

### PARAMS:

*  **`ids`** value must be an array. Each value must be an integer greater than zero. The array cannot be empty.

*  **`display_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`entity_type`** value may be nil, or if non-nil, value must be a valid entity type (keyword or string).

*  **`visibility_type`** value may be nil, or if non-nil, value must be one of: `cruft`, `hidden`, `technical`.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`caveats`** value may be nil, or if non-nil, value must be a string.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a string.

*  **`show_in_getting_started`** value may be nil, or if non-nil, value must be a boolean.

## `PUT /api/table/:id`

Update `Table` with ID.

### PARAMS:

*  **`visibility_type`** value may be nil, or if non-nil, value must be one of: `cruft`, `hidden`, `technical`.

*  **`field_order`** value may be nil, or if non-nil, value must be one of: `alphabetical`, `custom`, `database`, `smart`.

*  **`display_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a string.

*  **`entity_type`** value may be nil, or if non-nil, value must be a valid entity type (keyword or string).

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`show_in_getting_started`** value may be nil, or if non-nil, value must be a boolean.

*  **`caveats`** value may be nil, or if non-nil, value must be a string.

*  **`id`**

## `PUT /api/table/:id/fields/order`

Reorder fields.

### PARAMS:

*  **`id`** value must be an integer greater than zero.

*  **`field_order`** sequence of value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)