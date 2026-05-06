---
title: Security center
summary: See all security advisories published by Metabase and subscribe to notifications.
---

# Security center

{% include plans-blockquote.html feature="Security center" self-hosted-only="true" %}

_Admin > Security_

Security center displays all security advisories published by Metabase, including affected versions and remediation steps, so that you can upgrade your self-hosted Metabase in a timely manner to remain secure.

![Security center](./images/security-center.png)

You can configure Metabase to send notifications to specific email addresses or a Slack channel whenever a new security advisory is published.

Security center is available only on self-hosted Metabases on Pro/Enterprise plans. Metabase Cloud instances are automatically patched as soon as issues are discovered and resolved.

## See security issues affecting your instance

Security center in **Admin > Security** will display _all_ security advisories published by Metabase, regardless of whether they're affecting your instance.

Issues that _do_ affect your instance will be highlighted in the security center, and you can opt in to get email or Slack notifications about new issues affecting your instance.

![Security center](./images/security-center.png)

To determine if your instance is affected by a security issue, Metabase analyzes the instance's configuration: version, settings, databases connected, features used, etc. For example, if an advisory involving impersonation on PostgreSQL is posted, Metabase will check whether your instance has a PostgreSQL database connected, and whether it has impersonation enabled.

Metabase checks for new security advisories periodically, but you can also force the check by clicking **Check now** in the security center.

## Remedy security issues

Every security issue posted in **Admin > Security** will come with remediation steps. They will usually involve upgrading your Metabase.

See [Upgrading a self-hosted Metabase](upgrading-metabase.md#upgrading-a-self-hosted-metabase).

If you have questions or need help remedying a security issue, you can always [reach out to us](https://www.metabase.com/help-premium).

## Get notified about security issues

_Admin > Security_

To get notified about security issues affecting your instance, you must set up at least one notification channel for your Metabase. See [Set up email](../configuring-metabase/email.md) or [Set up Slack](../configuring-metabase/slack.md).

Once you set up a notification channel for your Metabase, set up notifications about security issues affecting your instance in the security center:

1. Go to **Admin > Security**.
2. At the top of security center, click **Notification settings**.
3. Select Email and/or Slack:

   - **Email**: you can choose whether to send emails to all admins of your Metabase, and add any additional emails - even if they aren't Metabase users. For example, you can add security team at your org as a recipient of security notification emails.
   - **Slack**: pick a channel or a user to send notifications to.

   ![Security notification](./images/security-notify.png)

4. (Optional) Click **Send the test notification** to do just that - useful to verify that notifications are set up correctly.
5. Save.

You'll only get notifications about new issues _affecting your instance_. New issues that don't affect your instance will be visible in the security center, but you won't get notified about them.

## Further reading

- [Security](https://www.metabase.com/security)
- [Upgrading Metabase](upgrading-metabase.md)
