# Collection permissions

![Collection detail](images/collections/collection-detail.png)

Collections are a great way to organize your dashboards, saved questions, and pulses, and to decide who gets to see and edit things. Collections could be things like, "Important Metrics," "Product Team," "Marketing KPIs," or "Questions about users." Collections can even contain other collections, allowing you to create an organizational structure that fits your team. You can also choose which user groups should have what level of access to your collections (more on that below).

Metabase starts out with a default top-level collection which is called __Our analytics__, which every other collection is saved inside of.

This page will teach you how to create and manage your collections. For more information on organizing saved questions and using collections, [check out this section of the User's Guide](../users-guide/06-sharing-answers.md).

### Creating and editing collections

If a user has Curate access for a collection, they can create new sub-collections inside it and edit the contents of the collection. From the detail view of any collection, click on the **+** button and select **Collection** to make a new one. Give your collection a name, choose where it should live, and give it a description if you'd like.

![Create collection](images/collections/create-collection.png)

By default, any new collection will have the same permissions settings as the collection it was created in (its "parent" collection), but you can change those settings from the Edit menu.

### Pinning things in collections

![Pins](images/collections/pinned-items.png)

One great feature in Metabase is that you can pin the most important couple of items in each of your collections to the top. Pinning an item in a collection turns it into a big, eye-catching card that will help make sure that folks who are browsing your Metabase instance will always know what's most important. And if you pin a question, Metabase will display a preview of its visualization. 

Any user with curate permissions for a collection can pin items in it, making it easy to delegate curation responsibilities to other members of your team. To pin something, select the **pin icon** next to the item's name. Note that collections themselves can't be pinned, but if you're running [Metabase Pro or Enterprise Edition](https://www.metabase.com/pricing), admins can designate [Offical Collections][offical-collections].

### Setting permissions for collections

Collection permissions are similar to [data access permissions](05-setting-permissions.md). You can set permissions on collections by clicking on the lock icon in the top-right of the screen while viewing the collection and clicking on **Edit permissions**. Only Administrators can edit collection permissions. Each [user group](05-setting-permissions.md) can have either View, Curate, or No access to a collection:

- **Curate access**: the user can edit, move, and archive items saved in this collection, and can save or move new items into it. They can also create new sub-collections within this collection. In order to archive a sub-collection within this collection, they'll need to have Curate access for it and any and all collections within it.
- **View access**: the user can see all the questions, dashboards, and pulses in the collection. If the user does not have permission to view some or all of the questions included in a given dashboard or pulse then those questions will not be visible to them; but any questions that are saved in this collection _will_ be visible to them, _even if the user doesn't have access to the underlying data used to in the question._
- **No access**: the user won't see this collection listed, and doesn't have access to any of the items saved within it.

![Permissions](images/collections/collection-permissions.png)

If you want to see the bigger picture of what permissions your user groups have for all your collections, just click the link that says **See all collection permissions**, which takes you to the Admin Panel. You'll see a list of your collections down along the left, and clicking on any of those will bring up a list of each group's permission settings for that collection.

![Collection Permissions](images/collections/admin-panel-collections.png)

Just like with data access permissions, collection permissions are _additive_, meaning that if a user belongs to more than one group, if one of their groups has a more restrictive setting for a collection than another one of their groups, they'll be given the _more permissive_ setting. This is especially important to remember when dealing with the All Users group: since all users are members of this group, if you give the All Users group Curate access to a collection, then _all_ users will be given Curate access for that collection, even if they also belong to a group with _less_ access than that.

### Permissions and sub-collections

One nuance with how collections permissions work has to do with sub-collections. A user group can be given access to a collection located somewhere within one or more sub-collections _without_ having to have access to every collection "above" it. E.g., if a user group had access to the "Super Secret Collection" that's saved several layers deep within a "Marketing" collection that the group does _not_ have access to, the "Super Secret Collection" would show up at the top-most level that the group _does_ have access to.

To learn more, check out our Learn article on [working with collection permissions][collection-permissions].

### Personal collections

Each user has a personal collection where they're always allowed to save things, even if they don't have Curate permissions for any other collections. Administrators can see and edit the contents of every user's personal collection (even those belonging to other Administrators) by clicking on the **Other users' personal collections** link at the bottom of the sidebar when viewing "Our analytics".

A personal collection works just like any other collection except that its permissions can't be changed. If a sub-collection within a personal collection is moved to a different collection, it will inherit the permissions of that collection.

### Archiving collections

Users with curate permission for a collection can archive collections. Click the edit icon in the top-right of the collection screen and select **Archive this collection** to archive it. This will also archive all questions, dashboards, pulses, and all other sub-collections and their contents. Importantly, this will also remove any archived questions from all dashboards and Pulses that use them.

**Note:** The "Our analytics" collection and personal collections can't be archived.

You can always _unarchive_ items. In the Collections list sidebar, at the bottom, click on __View archive__. Search for the item you'd like to unarchive (you'll either need to scroll down the page, or use the browser's find in page functionality, as archived items won't appear in Metabase's search results). Select the open box with an up arrow icon to "Unarchive this".

## Dashboard subscriptions

You don't explicitly set permissions on [dashboards subscriptions][dashboard-subscriptions], as the subscriptions are a feature of a dashboard. And access to dashboards falls under Collection permissions.

Here's what you can do with dashboard subscriptions based on Collection permissions for the collection the dashboard is in:

- **Curate access**: You can view and edit all subscriptions for the dashboard, including subscriptions created by other people.
- **View access**: You can view all subscriptions for that dashboard. You can also create subscriptions and edit ones that you’ve created, but you can’t edit ones that other people created. You can also unsubscribe from a subscription that somebody else created.
- **No access**: You can’t view any of the dashboard's subscriptions, including, for example, subscriptions you created before an administrator revoked your access to the collection.

---

## Next: sharing and embedding with public links

Want to share certain dashboards or questions with the world? You can do that with [public links](12-public-links.md).

[collections]: 06-collections.md
[collection-permissions]: /learn/permissions/collection-permissions.html
[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.md
[data-permissions]: data-permissions.md
[pulses]: ../users-guide/10-pulses.md
[data-sandboxing]: ../enterprise-guide/data-sandboxes.md
[offical-collections]: ../users-guide/collections.html#official-collections
[permissions]: /learn/permissions/
[sandbox-columns]: /learn/permissions/data-sandboxing-column-permissions.html
[sandbox-rows]: /learn/permissions/data-sandboxing-row-permissions.html
[slack-integration]: 09-setting-up-slack.md
[sql-snippet-folders]: ../enterprise-guide/sql-snippets.md
[table-permissions]: data-permissions.md#table-permissions
