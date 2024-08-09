---
title: "Dataset"
summary: |
  /api/dataset endpoints.
---

# Dataset

/api/dataset endpoints.

## `POST /api/dataset/`

Execute a query and retrieve the results in the usual format. The query will not use the cache.

### PARAMS:

-  **`database`** nullable integer.

-  **`query`**

## `POST /api/dataset/:export-format`

Execute a query and download the result data as a file in the specified format.

### PARAMS:

-  **`export-format`** enum of csv, api, xlsx, json.

-  **`query`** value must be a valid JSON string.

-  **`visualization_settings`** value must be a valid JSON string.

-  **`format_rows`** nullable boolean.

## `POST /api/dataset/native`

Fetch a native version of an MBQL query.

### PARAMS:

-  **`database`** value must be an integer greater than zero.

-  **`pretty`** nullable boolean.

-  **`query`**

## `POST /api/dataset/parameter/search/:query`

Return parameter values for cards or dashboards that are being edited. Expects a query string at `?query=foo`.

### PARAMS:

-  **`query`** value must be a non-blank string.

-  **`parameter`** parameter must be a map with :id and :type keys.

-  **`field_ids`** nullable sequence of value must be an integer greater than zero.

## `POST /api/dataset/parameter/values`

Return parameter values for cards or dashboards that are being edited.

### PARAMS:

-  **`parameter`** parameter must be a map with :id and :type keys.

-  **`field_ids`** nullable sequence of value must be an integer greater than zero.

## `POST /api/dataset/pivot`

Generate a pivoted dataset for an ad-hoc query.

### PARAMS:

-  **`database`** nullable value must be an integer greater than zero.

-  **`query`**

## `POST /api/dataset/query_metadata`

Get all of the required query metadata for an ad-hoc query.

### PARAMS:

-  **`database`** value must be an integer greater than zero.

-  **`query`**

---

[<< Back to API index](../api-documentation.md)