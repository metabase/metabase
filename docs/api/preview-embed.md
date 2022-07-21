---
title: "Preview embed"
summary: |
  Endpoints for previewing how Cards and Dashboards will look when embedding them. These endpoints are basically identical in functionality to the ones in `/api/embed`, but:  1.  Require admin access 2.  Ignore the values of `:enabled_embedding` for Cards/Dashboards 3.  Ignore the `:embed_params` whitelist for Card/Dashboards, instead using a field called `:_embedding_params` in the JWT token itself.  Refer to the documentation for those endpoints for further details.
---

# Preview embed

Endpoints for previewing how Cards and Dashboards will look when embedding them.
   These endpoints are basically identical in functionality to the ones in `/api/embed`, but:

   1.  Require admin access
   2.  Ignore the values of `:enabled_embedding` for Cards/Dashboards
   3.  Ignore the `:embed_params` whitelist for Card/Dashboards, instead using a field called `:_embedding_params` in
       the JWT token itself.

   Refer to the documentation for those endpoints for further details.

  - [GET /api/preview-embed/card/:token](#get-apipreview-embedcardtoken)
  - [GET /api/preview-embed/card/:token/query](#get-apipreview-embedcardtokenquery)
  - [GET /api/preview-embed/dashboard/:token](#get-apipreview-embeddashboardtoken)
  - [GET /api/preview-embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id](#get-apipreview-embeddashboardtokendashcarddashcard-idcardcard-id)
  - [GET /api/preview-embed/pivot/card/:token/query](#get-apipreview-embedpivotcardtokenquery)
  - [GET /api/preview-embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id](#get-apipreview-embedpivotdashboardtokendashcarddashcard-idcardcard-id)

## `GET /api/preview-embed/card/:token`

Fetch a Card you're considering embedding by passing a JWT `token`.

### PARAMS:

*  **`token`**

## `GET /api/preview-embed/card/:token/query`

Fetch the query results for a Card you're considering embedding by passing a JWT `token`.

### PARAMS:

*  **`token`** 

*  **`&`** 

*  **`query-params`**

## `GET /api/preview-embed/dashboard/:token`

Fetch a Dashboard you're considering embedding by passing a JWT `token`. .

### PARAMS:

*  **`token`**

## `GET /api/preview-embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`.

### PARAMS:

*  **`token`** 

*  **`dashcard-id`** 

*  **`card-id`** 

*  **`&`** 

*  **`query-params`**

## `GET /api/preview-embed/pivot/card/:token/query`

Fetch the query results for a Card you're considering embedding by passing a JWT `token`.

### PARAMS:

*  **`token`** 

*  **`&`** 

*  **`query-params`**

## `GET /api/preview-embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard you're considering embedding with JWT `token`.

### PARAMS:

*  **`token`** 

*  **`dashcard-id`** 

*  **`card-id`** 

*  **`&`** 

*  **`query-params`**

---

[<< Back to API index](../api-documentation.md)