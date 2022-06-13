---
title: "Card"
summary: |
  /api/card endpoints.
---

# Card

/api/card endpoints.

  - [DELETE /api/card/:card-id/public_link](#delete-apicardcard-idpublic_link)
  - [DELETE /api/card/:id](#delete-apicardid)
  - [GET /api/card/](#get-apicard)
  - [GET /api/card/:id](#get-apicardid)
  - [GET /api/card/:id/related](#get-apicardidrelated)
  - [GET /api/card/:id/timelines](#get-apicardidtimelines)
  - [GET /api/card/embeddable](#get-apicardembeddable)
  - [GET /api/card/public](#get-apicardpublic)
  - [POST /api/card/](#post-apicard)
  - [POST /api/card/:card-id/public_link](#post-apicardcard-idpublic_link)
  - [POST /api/card/:card-id/query](#post-apicardcard-idquery)
  - [POST /api/card/:card-id/query/:export-format](#post-apicardcard-idqueryexport-format)
  - [POST /api/card/:id/copy](#post-apicardidcopy)
  - [POST /api/card/collections](#post-apicardcollections)
  - [POST /api/card/pivot/:card-id/query](#post-apicardpivotcard-idquery)
  - [POST /api/card/related](#post-apicardrelated)
  - [PUT /api/card/:id](#put-apicardid)

## `DELETE /api/card/:card-id/public_link`

Delete the publicly-accessible link to this Card.

### PARAMS:

*  **`card-id`**

## `DELETE /api/card/:id`

Delete a Card. (DEPRECATED -- don't delete a Card anymore -- archive it instead.).

### PARAMS:

*  **`id`**

## `GET /api/card/`

Get all the Cards. Option filter param `f` can be used to change the set of Cards that are returned; default is
  `all`, but other options include `mine`, `bookmarked`, `database`, `table`, `recent`, `popular`, and `archived`. See
  corresponding implementation functions above for the specific behavior of each filter option. :card_index:.

### PARAMS:

*  **`f`** value may be nil, or if non-nil, value must be one of: `all`, `archived`, `bookmarked`, `database`, `mine`, `popular`, `recent`, `table`.

*  **`model_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `GET /api/card/:id`

Get `Card` with ID.

### PARAMS:

*  **`id`**

## `GET /api/card/:id/related`

Return related entities.

### PARAMS:

*  **`id`**

## `GET /api/card/:id/timelines`

Get the timelines for card with ID. Looks up the collection the card is in and uses that.

### PARAMS:

*  **`id`** 

*  **`include`** value may be nil, or if non-nil, value must be one of: `events`.

*  **`start`** value may be nil, or if non-nil, value must be a valid date string

*  **`end`** value may be nil, or if non-nil, value must be a valid date string

## `GET /api/card/embeddable`

Fetch a list of Cards where `enable_embedding` is `true`. The cards can be embedded using the embedding endpoints
  and a signed JWT.

## `GET /api/card/public`

Fetch a list of Cards with public UUIDs. These cards are publicly-accessible *if* public sharing is enabled.

## `POST /api/card/`

Create a new `Card`.

### PARAMS:

*  **`visualization_settings`** value must be a map.

*  **`description`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`result_metadata`** value may be nil, or if non-nil, value must be an array of valid results column metadata maps.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`name`** value must be a non-blank string.

*  **`cache_ttl`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`dataset_query`** 

*  **`display`** value must be a non-blank string.

## `POST /api/card/:card-id/public_link`

Generate publicly-accessible links for this Card. Returns UUID to be used in public links. (If this Card has
  already been shared, it will return the existing public link rather than creating a new one.)  Public sharing must
  be enabled.

### PARAMS:

*  **`card-id`**

## `POST /api/card/:card-id/query`

Run the query associated with a Card.

### PARAMS:

*  **`card-id`** 

*  **`parameters`** 

*  **`ignore_cache`** value may be nil, or if non-nil, value must be a boolean.

*  **`dashboard_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`collection_preview`** value may be nil, or if non-nil, value must be a boolean.

## `POST /api/card/:card-id/query/:export-format`

Run the query associated with a Card, and return its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions).

### PARAMS:

*  **`card-id`** 

*  **`export-format`** value must be one of: `api`, `csv`, `json`, `xlsx`.

*  **`parameters`** value may be nil, or if non-nil, value must be a valid JSON string.

## `POST /api/card/:id/copy`

Copy a `Card`, with the new name 'Copy of _name_'.

### PARAMS:

*  **`id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `POST /api/card/collections`

Bulk update endpoint for Card Collections. Move a set of `Cards` with CARD_IDS into a `Collection` with
  COLLECTION_ID, or remove them from any Collections by passing a `null` COLLECTION_ID.

### PARAMS:

*  **`card_ids`** value must be an array. Each value must be an integer greater than zero.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

## `POST /api/card/pivot/:card-id/query`

Run the query associated with a Card.

### PARAMS:

*  **`card-id`** 

*  **`parameters`** 

*  **`ignore_cache`** value may be nil, or if non-nil, value must be a boolean.

## `POST /api/card/related`

Return related entities for an ad-hoc query.

### PARAMS:

*  **`query`**

## `PUT /api/card/:id`

Update a `Card`.

### PARAMS:

*  **`visualization_settings`** value may be nil, or if non-nil, value must be a map.

*  **`dataset`** value may be nil, or if non-nil, value must be a boolean.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_position`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`result_metadata`** value may be nil, or if non-nil, value must be an array of valid results column metadata maps.

*  **`enable_embedding`** value may be nil, or if non-nil, value must be a boolean.

*  **`collection_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`card-updates`** 

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`embedding_params`** value may be nil, or if non-nil, value must be a valid embedding params map.

*  **`cache_ttl`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`dataset_query`** value may be nil, or if non-nil, value must be a map.

*  **`id`** 

*  **`display`** value may be nil, or if non-nil, value must be a non-blank string.

---

[<< Back to API index](../api-documentation.md)