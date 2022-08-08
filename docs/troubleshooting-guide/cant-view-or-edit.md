---
title: Troubleshooting viewing and editing questions and dashboards
---

# Troubleshooting viewing and editing questions and dashboards

1. Clear your browser cache.
2. Check if a browser extension or plugin is interfering with Metabase:
   - Disable all extensions and plugins,
   - Open your question or dashboard in an incognito browser session, or
   - Open your question or dashboard in a different browser.
3. If you aren't the creator of the question or dashboard, check if you have permissions to the collection where the question or dashboard is saved.

## I can't view or edit a dashboard in a collection that I have permissions to

1. Check the collections where each question (or card) on the dashboard is saved.
2. If a saved question is in a collection that you don't have access to, you'll need to ask someone with edit access to the collection to:
    - Grant you permission to the collection.
    - Or, to move the saved question to a collection that you have permissions to.
3. If the steps above don't solve your problem, ask your Metabase admin if you have [permission to the database that's used by the question][block-access].

**Explanation**

Moving a dashboard to a different collection doesn't move the dashboard's questions into that collection. 

If the saved questions are stored in a restricted collection (such as someone's personal folder), then other groups won't be able to view those cards.

Someone with edit permissions (your Metabase admin is probably a safe bet) will need to move those questions into a collection that you have permissions to.

## Do you have a different problem?

- [I can't view or edit queries from the SQL editor][sql-access].
- [I'm getting a "permission denied" error message][permission-denied].
- [I can't save my question or dashboard][proxies].
- [I can't see my tables][cant-see-tables].

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[admin-permissions]: ../administration-guide/05-setting-permissions.html
[block-access]: ../administration-guide/data-permissions.html#block-access
[cant-see-tables]: ./cant-see-tables.html
[collection-permissions]: ../administration-guide/06-collections.html
[data-permissions]: ../administration-guide/data-permissions.html
[discourse]: https://discourse.metabase.com/
[known-issues]: ./known-issues.html
[learn-permissions]: /learn/permissions/index.html
[permission-denied]: ./data-permissions#getting-a-permission-denied-error-message
[proxies]: ./proxies.html
[sql-access]: ./data-permissions#a-user-group-cant-access-the-sql-editor
[troubleshooting-data-permissions]: ./data-permissions.html
