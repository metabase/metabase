---
title: "Native query snippet"
summary: |
  Native query snippet (/api/native-query-snippet) endpoints.
---

# Native query snippet

Native query snippet (/api/native-query-snippet) endpoints.

## `GET /api/native-query-snippet/`

Fetch all snippets.

### PARAMS:

-  **`archived`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/native-query-snippet/:id`

Fetch native query snippet with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/native-query-snippet/`

Create a new `NativeQuerySnippet`.

### PARAMS:

-  **`content`** string.

-  **`description`** nullable string.

-  **`name`** snippet names cannot include } or start with spaces.

-  **`collection_id`** nullable value must be an integer greater than zero.

## `PUT /api/native-query-snippet/:id`

Update an existing `NativeQuerySnippet`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`archived`** nullable boolean.

-  **`content`** nullable string.

-  **`description`** nullable string.

-  **`name`** nullable snippet names cannot include } or start with spaces.

-  **`collection_id`** nullable value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)