---
title: "Notify"
summary: |
  /api/notify/* endpoints which receive inbound etl server notifications.
---

# Notify

/api/notify/* endpoints which receive inbound etl server notifications.

## `POST /api/notify/db/:id`

Notification about a potential schema change to one of our `Databases`.
  Caller can optionally specify a `:table_id` or `:table_name` in the body to limit updates to a single
  `Table`. Optional Parameter `:scan` can be `"full"` or `"schema"` for a full sync or a schema sync, available
  regardless if a `:table_id` or `:table_name` is passed.
  This endpoint is secured by an API key that needs to be passed as a `X-METABASE-APIKEY` header which needs to be defined in
  the `MB_API_KEY` [environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.html#mb_api_key).

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`table_id`** nullable value must be an integer greater than zero.

-  **`table_name`** nullable value must be a non-blank string.

-  **`scan`** nullable enum of full, schema.

-  **`synchronous?`**

## `POST /api/notify/db/:id/new-table`

Sync a new table without running a full database sync. Requires `schema_name` and `table_name`. Will throw an error
  if the table already exists in Metabase or cannot be found.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`schema_name`** value must be a non-blank string.

-  **`table_name`** value must be a non-blank string.

## `POST /api/notify/db/attached_datawarehouse`

Sync the attached datawarehouse. Can provide in the body:
  - table_name and schema_name: both strings. Will look for an existing table and sync it, otherwise will try to find a
  new table with that name and sync it. If it cannot find a table it will throw an error. If table_name is empty or
  blank, will sync the entire database.
  - synchronous?: is a boolean value to indicate if this should block on the result.

### PARAMS:

-  **`table_name`** nullable value must be a non-blank string.

-  **`schema_name`** nullable string.

-  **`synchronous?`** nullable value must be a valid boolean string ('true' or 'false').

---

[<< Back to API index](../api-documentation.md)