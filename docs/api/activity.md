---
title: "Activity"
summary: |
  API endpoints for Activity.
---

# Activity

API endpoints for Activity.

## `GET /api/activity/`

Get recent activity.

## `GET /api/activity/popular_items`

Get the list of 5 popular things for the current user. Query takes 8 and limits to 5 so that if it
  finds anything archived, deleted, etc it can hopefully still get 5.

## `GET /api/activity/recent_views`

Get a list of 5 things the current user has been viewing most recently.

---

[<< Back to API index](../api-documentation.md)