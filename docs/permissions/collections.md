---
title: Collection permissions
redirect_from:
  - /docs/latest/administration-guide/06-collections
---

# Collection permissions

![Collection detail](./images/collection-detail.png)

You can use [collections](../exploration-and-organization/collections.md) to organize questions, dashboards, models, timelines, and other collections. You can set permissions on those collections to determine which groups of people can view and curate collections' items.

Metabase starts out with a default top-level collection which is called **Our analytics**, which every other collection is saved inside of.

## Collection permission levels

There are three permission levels for collections:

- [Curate access](#curate-access)
- [View access](#view-access)
- [No access](#no-access)

| Action                             | Curate Access | View Access | No Access |
| ---------------------------------- | ------------- | ----------- | --------- |
| View items                         | ✅            | ✅          | ❌        |
| Edit items' title and descriptions | ✅            | ❌          | ❌        |
| Move items                         | ✅            | ❌          | ❌        |
| Archive items                      | ✅            | ❌          | ❌        |
| Pin items                          | ✅            | ❌          | ❌        |
| View events and timelines          | ✅            | ✅          | ❌        |
| Edit events and timelines          | ✅            | ❌          | ❌        |

### Curate access

The group can view, edit, move, archive, and pin items saved in this collection, and can save or move new items into it. The group can also create new sub-collections within this collection. The group can also create and edit [events and timelines](../exploration-and-organization/events-and-timelines.md).

### View access

The group can see all the questions, dashboards, and models in the collection, as well as [events and timelines](../exploration-and-organization/events-and-timelines.md).

### No access

The group won't see this collection listed, and they'll lack access to any of the items saved within it.

## Collection vs data permissions

Collection permissions only apply to viewing and curating existing questions, models, and dashboards. Changing the query on an existing question, or creating a new question, requires that the group have [data permissions](./data.md) for the underlying data.

There is one, important exception: when a group has their data permission set to [Block](./data.md#blocked-view-data-permission) for a database or table, the group won't be able to view questions based on that data, even if they have curate access to the collection where those questions are saved.

## Dashboards with questions from multiple collections

If a dashboard includes questions saved to other collections, the group will need view or curate access to all of those collections in order to view those questions. If not, Metabase will apologize and tell you that you lack permissions to see the cards saved to the other collections.

![Dashboard with questions from multiple collections, where the person is not in a group with access to one of the collections](./images/dashboard-no-permissions.png)

In general, it's easier to manage permissions when keeping all of a dashboard's questions in the same collection.

## Setting permissions for collections

You can set permissions on collections by clicking on the lock icon in the top-right of the screen while viewing the collection and clicking on **Edit permissions**. Only Administrators can edit collection permissions. Each [user group](./introduction.md) can have either View, Curate, or No access to a collection:

![Permissions](./images/collection-permissions.png)

If you want to see the bigger picture of what permissions your user groups have for all your collections, just click the link that says **See all collection permissions**, which takes you to the Admin Panel. You'll see a list of your collections down along the left, and clicking on any of those will bring up a list of each group's permission settings for that collection.

![Collection Permissions](./images/admin-panel-collections.png)

Just like with data access permissions, collection permissions are _additive_, meaning that if a user belongs to more than one group, if one of their groups has a more restrictive setting for a collection than another one of their groups, they'll be given the _more permissive_ setting. This is especially important to remember when dealing with the All Users group: since all users are members of this group, if you give the All Users group Curate access to a collection, then _all_ users will be given Curate access for that collection, even if they also belong to a group with _less_ access than that.

## Permissions and sub-collections

A group can be given access to a collection located somewhere within one or more sub-collections _without_ having to have access to every collection "above" it. For example, if a group had access to the "Super Secret Collection" that's saved several layers deep within a "Marketing" collection that the group lacks access to, the "Super Secret Collection" would show up at the top-most level that the group _does_ have access to.

## Archiving collections

Users with curate permission for a collection can archive collections. Click the edit icon in the top-right of the collection screen and select **Archive this collection** to archive it. This will also archive all questions, dashboards, models, and all other sub-collections and their contents. Importantly, this will also remove any archived questions from all dashboards that use them.

You can _unarchive_ items. In the Collections list sidebar, at the bottom, click on **View archive**. Search for the item you'd like to unarchive (you'll either need to scroll down the page, or use the browser's find in page functionality, as archived items won't appear in Metabase's search results). Select the open box with an up arrow icon to "Unarchive this".

## Pinning items in collections

![Pins](./images/pinned-items.png)

People in groups with Curate access to a collection can pin items in the collection. Pinning an item in a collection turns the item into a handsome card at the top of the collection.

To pin an item, select the **pin icon** next to the item's name.

Note that collections themselves can't be pinned. If you're running on a [Pro or Enterprise plan](https://www.metabase.com/pricing), admins can designate [Official Collections][offical-collections].

## Special collections

### Our analytics

The "Our analytics" collection and individual personal collections are invincible; they cannot be archived, injured, or slain. They are eternal.

### Metabase analytics

See [Usage analytics](../usage-and-performance-tools/usage-analytics.md).

### Personal collections

Each person has a personal collection where they're always allowed to save things, even if they don't have Curate permissions for any other collections.

Administrators can see and edit the contents of every user's personal collection (even those belonging to other Administrators) by clicking on the **Other users' personal collections** link at the bottom of the sidebar when viewing "Our analytics".

A personal collection works just like any other collection except that its permissions are fixed and cannot be changed. If a sub-collection within a personal collection is moved to a different collection, the sub-collection will inherit the permissions of its new parent collection.

## Further reading

- [Working with collection permissions][collection-permissions].

[collections]: ../exploration-and-organization/collections.md
[collection-permissions]: https://www.metabase.com/learn/permissions/collection-permissions
[dashboard-subscriptions]: ../dashboards/subscriptions.md
[data-permissions]: ./data.md
[data-sandboxing]: ../permissions/data-sandboxes.md
[offical-collections]: ../exploration-and-organization/collections.md#official-collections
[permissions]: https://www.metabase.com/learn/permissions
[sandbox-columns]: https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions
[sandbox-rows]: https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions
[slack-integration]: ../configuring-metabase/slack.md
[sql-snippet-folders]: ../questions/native-editor/sql-snippets.md
