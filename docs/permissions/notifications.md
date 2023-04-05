---
title: Notification permissions
---

# Notification permissions

Notifications in Metabase include [alerts](../questions/sharing/alerts) and [dashboard subscriptions](../dashboards/subscriptions#setting-up-a-dashboard-subscription).

**Notification recipients can see whatever the notification creator can see.** That is, recipients will see charts in their email or Slack _as if_ they had the alert or subscription creator's permissions to view those charts, _regardless of whether the recipients have permission to view those charts inside Metabase_.

## All accounts

All accounts can:

- Create [alerts](../questions/sharing/alerts) and [dashboard subscriptions](../dashboards/subscriptions#setting-up-a-dashboard-subscription).
- Add new recipients to alerts and subscriptions that they own.
- Unsubscribe from any alert or subscription.

When a notification creator adds new recipients to an alert or subscription, Metabase will display data to the recipients using **the creator's [permissions](../permissions/start.md)**. 

Non-admins can only view notifications that they've created. [Admins](#admins) can view and manage notifications created by any account.

## Sandboxed accounts

Same as [all accounts](#all-accounts), but **people using sandboxed accounts will only see themselves in the list of recipients** when creating an alert or subscription.

## Admins

**Admins can edit recipients**. Admins can [add or remove](/docs/latest/usage-and-performance-tools/audit#subscriptions-and-alerts) recipients without affecting the permissions of the alert or subscription. For example, if an admin adds Anya to a subscription created by Beau, Anya will receive emails with the same data that the Beau can see.

## Restricting email domains

{% include plans-blockquote.html feature="Approved domains for notifications" %}

Admins can limit email recipients to people within your org by going to **Admin setting** > **General settings** > [approved domains for notifications](../configuring-metabase/settings.md#approved-domains-for-notifications).

## Further reading

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/sharing/alerts.md)
- [Auditing](../usage-and-performance-tools/audit.md)
