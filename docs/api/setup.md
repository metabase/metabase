---
title: "Setup"
summary: |
  API endpoints for Setup.
---

# Setup

API endpoints for Setup.

  - [GET /api/setup/admin_checklist](#get-apisetupadmin_checklist)
  - [GET /api/setup/user_defaults](#get-apisetupuser_defaults)
  - [POST /api/setup/](#post-apisetup)
  - [POST /api/setup/validate](#post-apisetupvalidate)

## `GET /api/setup/admin_checklist`

Return various "admin checklist" steps and whether they've been completed. You must be a superuser to see this!

## `GET /api/setup/user_defaults`

Returns object containing default user details for initial setup, if configured,
   and if the provided token value matches the token in the configuration value.

### PARAMS:

*  **`token`**

## `POST /api/setup/`

Special endpoint for creating the first user during setup. This endpoint both creates the user AND logs them in and
  returns a session ID. This endpoint can also be used to add a database, create and invite a second admin, and/or
  set specific settings from the setup flow.

### PARAMS:

*  **`engine`** 

*  **`schedules`** value may be nil, or if non-nil, value must be a valid map of schedule maps for a DB.

*  **`allow_tracking`** value may be nil, or if non-nil, value must satisfy one of the following requirements: 1) value must be a boolean. 2) value must be a valid boolean string ('true' or 'false').

*  **`invited_last_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`site_locale`** value may be nil, or if non-nil, String must be a valid two-letter ISO language or language-country code e.g. en or en_US.

*  **`email`** value must be a valid email address.

*  **`first_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`request`** 

*  **`auto_run_queries`** value may be nil, or if non-nil, value must be a boolean.

*  **`password`** password is too common.

*  **`name`** 

*  **`invited_email`** value may be nil, or if non-nil, value must be a valid email address.

*  **`invited_first_name`** value may be nil, or if non-nil, value must be a non-blank string.

*  **`site_name`** value must be a non-blank string.

*  **`token`** Token does not match the setup token.

*  **`details`** 

*  **`database`** 

*  **`last_name`** value may be nil, or if non-nil, value must be a non-blank string.

## `POST /api/setup/validate`

Validate that we can connect to a database given a set of details.

### PARAMS:

*  **`engine`** value must be a valid database engine.

*  **`details`** 

*  **`token`** Token does not match the setup token.

---

[<< Back to API index](../api-documentation.md)