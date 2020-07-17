# SQL snippet folders and permissions

This article covers **SQL snippet folders**, which are an Enterprise feature for keeping snippets organized and setting permissions. You can learn more about [how SQL snippets work in our User Guide](../users-guide/sql-snippets.md).

The purpose of snippet folders (and the permissions administrators can set for these folders) is to help teams keep large numbers of snippets organized. Folder permissions should not be considered a security feature, but instead a feature that helps with organization and standardization. See the [discussion on permissions below](#permissions) for more info. 

## Folders

Folders work similar to a file system. You can add snippets to folders, and nest folders (i.e. create a folder, and put a subfolder in that folder, which itself has a subfolder, etc.). You can nest as many folders as your Metabase instance can handle or the laws of physics allow (whichever yields first).

### Create new SQL snippet folder

You can create a SQL snippet folder from the **Snippets** menu in the SQL editor.

![Create new snippet folder](./images/sql-snippets/snippet-folder.png)

1. Click on the SQL Snippet menu icon (looks like paragraph text with three uneven horizontal lines).
2. Click on the `+` and select `New folder`
3. Give your folder a name, and optionally add a description, and/or place the folder in an existing folder.

![Create new folder modal](./images/sql-snippets/create-new-folder-modal.png)

### Creating a new SQL snippet

When creating a SQL snippet in the Enterprise Edition, you'll also see an additional option to add that snippet to an existing folder. You can add a snippet to a folder at any time (or relocate a snippet to another folder, provided you have permission to both folders).

## Permissions

Administrators can set snippet visibility and editability by placing snippets in **folders**, and assigning one of three permission levels to groups of people with respect to those folders. If you're familiar with [collection permissions](/docs/latest/administration-guide/06-collections.html#setting-permissions-for-collections), the functionality is similar.

### Setting permissions on a folder

Administrators can set the permissions on a folder by clicking on the ellipsis (...) next to a folder, and selecting **Change permissions**.

There are three levels for folder permissions:

- **Edit**. Full access to the snippet. Users can view, execute, edit, and archive or unarchive the snippet.
- **Execute**. Users in that group can view and execute that snippet, but not edit or archive/unarchive it. They can, of course, copy the snippet's code and create a new snippet.
- **Revoke**. Users in groups with neither edit nor execute permissions to a snippet folder will not see that folder's snippets in the sidebar, nor will any snippets in that folder populate those users' searches.

Archiving or unarchiving snippets does not affect a snippet's permissions. If, for example, only one group, say Datamancers, has edit permissions on a folder, only Datamancers would be able to archive and unarchive snippets in that folder, as archiving and unarchiving is considered editing the snippet.

### How folder permissions work

SQL snippet permissions require some effort to conceptualize, as SQL snippet folders permissions must work in conjunction with other sets of permissions, such as those in collections. But here's the basic rule: data is more sensitive than code, so permissions that protect data will take precedence over permissions that protect code.

For example, if users in a group have **Edit** or **Execute** permission on a snippet folder, but that group doesn't have permission to access the database queried in that snippet, they'll be able to view the snippet (and edit it, if they have edit permission), but they'll be unable to run the query and return results, as they do not have access to that database.

As a counter example, consider a question that contains a SQL snippet. If a group has 1) SQL editor access, and 2) access to that question (i.e. the group has permissions to the question via a collection), users in that group should be able to view and execute that question with the snippet, even if that group does not have permission to the snippet's folder.

Basically, you should consider SQL snippet permissions as an additional tool for snippet organization, not as method of preventing access to the SQL code those snippets contain. Use folder permissions to keep the snippet sidebar tidy by exposing teams to folders relevant to their analytics, and restrict editing permissions to key snippets in your organization to keep important SQL code accurate and safe from bugs introduced by edits from less experienced personnel.
