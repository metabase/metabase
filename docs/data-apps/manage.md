---
title: Manage data apps
summary: In Data Studio, admins see what each data app reads and writes, make apps live or drafts, and choose which groups can open them.
---

# Manage data apps

_Data Studio > Data apps_

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

Only admins can manage data apps.

1. Click the **grid** icon in the upper right and select **Data studio**.
2. In the left sidebar, under **Library**, click **Data apps**.

The list shows each app's **Name**, **Address**, **Status**, and **Last synced** time. The address is where people open the app, `/apps/<slug>`. **Last synced** is the last time the app itself changed, like a new bundle or a status change. Edits to the app's questions and actions don't update it.

![Data apps list](./images/data-apps-list.png)

To open a live app, click the **three dots** on the app's row and select **Open app**.

## See what an app reads and writes

Click an app in the list to see its details. Each app has four tabs:

- **Overview**: A live preview of the app, and the app's **Status**, **Address**, and **Group access**.
- **Questions**: The questions in the app's collection, but not its metrics. Click a question to see it.
- **Actions**: The data actions the app uses to write data. Click an action to see its **Definition** and **Fields**.
- **Permissions**: The groups whose people can open the app.

![Data app Overview tab](./images/data-apps-overview-tab.png)

Each question and action also has a **Dependencies** tab. You can also [see the whole app in the dependency graph](../data-modeling/tools/graph.md#data-apps-in-the-dependency-graph).

To see the questions and actions that your apps run, who runs them, and what fails, check out [Data app analytics](../monitor/data-app-analytics.md) in Monitor.

## Make an app live or a draft

New apps start live. To change an app's status:

1. In the list of data apps, click the **three dots** on the app's row.
2. Select **Make draft** (or **Make live**), and confirm.

Nobody can open a draft at its address, not even admins. Admins can preview a draft on its **Overview** tab.

## Choose who can open an app

On the app's **Permissions** tab:

1. Click **Add groups**.
2. Search for one or more groups, and select them.
3. Click **Add**.

You can add any group except [tenant](../embedding/tenants.md) groups. People in tenants can't open data apps. If an app has no groups, only admins can open it.

### Check that groups can see the app's data

Adding a group to an app lets people in that group open the app, and gives the group read access to the app's collection. Adding a group doesn't change their [data permissions](../permissions/data.md). If the **Data access** column says **Missing N tables**, people in that group don't have [Can view](../permissions/data.md#can-view-data-permission) access to some of the tables that the app's questions and actions read. The check counts the group's own access, and All Users access, but not access that people get from their other groups. The check also doesn't look at [row and column security](../permissions/row-and-column-security.md): a group with row and column security can show **All tables**, but people in that group can't run the app's actions on that database.

![Data app Permissions tab](./images/data-apps-permissions-tab.png)

The check uses the [dependency graph](../data-modeling/tools/graph.md). Since the graph updates in the background, a warning can also lag behind your latest edits.

To fix the group's access:

1. Click the group's row. A sidebar opens with the group's **Missing tables**.
2. Click a table, and select **Change permissions** to open that table's data permissions.

## Delete a data app

Data Studio doesn't have an option to delete apps. To delete an app, ask your agent, or run:

```sh
mb data-app delete <slug>
```

Deleting an app also deletes its collection (with its questions and actions), its bundle, and its group access.
