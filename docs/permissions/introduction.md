---
title: Permissions introduction
redirect_from:
  - /docs/latest/administration-guide/05-setting-permissions
---

# Permissions introduction

There are always going to be sensitive bits of information in your data, and thankfully Metabase provides a rich set of tools to ensure that people on your team only see the data they're supposed to.

If instead you're wondering about what data Metabase the company can see, check out our page on [data privacy and security](https://www.metabase.com/security).

## Key points regarding permissions

- Permissions are granted to [groups](../people-and-groups/managing.md#groups), not people. Though you can define user attributes to apply permissions person to person.
- People can be in more than one group.
- If a person is in multiple groups, they will have the _most permissive_ access granted to them across all of their groups. For example, if a person is in three groups, and any one of those groups has Curate access to a collection, then that person will have curate access to that collection.
- By default, everyone is in the All users group, so be sure to block that group's access before granting permissions to other groups. Thankfully, Metabase will warn you if the All users group has more permissive permissions than the group you're restricting.

## What you can set permissions on

- [Data permissions](./data.md) - Control access to databases, schemas, and tables, including:
  - [View data](./data.md#view-data-permissions)
  - [Create queries](./data.md#create-queries-permissions)
  - [Download results](./data.md#download-results-permissions)
  - [Manage table metadata](./data.md#manage-table-metadata-permissions)
  - [Manage database](./data.md#manage-database-permissions)
  - [Transforms](./data.md#transform-permissions)
- [Collection permissions][collections] - Control access to questions, dashboards, models, metrics, events, and timelines
- [Application permissions](application.md) - Control access to admin features (Pro and Enterprise plans only):
  - [Settings tab in Admin panel](application.md#settings-access)
  - [Monitoring tools and troubleshooting](application.md#monitoring-access)
  - [Dashboard subscriptions and alerts](application.md#subscriptions-and-alerts)
- [Snippet folder permissions][snippet-folders] - Control access to SQL snippet folders (available on plans with snippet folders)

## Tools for managing multi-tenant setups

To compare [row and column security](./row-and-column-security.md), [impersonation](./impersonation.md), [database routing](./database-routing.md), and locked parameters, see [Data isolation methods](./data-isolation-methods.md).

[collections]: ./collections.md
[dashboard-subscriptions]: ../dashboards/subscriptions.md
[data-permissions]: ./data.md
[permissions]: https://www.metabase.com/learn/metabase-basics/administration/permissions
[slack-integration]: ../configuring-metabase/slack.md
[snippet-folders]: ./snippets.md
[troubleshooting-permissions]: ../troubleshooting-guide/permissions.md
