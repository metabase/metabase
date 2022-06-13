---
title: "Email"
summary: |
  /api/email endpoints.
---

# Email

/api/email endpoints.

  - [DELETE /api/email/](#delete-apiemail)
  - [POST /api/email/test](#post-apiemailtest)
  - [PUT /api/email/](#put-apiemail)

## `DELETE /api/email/`

Clear all email related settings. You must be a superuser or have `setting` permission to do this.

## `POST /api/email/test`

Send a test email using the SMTP Settings. You must be a superuser or have `setting` permission to do this.
  Returns `{:ok true}` if we were able to send the message successfully, otherwise a standard 400 error response.

## `PUT /api/email/`

Update multiple email Settings. You must be a superuser or have `setting` permission to do this.

### PARAMS:

*  **`settings`** value must be a map.

---

[<< Back to API index](../api-documentation.md)