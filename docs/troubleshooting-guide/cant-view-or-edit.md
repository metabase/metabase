---
title: Can't view or edit
---

# Can't view or edit

1. Clear your browser cache.
2. Check if a browser extension or plugin is interfering with Metabase:
   - Disable all extensions and plugins,
   - Open the link in an incognito browser session, or
   - Open the link in a different browser.
3. If you aren't the creator of the question, dashboard, or model, check if you have permissions to the collection where the item is saved.
4. Check the [archive](../exploration-and-organization/history.md#viewing-the-archive).

## Can't view cards on a dashboard

1. Check the collections where each question (or card) on the dashboard is saved.
2. If a saved question is in a collection that you don't have access to, you'll need to ask someone with edit access to the collection to:
    - Grant you permission to the collection.
    - Or, to move the saved question to a collection that you have permissions to.
3. If the steps above don't solve your problem, ask your Metabase admin if you have [permission to the database that's used by the question](../permissions/data.md#blocked-view-data-permission).

**Explanation**

Moving a dashboard to a different collection doesn't move the dashboard's questions into that collection.

If the saved questions are stored in a restricted collection (such as someone's personal folder), then other groups won't be able to view those cards.

Someone with edit permissions (your Metabase admin is probably a safe bet) will need to move those questions into a collection that you have permissions to.

## Related problems

- [Error message: your question took too long](./timeout.md).
- [Error message: permission denied](./data-permissions.md#getting-a-permission-denied-error-message).
- [I can't view or edit queries from the SQL editor](./data-permissions.md#a-user-group-cant-access-the-sql-editor).
- [I can't save my question or dashboard](./proxies.md).
- [I can't see my tables](./cant-see-tables.md).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
