---
title: Application permissions
redirect_from:
  - /docs/latest/administration-guide/application-permissions
---

# Application permissions

{% include plans-blockquote.html feature="Application permissions" %}

Application settings are useful for granting groups access to some, but not all, of Metabase's administrative features.

To set application permissions, got to the top right of the screen and click on the **gear** icon > **Admin settings** > **Permissions** > **Application**.

## Settings access

Settings access defines which groups can view and edit the settings under the Admin > Settings tab. These settings include:

- [Settings](../configuring-metabase/settings.md)
- [Email](../configuring-metabase/email.md)
- [Slack](../configuring-metabase/slack.md)
- [Authentication](../people-and-groups/start.md)
- [Maps](../configuring-metabase/custom-maps.md)
- [Localization](../configuring-metabase/localization.md)
- [Appearance](../configuring-metabase/appearance.md)
- [Public sharing](../questions/sharing/public-links.md)
- [Embedding in other applications](../embedding/start.md)
- [Caching](../configuring-metabase/caching.md)

## Monitoring access

Monitoring access sets permissions for the following:

- [Tools](../usage-and-performance-tools/tools.md)
- [Troubleshooting](../troubleshooting-guide/index.md)

## Subscriptions and alerts

This setting determines who can set up:

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/sharing/alerts.md)

People will need to be in groups with either view or edit access to the collection that contains the dashboard or question in order to set up alerts. See [Collection permissions](../permissions/collections.md).
