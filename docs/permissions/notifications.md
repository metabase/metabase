---
title: Notification permissions
---

# Notification permissions

How permissions work with dashboard subscriptions and alerts:

- **Recipients of the notification will be able to see whatever the creator of the notification can see.** That is, people will get to see charts in their email or Slack _as if_ they had the alert or subscription creator's permissions to view those charts, _regardless of whether their groups have permission to view those charts_.
- **Admins can see and edit all notifications.** Admins can modify recipients, filters, or delete the subscription without affecting the subscription's permissions; the subscription will continue to send data based on the subscription's creator's permissions. Admins can edit alerts and subscriptions on the items themselves, or, if they have a paid plan, in the Admin panel under **Audit** > **Subscriptions and alerts**. 
- **Non-admins only view and edit their subscriptions and alerts, not subscriptions created by others.** People who are 1) not in the Admin group, and 2) not sandboxed, can only see the subscriptions they've created. They can add anyone in their Metabase to their subscriptions using the dropdown menu.
- **People in data sandboxes can only send notifications to themselves.** People who are sandboxed will only see themselves in the list of recipients for dashboard subscriptions and alerts.
- **Everyone can view and manage their own notifications**. People can click on the **gear** icon and go to **Account settings** > **Notifications** to view and unsubscribe from any or all of their dashboard subscriptions and alerts.

## Further reading

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/sharing/alerts.md)
- [Auditing](../usage-and-performance-tools/audit.md)
- 

