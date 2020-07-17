# SQL snippet folders and permissions

This article covers **SQL snippet folders**, which are an Enterprise feature for organizing and permissioning snippets. You can learn more about [how SQL snippets work in our User Guide](../users-guide/sql-snippets.md).

Folder permissions should not be considered a security feature, but instead a feature that helps with organization and standardization. See the [discussion on permissions below](#permissions) for more info. 

## Folders

Folders work similar to a file system. You can add snippets to folders, and nest folders (i.e. create a folder, and put a subfolder in that folder, which itself has a subfolder, etc.). You can nest as many folders as your Metabase instance can handle or the laws of physics allow (whichever yields first).

The **Top folder** is the snippet sidebar's default folder. It is the root folder that contains all folders and snippets.

### Creating a new SQL snippet folder

You can create a SQL snippet folder from the **Snippets** menu in the [SQL editor](../users-guide/writing-sql).

![Create new snippet folder](./images/sql-snippets/snippet-folder.png)

1. Click on the SQL Snippet menu icon (looks like paragraph text with three uneven horizontal lines).
2. Click on the `+` and select `New folder`
3. Give your folder a name, and optionally add a description, and/or place the folder in an existing folder.

![Create new folder modal](./images/sql-snippets/create-new-folder-modal.png)

### Creating a new SQL snippet

When creating a SQL snippet in the Enterprise Edition, you'll also see an additional option to add that snippet to an existing folder: **Folder this should be in**. 

![Add a snippet enterprise modal](./images/sql-snippets/enterprise-add-snippet.png)

The default location is the **Top folder**, which is the root folder for all snippet folders. You can add a snippet to a folder at any time (or relocate a snippet to another folder, provided you have Edit permission to both folders).


## Permissions

Administrators (and only administrators) can set snippet visibility and editability by placing snippets in **folders**, and granting groups one of three permission levels with respect to those folders. If you're familiar with [collection permissions](/docs/latest/administration-guide/06-collections.html#setting-permissions-for-collections), the functionality is similar. See [how folder permissions work](#how-folder-permissions-work) for more on how collection permissions and folder permissions work together.

### Changing permissions on a folder

Administrators can set the permissions on a folder by clicking on the ellipsis (**...**) next to a folder, and selecting **Change permissions**.

You can additionally change the currently selected folder by mousing over to the top of the snippet sidebar, clicking on the ellipsis (**...**) to the left of the **+**, and selecting **Change permissions**. When at the **top folder**, selecting the **...** at the top of the sidebar will give Administrators the option to set permissions for all snippets, folders, and sub-folders.

When changing permissions on a folder that has subfolders, you have an option to extend those permissions to that folder's sub-folders by toggling the **Also change sub-folders** setting.

### Options for folder permissions

There are three options for changing snippet folder permissions:

- **Edit access (green checkmark icon)**. The default setting. Full access to the snippets in the folder. Users can view, edit, and archive or unarchive snippets. When a folder is created, all snippets are editable by all users. To restrict permissions to that folder, you'll need to either downgrade the group to view access, or revoke access entirely.
- **View access (yellow eye icon)**. Users in that group can view that snippet, but not edit or archive/unarchive it. They can, of course, copy the snippet's code and create a new snippet.
- **Revoke access (red X icon)**. Users in groups with neither edit nor view permissions to a snippet folder will not see that folder's snippets in the sidebar, nor will any snippets in that folder populate those users' searches.

### Archiving does not affect permissions

Archiving or unarchiving snippets does not affect a snippet's permissions. If, for example, only one group, say the Datamancer group, has edit permissions on a folder, only Datamancers would be able to archive and unarchive snippets in that folder, as archiving and unarchiving is considered editing the snippet.

### How folder permissions work

Snippet folder permissions require some effort to unpack, as permissions for snippet folders must work in conjunction with permissions for collections. 

Here's the basic rule: data is more sensitive than code, so permissions that protect data will take precedence over permissions that protect code. Let's work through some examples to illustrate how this works in practice.

For example (and here's a sentence that merits slow reading): a group might have permission to a collection that contains a question that uses a snippet housed in a folder that the group does not have permissions to. To rephrase: people in that group have permissions to run questions in a collection, but they do not have permission to a folder containing a snippet used in one of the collection's questions. How will Metabase resolve permissions in this case?

In two parts:

1. People in that group can run the question and get results. They have permission to see that data (the question results), and their permissions to the collection takes precedence over permissions to the folder (the snippet code).
2. However, just because people in that group can run the question without issue, they still don't have permission to the snippet's folder, so they wouldn't be able to see or edit that snippet (or the snippet's folder) in the snippet sidebar.

Because of how folder permissions work, we recommend that you consider snippet folder permissions as an additional tool for snippet organization, not as method of preventing access to the SQL code those snippets contain. Use folder permissions to keep the snippet sidebar tidy by exposing teams to folders relevant to their analytics, and restrict editing permissions to key snippets in your organization to keep important SQL code accurate and safe from bugs introduced by unvetted edits.
