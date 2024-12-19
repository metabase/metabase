---
title: Delete and restore
---

# Delete and restore

Sometimes your questions, dashboards, models, or collections outlive their usefulness. You can send outdated items to **Trash**.

![Move to trash](./images/move-to-trash.png)

Items in **Trash** won't show up in search (unless you use [advanced search filters](./exploration.md)), and you won't be able to use them to create new questions and dashboards.

Moving items to Trash isn't permanent; you'll be able to restore them to their original parent collection, or move them to another collection. But if you'd like to delete items permanently, [you can do that too](#permanently-deleting-items).

Deleting an item will affect any [dashboards](../dashboards/introduction.md), [subscriptions](../dashboards/subscriptions.md), or [SQL questions](../questions/native-editor/referencing-saved-questions-in-queries.md) that depend on that item, so be careful!

## See items in Trash

You can find Trash at the bottom of the left navigation sidebar below all the collections:

![Trash](./images/trash.png)

You can think of Trash as a special type of collection. In **Trash**, you can see deleted items from the collections that you have [Curate permissions](../permissions/collections.md#collection-permission-levels) on. You can order deleted items by type (questions, dashboards, etc), time it was deleted, and who deleted it.

You;'ll be able to see the contents of deleted dashboards, questions, and models in Trash, but you won't be able to modify them.

## Search in Trash

To find items in Trash, you can use [advanced search](./exploration.md) with a "Search items in trash" toggle.

## Deleting and restoring items

To move an item (question, dashboard, model, or collection) to Trash:

1. Go to the question you want to delete;
2. Click on the three dots menu;
3. Select "Move to trash".

When a collection is moved to the trash, Metabase moves all items in the collection to the trash as well.

You'll still be able to see the contents of the items in Trash, but you won't be able to modify them or use them as a source for other questions.

If you need to delete multiple items from the same collection, you can delete them in bulk:

1. Go to the collection containing items you want to delete;
2. Click the checkboxes next to the items to select them;
3. Select "Move to trash"

To restore an item:

1. Go to Trash;
2. Find the item you'd like to delete. You can sort deleted items to make it easier to find the item, or [search for your question in Trash](#search-in-trash);
3. Click on the checkbox next to the item to select it;
4. Select "Restore".

> Restoring a collection will also restore all the items from that collection.

If the item's original parent collection has been deleted as well, you won't see an option to **Restore**. You'll still be able to move the it from Trash to a different collection.

### Cleaning up collections

To move older, unused items in bulk to the trash, check out [cleaning up collections](./collections.md#cleaning-up-collections).

## How deleting an item affects related items

Deleting or restoring an item will affect other items that depend on that item.

### Questions

What happens to related items when you delete a question?

| Related item                       | In Trash       | Permanently deleted                | Restored       |
| ---------------------------------- | -------------- | ---------------------------------- | -------------- |
| Dashboard                          | Card removed   | Card removed                       | Card restored  |
| Question based on deleted question | Works normally | Breaks with `Card not found` error | Works normally |
| Alerts                             | Removed        | Removed                            | Not restored   |

### Dashboards

What happens to related items when you delete a dashboard?

| Related item                          | In Trash                   | Permanently deleted        | Restored       |
| ------------------------------------- | -------------------------- | -------------------------- | -------------- |
| Questions saved to that dashboard     | Moved to trash             | Deleted                    | Restored       |
| Questions not saved to that dashboard | Works normally             | Works normally             | Works normally |
| Subscriptions                         | Deactivated                | Deactivated                | Restored       |
| Custom homepage                       | Revert to default homepage | Revert to default homepage | Restored       |

### Model

What happens to related items when you delete a model?

| Related item                       | In Trash       | Permanently deleted                | Restored       |
| ---------------------------------- | -------------- | ---------------------------------- | -------------- |
| Question based on deleted question | Works normally | Breaks with `Card not found` error | Reactivated    |
| Dashboard                          | Card removed   | Card removed                       | Card restored  |
| Action                             | Works normally | Deleted                            | Works normally |

## Collections

What happens to related items when you delete a collection?

| Related item                                   | In Trash | Permanently deleted | Restored |
| ---------------------------------------------- | -------- | ------------------- | -------- |
| All items and subcollections in the collection | In Trash | Permanently deleted | Restored |

## Permanently deleting items

Moving an item to Trash doesn't delete the item completely: you'll be able to restore the item from the Trash.

To permanently delete an item:

1. Go to Trash;
2. Find the item you'd like to delete;
3. Click on the checkbox next to the collection to select it;
4. Select "Permanently delete". If you click this button, you won't be able to recover the item. It'll be lost to the void.

## Deleting and restoring events and timelines

Events and timelines can be archived and unarchived. See [Archiving Events and timelines](events-and-timelines.md#archiving-timelines).

You won't see archived Events and Timelines in Trash. To see archived events and timelines, you need to [access them from the collection's page](events-and-timelines.md#view-archived-events-and-timelines).

## Deleting and restoring SQL snippets

SQL snippets can be archived and unarchived. See [Archiving SQL snippets](../questions/native-editor/sql-snippets.md#archiving-snippets).

You won't see archived SQL snippets in Trash. To see archived SQL Snippets, you need to [access them from the Snippet menu](../questions/native-editor/sql-snippets.md#snippet-menu).

## Deleting segments

Segments can be retired. See [Retiring Segments](../data-modeling/segments.md#editing-and-retiring-segments).

You won't see retired Segments in Trash.

## Deleting subscriptions and alerts

See [Deleting a subscription](../dashboards/subscriptions.md#deleting-a-subscription) and [Deleting alerts](../questions/alerts.md#editing-and-deleting-alerts).

## Deleting databases

See [Deleting databases](../databases/connecting.md#deleting-databases).
