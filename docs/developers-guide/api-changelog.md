---
title: API changelog
---

# Breaking changes to the API interface

## Metabase 0.57.0

- MBQL queries (in Cards and elsewhere) are now serialized as MBQL 5 as opposed to MBQL 4 (aka legacy MBQL) in the
  application database and in REST API responses. While we do not officially support editing or introspection of MBQL
  via the REST API (please treat it as an opaque object), to support existing usages the `GET /api/card/:id` endpoint
  can return the Card `dataset_query` as MBQL 4 if you include the query parameter `?legacy-mbql=true`.

## Metabase 0.56.13

- `/api/collection/graph` endpoints now no longer return 'none' permissions in the returned graph. Missing fields in
  between group ids and collection id indicate that that the group provides no permissions for the collection. For
  example, what was returned in versions before 0.56.13:
  ```json
  {"revision": 2, "groups": {"1": {"root": "write", "1": "read", "2": "none"}}}
  ```
  becomes:
  ```json
  {"revision": 2, "groups": {"1": {"root": "write", "1": "read"}}}
  ```
  in versions 0.56.13 and up. 

## Metabase 0.55.0

- `POST /api/card/from-csv` has been renamed to `POST /api/upload/csv`.

- `GET /api/util/stats` has been renamed to `GET /api/analytics/anonymous-stats`.

- `GET /api/util/bug_report_details` has been renamed to `GET /api/bug-reporting/details`.

- `POST /api/util/product-feedback` has been renamed to `POST /api/product-feedback`.

- `POST /api/util/entity_id` has been renamed to `POST /api/eid-translation/translate`.

- `POST /api/util/password_check` has been renamed to `POST /api/session/password-check`.

- `GET /api/util/logs` has been renamed to `GET /api/logger/logs`.

- `GET /api/util/openapi` has been removed; you can use `GET /api/docs/openapi.json` instead, which does the same
  thing.

- `GET /api/util/diagnostic_info/connection_pool_info` has been renamed to `GET
/api/bug-reporting/connection-pool-details`.

## Metabase 0.54.0

- The alert system has been migrated from the legacy pulse infrastructure to the new notification system. This migration includes the following changes:

  - The majority of `/api/alert` endpoints have been removed in favor of the new `/api/notification` endpoints. For backward compatibility, these endpoints will remain available until the next release:

    - `GET /api/alert`
    - `GET /api/alert/:id`
    - `DELETE /api/alert/:id/subscription`

  - Developers should migrate to using the `/api/notification` endpoints. For reference:
    - An overview of the new notification system can be found at `src/metabase/notification/README.md`
    - Notification API documentation at `{{YOUR_URL}}/api/docs/#tag/apinotification`
    - Interactive API documentation available at `/api/docs` endpoint

## Metabase 0.53.0

- `POST /api/card/:card-id/query/:export-format`

  Previously, request parameters (parameters, pivot-results?, and format-rows?) could be sent via query parameters or
  as application/x-www-form-urlencoded form content. In Metabase 0.53.0, parameters must be sent as either:

  - application/x-www-form-urlencoded form content
  - JSON-encoded in the request body

  Sending parameters as query parameters in the URL is no longer supported.

## Metabase 0.52.0

- `POST /api/user/:id/send_invite` has been removed.
- `GET /:id/fields` now includes the Table ID.

- APIs under `/api/pulse` and `/api/alert` will be removed in a future version as we're transitioning to a new architecture.

## Metabase 0.51.0

- `GET /api/dashboard/:id/query_metadata`

  New endpoint that combines responses for `/api/field/:id`, `/api/database/:id`, and `/api/table/:id/query_metadata`.
  This should drastically cut down on the required number of requests to display a card.

- `GET /api/card/:id/query_metadata`

  New endpoint that combines responses for `/api/field/:id`, `/api/database/:id`, and `/api/table/:id/query_metadata`.
  This should drastically cut down on the required number of requests to display a dashboard.

- `/api/legacy-metric`

  The `/api/legacy-metric` endpoints have been removed.

- `POST /api/session/pulse/unsubscribe` and `POST /api/session/pulse/unsubscribe/undo` have been moved to `POST /api/pulse/unsubscribe` and `POST /api/pulse/unsubscribe/undo` respectively.

## Metabase 0.50.0

- `GET /api/collection/tree` and `GET /api/collection/:id/items`
  These API endpoints will always return official collections first, before other items in the collection.

- `PUT /api/dashboard/:id`, `PUT /api/card/:id`, and `PUT /api/collection/:id`

  When setting `archived` to `true`, the Dashboard, Card, or Collection will be automatically moved to the Trash
  collection, a special collection that holds all archived items.

  When setting `archived` to `false`, you may optionally also provide a `collection_id` (for Dashboards or Cards) or a
  `parent_id` (for Collections). In this case, the entity will be re-parented to the specified Collection when it is
  moved from the Trash. If a new `collection_id` or `parent_id` is not provided, the entity will be moved back to its
  original location if possible. If this is impossible (for example, the original location is also in the Trash) an
  error will occur.

- `/api/metric`

  The `/api/metric` endpoints has been renamed to `/api/legacy-metric` to reflect that fact it will not be used for the new version of metrics. The new version uses the `/api/card` endpoints.

- `GET /api/permissions/graph` and `PUT /api/permissions/graph`

  The `data` key has been removed from the permissions graph. The `data` key has been replaced with two new keys: `view-data` and `create-queries`.
  Valid permission values for `view-data` are `unrestricted`, `blocked`, `sandboxed` or `restricted`. Valid permission values
  for `create-queries` are `query-builder-and-native`, `query-builder`, and `no`.

  If you're scripting permissions, you'll need to update your scripts to reflect these breaking changes to the `/api/permissions/graph` endpoints. For more about the new data permissions of View data and Create queries, see our docs on [data permissions](../permissions/data.md). And here's a page that [talks about the change (and why we did it)](../permissions/no-self-service-deprecation.md).

- `GET /api/transform/:db-id/:schema/:transform-name`, which hasn't been used internally by Metabase for ages, has
  been removed.

- `POST /api/user/:id/send_invite` is deprecated and will be removed in the next version.

## Metabase 0.49.5

NOTE: These endpoint changes were added in 0.49.3, and a bug in `GET /api/embed/card/:token/query/:export-format` was fixed in 0.49.5.

- `POST /api/card/:card-id/query/:export-format`
- `POST /api/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format`
- `POST /api/dataset/:export-format`
- `GET /api/embed/card/:token/query/:export-format`
- `GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format`

  The above endpoints now accept the `format_rows` query parameter. It is an optional boolean parameter that will default to `true` if not included in the request.
  When `format_rows` is `true`, the export will have formatting applied such that the values match what they appear as in the app.
  When `format_rows` is `false`, formatting is not applied and exports will behave as they did before 0.49.0.

  The value of `format_rows` has no effect when exporting xlsx files.

## Metabase 0.49.0

- `POST /api/card` and `PUT /api/card/:id`

  The `dataset` key is deprecated and will be removed in a future version, most likely 50. In its place we have added a new key: `type` which is equivalent in that it distinguishes Models from Questions. `type="model"` is equivalent to `dataset=true` and `type="question"` is equivalent to `dataset=false`.

- all endpoints that return data (e.g. exports in JSON, XLSX, CSV, endpoints that end in "/query")

  Starting from v49, we respond to the API calls with values formatted according to the instance localization options
