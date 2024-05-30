---
title: "Metabot"
summary: |
  These Metabot endpoints are for an experimental feature.
---

# Metabot

These Metabot endpoints are for an experimental feature.

## `POST /api/metabot/database/:database-id`

Ask Metabot to generate a native question given a prompt about a given database.

### PARAMS:

-  **`database-id`** value must be an integer greater than zero.

-  **`question`** value must be a non-blank string.

## `POST /api/metabot/database/:database-id/query`

Ask Metabot to generate a SQL query given a prompt about a given database.

### PARAMS:

-  **`database-id`** value must be an integer greater than zero.

-  **`question`** value must be a non-blank string.

## `POST /api/metabot/feedback`

Record feedback on metabot results.

### PARAMS:

-  **`feedback`**

## `POST /api/metabot/model/:model-id`

Ask Metabot to generate a SQL query given a prompt about a given model.

### PARAMS:

-  **`model-id`** value must be an integer greater than zero.

-  **`question`** value must be a non-blank string.

---

[<< Back to API index](../api-documentation.md)