---
title: "Database"
summary: |
  /api/database endpoints.
---

# Database

/api/database endpoints.

  - [DELETE /api/database/:id](#delete-apidatabaseid)
  - [GET /api/database/](#get-apidatabase)
  - [GET /api/database/:id](#get-apidatabaseid)
  - [GET /api/database/:id/autocomplete_suggestions](#get-apidatabaseidautocomplete_suggestions)
  - [GET /api/database/:id/fields](#get-apidatabaseidfields)
  - [GET /api/database/:id/idfields](#get-apidatabaseididfields)
  - [GET /api/database/:id/metadata](#get-apidatabaseidmetadata)
  - [GET /api/database/:id/schema/](#get-apidatabaseidschema)
  - [GET /api/database/:id/schema/:schema](#get-apidatabaseidschemaschema)
  - [GET /api/database/:id/schemas](#get-apidatabaseidschemas)
  - [GET /api/database/:virtual-db/datasets](#get-apidatabasevirtual-dbdatasets)
  - [GET /api/database/:virtual-db/datasets/:schema](#get-apidatabasevirtual-dbdatasetsschema)
  - [GET /api/database/:virtual-db/metadata](#get-apidatabasevirtual-dbmetadata)
  - [GET /api/database/:virtual-db/schema/:schema](#get-apidatabasevirtual-dbschemaschema)
  - [GET /api/database/:virtual-db/schemas](#get-apidatabasevirtual-dbschemas)
  - [GET /api/database/db-ids-with-deprecated-drivers](#get-apidatabasedb-ids-with-deprecated-drivers)
  - [POST /api/database/](#post-apidatabase)
  - [POST /api/database/:id/discard_values](#post-apidatabaseiddiscard_values)
  - [POST /api/database/:id/rescan_values](#post-apidatabaseidrescan_values)
  - [POST /api/database/:id/sync](#post-apidatabaseidsync)
  - [POST /api/database/:id/sync_schema](#post-apidatabaseidsync_schema)
  - [POST /api/database/sample_database](#post-apidatabasesample_database)
  - [POST /api/database/validate](#post-apidatabasevalidate)
  - [PUT /api/database/:id](#put-apidatabaseid)

## `DELETE /api/database/:id`

Delete a `Database`.

You must be a superuser to do this.

### PARAMS:

*  **`id`**

## `GET /api/database/`

Fetch all `Databases`.

  * `include=tables` means we should hydrate the Tables belonging to each DB. Default: `false`.

  * `saved` means we should include the saved questions virtual database. Default: `false`.

  * `include_tables` is a legacy alias for `include=tables`, but should be considered deprecated as of 0.35.0, and will
    be removed in a future release.

  * `include_cards` here means we should also include virtual Table entries for saved Questions, e.g. so we can easily
    use them as source Tables in queries. This is a deprecated alias for `saved=true` + `include=tables` (for the saved
    questions virtual DB). Prefer using `include` and `saved` instead.

  * `include_editable_data_model` will only include DBs for which the current user has data model editing
    permissions. (If `include=tables`, this also applies to the list of tables in each DB). Has no effect unless
    Enterprise Edition code is available the advanced-permissions feature is enabled.

  * `exclude_uneditable_details` will only include DBs for which the current user can edit the DB details. Has no
    effect unless Enterprise Edition code is available and the advanced-permissions feature is enabled.

### PARAMS:

*  **`include_tables`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`include_cards`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`include`** include must be either empty or the value tables

*  **`saved`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`include_editable_data_model`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`exclude_uneditable_details`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

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

*  **`id`** 

*  **`include`** value may be nil, or if non-nil, value must be one of: `tables`, `tables.fields`.

*  **`include_editable_data_model`**

## `GET /api/database/:id/autocomplete_suggestions`

Return a list of autocomplete suggestions for a given `prefix`.

  This is intened for use with the ACE Editor when the User is typing raw SQL. Suggestions include matching `Tables`
  and `Fields` in this `Database`.

  Tables are returned in the format `[table_name "Table"]`;
  When Fields have a semantic_type, they are returned in the format `[field_name "table_name base_type semantic_type"]`
  When Fields lack a semantic_type, they are returned in the format `[field_name "table_name base_type"]`.

### PARAMS:

*  **`id`** 

*  **`prefix`** 

*  **`search`**

## `GET /api/database/:id/fields`

Get a list of all `Fields` in `Database`.

### PARAMS:

*  **`id`**

## `GET /api/database/:id/idfields`

Get a list of all primary key `Fields` for `Database`.

### PARAMS:

*  **`id`**

## `GET /api/database/:id/metadata`

Get metadata about a `Database`, including all of its `Tables` and `Fields`. Returns DB, fields, and field values.
  By default only non-hidden tables and fields are returned. Passing include_hidden=true includes them.

  Passing include_editable_data_model will only return tables for which the current user has data model editing
  permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
  In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
  and tables, with no additional metadata.

### PARAMS:

*  **`id`** 

*  **`include_hidden`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

*  **`include_editable_data_model`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

## `GET /api/database/:id/schema/`

Return a list of Tables for a Database whose `schema` is `nil` or an empty string.

### PARAMS:

*  **`id`**

## `GET /api/database/:id/schema/:schema`

Returns a list of Tables for the given Database `id` and `schema`.

### PARAMS:

*  **`id`** 

*  **`schema`**

## `GET /api/database/:id/schemas`

Returns a list of all the schemas found for the database `id`.

### PARAMS:

*  **`id`**

## `GET /api/database/:virtual-db/datasets`

Returns a list of all the datasets found for the saved questions virtual database.

## `GET /api/database/:virtual-db/datasets/:schema`

Returns a list of Tables for the datasets virtual database.

### PARAMS:

*  **`schema`**

## `GET /api/database/:virtual-db/metadata`

Endpoint that provides metadata for the Saved Questions 'virtual' database. Used for fooling the frontend
   and allowing it to treat the Saved Questions virtual DB just like any other database.

## `GET /api/database/:virtual-db/schema/:schema`

Returns a list of Tables for the saved questions virtual database.

### PARAMS:

*  **`schema`**

## `GET /api/database/:virtual-db/schemas`

Returns a list of all the schemas found for the saved questions virtual database.

## `GET /api/database/db-ids-with-deprecated-drivers`

Return a list of database IDs using currently deprecated drivers.

## `POST /api/database/`

Add a new `Database`.

You must be a superuser to do this.

### PARAMS:

*  **`name`** value must be a non-blank string.

*  **`engine`** value must be a valid database engine.

*  **`details`** value must be a map.

*  **`is_full_sync`** value may be nil, or if non-nil, value must be a boolean.

*  **`is_on_demand`** value may be nil, or if non-nil, value must be a boolean.

*  **`schedules`** value may be nil, or if non-nil, value must be a valid map of schedule maps for a DB.

*  **`auto_run_queries`** value may be nil, or if non-nil, value must be a boolean.

*  **`cache_ttl`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `POST /api/database/:id/discard_values`

Discards all saved field values for this `Database`.

### PARAMS:

*  **`id`**

## `POST /api/database/:id/rescan_values`

Trigger a manual scan of the field values for this `Database`.

### PARAMS:

*  **`id`**

## `POST /api/database/:id/sync`

Update the metadata for this `Database`. This happens asynchronously.

### PARAMS:

*  **`id`**

## `POST /api/database/:id/sync_schema`

Trigger a manual update of the schema metadata for this `Database`.

### PARAMS:

*  **`id`**

## `POST /api/database/sample_database`

Add the sample database as a new `Database`.

You must be a superuser to do this.

## `POST /api/database/validate`

Validate that we can connect to a database given a set of details.

You must be a superuser to do this.

### PARAMS:

*  **`engine`** value must be a valid database engine.

*  **`details`** value must be a map.

## `PUT /api/database/:id`

Update a `Database`.

### PARAMS:

*  **`engine`** value may be nil, or if non-nil, value must be a valid database engine.

*  **`schedules`** value may be nil, or if non-nil, value must be a valid map of schedule maps for a DB.

*  **`refingerprint`** value may be nil, or if non-nil, value must be a boolean.

*  **`points_of_interest`** value may be nil, or if non-nil, value must be a string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`auto_run_queries`** value may be nil, or if non-nil, value must be a boolean.

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`caveats`** value may be nil, or if non-nil, value must be a string.

*  **`is_full_sync`** 

*  **`cache_ttl`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`details`** value may be nil, or if non-nil, value must be a map.

*  **`id`** 

*  **`is_on_demand`**

---

[<< Back to API index](../api-documentation.md)