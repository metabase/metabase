---
title: "Cloud migration"
summary: |
  /api/cloud-migration endpoints.
    Only one migration should be happening at any given time.
    But if something weird happens with concurrency, /cancel will
    cancel all of them. .
---

# Cloud migration

> You can view live OpenAPI docs in your own running Metabase at `/api/docs`.
   So if your Metabase is at https://www.your-metabase.com you could view
   the API docs at https://www.your-metabase.com/api/docs.

/api/cloud-migration endpoints.
  Only one migration should be happening at any given time.
  But if something weird happens with concurrency, /cancel will
  cancel all of them. .

## `GET /api/cloud-migration/`

Get the latest cloud migration, if any.

You must be a superuser to do this.

## `POST /api/cloud-migration/`

Initiate a new cloud migration.

You must be a superuser to do this.

## `PUT /api/cloud-migration/cancel`

Cancel any ongoing cloud migrations, if any.

You must be a superuser to do this.

---

[<< Back to API index](../api-documentation.md)