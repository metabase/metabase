---
title: "Cache"
summary: |
  API endpoints for Cache.
---

# Cache

API endpoints for Cache.

## `DELETE /api/cache/`

Delete cache configurations.

### PARAMS:

-  **`model`** enum of root, database, dashboard, question.

-  **`model_id`** vector of value must be an integer greater than zero.

## `GET /api/cache/`

Return cache configuration.

### PARAMS:

-  **`model`** vector of enum of root, database, dashboard, question.

-  **`collection`** nullable value must be an integer greater than zero.

-  **`id`** nullable value must be an integer greater than zero.

## `POST /api/cache/invalidate`

Invalidate cache entries.

  Use it like `/api/cache/invalidate?database=1&dashboard=15` (any number of database/dashboard/question can be
  supplied).

  `&include=overrides` controls whenever you want to invalidate cache for a specific cache configuration without
  touching all nested configurations, or you want your invalidation to trickle down to every card.

### PARAMS:

-  **`include`** All cache configuration overrides should invalidate cache too.

-  **`database`** A database id.

-  **`dashboard`** A dashboard id.

-  **`question`** A question id.

## `PUT /api/cache/`

Store cache configuration.

### PARAMS:

-  **`model`** enum of root, database, dashboard, question.

-  **`model_id`** value must be an integer greater than zero.

-  **`strategy`** map where {:type -> <enum of :nocache, :ttl>}, and one of <:nocache = map where {:type -> <keyword>} | :ttl = map where {:type -> <must equal :ttl>, :multiplier -> <value must be an integer greater than zero.>, :min_duration_ms -> <value must be an integer greater than zero.>} with no other keys> dispatched by :type.

-  **`config`**

---

[<< Back to API index](../api-documentation.md)