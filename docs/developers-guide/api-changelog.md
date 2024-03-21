---
title: API changelog
---

# Breaking changes to the API interface

## Metabase 0.50.0

- `/api/metric`

   The `/api/metric` endpoints has been renamed to `/api/legacy-metric` to reflect that fact it will not be used for the new version of metrics. The new version uses the `/api/card` endpoints.

## Metabase 0.49.0
- `POST /api/card` and `PUT /api/card/:id`

   The `dataset` key is deprecated and will be removed in a future version, most likely 50. In its place we have added a new key: `type` which is equivalent in that it distinguishes Models from Questions. `type="model"` is equivalent to `dataset=true` and `type="question"` is equivalent to `dataset=false`.

- all endpoints that return data (e.g. exports in JSON, XLSX, CSV, endpoints that end in "/query")

   Starting from v49, we respond to the API calls with values formatted according to the instance localization options
