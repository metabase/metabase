---
title: "Automagic dashboards"
summary: |
  API endpoints for Automagic dashboards.
---

# Automagic dashboards

API endpoints for Automagic dashboards.

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query`

Return an automagic dashboard for entity `entity` with id `id`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** 

-  **`show`** nullable must equal all, or natural integer.

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query`

Return an automagic dashboard analyzing cell in  automagic dashboard for entity `entity`
   defined by
   query `cell-query`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** value must be a non-blank string.

-  **`cell-query`** value couldn't be parsed as base64 encoded JSON.

-  **`show`** invalid show value.

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `id` defined by query `cell-query`; compared with entity `comparison-entity` with id
   `comparison-entity-id-or-query.`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** value must be a non-blank string.

-  **`cell-query`** value couldn't be parsed as base64 encoded JSON.

-  **`show`** invalid show value.

-  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc".

-  **`comparison-entity-id-or-query`**

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:dashboard-template`

Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-query` using dashboard-template `dashboard-template`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** value must be a non-blank string.

-  **`cell-query`** value couldn't be parsed as base64 encoded JSON.

-  **`prefix`** invalid value for prefix.

-  **`dashboard-template`** invalid value for dashboard template name.

-  **`show`** invalid show value.

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:dashboard-template/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `id` defined by query `cell-query` using dashboard-template `dashboard-template`; compared with entity
   `comparison-entity` with id `comparison-entity-id-or-query.`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** value must be a non-blank string.

-  **`cell-query`** value couldn't be parsed as base64 encoded JSON.

-  **`prefix`** invalid value for prefix.

-  **`dashboard-template`** invalid value for dashboard template name.

-  **`show`** invalid show value.

-  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc".

-  **`comparison-entity-id-or-query`**

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for entity `entity` with id `id` compared with entity
   `comparison-entity` with id `comparison-entity-id-or-query.`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** value must be a non-blank string.

-  **`show`** invalid show value.

-  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc".

-  **`comparison-entity-id-or-query`**

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/query_metadata`

Return all metadata for an automagic dashboard for entity `entity` with id `id`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`**

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/rule/:prefix/:dashboard-template`

Return an automagic dashboard for entity `entity` with id `id` using dashboard-template `dashboard-template`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** value must be a non-blank string.

-  **`prefix`** invalid value for prefix.

-  **`dashboard-template`** invalid value for dashboard template name.

-  **`show`** invalid show value.

## `GET /api/automagic-dashboards/:entity/:entity-id-or-query/rule/:prefix/:dashboard-template/compare/:comparison-entity/:comparison-entity-id-or-query`

Return an automagic comparison dashboard for entity `entity` with id `id` using dashboard-template `dashboard-template`;
   compared with entity `comparison-entity` with id `comparison-entity-id-or-query.`.

### PARAMS:

-  **`entity`** Invalid entity type.

-  **`entity-id-or-query`** value must be a non-blank string.

-  **`prefix`** invalid value for prefix.

-  **`dashboard-template`** invalid value for dashboard template name.

-  **`show`** invalid show value.

-  **`comparison-entity`** Invalid comparison entity type. Can only be one of "table", "segment", or "adhoc".

-  **`comparison-entity-id-or-query`**

## `GET /api/automagic-dashboards/database/:id/candidates`

Return a list of candidates for automagic dashboards ordered by interestingness.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/automagic-dashboards/model_index/:model-index-id/primary_key/:pk-id`

Return an automagic dashboard for an entity detail specified by `entity`
  with id `id` and a primary key of `indexed-value`.

### PARAMS:

-  **`model-index-id`** integer.

-  **`pk-id`** integer.

---

[<< Back to API index](../api-documentation.md)