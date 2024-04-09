---
title: "Setup"
summary: |
  API endpoints for Setup.
---

# Setup

API endpoints for Setup.

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

*  **`schedules`** nullable :metabase.sync.schedules/ExpandedSchedulesMap

*  **`allow_tracking`** nullable boolean, or value must be a valid boolean string ('true' or 'false').

*  **`invited_last_name`** nullable value must be a non-blank string.

*  **`site_locale`** nullable String must be a valid two-letter ISO language or language-country code e.g. en or en_US.

*  **`email`** value must be a valid email address.

*  **`first_name`** nullable value must be a non-blank string.

*  **`request`** 

*  **`auto_run_queries`** nullable boolean

*  **`password`** password is too common.

*  **`name`** 

*  **`invited_email`** nullable value must be a valid email address.

*  **`invited_first_name`** nullable value must be a non-blank string.

*  **`site_name`** value must be a non-blank string.

*  **`token`** Token does not match the setup token.

*  **`details`** 

*  **`database`** 

*  **`last_name`** nullable value must be a non-blank string.

## `POST /api/setup/validate`

Validate that we can connect to a database given a set of details.

### PARAMS:

*  **`engine`** value must be a valid database engine.

*  **`details`** 

*  **`token`** Token does not match the setup token.

---

[<< Back to API index](../api-documentation.md)