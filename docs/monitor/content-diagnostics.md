---
title: Content diagnostics
summary: Find unused, duplicated, and poorly organized content so you can clean up your Metabase.
---

# Content diagnostics

{% include plans-blockquote.html feature="Content diagnostics" %}

Content diagnostics scans your Metabase for content that clutters your instance or performs poorly, like questions nobody views, duplicate dashboards, and empty collections. It groups results by finding type so you can review them and clean up your Metabase.

To open Content diagnostics:
 
1. Open [Monitor](./start.md).
2. In the left sidebar, click **Content diagnostics**.

Admins, [Data Analysts](../people-and-groups/managing.md#data-analysts), and groups with [Monitoring access](../permissions/application.md#monitoring-access) can view Content diagnostics. You only see findings for content you have permission to view.

## Finding types

Each tab shows one type of finding.

| Tab            | What Metabase flags                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stale**      | Questions, models, metrics, dashboards, documents, and transforms that nobody has viewed or run in 90 days or more.                                                       |
| **Duplicated** | Items that share a name with another item of the same type. Metabase ignores case and whitespace when comparing names.                                                   |
| **Slow**       | Questions with a median run time over 15 seconds in the last 30 days, the dashboards and documents that contain them, and transforms whose last run took over 60 seconds. |
| **Empty**      | Collections with no items, dashboards with no cards, documents with no content, and questions whose last run returned no results.                                         |
| **Sparse**     | Collections with fewer than 5 items, and dashboards with fewer than 4 cards.                                                                                              |
| **Crowded**    | Collections with more than 100 items, dashboards with more than 5 tabs or more than 20 cards on a tab, and documents with more than 20 cards.                             |

Metabase doesn't scan items in the Trash, sample content, or usage analytics. To hide items in personal collections, click **Filter** and clear **Include items in personal collections**.

## Review findings

Click an item to open a sidebar with its:

- Type
- Description
- Creator, or owner for collections
- Created date

The sidebar also shows why Metabase flagged the item:

- **Stale**: view count and last used date.
- **Duplicated**: view count, and a list of the duplicates with their view counts. Click a duplicate to open it.
- **Slow**: view count and run duration.
- **Empty**, **Sparse**, and **Crowded**: content count.

To open the item, click the arrow icon next to its name.

## Trash or dismiss findings
 
1. Select the checkbox next to each item.
2. Click **Move to trash** or **Dismiss finding**.

**Move to trash** sends items to the [Trash](../exploration-and-organization/delete-and-restore.md), where you can restore them later. The exception is transforms, which Metabase deletes permanently.

**Dismiss finding** hides the finding until the next scan. If the problem still exists, the finding appears again.

## When scans run

Metabase runs the first scan when you upgrade to Metabase 65 or later, and then scans every day at 4:00 AM server time. You can't start a scan manually.

If you fix a problem, the finding stays in the list until the next scan. Dismiss the finding to hide it sooner.