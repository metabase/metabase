---
title: "Util"
summary: |
  Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin page tasks.
---

# Util

Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks.

  - [GET /api/util/bug_report_details](#get-apiutilbug_report_details)
  - [GET /api/util/diagnostic_info/connection_pool_info](#get-apiutildiagnostic_infoconnection_pool_info)
  - [GET /api/util/logs](#get-apiutillogs)
  - [GET /api/util/random_token](#get-apiutilrandom_token)
  - [GET /api/util/stats](#get-apiutilstats)
  - [POST /api/util/password_check](#post-apiutilpassword_check)

## `GET /api/util/bug_report_details`

Returns version and system information relevant to filing a bug report against Metabase.

## `GET /api/util/diagnostic_info/connection_pool_info`

Returns database connection pool info for the current Metabase instance.

## `GET /api/util/logs`

Logs.

## `GET /api/util/random_token`

Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`.

## `GET /api/util/stats`

Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home.

## `POST /api/util/password_check`

Endpoint that checks if the supplied password meets the currently configured password complexity rules.

### PARAMS:

*  **`password`** password is too common.

---

[<< Back to API index](../api-documentation.md)