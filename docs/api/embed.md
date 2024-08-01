---
title: "Embed"
summary: |
  Various endpoints that use [JSON web tokens](https://jwt.io/introduction/) to fetch Cards and Dashboards.
     The endpoints are the same as the ones in `api/public/`, and differ only in the way they are authorized.
  
     To use these endpoints:
  
      1.  Set the `embedding-secret-key` Setting to a hexadecimal-encoded 32-byte sequence (i.e., a 64-character string).
          You can use `/api/util/random_token` to get a cryptographically-secure value for this.
      2.  Sign/base-64 encode a JSON Web Token using the secret key and pass it as the relevant part of the URL path
          to the various endpoints here.
  
     Tokens can have the following fields:
  
        {:resource {:question  <card-id>
                    :dashboard <dashboard-id>}
         :params   <params>}.
---

# Embed

Various endpoints that use [JSON web tokens](https://jwt.io/introduction/) to fetch Cards and Dashboards.
   The endpoints are the same as the ones in `api/public/`, and differ only in the way they are authorized.

   To use these endpoints:

    1.  Set the `embedding-secret-key` Setting to a hexadecimal-encoded 32-byte sequence (i.e., a 64-character string).
        You can use `/api/util/random_token` to get a cryptographically-secure value for this.
    2.  Sign/base-64 encode a JSON Web Token using the secret key and pass it as the relevant part of the URL path
        to the various endpoints here.

   Tokens can have the following fields:

      {:resource {:question  <card-id>
                  :dashboard <dashboard-id>}
       :params   <params>}.

## `GET /api/embed/card/:token`

Fetch a Card via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}}.

### PARAMS:

-  **`token`**

## `GET /api/embed/card/:token/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Cards.

### PARAMS:

-  **`token`** 

-  **`field-id`** value must be an integer greater than zero.

-  **`remapped-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

## `GET /api/embed/card/:token/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by an embedded Card.

### PARAMS:

-  **`token`** 

-  **`field-id`** value must be an integer greater than zero.

-  **`search-field-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

-  **`limit`** nullable value must be an integer greater than zero.

## `GET /api/embed/card/:token/field/:field-id/values`

Fetch FieldValues for a Field that is referenced by an embedded Card.

### PARAMS:

-  **`token`** 

-  **`field-id`** value must be an integer greater than zero.

## `GET /api/embed/card/:token/params/:param-key/search/:prefix`

Embedded version of chain filter search endpoint.

### PARAMS:

-  **`token`** 

-  **`param-key`** 

-  **`prefix`**

## `GET /api/embed/card/:token/params/:param-key/values`

Embedded version of api.card filter values endpoint.

### PARAMS:

-  **`token`** 

-  **`param-key`**

## `GET /api/embed/card/:token/query`

Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}.

### PARAMS:

-  **`token`** 

-  **`&`** 

-  **`query-params`**

## `GET /api/embed/card/:token/query/:export-format`

Like `GET /api/embed/card/query`, but returns the results as a file in the specified format.

### PARAMS:

-  **`token`** 

-  **`export-format`** enum of csv, api, xlsx, json.

-  **`format_rows`** nullable boolean.

-  **`query-params`**

## `GET /api/embed/dashboard/:token`

Fetch a Dashboard via a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:dashboard <dashboard-id>}}.

### PARAMS:

-  **`token`**

## `GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`.

### PARAMS:

-  **`token`** 

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`&`** 

-  **`query-params`**

## `GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format`

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key` return the data in one of the export formats.

### PARAMS:

-  **`token`** 

-  **`export-format`** enum of csv, api, xlsx, json.

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`format_rows`** nullable boolean.

-  **`query-params`**

## `GET /api/embed/dashboard/:token/field/:field-id/remapping/:remapped-id`

Fetch remapped Field values. This is the same as `GET /api/field/:id/remapping/:remapped-id`, but for use with
  embedded Dashboards.

### PARAMS:

-  **`token`** 

-  **`field-id`** value must be an integer greater than zero.

-  **`remapped-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

## `GET /api/embed/dashboard/:token/field/:field-id/search/:search-field-id`

Search for values of a Field that is referenced by a Card in an embedded Dashboard.

### PARAMS:

-  **`token`** 

-  **`field-id`** value must be an integer greater than zero.

-  **`search-field-id`** value must be an integer greater than zero.

-  **`value`** value must be a non-blank string.

-  **`limit`** nullable value must be an integer greater than zero.

## `GET /api/embed/dashboard/:token/field/:field-id/values`

Fetch FieldValues for a Field that is used as a param in an embedded Dashboard.

### PARAMS:

-  **`token`** 

-  **`field-id`** value must be an integer greater than zero.

## `GET /api/embed/dashboard/:token/params/:param-key/search/:prefix`

Embedded version of chain filter search endpoint.

### PARAMS:

-  **`token`** 

-  **`param-key`** 

-  **`prefix`** 

-  **`query-params`**

## `GET /api/embed/dashboard/:token/params/:param-key/values`

Embedded version of chain filter values endpoint.

### PARAMS:

-  **`token`** 

-  **`param-key`** 

-  **`query-params`**

## `GET /api/embed/pivot/card/:token/query`

Fetch the results of running a Card using a JSON Web Token signed with the `embedding-secret-key`.

   Token should have the following format:

     {:resource {:question <card-id>}
      :params   <parameters>}.

### PARAMS:

-  **`token`** 

-  **`&`** 

-  **`query-params`**

## `GET /api/embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id`

Fetch the results of running a Card belonging to a Dashboard using a JSON Web Token signed with the
  `embedding-secret-key`.

### PARAMS:

-  **`token`** 

-  **`dashcard-id`** value must be an integer greater than zero.

-  **`card-id`** value must be an integer greater than zero.

-  **`&`** 

-  **`query-params`**

---

[<< Back to API index](../api-documentation.md)