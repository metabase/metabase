---
title: Application permissions
---

# Application permissions

{% include plans-blockquote.html feature="Application permissions" %}

Application settings are useful for granting groups access to some, but not all, of Metabase's administrative features.

To set application permissions, got to the top right of the screen and click on the **gear** icon > **Admin settings** > **Permissions** > **Application**.

- [Settings access](#settings-access)
- [Monitoring access](#monitoring-access)
- [Subscriptions and alerts](#subscriptions-and-alerts)

## Settings access

Settings access defines which groups can view and edit the settings under the Admin > Settings tab. These settings include:

- [Settings](08-configuration-settings.md)
- [Email](02-setting-up-email.md)
- [Slack](09-setting-up-slack.md)
- [Authentication](10-single-sign-on.md)
- [Maps](20-custom-maps.md)
- [Localization](localization.md)
- [Public sharing](12-public-links.md)
- [Embedding in other applications](13-embedding.md)
- [Caching](14-caching.md)
- [White labeling](../embedding/whitelabeling.md)

## Monitoring access

Monitoring access sets permissions on the following Admin tabs:

- [Tools](../enterprise-guide/tools.md)
- [Auditing](../enterprise-guide/audit.md)
- [Troubleshooting](../troubleshooting-guide/index.md)

## Subscriptions and alerts

This setting determines who can set up:

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/sharing/alerts.md)

People will need to be in groups with either view or edit access to the collection that contains the dashboard or question in order to set up alerts. See [Collection permissions](06-collections.md).
