## Creating Collections for Your Saved Questions
---

Collections are a great way to organize your saved questions and decide who gets to see and edit things. Collections could be things like, "Important Metrics," "Marketing KPIs," or "Questions about users." Collections can even contain other collections, allowing you to create an organizational structure that fits your team. You can also choose which user groups should have what level of access to your collections (more on that below).

This page will teach you how to create and manage your collections. For more information on organizing saved questions and using collections, [check out this section of the User's Guide](../users-guide/06-sharing-answers.md).

### Creating and editing collections
If a user has Curate access for a collection, they can create new sub-collections inside it and edit the contents of the collection. From the detail view of any collection, click on the `Create a collection` button to make a new one. Give your collection a name, choose where it should live, and give it a description if you'd like. By default, new collections will have the same permissions settings as the collection it was created in (its "parent" collection), but you can change those settings.

![Permissions empty state](images/collections/collections-empty-state.png)

### Setting permissions for collections
Collection permissions are similar to [data access permissions](05-setting-permissions.md). Rather than going to the Admin Panel, you set permissions on collections by clicking on the sharing icon in the top-right of the screen while viewing the collection and clicking on `Edit permissions`. Only Administrators can edit collection permissions. Each [user group](05-setting-permissions.md) can have either View, Curate, or No access to a collection:

- **View access:** the user can see all the questions, dashboards, and pulses in the collection. If the user does not have permission to view some or all of the questions included in a given dashboard or pulse then those questions will not be visible to them; but any questions that are saved in this collection *will* be visible to them, *even if the user doesn't have access to the underlying data used to in the question.**
- **Curate access:** the user can edit, move, and archive items saved in this collection, and can save or move new items into it. They can also create new sub-collections within this collection. In order to archive a sub-collection within this collection, they'll need to have Curate access for it and any and all collections within it.
- **No access:** the user won't see this collection listed, and doesn't have access to any of the items saved within it.

![FIX ME -- new permissions modal]()

If you want to see the bigger picture of what permissions your user groups have for all your collections, jut click the link that says `See all collection permissions`. You'll see a table with your user groups along the top and all your collections down along the left. Click the `View collections` link under any collection that contains more collections to zoom in and see its contents.

![Permissions grid](images/collections/permission-grid.png)

Just like with data access permissions, collection permissions are *additive*, meaning that if a user belongs to more than one group, if one of their groups has a more restrictive setting for a collection than another one of their groups, they'll be given the *more permissive* setting. This is especially important to remember when dealing with the All Users group: since all users are members of this group, if you give the All Users group Curate access to a collection, then *all* users will be given Curate access for that collection, even if they also belong to a group with *less* access than that.

### Permissions and sub-collections
One nuance with how

### The "Everything Else" section
If a question isn't saved within a collection, it will be placed in the Everything Else section of the main Questions page. **All your Metabase users can see questions in this section**, provided they have data access permission.

### Archiving collections
You can archive collections similarly to how you can archive questions. Click the archive icon in the top-right of the collection screen to archive it. This will also archive all questions in the collection, and importantly it will also remove all of those questions from all dashboards and Pulses that use those questions. So be careful!

To restore a collection and its contents, click the `View Archive` icon in the top-right of the main Questions screen to see the archive, then hover over an item to reveal the `Unarchive` icon on the far right of the item. Questions within archived collections are not individually listed in the archive, so if you want to unarchive a specific question from an archived collection, you have to unarchive that whole collection.

### Personal collections

## Next: custom segments and metrics
Learn how to define custom segments and commonly referenced metrics in the [next section](07-segments-and-metrics.md).
