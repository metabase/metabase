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

---

[<< Back to API index](../api-documentation.md)