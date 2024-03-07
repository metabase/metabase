---
title: "Field"
summary: |
  API endpoints for Field.
---

# Field

API endpoints for Field.

## `DELETE /api/field/:id/dimension`

Remove the dimension associated to field at ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/field/:id`

Get `Field` with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include_editable_data_model`** value must be a valid boolean string ('true' or 'false').

## `GET /api/field/:id/related`

Return related entities.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/field/:id/remapping/:remapped-id`

Fetch remapped Field values.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`remapped-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

## `GET /api/field/:id/search/:search-id`

Search for values of a Field with `search-id` that start with `value`. See docstring for
  `metabase.api.field/search-values` for a more detailed explanation.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`search-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

## `GET /api/field/:id/summary`

Get the count and distinct count of `Field` with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/field/:id/values`

If a Field's value of `has_field_values` is `:list`, return a list of all the distinct values of the Field (or
  remapped Field), and (if defined by a User) a map of human-readable remapped values. If `has_field_values` is not
  `:list`, checks whether we should create FieldValues for this Field; if so, creates and returns them.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/field/field%2C:field-name%2C:options/values`

Implementation of the field values endpoint for fields in the Saved Questions 'virtual' DB. This endpoint is just a
  convenience to simplify the frontend code. It just returns the standard 'empty' field values response.

### PARAMS:

-  **`_`**

## `POST /api/field/:id/dimension`

Sets the dimension for the given field at ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`dimension-type`** enum of internal, external.

-  **`dimension-name`** value must be a non-blank string.

-  **`human_readable_field_id`** nullable value must be an integer greater than zero.

## `POST /api/field/:id/discard_values`

Discard the FieldValues belonging to this Field. Only applies to fields that have FieldValues. If this Field's
   Database is set up to automatically sync FieldValues, they will be recreated during the next cycle.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/field/:id/rescan_values`

Manually trigger an update for the FieldValues for this Field. Only applies to Fields that are eligible for
   FieldValues.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/field/:id/values`

Update the fields values and human-readable values for a `Field` whose semantic type is
  `category`/`city`/`state`/`country` or whose base type is `type/Boolean`. The human-readable values are optional.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`value-pairs`** sequence of vector with exactly 1 items of type: anything, or vector with exactly 2 items of type: anything, value must be a non-blank string.

## `PUT /api/field/:id`

Update `Field` with ID.

### PARAMS:

-  **`visibility_type`** nullable enum of retired, sensitive, normal, hidden, details-only.

-  **`display_name`** nullable value must be a non-blank string.

-  **`points_of_interest`** nullable value must be a non-blank string.

-  **`description`** nullable value must be a non-blank string.

-  **`semantic_type`** nullable value must be a valid field semantic or relation type (keyword or string).

-  **`coercion_strategy`** nullable value must be a valid coercion strategy (keyword or string).

-  **`has_field_values`** nullable :metabase.lib.schema.metadata/column.has-field-values.

-  **`settings`** nullable Value must be a map.

-  **`caveats`** nullable value must be a non-blank string.

-  **`fk_target_field_id`** nullable value must be an integer greater than zero.

-  **`nfc_path`** nullable sequence of value must be a non-blank string.

-  **`id`** value must be an integer greater than zero.

-  **`json_unfolding`** nullable boolean.

---

[<< Back to API index](../api-documentation.md)