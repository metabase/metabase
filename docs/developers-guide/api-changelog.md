---
title: API changelog
---

# Breaking changes to the API interface

## Metabase 0.49.0
- `POST /api/card` and `PUT /api/card/:id`

  `dataset` is deprecated and will be removed in future version. Instead use `type=model` (equivalent to `dataset=true`) or `type=query` (equivalent to `dataset=false`).