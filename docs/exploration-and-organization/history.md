---
title: History
---

# History

## Viewing tracked changes

1. Go to your question or model.
2. Click the info icon (an i in a circle).
3. A sidebar will pop up with a history of up to 15 versions.

Metabase will keep track of a version each time you [save](../questions/sharing/answers.md#how-to-save-a-question), [move](../questions/sharing/answers.md#editing-your-question), [archive](#archive), or [verify](./exploration.md#verified-items) a question or model.

## Reverting to previous versions

1. Go to your question or model.
2. Click the info icon.
3. A sidebar will appear with the last 15 tracked changes.
4. Click on the **back arrow** icon beside an edit to revert your question or model to that version.

## Archive

Sometimes questions outlive their usefulness and need to be sent to Question Heaven.

You can find the **Archive** option from the three dot menu `...` of most Metabase items. Note that archiving a question will remove it from dashboards and email [subscriptions](../dashboards/subscriptions.md), so be careful!

### Archiving multiple items

You can batch archive multiple items from the same collection.

1. Go to the collection.
2. Hover over the icon beside the name of the item.
3. Click the checkbox that appears.
4. When you're done selecting your items, click **Archive** at the bottom of the page.

### Archiving a collection

1. Go to the collection.
2. Click `...` > **Archive** to send the collection to the archive.

Archiving a collection archives all of the collection's contents as well. You can only archive a collection if you have permission to **Curate** a collection (as well as all of the collections inside that collection). If you don't see the **Archive** option, you don't have the right permissions.

### Viewing the archive

1. Open the Metabase sidebar.
2. Click the `...` beside the "COLLECTIONS" header in the sidebar.
3. Click **View archive**.

## Unarchive

1. Open the Metabase sidebar.
2. Click the `...` beside the "COLLECTIONS" header in the sidebar.
3. Click **View archive**.
4. Hover over the item and click the **file** icon with a `^` symbol.

### Unarchiving multiple items

You can batch unarchive items from a collection that you have permission to **Curate**.

1. Go to the collection.
2. Hover over the icon beside the name of the item and click the checkbox that appears.
3. When you're done selecting your items, click **Unarchive** at the bottom of the page.

The item will get restored to the collection it was most recently saved in.

## Delete permanently

1. Open the Metabase sidebar.
2. Click the `...` beside the "COLLECTIONS" header in the sidebar.
3. Click **View archive**.
4. Hover over the item and click the **trash bin** icon.

### Deleting multiple items

You can batch delete items from a collection that you have permission to **Curate**.

1. Go to the collection.
2. Hover over the icon beside the name of the item and click the checkbox that appears.
3. When you're done selecting your items, click **Delete** at the bottom of the page.

The item will get permanently deleted from your application database. You cannot restore a deleted item unless you happen to maintain regular backups of your application database.
