---
title: "Query reference validation"
summary: |
  API endpoints for Query reference validation.
---

# Query reference validation

API endpoints for Query reference validation.

## `GET /api/ee/query-reference-validation/invalid-cards`

List of cards that have an invalid reference in their query. Shape of each card is standard, with the addition of an
  `errors` key. Supports pagination (`offset` and `limit`), so it returns something in the shape:

  ```
    {:total  200
     :data   [card1, card2, ...]
     :limit  50
     :offset 100
  ```

### PARAMS:

-  **`sort_column`** nullable enum of collection, created_by, name, last_edited_at.

-  **`sort_direction`** nullable enum of desc, asc.

-  **`collection_id`** nullable value must be an integer greater than zero.

---

[<< Back to API index](../../api-documentation.md)