---
title: API changelog
---

# Breaking changes to the API interface

## Metabase 0.50.0

- `GET /api/collection/tree` and `GET /api/collection/:id/items`
  These API endpoints will always return official collections first, before other items in the collection.

- `PUT /api/dashboard/:id`, `PUT /api/card/:id`, and `PUT /api/collection/:id`

  When setting `archived` to `true`, the Dashboard, Card, or Collection will be automatically moved to the Trash
  collection, a special collection that holds all archived items.

  When setting `archived` to `false`, you may optionally also provide a `collection_id` (for Dashboards or Cards) or a
  `parent_id` (for Collections). In this case, the entity will be re-parented to the specified Collection when it is
  moved from the Trash. If a new `collection_id` or `parent_id` is not provided, the entity will be moved back to its
  original location if possible. If this is not possible (for example, the original location is also in the Trash) an
  error will occur.

- `/api/metric`

   The `/api/metric` endpoints has been renamed to `/api/legacy-metric` to reflect that fact it will not be used for the new version of metrics. The new version uses the `/api/card` endpoints.

- `GET /api/permissions/graph` and `PUT /api/permissions/graph`

   The `data` key has been removed from the permissions graph. It has been replaced with `view-data` and `create-queries`.
   Valid permission values for `view-data` are `unrestricted`, `blocked`, `sandboxed` or `restricted`. Valid permission values
   for `create-queries` are `query-builder-and-native`, `query-builder`, and `no`.

- `GET /api/transform/:db-id/:schema/:transform-name`, which hasn't been used internally by Metabase for ages, has
  been removed.

## Metabase 0.49.0
- `POST /api/card` and `PUT /api/card/:id`

   The `dataset` key is deprecated and will be removed in a future version, most likely 50. In its place we have added a new key: `type` which is equivalent in that it distinguishes Models from Questions. `type="model"` is equivalent to `dataset=true` and `type="question"` is equivalent to `dataset=false`.

- all endpoints that return data (e.g. exports in JSON, XLSX, CSV, endpoints that end in "/query")

   Starting from v49, we respond to the API calls with values formatted according to the instance localization options