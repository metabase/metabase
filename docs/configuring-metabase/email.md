---
title: Set up email
summary: Learn how to set up email in Metabase to enable dashboard subscriptions and alerts.
redirect_from:
  - /docs/latest/administration-guide/02-setting-up-email
---

# Set up email

Once you connect your database to Metabase, you'll want to configure an email account to send system notifications to your organization's users. Metabase uses email to reset passwords, onboard new users, and notify you when something happens (see [dashboard subscriptions](../dashboards/subscriptions.md) and [alerts](../questions/alerts.md)).

Both admins and people with [settings access](../permissions/application.md#settings-access) can set up email.

## Set up email on Metabase Cloud

_Admin > Settings > Email_

On Metabase Cloud, you can use the default SMTP server, or set up a custom server.

### Default SMTP server on Metabase Cloud

By default, Metabase Cloud will manage an email server for you, so you don't need to set up email.

If you like, you can still set up:

- A display name for your Cloud email account (the "from" name). The email will still be sent from a Metabase address, however.
- An email address to receive email replies (reply-to address).

When Metabase manages the SMTP server, you can't change the from address. If you want Metabase to send emails from a different domain, you'll need to bring your own SMTP server. See below.

### Custom SMTP Server on Metabase Cloud

{% include plans-blockquote.html feature="Custom SMTP server on Metabase Cloud" %}

_Admin > Settings > Email > Set up a custom SMTP server_

By default, Metabase Cloud manages an SMTP server for you. But if you want to use your own SMTP server, you can bring your own.

You may want to use your own SMTP server if you want to:

- Customize the From domain (for example, if you're [white-labeling Metabase](./appearance.md)).
- Avoid having emails pass through 3rd-party services.
- Own IP reputation, logs, monitoring.
- Own auditing.

When setting up a custom SMTP server on Metabase Cloud, you'll configure these fields:

- **SMTP HOST**: The address of the SMTP server that handles your emails (e.g., smtp.yourservice.com).
- **SMTP PORT**: The port your SMTP server uses for outgoing emails. Only encrypted email ports are supported:
  - 465 (SSL)
  - 587 (TLS)
  - 2525 (STARTTLS)
- **SMTP SECURITY**: Choose the security protocol for your connection:
  - SSL
  - TLS
  - STARTTLS
- **SMTP USERNAME**: Your SMTP account username.
- **SMTP PASSWORD**: Your SMTP account password.

Once you set up your SMTP, you'll be able to [Configure email settings](#configure-email-settings).

You can edit these settings at any time. You can also toggle between this custom SMTP server and the server managed by Metabase Cloud.

## Set up email on self-hosted Metabases

_Admin > Settings > Email_

For Metabase to send messages to people, you'll need to set up an email account to send emails via **SMTP** (simple mail transfer protocol). SMTP is an email standard that, when combined with SSL/TLS, provides security protection for emails.

If you are on Metabase Cloud, see [Email on Metabase Cloud](#set-up-email-on-metabase-cloud) for email setup.

To set up email on self-hosted Metabase instance:

1. Go to **Admin > Settings > Email**.
2. Next to **Self-Hosted SMTP**, click **Configure**.
3. Specify the email configuration:

   ![Email Credentials](images/EmailCredentials.png)

- **SMTP Host**: The address of the SMTP server that handles your emails.
- **SMTP Port**: The port your SMTP server uses for outgoing emails.
- **SMTP Security**:
  - None
  - SSL
  - TLS
  - STARTTLS
- **SMTP Username**: Your SMTP account username.
- **SMTP Password**: Your SMTP account password.

3. Click **Save changes**.

## Configure email settings

_Admin > Settings > Email_

![email settings](./images/email-settings.png)

### Add From and Reply-to addresses

Once you set up your email, you can configure:

- **From Name**: The name you want to use for the sender of emails.
- **From address**: The email address you want to use for the sender of emails.
- **Reply-to address**: The email address you want replies to go to, if different from the From address.

### Add recipients as CC or BCC

By default, Metabase will hide email recipients by including them in the BCC list (Blind Carbon Copy) of the email. But if you're having issues with your email provider blocking emails with BCC recipients, and you don't mind having people see who else has been copied on the email Metabase sends them, you can tell Metabase to CC (Carbon Copy) recipients instead.

To configure CC/BCC:

1. Go to **Admin > Settings > Email**
2. Under **Add recipients as CC or BCC**, select how you want Metabase to handle recipients.

### Approved domains for notifications

{% include plans-blockquote.html feature="Approved domains for notifications" %}

You can configure allowed email address domain(s) for new [dashboard subscriptions](../dashboards/subscriptions.md) and [alerts](../questions/alerts.md).

Adding approved domains allows you to restrict which email addresses people can send alerts and subscriptions to. This restriction only applies to sending email to people who lack an account with that Metabase. People with Metabase accounts who aren't [restricted by row or column security](../permissions/row-and-column-security.md) will be able to email any other person with an account in that same Metabase.

To configure allowed domains:

1. Go to **Admin > Settings > Email**
2. Under **Allowed domains for notifications**, add allowed domains:

   - To allow all domains, leave the field empty (allowing all domains is the default).
   - To specify multiple domains, separate each domain with a comma, with no space in between (e.g., "domain1,domain2").

You can also set this property using the environment variable [`MB_SUBSCRIPTION_ALLOWED_DOMAINS`](../configuring-metabase/environment-variables.md#mb_subscription_allowed_domains).

> Changing this setting won't affect already existing subscriptions and alerts.

### Suggest recipients on dashboard subscriptions and alerts

{% include plans-blockquote.html feature="Configuring suggested recipients" %}

You can control which recipients people can see when they create a new [dashboard subscription](../dashboards/subscriptions.md) or [alert](../questions/alerts.md).

![Suggested recipients](./images/suggested-recipients.png)

For example, you may want to restrict people to viewing potential recipients that belong to the same [groups](../people-and-groups/managing.md#groups) they are a member of.

To configure suggested recipients for subscriptions and alerts:

1. Go to **Admin > Settings > Email**.
2. Under **Suggest recipients on dashboard subscriptions and alerts**, select one of the options:

   - Suggest all users
   - Only suggest users in the same groups
   - Don't show suggestions

People with [row or column restrictions](../permissions/row-and-column-security.md) won't see suggestions.

## Email best practices

- SSL is strongly recommended because it's more secure and gives your account extra protection from threats.
- If your email service has a whitelist of email addresses that are allowed to send email, be sure to whitelist the email address that you put in the **From address** field to ensure you and your teammates receive all emails from Metabase.

## Notes for common email services

- [Google Apps](#google-apps)
- [Amazon SES](#amazon-ses)
- [Mandrill](#mandrill)

### Google Apps

1. In the **SMTP Host** field, enter `smtp.gmail.com`.
2. Fill in 465 for the **SMTP Port** field.
3. For the **SMTP Security**, select **SSL**.
4. In the **SMTP UsernameE** field, enter your Google Apps email address (e.g. `hello@yourdomain.com`).
5. Enter your Google Apps password in the **SMTP Password** field.
6. Enter the email address you would like to be used as the sender of system notifications in the **From address** field.

### Amazon SES

1. Log on to [https://console.aws.amazon.com/ses](https://console.aws.amazon.com/ses).
2. Click **SMTP Settings** from the navigation pane.
3. Select **Create My SMTP Credentials** in the content pane.
4. Create a user in the **Create User for SMTP** dialog box and then click **Create**.
5. Next, select **Show User SMTP Credentials** to view the user's SMTP credentials.
6. Go back to the Metabase Admin Panel form and enter the info there.

Check if [email quotas](https://docs.aws.amazon.com/ses/latest/dg/quotas.html) apply to your Amazon SES server. You may want to manage your email recipients using groups instead.

### Mandrill

1. Log in to your Mandrill account and locate your credentials from the **SMTP & API Info** page there.
2. Your SMTP password is any active API key for your account — _not_ your Mandrill password.
3. Although Mandrill lists **port 587**, [any port supported by Mandrill](https://mailchimp.com/developer/transactional/docs/smtp-integration/#the-basics) will work for SMTP email.
4. Now you can go back to the Metabase Admin Panel form and enter the info there.

## Further reading

- [Alerts](../questions/alerts.md)
- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Notification permissions](../permissions/notifications.md)
- [Setting up Slack](./slack.md)
- [Usage Analytics](../usage-and-performance-tools/usage-analytics.md)
