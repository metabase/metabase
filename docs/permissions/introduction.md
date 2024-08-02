---
title: Permissions introduction
redirect_from:
  - /docs/latest/administration-guide/05-setting-permissions
---

# Permissions introduction

There are always going to be sensitive bits of information in your data, and thankfully Metabase provides a rich set of tools to ensure that people on your team only see the data they’re supposed to.

If instead you're wondering about what data Metabase the company can see, check out our page on [data privacy and security](https://www.metabase.com/security).

## Key points regarding permissions

- Permissions are granted to [groups](../people-and-groups/managing.md#groups), not people.
- People can be in more than one group.
- If a person is in multiple groups, they will have the _most permissive_ access granted to them across all of their groups. For example, if a person is in three groups, and any one of those groups has Curate access to a collection, then that person will have curate access to that collection.

## What you can set permissions on

- [Data permissions](#data-permissions)
- [Collection permissions](#collection-permissions)
- [Application permissions](#application-permissions)
- [SQL snippet folder permissions](#sql-snippet-folder-permissions)

### Data permissions

[Data permissions](./data.md) allow you to set permissions on database and their schemas and tables.

- [View data](./data.md#view-data-permissions)
- [Create queries](./data.md#create-queries-permissions)
- [Download results](./data.md#download-results-permissions)
- [Manage database](./data.md#manage-database-permissions)

### Collection permissions

[Collection permissions][collections] dictate which groups can view/edit items in collections, including:

- Questions
- Dashboards
- Models
- Events
- Timelines

### Application permissions

[Application permissions](application.md) (available on [Pro and Enterprise plans](https://www.metabase.com/pricing/)) dictate access to Metabase application-level features, including:

- **Settings**: The Settings tab in the Admin panel.
- **Monitoring access**: The Tools and Troubleshooting tabs in the Admin panel.
- **Subscriptions and Alerts**. Which groups can create/edit dashboard subscriptions and alerts.

### SQL snippet folder permissions

For plans that include [SQL Snippet Folders][sql-snippet-folders], you can also set permissions on those folders.

## Changing permissions

Whenever you change permissions for a group, make sure you:

- Save your changes.
- Click yes to confirm your choices.

## Further reading

- [Managing people and groups](../people-and-groups/managing.md)
- [Permissions guide][permissions]
- [Troubleshooting permissions][troubleshooting-permissions]

[collections]: ../exploration-and-organization/collections.md
[dashboard-subscriptions]: ../dashboards/subscriptions.md
[data-permissions]: ./data.md
[data-sandboxing]: ./data-sandboxes.md
[permissions]: https://www.metabase.com/learn/permissions
[sandbox-columns]: https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions
[sandbox-rows]: https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions
[slack-integration]: ../configuring-metabase/slack.md
[sql-snippet-folders]: ../questions/native-editor/sql-snippets.md
[troubleshooting-permissions]: ../troubleshooting-guide/permissions.md
