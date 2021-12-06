# Fixing permissions issues

Metabase operates with two types of [permissions][admin-permissions]: **data permissions** and **collection permissions**. Permissions in Metabase don't operate on an all-or-nothing basis — as an administrator you'll weave together these data and collection permission settings based on the needs of different user groups to form your organization's overall permissions structure. If you're not sure where to start in setting up and managing permissions, check out our [Learn track][learn-permissions] on the subject.

Certain permissions features, like [sandboxing][sandboxing] and blocking database access to groups, are exclusive to [paid plans](https://www.metabase.com/pricing). 

This troubleshooting guide has you covered if you've connected your database to Metabase, set up groups for new users, and granted data and collection permissions to those groups, but:

- users in multiple groups can access data they shouldn't, or
- users can view collections that contain data you want to restrict, or
- users who need to can't access the SQL Editor.

## A user in multiple groups can access a table that you want to restrict

**Root cause:** This person is a member of multiple groups, in which case Metabase grants the *most permissive* level of access across all the groups in which they're a member.

If they're a member of two groups — one which grants **Unrestricted** access to a database or table and another that grants **No self-service** access — that user will have full unrestricted access.

**Steps to take:**

1. In the **People tab** of the **Admin Panel**, take a look at which groups the user is in.
2. Either remove the user from the group with wider permissions, or adjust that group's data permissions to grant them no-self service access to the table you want restricted.

Remember that everyone is a member of the **All Users** group; this is why we recommend you revoke permissions from the **All users** group, and create new groups to selectively apply permissions to your data sources.

## A user can view collections that reference data you want to restrict

**Root cause:** Even if you've granted a user group no self-service access to a table, they can still view saved questions and dashboards that draw on that database. Unless a user group's access to a given database is set to “block," they’ll be able to view any saved question based on that data if they have access to the collection it’s saved in.

**Steps to take:**

1. If you're running Metabase Pro or Enterprise Edition, you can block group access to an entire database. This means that your users will not ever seen any data from this database, regardless of their permissions at the Collection level. 
2. In the **Admin Panel**'s **Permissions tab**, change data permissions for your user group to **Block** and save your changes.
3. Using an incognito window, log in as the user in question to confirm that they can no longer view saved questions or dashboards that include information from the blocked database.

Keep in mind that if a user belongs to another group that does have data access, that setting will take precedence, and the user's access will not be blocked.

## A user who needs to access the SQL editor can't

**Root cause:** The user currently has either **No self-service** or **Granular** access to a database. To give someone access to the native SQL editor, you must grant **Unrestricted** access to the database as a whole. 

**Steps to take**:

1. In the **Admin Panel**'s **Permissions tab**, change the group's permissions to **Unrestricted** at the database level.

[admin-permissions]: ../administration-guide/05-setting-permissions.html
[data-browser]: /learn/getting-started/data-browser.html
[data-model]: ../administration-guide/03-metadata-editing.html
[learn-permissions]: /learn/permissions/index.html
[sandboxing]: ./sandboxing.html
