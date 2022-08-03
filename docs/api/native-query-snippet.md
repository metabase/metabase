---
title: "Native query snippet"
summary: |
  Native query snippet (/api/native-query-snippet) endpoints.
---

# Native query snippet

Native query snippet (/api/native-query-snippet) endpoints.

  - [GET /api/native-query-snippet/](#get-apinative-query-snippet)
  - [GET /api/native-query-snippet/:id](#get-apinative-query-snippetid)
  - [POST /api/native-query-snippet/](#post-apinative-query-snippet)
  - [PUT /api/native-query-snippet/:id](#put-apinative-query-snippetid)

## `GET /api/native-query-snippet/`

Fetch all snippets.

### PARAMS:

*  **`archived`** value may be nil, or if non-nil, value must be a valid boolean string ('true' or 'false').

## `GET /api/native-query-snippet/:id`

Fetch native query snippet with ID.

### PARAMS:

*  **`id`**

## `POST /api/native-query-snippet/`

Create a new `NativeQuerySnippet`.

### PARAMS:

*  **`content`** value must be a string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`name`** snippet names cannot include } or start with spaces

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`template_tags`** value may be nil, or if non-nil, template tags must be a map with key of name->TemplateTag.

## `PUT /api/native-query-snippet/:id`

Update an existing `NativeQuerySnippet`.

### PARAMS:

*  **`id`** 

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`content`** value may be nil, or if non-nil, value must be a string.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`name`** value may be nil, or if non-nil, snippet names cannot include } or start with spaces

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`template_tags`** value may be nil, or if non-nil, template tags must be a map with key of name->TemplateTag.

---

[<< Back to API index](../api-documentation.md)