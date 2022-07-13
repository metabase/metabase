---
title: Troubleshooting permissions
---

# Troubleshooting permissions

If someone has the wrong level of access to a dashboard or a question, the problem may be coming from group settings, collection permissions, or data permissions.

1. Go to **Admin** > **People** and check if the person is in [more than one group with conflicting permissions][group-permissions].
2. If a person can't view or edit questions or dashboards, see [Troubleshooting collection permissions](#troubleshooting-collection-permissions).
3. If a person can't access schemas, tables, rows, or columns, see [Troubleshooting data permissions](#troubleshooting-data-permissions).

## [Troubleshooting collection permissions][troubleshooting-collection-permissions]

- [People can't access a dashboard in a collection that they have permissions for](./collection-permissions#people-cant-access-a-dashboard-from-a-collection-that-they-have-permissions-for).
- [People can view collections that contain restricted data](./data-permissions#people-can-view-collections-that-contain-restricted-data).

## [Troubleshooting data permissions][troubleshooting-data-permissions]

### Row and column permissions

- [Troubleshooting data sandboxing][troubleshooting-data-sandboxing].

### Native query (SQL) permissions

- [People can't access the SQL editor](./data-permissions#people-cant-access-the-sql-editor).
- [People with SQL permissions aren't being restricted by their data sandbox](./sandboxing.html#is-the-question-written-in-sql).
- [People can't _view_ native SQL questions when a block permission is applied to "All Users"](https://github.com/metabase/metabase/issues/21695).

### Table or schema permissions

- [People have the wrong access to a table or schema](./data-permissions#people-have-the-wrong-access-to-a-table-or-schema).
- [Getting a "permission denied" error message](#getting-a-"permission-denied"-error-message).
- [Checking someone's access to a table or schema](./data-permissions#checking-someones-access-to-a-table-or-schema).

## Further reading

- [Permissions overview][admin-permissions].
- [Collection permissions][collection-permissions].
- [Data permissions][data-permissions].
- [Permissions tutorials][learn-permissions] in Learn Metabase.

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[admin-permissions]: ../administration-guide/05-setting-permissions.html
[collection-permissions]: ../administration-guide/06-collections.html
[connecting-database]: ../administration-guide/01-managing-databases.html
[data-browser]: /learn/getting-started/data-browser.html
[data-model]: ../administration-guide/03-metadata-editing.html
[data-permissions]: ../administration-guide/data-permissions.html
[discourse]: https://discourse.metabase.com/
[granular]: ../administration-guide/data-permissions.html#granular-access
[group-permissions]: ../administration-guide/05-setting-permissions.html#key-points-regarding-permissions
[known-issues]: ./known-issues.html
[learn-permissions]: /learn/permissions/index.html
[sandboxing]: ./sandboxing.html
[setting-collection-permissions]: ../administration-guide/06-collections.html#setting-permissions-for-collections
[troubleshooting-collection-permissions]: ./collection-permissions.html
[troubleshooting-data-permissions]: ./data-permissions.html
[troubleshooting-data-sandboxing]: ./sandboxing.html