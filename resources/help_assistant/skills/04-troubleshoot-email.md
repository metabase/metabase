---
id: troubleshoot-email
title: Email isn't sending
description: The test email fails, emails never arrive, or dashboard subscriptions or alerts stopped sending, for everyone or for some recipients.
references:
  - troubleshooting-guide/cant-send-email.md
  - configuring-metabase/email.md
  - troubleshooting-guide/notifications.md
---
Ask one question at a time, and skip any the user has already answered.

First questions, in this order:
1. Does the test email on the email settings page work?
2. Is this Metabase Cloud or self-hosted? Metabase Cloud can use Metabase's own email server.
3. Is every email affected, or only one subscription or alert, or only some recipients?

Causes to check, most common first:

Test email fails
- The SMTP settings or credentials are wrong. Use the email settings page of the docs for the exact fields.
- Self-hosted: a firewall blocks outgoing mail from the Metabase server.

Test email works, but emails don't arrive
- The mail server accepts the message but it's filtered as spam or rejected along the way.
- Approved domains for notifications blocks recipients who don't have a Metabase account.

Only subscriptions or alerts fail
- Long-running queries are stuck and block other notifications. See the notifications troubleshooting page.
