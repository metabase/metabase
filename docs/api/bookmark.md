---
title: "Bookmark"
summary: |
  Handle creating bookmarks for the user. Bookmarks are in three tables and should be thought of as a tuple of (model, model-id) rather than a row in a table with an id. The DELETE takes the model and id because DELETE's do not necessarily support request bodies. The POST is therefore shaped in this same manner. Since there are three underlying tables the id on the actual bookmark itself is not unique among 'bookmarks' and is not a good identifier for using in the API.
---

# Bookmark

Handle creating bookmarks for the user. Bookmarks are in three tables and should be thought of as a tuple of (model,
  model-id) rather than a row in a table with an id. The DELETE takes the model and id because DELETE's do not
  necessarily support request bodies. The POST is therefore shaped in this same manner. Since there are three
  underlying tables the id on the actual bookmark itself is not unique among "bookmarks" and is not a good
  identifier for using in the API.

  - [DELETE /api/bookmark/:model/:id](#delete-apibookmarkmodelid)
  - [GET /api/bookmark/](#get-apibookmark)
  - [POST /api/bookmark/:model/:id](#post-apibookmarkmodelid)
  - [PUT /api/bookmark/ordering](#put-apibookmarkordering)

## `DELETE /api/bookmark/:model/:id`

Delete a bookmark. Will delete a bookmark assigned to the user making the request by model and id.

### PARAMS:

*  **`model`** value must be one of: `card`, `collection`, `dashboard`.

*  **`id`** value must be an integer greater than zero.

## `GET /api/bookmark/`

Fetch all bookmarks for the user.

## `POST /api/bookmark/:model/:id`

Create a new bookmark for user.

### PARAMS:

*  **`model`** value must be one of: `card`, `collection`, `dashboard`.

*  **`id`** value must be an integer greater than zero.

## `PUT /api/bookmark/ordering`

Sets the order of bookmarks for user.

### PARAMS:

*  **`orderings`** value must be an array.

---

[<< Back to API index](../api-documentation.md)