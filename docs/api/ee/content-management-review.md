---
title: "Content management review"
summary: |
  API endpoints for Content management review.
---

# Content management review

API endpoints for Content management review.

  - [POST /api/moderation-review/review/](#post-apimoderation-reviewreview)

## `POST /api/moderation-review/review/`

Create a new `ModerationReview`.

You must be a superuser to do this.

### PARAMS:

*  **`text`** value may be nil, or if non-nil, value must be a string.

*  **`moderated_item_id`** value must be an integer greater than zero.

*  **`moderated_item_type`** value must be one of: `:card`, `:dashboard`, `card`, `dashboard`.

*  **`status`** value must be one of: ``, `verified`.

---

[<< Back to API index](../../api-documentation.md)