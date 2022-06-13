---
title: "Sandbox user"
summary: |
  Endpoint(s)for setting user attributes.
---

# Sandbox user

Endpoint(s)for setting user attributes.

  - [GET /api/ee/sandbox/user/attributes](#get-apieesandboxuserattributes)
  - [PUT /api/ee/sandbox/user/:id/attributes](#put-apieesandboxuseridattributes)

## `GET /api/ee/sandbox/user/attributes`

Fetch a list of possible keys for User `login_attributes`. This just looks at keys that have already been set for
  existing Users and returns those. .

## `PUT /api/ee/sandbox/user/:id/attributes`

Update the `login_attributes` for a User.

### PARAMS:

*  **`id`** 

*  **`login_attributes`** value must be a valid user attributes map (name -> value)

---

[<< Back to API index](../../api-documentation.md)