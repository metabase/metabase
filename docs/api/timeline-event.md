---
title: "Timeline event"
summary: |
  /api/timeline-event endpoints.
---

# Timeline event

/api/timeline-event endpoints.

  - [DELETE /api/timeline-event/:id](#delete-apitimeline-eventid)
  - [GET /api/timeline-event/:id](#get-apitimeline-eventid)
  - [POST /api/timeline-event/](#post-apitimeline-event)
  - [PUT /api/timeline-event/:id](#put-apitimeline-eventid)

## `DELETE /api/timeline-event/:id`

Delete a [[TimelineEvent]].

### PARAMS:

*  **`id`**

## `GET /api/timeline-event/:id`

Fetch the [[TimelineEvent]] with `id`.

### PARAMS:

*  **`id`**

## `POST /api/timeline-event/`

Create a new [[TimelineEvent]].

### PARAMS:

*  **`timestamp`** value must be a valid date string

*  **`question_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`timezone`** value must be a string.

*  **`time_matters`** value may be nil, or if non-nil, value must be a boolean.

*  **`name`** value must be a non-blank string.

*  **`timeline_id`** value must be an integer greater than zero.

*  **`source`** value may be nil, or if non-nil, value must be one of: `collections`, `question`.

*  **`icon`** value may be nil, or if non-nil, value must be one of: `balloons`, `bell`, `cloud`, `mail`, `star`, `warning`.

## `PUT /api/timeline-event/:id`

Update a [[TimelineEvent]].

### PARAMS:

*  **`timestamp`** value may be nil, or if non-nil, value must be a valid date string

*  **`description`** value may be nil, or if non-nil, value must be a string.

*  **`archived`** value may be nil, or if non-nil, value must be a boolean.

*  **`timezone`** value may be nil, or if non-nil, value must be a string.

*  **`time_matters`** value may be nil, or if non-nil, value must be a boolean.

*  **`name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`timeline_id`** value may be nil, or if non-nil, value must be an integer greater than zero.

*  **`icon`** value may be nil, or if non-nil, value must be one of: `balloons`, `bell`, `cloud`, `mail`, `star`, `warning`.

*  **`id`** 

*  **`timeline-event-updates`**

---

[<< Back to API index](../api-documentation.md)