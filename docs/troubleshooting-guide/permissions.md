---
title: Troubleshooting permissions
---

# Troubleshooting permissions

If someone has the wrong level of access to a dashboard or a question, the problem may be coming from group settings, collection permissions, or data permissions.

1. Go to **Admin** > **People** and check if the person is in [more than one group with different permissions][group-permissions].
2. If a person **can't view or edit** questions or dashboards, see [Troubleshooting collection permissions](#troubleshooting-collection-permissions).
3. If a person **can't access data**, such as schema, tables, rows, or columns, see [Troubleshooting data permissions](#troubleshooting-data-permissions).

If you have a different issue, see [related problems](#do-you-have-a-different-problem).

## Troubleshooting collection permissions

- [A user group can't access a dashboard in a collection that they have permissions for][troubleshooting-viewing-editing].
- [A user group can view collections that contain restricted data][collections-restricted-data].

## [Troubleshooting data permissions][troubleshooting-data-permissions]

### Row and column permissions

- [Troubleshooting data sandboxing][troubleshooting-data-sandboxing].

### Native query (SQL) permissions

- [A user group can't access the SQL editor][sql-access].
- [A user group with SQL permissions isn't being restricted by their data sandbox][sql-sandboxing].

### Table or schema permissions

- [A user group has the wrong access to a table or schema][table-schema-access].
- [Getting a "permission denied" error message][permission-denied].
- [Checking someone's access to a table or schema][check-permissions].


## Do you have a different problem?

- [I can't save my question or dashboard][proxies].
- [I can't see my tables][cant-see-tables].

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].


[admin-permissions]: ../administration-guide/05-setting-permissions.html
[cant-see-tables]: ./cant-see-tables.html
[check-permissions]: ./data-permissions#checking-someones-access-to-a-table-or-schema
[collection-permissions]: ../administration-guide/06-collections.html
[collections-restricted-data]: ./data-permissions#a-user-group-can-view-collections-that-contain-restricted-data
[connecting-database]: ../administration-guide/01-managing-databases.html
[data-browser]: /learn/getting-started/data-browser.html
[data-model]: ../administration-guide/03-metadata-editing.html
[data-permissions]: ../administration-guide/data-permissions.html
[discourse]: https://discourse.metabase.com/
[granular]: ../administration-guide/data-permissions.html#granular-access
[group-permissions]: ../administration-guide/05-setting-permissions.html#key-points-regarding-permissions
[known-issues]: ./known-issues.html
[learn-permissions]: /learn/permissions/index.html
[permission-denied]: ./data-permissions#getting-a-permission-denied-error-message
[proxies]: ./proxies.html
[sandboxing]: ./sandboxing.html
[setting-collection-permissions]: ../administration-guide/06-collections.html#setting-permissions-for-collections
[sql-access]: ./data-permissions#a-user-group-cant-access-the-sql-editor
[sql-sandboxing]: ./sandboxing.html#is-the-question-written-in-sql
[table-schema-access]: ./data-permissions#a-user-group-has-the-wrong-access-to-a-table-or-schema
[troubleshooting-data-permissions]: ./data-permissions.html
[troubleshooting-data-sandboxing]: ./sandboxing.html
[troubleshooting-viewing-editing]: ./cant-view-or-edit.html