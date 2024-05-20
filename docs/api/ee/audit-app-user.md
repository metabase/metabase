---
title: "Audit app user"
summary: |
  `/api/ee/audit-app/user` endpoints. These only work if you have a premium token with the `:audit-app` feature.
---

# Audit app user

`/api/ee/audit-app/user` endpoints. These only work if you have a premium token with the `:audit-app` feature.

## `DELETE /api/ee/audit-app/user/:id/subscriptions`

Delete all Alert and DashboardSubscription subscriptions for a User (i.e., so they will no longer receive them).
  Archive all Alerts and DashboardSubscriptions created by the User. Only allowed for admins or for the current user.

### PARAMS:

-  **`id`** value must be an integer greater than zero.

## `GET /api/ee/audit-app/user/audit-info`

Gets audit info for the current user if he has permissions to access the audit collection.
  Otherwise return an empty map.

---

[<< Back to API index](../../api-documentation.md)