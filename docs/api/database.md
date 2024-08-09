---
title: "Database"
summary: |
  /api/database endpoints.
---

# Database

/api/database endpoints.

## `DELETE /api/database/:id`

Delete a `Database`.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/database/`

Fetch all `Databases`.

  * `include=tables` means we should hydrate the Tables belonging to each DB. Default: `false`.

  * `saved` means we should include the saved questions virtual database. Default: `false`.

  * `include_editable_data_model` will only include DBs for which the current user has data model editing
    permissions. (If `include=tables`, this also applies to the list of tables in each DB). Should only be used if
    Enterprise Edition code is available the advanced-permissions feature is enabled.

  * `exclude_uneditable_details` will only include DBs for which the current user can edit the DB details. Has no
    effect unless Enterprise Edition code is available and the advanced-permissions feature is enabled.

  * `include_only_uploadable` will only include DBs into which Metabase can insert new data.

### PARAMS:

-  **`include`** include must be either empty or the value tables.

-  **`saved`** nullable boolean.

-  **`include_editable_data_model`** nullable boolean.

-  **`exclude_uneditable_details`** nullable boolean.

-  **`include_only_uploadable`** nullable boolean.

-  **`include_analytics`** nullable boolean.

## `GET /api/database/:id`

Get a single Database with `id`. Optionally pass `?include=tables` or `?include=tables.fields` to include the Tables
   belonging to this database, or the Tables and Fields, respectively.  If the requestor has write permissions for the DB
   (i.e. is an admin or has data model permissions), then certain inferred secret values will also be included in the
   returned details (see [[metabase.models.secret/expand-db-details-inferred-secret-values]] for full details).

   Passing include_editable_data_model will only return tables for which the current user has data model editing
   permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
   In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
   and tables, with no additional metadata.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include`** nullable enum of tables, tables.fields.

-  **`include_editable_data_model`** 

-  **`exclude_uneditable_details`**

## `GET /api/database/:id/autocomplete_suggestions`

Return a list of autocomplete suggestions for a given `prefix`, or `substring`. Should only specify one, but
  `substring` will have priority if both are present.

  This is intended for use with the ACE Editor when the User is typing raw SQL. Suggestions include matching `Tables`
  and `Fields` in this `Database`.

  Tables are returned in the format `[table_name "Table"]`;
  When Fields have a semantic_type, they are returned in the format `[field_name "table_name base_type semantic_type"]`
  When Fields lack a semantic_type, they are returned in the format `[field_name "table_name base_type"]`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`prefix`** nullable value must be a non-blank string.

-  **`substring`** nullable value must be a non-blank string.

## `GET /api/database/:id/card_autocomplete_suggestions`

Return a list of `Card` autocomplete suggestions for a given `query` in a given `Database`.

  This is intended for use with the ACE Editor when the User is typing in a template tag for a `Card`, e.g. {{#...}}.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`query`** value must be a non-blank string.

## `GET /api/database/:id/fields`

Get a list of all `Fields` in `Database`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/database/:id/idfields`

Get a list of all primary key `Fields` for `Database`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include_editable_data_model`**

## `GET /api/database/:id/metadata`

Get metadata about a `Database`, including all of its `Tables` and `Fields`. Returns DB, fields, and field values.
  By default only non-hidden tables and fields are returned. Passing include_hidden=true includes them.

  Passing include_editable_data_model will only return tables for which the current user has data model editing
  permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
  In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
  and tables, with no additional metadata.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include_hidden`** nullable value must be a valid boolean string ('true' or 'false').

-  **`include_editable_data_model`** nullable value must be a valid boolean string ('true' or 'false').

-  **`remove_inactive`** nullable value must be a valid boolean string ('true' or 'false').

-  **`skip_fields`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/database/:id/schema/`

Return a list of Tables for a Database whose `schema` is `nil` or an empty string.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include_hidden`** nullable value must be a valid boolean string ('true' or 'false').

-  **`include_editable_data_model`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/database/:id/schema/:schema`

Returns a list of Tables for the given Database `id` and `schema`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include_hidden`** nullable value must be a valid boolean string ('true' or 'false').

-  **`include_editable_data_model`** nullable value must be a valid boolean string ('true' or 'false').

-  **`schema`**

## `GET /api/database/:id/schemas`

Returns a list of all the schemas with tables found for the database `id`. Excludes schemas with no tables.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include_editable_data_model`** nullable value must be a valid boolean string ('true' or 'false').

-  **`include_hidden`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/database/:id/syncable_schemas`

Returns a list of all syncable schemas found for the database `id`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/database/:id/usage_info`

Get usage info for a database.
  Returns a map with keys are models and values are the number of entities that use this database.

You must be a superuser to do this.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/database/:virtual-db/datasets`

Returns a list of all the datasets found for the saved questions virtual database.

## `GET /api/database/:virtual-db/datasets/:schema`

Returns a list of Tables for the datasets virtual database.

### PARAMS:

-  **`schema`**

## `GET /api/database/:virtual-db/metadata`

Endpoint that provides metadata for the Saved Questions 'virtual' database. Used for fooling the frontend
   and allowing it to treat the Saved Questions virtual DB just like any other database.

## `GET /api/database/:virtual-db/schema/:schema`

Returns a list of Tables for the saved questions virtual database.

### PARAMS:

-  **`schema`**

## `GET /api/database/:virtual-db/schemas`

Returns a list of all the schemas found for the saved questions virtual database.

## `POST /api/database/`

Add a new `Database`.

You must be a superuser to do this.

### PARAMS:

-  **`engine`** value must be a valid database engine.

-  **`schedules`** nullable :metabase.sync.schedules/ExpandedSchedulesMap.

-  **`connection_source`** nullable enum of :admin, :setup.

-  **`auto_run_queries`** nullable boolean.

-  **`name`** value must be a non-blank string.

-  **`is_full_sync`** nullable value must be a valid boolean string ('true' or 'false').

-  **`cache_ttl`** nullable value must be an integer greater than zero.

-  **`details`** Value must be a map.

-  **`is_on_demand`** nullable value must be a valid boolean string ('true' or 'false').

## `POST /api/database/:id/discard_values`

Discards all saved field values for this `Database`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/database/:id/dismiss_spinner`

Manually set the initial sync status of the `Database` and corresponding
  tables to be `complete` (see #20863).

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/database/:id/persist`

Attempt to enable model persistence for a database. If already enabled returns a generic 204.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/database/:id/rescan_values`

Trigger a manual scan of the field values for this `Database`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/database/:id/sync_schema`

Trigger a manual update of the schema metadata for this `Database`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/database/:id/unpersist`

Attempt to disable model persistence for a database. If already not enabled, just returns a generic 204.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/database/sample_database`

Add the sample database as a new `Database`.

You must be a superuser to do this.

## `POST /api/database/validate`

Validate that we can connect to a database given a set of details.

You must be a superuser to do this.

### PARAMS:

-  **`engine`** value must be a valid database engine.

-  **`details`** map.

## `PUT /api/database/:id`

Update a `Database`.

### PARAMS:

-  **`engine`** nullable value must be a valid database engine.

-  **`schedules`** nullable :metabase.sync.schedules/ExpandedSchedulesMap.

-  **`refingerprint`** nullable boolean.

-  **`points_of_interest`** nullable string.

-  **`description`** nullable string.

-  **`auto_run_queries`** nullable boolean.

-  **`name`** nullable value must be a non-blank string.

-  **`settings`** nullable Value must be a map.

-  **`caveats`** nullable string.

-  **`is_full_sync`** 

-  **`cache_ttl`** nullable value must be an integer greater than zero.

-  **`details`** nullable Value must be a map.

-  **`id`** value must be an integer greater than zero.

-  **`is_on_demand`**

---

[<< Back to API index](../api-documentation.md)