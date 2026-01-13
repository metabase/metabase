---
title: Notification permissions
summary: Learn who can create and edit alerts and dashboard subscriptions, and what data recipients can see in their notifications.
---

# Notification permissions

Notifications in Metabase include [alerts](../questions/alerts.md) and [dashboard subscriptions](../dashboards/subscriptions.md#setting-up-a-dashboard-subscription).

## Who can edit dashboard subscriptions and alerts

What you can do with alerts and dashboard subscriptions depends on whether you're in the Administrators group or in a group with [impersonation](./impersonation.md) or [row and column security](./row-and-column-security.md).

- [All Users group](#all-users-group-notification-permissions)
- [Groups with impersonation or row and column security](#groups-with-impersonation-or-row-and-column-security)
- [Administrators group](#administrators-group-notification-permissions)

### All Users group notification permissions

Everyone's in the All Users group. Which means that everyone can:

- Create [alerts](../questions/alerts.md) and [dashboard subscriptions](../dashboards/subscriptions.md#setting-up-a-dashboard-subscription).
- Add new recipients to dashboard subscriptions and alerts that they created.
- Unsubscribe from any alert or subscription in their [Account settings](../people-and-groups/account-settings.md).

When a notification creator adds new recipients to an alert or subscription, Metabase will display data to the recipients using the **creator's** [data permissions](../permissions/data.md) and [collection permissions](../permissions/collections.md).

### Groups with impersonation or row and column security

People in groups with [impersonation](./impersonation.md) or [row and column security](./row-and-column-security.md) permissions cannot create Slack [alerts](../questions/alerts.md) or [dashboard subscriptions](../dashboards/subscriptions.md). They can still set up email alerts and subscriptions.

For email alerts and subscriptions, people in these groups will only see themselves in the list of recipients.

### Administrators group notification permissions

People in the admin group can:

- View all subscriptions and alerts.
- Add or remove recipients from an existing subscription or alert. Admins can safely add and remove recipients without changing the permissions of the alert or subscription. For example, if an admin adds Anya to a subscription created by Beau, Anya will receive emails with the same data that Beau can see (not what the admin can see).
- Delete subscriptions or alerts.

## What notification recipients can see

Notification **recipients** can see whatever the notification **creator** can see. For example, if:

- Beau creates a subscription to a dashboard saved in their [personal collection](../exploration-and-organization/collections.md#your-personal-collection).
- Beau adds Anya to the dashboard subscription.
- Anya will see the dashboard results in her email, even though she lacks permissions to view that dashboard in Beau's personal collection.

## More control over email options

On [Enterprise](https://www.metabase.com/product/enterprise) and [Pro](https://www.metabase.com/product/pro) plans, Admins can:

- Limit email recipients to [approved domains for notifications](../configuring-metabase/email.md#approved-domains-for-notifications).
- [Limit which recipients Metabase suggests](../configuring-metabase/email.md#suggest-recipients-on-dashboard-subscriptions-and-alerts) when people set up a subscription or alert.

## Further reading

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/alerts.md)
