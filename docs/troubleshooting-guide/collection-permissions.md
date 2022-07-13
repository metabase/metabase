---
title: Troubleshooting collection permissions
---

# Troubleshooting collection permissions

Use this guide if you're having trouble with permissions to _view or edit_ questions or dashboards.

If someone has the wrong level of access to the tables, rows, or columns that are displayed in a question or dashboard, see [Troubleshooting data permissions][troubleshooting-data-permissions].

## People can't access a dashboard from a collection that they have permissions for

1. Check where each _question_ on the dashboard is saved (i.e., which collection).
2. If the saved question is in a collection that people don't have access to, you can either:
    - Grant people permission to the collection.
    - Move the saved question to a collection with broader permissions.

**Explanation**

Moving a dashboard to a collection with permissions does not automatically move all of the saved questions into the same collection. If the saved questions are stored in a restrictive collection (such as someone's personal folder), then other people will not be able to view those cards.

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
[data-permissions]: ../administration-guide/data-permissions.html
[discourse]: https://discourse.metabase.com/
[known-issues]: ./known-issues.html
[learn-permissions]: /learn/permissions/index.html
[troubleshooting-data-permissions]: ./data-permissions.html
