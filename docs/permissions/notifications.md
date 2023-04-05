---
title: Notification permissions
---

# Notification permissions

**Notification recipients can see whatever the notification creator can see.** That is, recipients will see charts in their email or Slack _as if_ they had the alert or subscription creator's permissions to view those charts, _regardless of whether the recipients have permission to view those charts inside Metabase_.

## All accounts

All accounts can:

- Create [alerts](../questions/sharing/alerts) and [dashboard subscriptions](../dashboards/subscriptions#setting-up-a-dashboard-subscription).
- Add other people to alerts and subscriptions that they own.
- Unsubscribe from any alert or subscription.

When a notification creator adds other people to an alert or subscription, Metabase will display data to the new recipients using **the notification creator's [permissions](../permissions/start.md)**. 

Non-admins cannot view notifications created by other people. [Admins](#admins) can view and manage notifications across Metabase.

## Sandboxed accounts

Same as [all accounts](#all-accounts), but **people using sandboxed accounts will only see themselves in the list of recipients** when creating an alert or subscription.

## Admins

**Admins can see and edit all notifications.** Admins can [add or remove](/docs/latest/usage-and-performance-tools/audit#subscriptions-and-alerts) recipients from an alert or subscription without affecting the permissions of the alert or subscription. All recipients will be able to see the same data that the notification creator can see.

## Restricting email domains

{% include plans-blockquote.html feature="Approved domains for notifications" %}

Admins can limit email recipients to people within your org by going to **Admin setting** > **General settings** > [approved domains for notifications](../configuring-metabase/settings.md#approved-domains-for-notifications).

## Further reading

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/sharing/alerts.md)
- [Auditing](../usage-and-performance-tools/audit.md)
