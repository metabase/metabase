---
title: "Cards"
summary: |
  Bulk endpoints for Cards.
---

# Cards

Bulk endpoints for Cards.

## `POST /api/cards/dashboards`

Get the dashboards that multiple cards appear in. The response is a sequence of maps, each of which has a `card_id`
  and `dashboards`. `dashboard` may include an `:error` key, either `:unreadable-dashboard` or
  `:unwritable-dashboard`. In the case of an `unreadable-dashboard` the dashboard details (name, ID) will NOT be
  present.

### PARAMS:

-  **`card_ids`** sequence of value must be an integer greater than zero.

## `POST /api/cards/move`

Moves a number of Cards to a single collection or dashboard.

  For now, just either succeed or fail as a batch - we can think more about error handling later down the road.

### PARAMS:

-  **`card_ids`** sequence of value must be an integer greater than zero.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`dashboard_id`** nullable value must be an integer greater than zero.

---

[<< Back to API index](../api-documentation.md)