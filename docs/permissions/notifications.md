---
title: Notification permissions
---

# Notification permissions

Notifications in Metabase include [alerts](../questions/sharing/alerts.md) and [dashboard subscriptions](../dashboards/subscriptions.md#setting-up-a-dashboard-subscription).

Notification **recipients** can see whatever the notification **creator** can see. For example, if:

- Beau creates a subscription to a dashboard saved in their [personal collection](../exploration-and-organization/collections.md#your-personal-collection).
- Beau adds Anya to the dashboard subscription.
- Anya will see the dashboard in her email, even though she doesn't have permissions to view that dashboard in Beau's personal collection.

## All accounts

From [Account settings](../people-and-groups/account-settings.md), all accounts can:

- Create [alerts](../questions/sharing/alerts.md) and [dashboard subscriptions](../dashboards/subscriptions.md#setting-up-a-dashboard-subscription).
- Add new recipients to dashboard subscriptions that they own. Non-admins can only add themselves to alerts.
- Unsubscribe from any alert or subscription.

When a notification creator adds new recipients to an alert or subscription, Metabase will display data to the recipients using the **creator's** [data permissions](../permissions/data.md) and [collection permissions](../permissions/collections.md).

## Sandboxed accounts

Same as [all accounts](#all-accounts), but **people using sandboxed accounts will only see themselves in the list of recipients** when creating an alert or subscription.

## Admins

{% include plans-blockquote.html feature="Auditing tools" %}

From Metabase's [auditing tools](../usage-and-performance-tools/audit.md#subscriptions-and-alerts), admins can:

- View all subscriptions and alerts
- Add or remove recipients from an existing subscription or alert
- Delete subscriptions or alerts

Admins can add recipients without changing the permissions of the alert or subscription. For example, if an admin adds Anya to a subscription created by Beau, Anya will receive emails with the same data that the Beau can see.

## Restricting email domains

{% include plans-blockquote.html feature="Approved domains for notifications" %}

Admins can limit email recipients to people within an org by going to **Admin setting** > **General settings** > [Approved domains for notifications](../configuring-metabase/settings.md#approved-domains-for-notifications). 

## Further reading

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/sharing/alerts.md)
- [Auditing](../usage-and-performance-tools/audit.md)
