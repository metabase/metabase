---
title: History
---

# History

Metabase keeps a version history for the previous fifteen versions for an entity. You can view changes, and revert to previous versions.

On Metabase Pro and Enterprise plans, you can also version control most entities in Metabase, see [Remote Sync](../installation-and-operation/remote-sync.md).

## History for questions, dashboards, metrics, and models

### Viewing tracked changes

1. Go to your question, dashboard, metric, or model.
2. Click the info icon.
3. Click on the **History** tab.
4. The History tab will display the item's history of up to 15 versions.

Metabase will keep track of a version each time you save, move, revert, [move to Trash](./delete-and-restore.md), or [verify](./content-verification.md) an item.

### Reverting to previous versions

1. Go to your question, dashboard, or model.
2. Click the info icon (an **i** in a circle).
3. A sidebar will appear with up to fifteen previous versions.
4. Click on the **back arrow** beside a version to revert your item to that point in time.

## History for transforms

### Viewing tracked changes

1. Go to your transform in [Data studio](../data-studio/transforms/transforms-overview.md).
2. Click the **three dots** icon and select **History**
3. The History tab will display the item's history of up to 15 versions.

Any change to the transform's query or script will be recorded as "changed source".

### Reverting to previous versions

1. Go to your transform in [Data studio > Transforms](../data-studio/transforms/transforms-overview.md).
2. Click the **three dots** icon and select **History**
3. Click on the **back arrow** beside a version to revert your item to that point in time.

## History for segments and measures

1. Go to the table source for the segment or metrics in [Data studio > Data Structure](../data-studio/data-structure.md).
2. Pick the segment or measure in the right sidebar.
3. On the segment or measure's page, go to **Revision history** tab
