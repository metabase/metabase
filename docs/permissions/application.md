---
title: Application permissions
summary: Grant groups access to Metabase's administrative features like settings, monitoring tools, and notifications.
redirect_from:
  - /docs/latest/administration-guide/application-permissions
---

# Application permissions

{% include plans-blockquote.html feature="Application permissions" %}

Application settings are useful for granting groups access to some, but not all, of Metabase's administrative features.

To set application permissions, go to the top right of the screen and click the **grid** icon > **Admin** > **Permissions** > **Application**.

## Settings access

Settings access defines which groups can view and edit the settings under the Admin > Settings tab. These settings include:

- [Settings](../configuring-metabase/settings.md)
- [Email](../configuring-metabase/email.md)
- [Slack](../configuring-metabase/slack.md)
- [Webhooks](../configuring-metabase/webhooks.md)
- [Maps](../configuring-metabase/custom-maps.md)
- [Localization](../configuring-metabase/localization.md)
- [Appearance](../configuring-metabase/appearance.md)
- [Public sharing](../embedding/public-links.md)
- [Embedding in other applications](../embedding/start.md)
- [Caching](../configuring-metabase/caching.md)

## Monitoring access

People in groups with Monitoring access can view:

- [Monitor](../monitor/start.md), including:
  - [Erroring questions](../monitor/erroring-questions.md)
  - [Background tasks](../monitor/background-tasks.md)
  - [Scheduled jobs](../monitor/scheduled-jobs.md)
  - [Application logs](../monitor/application-logs.md) (read-only)
  - [Model persistence log](../monitor/model-persistence-log.md)
- The **Help** tab in Admin
- [Troubleshooting](../troubleshooting-guide/index.md)

The following Monitor pages aren't included in Monitoring access:

- [Dependency diagnostics](../monitor/dependency-diagnostics.md): Available to admins and people in the [Data Analysts](../people-and-groups/managing.md#data-analysts) group
- [Alerts management](../monitor/alerts-management.md): Available to admins only

## Subscriptions and alerts

This setting determines who can create:

- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Alerts](../questions/alerts.md)

People will need to be in groups with either view or edit access to the collection that contains the dashboard or question in order to set up alerts. See [Collection permissions](../permissions/collections.md).

To prevent people from creating alerts and subscriptions, set the "Subscriptions and alerts" permission to "No".
