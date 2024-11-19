---
title: "Content verification review"
summary: |
  API endpoints for Content verification review.
---

# Content verification review

API endpoints for Content verification review.

## `POST /api/moderation-review/review/`

Create a new `ModerationReview`.

You must be a superuser to do this.

### PARAMS:

-  **`text`** nullable string.

-  **`moderated_item_id`** value must be an integer greater than zero.

-  **`moderated_item_type`** enum of card, :card.

-  **`status`** nullable nullable enum of verified.

---

[<< Back to API index](../../api-documentation.md)