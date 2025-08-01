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
  - [Manage database](./data.md#manage-database-permissions)
- [Collection permissions][collections] - Control access to questions, dashboards, models, metrics, events, and timelines
- [Application permissions](application.md) - Control access to admin features (Pro and Enterprise plans only):
  - [Settings tab in Admin panel](application.md#settings-access)
  - [Monitoring tools and troubleshooting](application.md#monitoring-access)
  - [Dashboard subscriptions and alerts](application.md#subscriptions-and-alerts)
- [Snippet folder permissions][snippet-folders] - Control access to SQL snippet folders (available on plans with snippet folders)

## Tools for managing multi-tenant setups

At a high-level, Metabase provides several approaches to managing permissions for different multi-tenant setups, depending on how you've segregated your data.

### Your customers share a single database

The [row and column security](./row-and-column-security.md) permission setting lets you restrict rows and columns based on who's logged in.

### Each customer has their own database

With [Database routing](./database-routing.md), you can build a question once, and have Metabase send a query to a different database depending on the customer.

### You'd prefer to manage permissions via the database itself

With [Connection impersonation](./impersonation.md), you can manage permissions with roles you define in your database.

[collections]: ../exploration-and-organization/collections.md
[dashboard-subscriptions]: ../dashboards/subscriptions.md
[data-permissions]: ./data.md
[permissions]: https://www.metabase.com/learn/metabase-basics/administration/permissions
[slack-integration]: ../configuring-metabase/slack.md
[snippet-folders]: ../questions/native-editor/snippets.md
[troubleshooting-permissions]: ../troubleshooting-guide/permissions.md
