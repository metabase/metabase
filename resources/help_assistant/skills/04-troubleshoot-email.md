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

Check first, if you can check this instance:
- Check whether email is set up (check_email_and_sign_in).
- For subscriptions or alerts, check them (check_subscriptions_and_alerts). It lists recent failed sends by name, with the error. A log search for "email" misses those failures; use "Failed to send" if you need the log lines.
- A failing test email shows its reason on screen, and the logs only record that the request failed, so ask them to paste the error from the screen.
- When SMTP settings are saved and don't work, the logs have "Problem connecting to mail server" with the reason, plus up to four "Error testing SMTP connection" lines, because Metabase retries with each security option. The first of those is their actual settings.

Unless they asked for the list, ask these first, in this order, skipping any a check already answered:
1. Does the test email on the email settings page work?
2. Is this Metabase Cloud or self-hosted? Metabase Cloud can use Metabase's own email server.
3. Is every email affected, or only one subscription or alert, or only some recipients?

Causes to check, most common first:

Test email fails
- The SMTP settings or credentials are wrong. Use the email settings page of the docs for the exact fields.
- Self-hosted: a firewall blocks outgoing mail from the Metabase server.

Test email works, but emails don't arrive
- The mail server accepts the message but it's filtered as spam or rejected along the way.

Only subscriptions or alerts fail
- Long-running queries are stuck and block other notifications. See the notifications troubleshooting page.
