---
title: API changelog
---

# Breaking changes to the API interface

## Metabase 0.50.0
- `DELETE /api/card` and `DELETE /api/dashboard`

  These have been out of use since 2017 and have now been removed. Cards and dashboards should be archived (via `PUT
  /api/card/` or `PUT /api/dashboard`), not hard-deleted

## Metabase 0.49.0
- `POST /api/card` and `PUT /api/card/:id`

  The `dataset` key is deprecated and will be removed in a future version, most likely 50. In its place we have added a
  new key: `type` which is equivalent in that it distinguishes Models from Questions. `type="model"` is equivalent to
  `dataset=true` and `type="question"` is equivalent to `dataset=false`.
