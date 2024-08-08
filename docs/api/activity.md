---
title: "Activity"
summary: |
  API endpoints for Activity.
---

# Activity

API endpoints for Activity.

## `GET /api/activity/most_recently_viewed_dashboard`

Get the most recently viewed dashboard for the current user. Returns a 204 if the user has not viewed any dashboards
   in the last 24 hours.

## `GET /api/activity/popular_items`

Get the list of 5 popular things on the instance. Query takes 8 and limits to 5 so that if it finds anything
  archived, deleted, etc it can usually still get 5. .

## `GET /api/activity/recent_views`

Get a list of 100 models (cards, models, tables, dashboards, and collections) that the current user has been viewing most
  recently. Return a maximum of 20 model of each, if they've looked at at least 20.

---

[<< Back to API index](../api-documentation.md)