---
title: "Timeline"
summary: |
  /api/timeline endpoints.
---

# Timeline

/api/timeline endpoints.

## `DELETE /api/timeline/:id`

Delete a [[Timeline]]. Will cascade delete its events as well.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/timeline/`

Fetch a list of [[Timelines]]. Can include `archived=true` to return archived timelines.

### PARAMS:

-  **`include`** nullable enum of events.

-  **`archived`** nullable value must be a valid boolean string ('true' or 'false').

## `GET /api/timeline/:id`

Fetch the [[Timeline]] with `id`. Include `include=events` to unarchived events included on the timeline. Add
  `archived=true` to return all events on the timeline, both archived and unarchived.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`include`** nullable enum of events.

-  **`archived`** nullable value must be a valid boolean string ('true' or 'false').

-  **`start`** nullable value must be a valid date string.

-  **`end`** nullable value must be a valid date string.

## `POST /api/timeline/`

Create a new [[Timeline]].

### PARAMS:

-  **`name`** value must be a non-blank string.

-  **`default`** nullable boolean.

-  **`description`** nullable string.

-  **`icon`** nullable enum of star, cake, mail, warning, bell, cloud.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`archived`** nullable boolean.

## `PUT /api/timeline/:id`

Update the [[Timeline]] with `id`. Returns the timeline without events. Archiving a timeline will archive all of the
  events in that timeline.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

-  **`name`** nullable value must be a non-blank string.

-  **`default`** nullable boolean.

-  **`description`** nullable string.

-  **`icon`** nullable enum of star, cake, mail, warning, bell, cloud.

-  **`collection_id`** nullable value must be an integer greater than zero.

-  **`archived`** nullable boolean.

-  **`timeline-updates`**

---

[<< Back to API index](../api-documentation.md)