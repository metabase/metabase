---
title: "Task"
summary: |
  /api/task endpoints.
---

# Task

/api/task endpoints.

  - [GET /api/task/](#get-apitask)
  - [GET /api/task/:id](#get-apitaskid)
  - [GET /api/task/info](#get-apitaskinfo)

## `GET /api/task/`

Fetch a list of recent tasks stored as Task History.

## `GET /api/task/:id`

Get `TaskHistory` entry with ID.

### PARAMS:

*  **`id`**

## `GET /api/task/info`

Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers).

---

[<< Back to API index](../api-documentation.md)