---
title: "SCIM"
summary: |
  /api/ee/scim/ endpoints.
  
  This feature is still in development.
---

# SCIM

/api/ee/scim/ endpoints.

This feature is still in development.

## `DELETE /api/ee/scim/api_key`

Deletes the SCIM API key, if one exists. Equivalent to disabling SCIM.

You must be a superuser to do this.

## `POST /api/ee/scim/api_key`

Create a new SCIM API key, or refresh one that already exists. When called for the first time,
  this is equivalent to enabling SCIM.

You must be a superuser to do this.

---

[<< Back to API index](../../api-documentation.md)