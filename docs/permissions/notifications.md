---
title: Notification permissions
---

# Notification permissions

Some notes on how permissions work with dashboard subscriptions and alerts:

- **Recipients of notifications can see whatever the creator of the notification can see.** That is, people will get to see charts in their email or Slack _as if_ they had the alert or subscription creator's permissions to view those charts, _regardless of whether their groups have permission to view those charts_.
- **Anyone can create and manage their own notifications**. In addition to the alert and subscription menus on questions and dashboards, people can click on the **gear** icon and go to **Account settings** > **Notifications** to view and unsubscribe from any or all of their dashboard subscriptions and alerts.
- **Anyone can add people via email or Slack to a subscription or alert that they created**. Again, the data Metabase sends to the added recipients depends on the person who created the notification, not the recipient.
- **Some paid plans can restrict which domains Metabase can email.** See [approved domains](../configuring-metabase/settings.md#approved-domains-for-notifications). 
- **Admins can see and edit all notifications.** Admins can modify recipients, filters, or delete the subscription without affecting the subscription's permissions; the subscription will continue to send data based on whoever originally created the subscription. Admins can edit alerts and subscriptions on the items themselves, or, if they have a paid plan, in the Admin panel under **Audit** > **Subscriptions and alerts**. See [Auditing Metabase](../usage-and-performance-tools/audit.md). 
- **Non-admins can only view and edit notifications they created, not notifications created by others.**
- **Provided the non-admin account isn't sandboxed, non-admins can add anyone in their Metabase to their subscriptions using the dropdown menu.** People who are sandboxed will only see themselves in the list of recipients for dashboard subscriptions and alerts that they create; they won't be able to see other Metabase accounts.

## Further reading

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/sharing/alerts.md)
- [Auditing](../usage-and-performance-tools/audit.md)
