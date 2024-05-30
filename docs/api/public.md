---
title: "Public"
summary: |
  Metabase API endpoints for viewing publicly-accessible Cards and Dashboards.
---

# Public

Metabase API endpoints for viewing publicly-accessible Cards and Dashboards.

## `GET /api/public/action/:uuid`

Fetch a publicly-accessible Action. Does not require auth credentials. Public sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

## `GET /api/public/card/:uuid`

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

## `GET /api/public/card/:uuid/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Cards.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`field-id`** value must be an integer greater than zero.

-  **`remapped-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

## `GET /api/public/card/:uuid/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a public Card.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`field-id`** value must be an integer greater than zero.

-  **`search-field-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

-  **`limit`** nullable value must be an integer greater than zero.

## `GET /api/public/card/:uuid/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by a public Card.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`field-id`** value must be an integer greater than zero.

## `GET /api/public/card/:uuid/params/:param-key/search/:query`

Fetch values for a parameter on a public card containing `query`.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`param-key`** value must be a non-blank string.

-  **`query`** value must be a non-blank string.

## `GET /api/public/card/:uuid/params/:param-key/values`

Fetch values for a parameter on a public card.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`param-key`** value must be a non-blank string.

## `GET /api/public/card/:uuid/query`

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`parameters`** nullable value must be a valid JSON string.

## `GET /api/public/card/:uuid/query/:export-format`

Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
  credentials. Public sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`export-format`** enum of csv, api, xlsx, json.

-  **`parameters`** nullable value must be a valid JSON string.

-  **`format_rows`** nullable boolean.

## `GET /api/public/dashboard/:uuid`

Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

## `GET /api/public/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id`

Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`card-id`** value must be an integer greater than zero.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`parameters`** nullable value must be a valid JSON string.

## `GET /api/public/dashboard/:uuid/dashcard/:dashcard-id/execute`

Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`parameters`** value must be a valid JSON string.

## `GET /api/public/dashboard/:uuid/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with public
  Dashboards.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`field-id`** value must be an integer greater than zero.

-  **`remapped-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

## `GET /api/public/dashboard/:uuid/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a Card in a public Dashboard.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`field-id`** value must be an integer greater than zero.

-  **`search-field-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

-  **`limit`** nullable value must be an integer greater than zero.

## `GET /api/public/dashboard/:uuid/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by a Card in a public Dashboard.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`field-id`** value must be an integer greater than zero.

## `GET /api/public/dashboard/:uuid/params/:param-key/search/:query`

Fetch filter values for dashboard parameter `param-key`, containing specified `query`.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`param-key`** value must be a non-blank string.

-  **`query`** value must be a non-blank string.

-  **`constraint-param-key->value`**

## `GET /api/public/dashboard/:uuid/params/:param-key/values`

Fetch filter values for dashboard parameter `param-key`.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`param-key`** value must be a non-blank string.

-  **`constraint-param-key->value`**

## `GET /api/public/oembed`

oEmbed endpoint used to retreive embed code and metadata for a (public) Metabase URL.

### PARAMS:

-  **`url`** value must be a non-blank string.

-  **`format`** nullable enum of json.

-  **`maxheight`** nullable value must be a valid integer.

-  **`maxwidth`** nullable value must be a valid integer.

## `GET /api/public/pivot/card/:uuid/query`

Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`parameters`** nullable value must be a valid JSON string.

## `GET /api/public/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id`

Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
  sharing must be enabled.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`card-id`** value must be an integer greater than zero.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`parameters`** nullable value must be a valid JSON string.

## `POST /api/public/action/:uuid/execute`

Execute the Action.

   `parameters` should be the mapped dashboard parameters with values.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`parameters`** nullable map from <keyword> to <anything>.

-  **`_body`**

## `POST /api/public/dashboard/:uuid/dashcard/:dashcard-id/execute`

Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values.

### PARAMS:

-  **`uuid`** value must be a valid UUID.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`parameters`** nullable map from <keyword> to <anything>.

-  **`_body`**

---

[<< Back to API index](../api-documentation.md)