---
title: "GeoJSON"
summary: |
  API endpoints for GeoJSON.
---

# GeoJSON

> You can view live OpenAPI docs in your own running Metabase at `/api/docs`.
   So if your Metabase is at https://www.your-metabase.com you could view
   the API docs at https://www.your-metabase.com/api/docs.

API endpoints for GeoJSON.

## `GET /api/geojson/`

Load a custom GeoJSON file based on a URL or file path provided as a query parameter.
  This behaves similarly to /api/geojson/:key but doesn't require the custom map to be saved to the DB first.

### PARAMS:

-  **`url`** value must be a non-blank string.

-  **`respond`** 

-  **`raise`**

## `GET /api/geojson/:key`

Fetch a custom GeoJSON file as defined in the `custom-geojson` setting. (This just acts as a simple proxy for the
  file specified for `key`).

### PARAMS:

-  **`key`** value must be a non-blank string.

-  **`respond`** 

-  **`raise`**

---

[<< Back to API index](../api-documentation.md)