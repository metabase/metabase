---
title: "Tiles"
summary: |
  `/api/tiles` endpoints.
---

# Tiles

`/api/tiles` endpoints.

## `GET /api/tiles/:zoom/:x/:y/:lat-field/:lon-field`

This endpoints provides an image with the appropriate pins rendered given a MBQL `query` (passed as a GET query
  string param). We evaluate the query and find the set of lat/lon pairs which are relevant and then render the
  appropriate ones. It's expected that to render a full map view several calls will be made to this endpoint in
  parallel.

### PARAMS:

*  **`zoom`** value must be a valid integer.

*  **`x`** value must be a valid integer.

*  **`y`** value must be a valid integer.

*  **`lat-field`** value must be a string.

*  **`lon-field`** value must be a string.

*  **`query`** value must be a valid JSON string.

---

[<< Back to API index](../api-documentation.md)