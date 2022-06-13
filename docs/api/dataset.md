---
title: "Dataset"
summary: |
  /api/dataset endpoints.
---

# Dataset

/api/dataset endpoints.

  - [POST /api/dataset/](#post-apidataset)
  - [POST /api/dataset/:export-format](#post-apidatasetexport-format)
  - [POST /api/dataset/duration](#post-apidatasetduration)
  - [POST /api/dataset/native](#post-apidatasetnative)
  - [POST /api/dataset/pivot](#post-apidatasetpivot)

## `POST /api/dataset/`

Execute a query and retrieve the results in the usual format.

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

## `POST /api/dataset/pivot`

Generate a pivoted dataset for an ad-hoc query.

### PARAMS:

*  **`database`** value may be nil, or if non-nil, value must be an integer.

*  **`query`**

---

[<< Back to API index](../api-documentation.md)