---
title: "Preview embed"
summary: |
  Endpoints for previewing how Cards and Dashboards will look when embedding them.
     These endpoints are basically identical in functionality to the ones in `/api/embed`, but:
  
     1.  Require admin access
     2.  Ignore the values of `:enabled_embedding` for Cards/Dashboards
     3.  Ignore the `:embed_params` whitelist for Card/Dashboards, instead using a field called `:_embedding_params` in
         the JWT token itself.
  
     Refer to the documentation for those endpoints for further details.
---

# Preview embed

Endpoints for previewing how Cards and Dashboards will look when embedding them.
   These endpoints are basically identical in functionality to the ones in `/api/embed`, but:

   1.  Require admin access
   2.  Ignore the values of `:enabled_embedding` for Cards/Dashboards
   3.  Ignore the `:embed_params` whitelist for Card/Dashboards, instead using a field called `:_embedding_params` in
       the JWT token itself.

   Refer to the documentation for those endpoints for further details.

## `GET /api/preview-embed/card/:token`

Fetch a Card you're considering embedding by passing a JWT `token`.

### PARAMS:

-  **`token`** value must be a non-blank string.

## `GET /api/preview-embed/card/:token/query`

Fetch the query results for a Card you're considering embedding by passing a JWT `token`.

### PARAMS:

-  **`token`** value must be a non-blank string.

-  **`&`** 

-  **`query-params`**

## `GET /api/preview-embed/dashboard/:token`

Fetch a Dashboard you're considering embedding by passing a JWT `token`. .

### PARAMS:

-  **`token`** value must be a non-blank string.

## `GET /api/preview-embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`.

### PARAMS:

-  **`token`** value must be a non-blank string.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`&`** 

-  **`query-params`**

## `GET /api/preview-embed/dashboard/:token/params/:param-key/values`

Embedded version of chain filter values endpoint.

### PARAMS:

-  **`token`** 

-  **`param-key`** 

-  **`query-params`**

## `GET /api/preview-embed/pivot/card/:token/query`

Fetch the query results for a Card you're considering embedding by passing a JWT `token`.

### PARAMS:

-  **`token`** value must be a non-blank string.

-  **`&`** 

-  **`query-params`**

## `GET /api/preview-embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`.

### PARAMS:

-  **`token`** value must be a non-blank string.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`&`** 

-  **`query-params`**

---

[<< Back to API index](../api-documentation.md)