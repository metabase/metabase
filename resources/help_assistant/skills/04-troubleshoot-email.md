---
id: troubleshoot-email
title: Email isn't sending
description: SMTP setup fails, test emails don't arrive, or subscriptions and alerts don't send.
references:
  - troubleshooting-guide/cant-send-email.md
  - configuring-metabase/email.md
  - troubleshooting-guide/notifications.md
---
1. Ask whether the test email on the email settings page succeeds.
2. If the test fails, go through the SMTP settings: host, port, security (SSL/TLS/STARTTLS) and credentials, plus firewalls blocking outbound mail from the Metabase server.
3. If the test works but subscriptions or alerts don't arrive, point to the notifications troubleshooting guide and to spam filtering.
