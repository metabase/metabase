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

*  **`database`** value may be nil, or if non-nil, value must be an integer.

*  **`query`**

## `POST /api/dataset/:export-format`

Execute a query and download the result data as a file in the specified format.

### PARAMS:

*  **`export-format`** value must be one of: `api`, `csv`, `json`, `xlsx`.

*  **`query`** value must be a valid JSON string.

*  **`visualization_settings`** value must be a valid JSON string.

## `POST /api/dataset/duration`

Get historical query execution duration.

### PARAMS:

*  **`database`** 

*  **`query`**

## `POST /api/dataset/native`

Fetch a native version of an MBQL query.

### PARAMS:

*  **`query`**

## `POST /api/dataset/parameter/search/:query`

Return parameter values for cards or dashboards that are being edited. Expects a query string at `?query=foo`.

### PARAMS:

*  **`query`** string

*  **`parameter`** map where {:id -> <string with length <= 1>, :type -> <keyword, or string with length <= 1>, :values_source_type (optional) -> <enum of static-list, card, >, :values_source_config (optional) -> <map where {:values (optional) -> <zero or more anything>, :card_id (optional) -> <integer greater than or equal to 1>, :value_field (optional) -> <function>, :label_field (optional) -> <function>}>, :slug (optional) -> <string>, :name (optional) -> <string>, :default (optional) -> <anything>, :sectionId (optional) -> <string with length <= 1>}

*  **`field_ids`** nullable sequence of integer greater than or equal to 1

## `POST /api/dataset/parameter/values`

Return parameter values for cards or dashboards that are being edited.

### PARAMS:

*  **`parameter`** map where {:id -> <string with length <= 1>, :type -> <keyword, or string with length <= 1>, :values_source_type (optional) -> <enum of static-list, card, >, :values_source_config (optional) -> <map where {:values (optional) -> <zero or more anything>, :card_id (optional) -> <integer greater than or equal to 1>, :value_field (optional) -> <function>, :label_field (optional) -> <function>}>, :slug (optional) -> <string>, :name (optional) -> <string>, :default (optional) -> <anything>, :sectionId (optional) -> <string with length <= 1>}

*  **`field_ids`** nullable sequence of integer greater than or equal to 1

## `POST /api/dataset/pivot`

Generate a pivoted dataset for an ad-hoc query.

### PARAMS:

*  **`database`** value may be nil, or if non-nil, value must be an integer.

*  **`query`**

---

[<< Back to API index](../api-documentation.md)