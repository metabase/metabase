---
title: "Scim"
summary: |
  /api/ee/scim/ endpoints.
---

# Scim

/api/ee/scim/ endpoints.

## `DELETE metabase-enterprise.scim.api/api_key`

Deletes the SCIM API key, if one exists. Equivalent to disabling SCIM.

You must be a superuser to do this.

## `POST metabase-enterprise.scim.api/api_key`

Create a new SCIM API key, or refresh one that already exists. When called for the first time,
  this is equivalent to enabling SCIM.

You must be a superuser to do this.

---

[<< Back to API index](../api-documentation.md)