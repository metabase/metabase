---
title: "Task"
summary: |
  /api/task endpoints.
---

# Task

> You can view live OpenAPI docs in your own running Metabase at `/api/docs`.
   So if your Metabase is at https://www.your-metabase.com you could view
   the API docs at https://www.your-metabase.com/api/docs.

/api/task endpoints.

## `GET /api/task/`

Fetch a list of recent tasks stored as Task History.

## `GET /api/task/:id`

Get `TaskHistory` entry with ID.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/task/info`

Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers).

---

[<< Back to API index](../api-documentation.md)