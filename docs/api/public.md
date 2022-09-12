---
title: "Public"
summary: |
  Metabase API endpoints for viewing publicly-accessible Cards and Dashboards.
---

# Public

Metabase API endpoints for viewing publicly-accessible Cards and Dashboards.

  - [GET /api/public/card/:uuid](#get-apipubliccarduuid)
  - [GET /api/public/card/:uuid/field/:field-id/remapping/:remapped-id](#get-apipubliccarduuidfieldfield-idremappingremapped-id)
  - [GET /api/public/card/:uuid/field/:field-id/search/:search-field-id](#get-apipubliccarduuidfieldfield-idsearchsearch-field-id)
  - [GET /api/public/card/:uuid/field/:field-id/values](#get-apipubliccarduuidfieldfield-idvalues)
  - [GET /api/public/card/:uuid/query](#get-apipubliccarduuidquery)
  - [GET /api/public/card/:uuid/query/:export-format](#get-apipubliccarduuidqueryexport-format)
  - [GET /api/public/dashboard/:uuid](#get-apipublicdashboarduuid)
  - [GET /api/public/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id](#get-apipublicdashboarduuiddashcarddashcard-idcardcard-id)
  - [GET /api/public/dashboard/:uuid/field/:field-id/remapping/:remapped-id](#get-apipublicdashboarduuidfieldfield-idremappingremapped-id)
  - [GET /api/public/dashboard/:uuid/field/:field-id/search/:search-field-id](#get-apipublicdashboarduuidfieldfield-idsearchsearch-field-id)
  - [GET /api/public/dashboard/:uuid/field/:field-id/values](#get-apipublicdashboarduuidfieldfield-idvalues)
  - [GET /api/public/dashboard/:uuid/params/:param-key/search/:query](#get-apipublicdashboarduuidparamsparam-keysearchquery)
  - [GET /api/public/dashboard/:uuid/params/:param-key/values](#get-apipublicdashboarduuidparamsparam-keyvalues)
  - [GET /api/public/oembed](#get-apipublicoembed)
  - [GET /api/public/pivot/card/:uuid/query](#get-apipublicpivotcarduuidquery)
  - [GET /api/public/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id](#get-apipublicpivotdashboarduuiddashcarddashcard-idcardcard-id)

## `GET /api/public/card/:uuid`

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

### PARAMS:

*  **`uuid`**

## `GET /api/public/card/:uuid/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Cards.

### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`remapped-id`** 

*  **`value`** value must be a non-blank string.

## `GET /api/public/card/:uuid/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a public Card.

### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`search-field-id`** 

*  **`value`** value must be a non-blank string.

*  **`limit`** value may be nil, or if non-nil, value must be a valid integer greater than zero.

## `GET /api/public/card/:uuid/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by a public Card.

### PARAMS:

*  **`uuid`** 

*  **`field-id`**

## `GET /api/public/card/:uuid/query`

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

### PARAMS:

*  **`uuid`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.

## `GET /api/public/card/:uuid/query/:export-format`

Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
   credentials. Public sharing must be enabled.

### PARAMS:

*  **`uuid`** 

*  **`export-format`** value must be one of: `api`, `csv`, `json`, `xlsx`.

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.

## `GET /api/public/dashboard/:uuid`

Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled.

### PARAMS:

*  **`uuid`**

## `GET /api/public/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id`

Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled.

### PARAMS:

*  **`uuid`** 

*  **`card-id`** 

*  **`dashcard-id`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.

## `GET /api/public/dashboard/:uuid/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Dashboards.

### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`remapped-id`** 

*  **`value`** value must be a non-blank string.

## `GET /api/public/dashboard/:uuid/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a Card in a public Dashboard.

### PARAMS:

*  **`uuid`** 

*  **`field-id`** 

*  **`search-field-id`** 

*  **`value`** value must be a non-blank string.

*  **`limit`** value may be nil, or if non-nil, value must be a valid integer greater than zero.

## `GET /api/public/dashboard/:uuid/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard.

### PARAMS:

*  **`uuid`** 

*  **`field-id`**

## `GET /api/public/dashboard/:uuid/params/:param-key/search/:query`

Fetch filter values for dashboard parameter `param-key`, containing specified `query`.

### PARAMS:

*  **`uuid`** 

*  **`param-key`** 

*  **`query`** 

*  **`query-params`**

## `GET /api/public/dashboard/:uuid/params/:param-key/values`

Fetch filter values for dashboard parameter `param-key`.

### PARAMS:

*  **`uuid`** 

*  **`param-key`** 

*  **`query-params`**

## `GET /api/public/oembed`

oEmbed endpoint used to retreive embed code and metadata for a (public) Metabase URL.

### PARAMS:

*  **`url`** value must be a non-blank string.

*  **`format`** value may be nil, or if non-nil, value must be one of: `json`.

*  **`maxheight`** value may be nil, or if non-nil, value must be a valid integer.

*  **`maxwidth`** value may be nil, or if non-nil, value must be a valid integer.

## `GET /api/public/pivot/card/:uuid/query`

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

### PARAMS:

*  **`uuid`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.

## `GET /api/public/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id`

Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled.

### PARAMS:

*  **`uuid`** 

*  **`card-id`** 

*  **`dashcard-id`** 

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.

---

[<< Back to API index](../api-documentation.md)