---
title: "Search"
summary: |
  API endpoints for Search.
---

# Search

API endpoints for Search.

## `GET /api/search/`

Search for items in Metabase.
  For the list of supported models, check [[metabase.search.config/all-models]].

  Filters:
  - `archived`: set to true to search archived items only, default is false
  - `table_db_id`: search for tables, cards, and models of a certain DB
  - `models`: only search for items of specific models. If not provided, search for all models
  - `filters_items_in_personal_collection`: only search for items in personal collections
  - `created_at`: search for items created at a specific timestamp
  - `created_by`: search for items created by a specific user
  - `last_edited_at`: search for items last edited at a specific timestamp
  - `last_edited_by`: search for items last edited by a specific user
  - `search_native_query`: set to true to search the content of native queries
  - `verified`: set to true to search for verified items only (requires Content Management or Official Collections premium feature)

  Note that not all item types support all filters, and the results will include only models that support the provided filters. For example:
  - The `created-by` filter supports dashboards, models, actions, and cards.
  - The `verified` filter supports models and cards.

  A search query that has both filters applied will only return models and cards.

### PARAMS:

-  **`filter_items_in_personal_collection`** nullable enum of only, exclude.

-  **`table_db_id`** nullable value must be an integer greater than zero.

-  **`created_by`** nullable vector of value must be an integer greater than zero.

-  **`verified`** nullable true.

-  **`created_at`** nullable value must be a non-blank string.

-  **`archived`** nullable boolean.

-  **`q`** nullable value must be a non-blank string.

-  **`search_native_query`** nullable true.

-  **`models`** nullable vector of enum of dashboard, table, dataset, segment, collection, database, action, indexed-entity, metric, card.

-  **`last_edited_by`** nullable vector of value must be an integer greater than zero.

-  **`last_edited_at`** nullable value must be a non-blank string.

-  **`model_ancestors`** nullable boolean.

## `GET /api/search/models`

Get the set of models that a search query will return.

### PARAMS:

-  **`filter_items_in_personal_collection`** 

-  **`created_by`** nullable vector of value must be an integer greater than zero.

-  **`verified`** nullable true.

-  **`created_at`** nullable value must be a non-blank string.

-  **`archived`** nullable value must be a valid boolean string ('true' or 'false').

-  **`q`** 

-  **`search_native_query`** nullable true.

-  **`last_edited_by`** nullable vector of value must be an integer greater than zero.

-  **`last_edited_at`** nullable value must be an integer greater than zero.

-  **`table-db-id`** nullable value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)