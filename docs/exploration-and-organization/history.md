---
title: History
---

# History

## Viewing tracked changes

1. Go to your question, dashboard, or model.
2. Click the info icon.
3. A sidebar will pop up with a history of up to 15 versions.

Metabase will keep track of a version each time you [save](../questions/sharing/answers.md#how-to-save-a-question), [move](../questions/sharing/answers.md#editing-your-question), [revert](#reverting-to-previous-versions), [archive](#archiving-items), or [verify](./exploration.md#verified-items) a question or model.

## Reverting to previous versions

1. Go to your question, dashboard, or model.
2. Click the info icon.
3. A sidebar will appear with up to 15 previous versions.
4. Click on the **back arrow** icon beside a version to revert your item to that point in time.

## Archiving items

Sometimes your questions, dashboards, or models outlive their usefulness. You can send outdated items to the **Archive** from the three dot menu `...` of your questions, dashboards, or models.

Note that archiving an item will affect any [dashboards](../dashboards/introduction.md), [subscriptions](../dashboards/subscriptions.md), or [SQL questions](../questions/native-editor/referencing-saved-questions-in-queries.md) that depend on that item, so be careful!

### Archiving multiple items

You can batch archive multiple items from the same collection:

1. Go to the collection.
2. Hover over the icon beside the name of the item.
3. Click the checkbox that appears.
4. When you're done selecting your items, click **Archive** at the bottom of the page.

### Archiving a collection

1. Go to the collection.
2. Click `...` > **Archive** to send the collection to the archive.

Archiving a collection archives all of the collection's contents as well. You can only archive a collection if you have permission to **Curate** a collection (as well as all of the collections inside that collection). If you don't see the **Archive** option, you don't have the right permissions.

### Viewing the archive

1. Open the main Metabase sidebar.
2. Click the `...` beside the "Collections" header in the sidebar.
3. Click **View archive**.

## Unarchiving items

1. Open the main Metabase sidebar.
2. Click the `...` beside the "Collections" header in the sidebar.
3. Click **View archive**.
4. Hover over the item and click the **unarchive** icon (rectangle with a `^` symbol).

The unarchived item should get restored to the parent collection that it was most recently saved in. If you unarchive an item, and you don't know where it's reappeared:

- search for the item directly, or
- check if the item's parent collection is also in the archive.

### Unarchiving multiple items

1. Go to the collection.
2. Hover over the icon beside the name of the item and click the checkbox that appears.
3. When you're done selecting your items, click **Unarchive** at the bottom of the page.

## Deleting items permanently

1. Open the main Metabase sidebar.
2. Click the `...` beside the "Collections" header in the sidebar.
3. Click **View archive**.
4. Hover over the item and click the **trash bin** icon.

The item will get permanently deleted from your application database. You cannot restore a deleted item unless you happen to maintain regular backups of your application database.

### Deleting multiple items permanently

1. Go to the collection.
2. Hover over the icon beside the name of the item and click the checkbox that appears.
3. When you're done selecting your items, click **Delete** at the bottom of the page.
