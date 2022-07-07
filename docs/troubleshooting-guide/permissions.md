---
title: Fixing permissions issues
---

# Fixing permissions issues

This troubleshooting guide has you covered if you've [connected your database][connecting-database] to Metabase, set up [groups][groups] for new people, and granted [data permissions][data-permissions] and [collection permissions][setting-collection-permissions] to those groups, but:

- [A person in multiple groups can access a table that you want to restrict](#a-person-in-multiple-groups-can-access-a-table-that-you-want-to-restrict)
- [A person who needs to access the SQL editor can't](#a-person-who-needs-to-access-the-sql-editor-cant)
- [A person can view collections that reference data you want to restrict](#a-person-can-view-collections-that-reference-data-you-want-to-restrict)

## A person in multiple groups can access a table that you want to restrict

**Root cause:** This person is a member of multiple [groups][groups], in which case Metabase grants the _most permissive_ level of access across all the groups in which they're a member.

If they're a member of two groups — one which grants [Unrestricted][unrestricted] access to a database or table and another that grants [No self-service][no-self-service] access — that person will have full unrestricted access.

**Steps to take:**

1. In the **People tab** of the **Admin Panel**, take a look at which groups the person is in.
2. Either remove the person from the group with wider permissions, or adjust that group's data permissions to grant them no-self service access to the table you want restricted.

Remember that everyone is a member of the **All Users** group. We recommend you revoke permissions from the **All users** group, and create new groups to selectively apply permissions to your data sources.

## A person who needs to access the SQL editor can't

**Root cause:** The person currently has either **No self-service** or [Granular][granular] access to a database. To give someone access to the [native SQL editor][native-query-editing], you must grant **Unrestricted** access to the database as a whole.

**Steps to take**:

1. In the **Admin Panel**'s **Permissions tab**, change the group's permissions to **Unrestricted** at the database level.

## A person can view collections that reference data you want to restrict

{% include plans-blockquote.html %}

**Root cause:** Since Metabase operates with two types of permissions — data permissions and collection permissions — even if you've granted a user group no self-service access to a database or table, they can still view saved questions and dashboards that draw on that database, as long as those questions and dashboards live in a collection they have access to. Unless a user group's access to a given database is set to “block," they’ll be able to view any saved question based on that data if they have access to the collection it’s saved in.

**Steps to take:**

1. If you're running a [paid version of Metabase](https://www.metabase.com/pricing), you can block group access to an entire database. This means that if you've blocked a group's access to a database, members of that group will not ever seen any data from this database, regardless of their permissions at the Collection level.
2. In the **Admin Panel**'s **Permissions tab**, change data permissions for your user group to **Block** and save your changes.
3. Using an incognito window, log in as the person in question to confirm that they can no longer view saved questions or dashboards that include information from the blocked database.

Keep in mind that if a person belongs to another group that does have data access, that setting will take precedence, and their access will not be blocked.

## Further reading

- [Setting permissions in Metabase][admin-permissions].
- [Collection permissions][collection-permissions].
- [Permissions track][learn-permissions] in Learn Metabase.
- [Troubleshooting data sandboxing][sandboxing].

[admin-permissions]: ../administration-guide/05-setting-permissions.html
[collection-permissions]: ../administration-guide/06-collections.html
[connecting-database]: ../administration-guide/01-managing-databases.html
[data-browser]: /learn/getting-started/data-browser.html
[data-model]: ../administration-guide/03-metadata-editing.html
[data-permissions]: ../administration-guide/data-permissions.html
[granular]: ../administration-guide/data-permissions.html#granular-access
[groups]: ../administration-guide/04-managing-users.html#groups
[learn-permissions]: /learn/permissions/index.html
[native-query-editing]: ../administration-guide/data-permissions.html#native-querying
[no-self-service]: ../administration-guide/data-permissions.html#no-self-service-access
[sandboxing]: ./sandboxing.html
[setting-collection-permissions]: ../administration-guide/06-collections.html#setting-permissions-for-collections
[unrestricted]: ../administration-guide/data-permissions.html#unrestricted-access