---
title: "Slack"
summary: |
  /api/slack endpoints.
---

# Slack

/api/slack endpoints.

## `GET /api/slack/manifest`

Returns the YAML manifest file that should be used to bootstrap new Slack apps.

## `POST /api/slack/bug-report`

Send diagnostic information to the configured Slack channels.

### PARAMS:

-  **`diagnosticInfo`** map.

## `PUT /api/slack/settings`

Update Slack related settings. You must be a superuser to do this. Also updates the slack-cache.
  There are 3 cases where we alter the slack channel/user cache:
  1. falsy token           -> clear
  2. invalid token         -> clear
  3. truthy, valid token   -> refresh .

### PARAMS:

-  **`slack-app-token`** nullable value must be a non-blank string.

-  **`slack-files-channel`** nullable value must be a non-blank string.

-  **`slack-bug-report-channel`** nullable string.

---

[<< Back to API index](../api-documentation.md)