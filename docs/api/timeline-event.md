---
title: "Timeline event"
summary: |
  /api/timeline-event endpoints.
---

# Timeline event

/api/timeline-event endpoints.

## `DELETE /api/timeline-event/:id`

Delete a [[TimelineEvent]].

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/timeline-event/:id`

Fetch the [[TimelineEvent]] with `id`.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `POST /api/timeline-event/`

Create a new [[TimelineEvent]].

### PARAMS:

-  **`timestamp`** value must be a valid date string.

-  **`question_id`** nullable value must be an integer greater than zero.

-  **`description`** nullable string.

-  **`archived`** nullable boolean.

-  **`timezone`** string.

-  **`time_matters`** nullable boolean.

-  **`name`** value must be a non-blank string.

-  **`timeline_id`** value must be an integer greater than zero.

-  **`source`** nullable enum of collections, question.

-  **`icon`** nullable enum of star, cake, mail, warning, bell, cloud.

## `PUT /api/timeline-event/:id`

Update a [[TimelineEvent]].

### PARAMS:

-  **`timestamp`** nullable value must be a valid date string.

-  **`description`** nullable string.

-  **`archived`** nullable boolean.

-  **`timezone`** nullable string.

-  **`time_matters`** nullable boolean.

-  **`name`** nullable value must be a non-blank string.

-  **`timeline_id`** nullable value must be an integer greater than zero.

-  **`icon`** nullable enum of star, cake, mail, warning, bell, cloud.

-  **`id`** value must be an integer greater than zero.

-  **`timeline-event-updates`**

---

[<< Back to API index](../api-documentation.md)