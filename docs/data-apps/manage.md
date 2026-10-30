---
title: Manage data apps
summary: In Data Studio, admins see what each data app reads and writes, make apps live or drafts, and choose which groups can open them.
---

# Manage data apps

_Data Studio > Data apps_

> **Beta:** Data apps are in beta.

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

Only admins can manage data apps.

1. Click the **grid** icon in the upper right and select **Data studio**.
2. In the left sidebar, under **Library**, click **Data apps**.

The list shows each app's **Name**, **Address**, **Status**, and **Last synced** time. The address, `/apps/<slug>`, is where people open the app. The slug is the app's short name. **Last synced** is the last time the app itself changed, like a new bundle or a status change. Edits to the app's questions and actions don't update it.

![Data apps list](./images/data-apps-list.png)

To open a live app, click the **three dots** on the app's row and select **Open app**.

## See what an app reads and writes

Before you let more people open an app, check which data the app reads and writes. In the list of data apps, click the app. The app's **Overview** tab has a preview of the app. The **Questions** and **Actions** tabs list the questions and actions in the app's collection, and the **Permissions** tab lists the groups that can open the app.

![Data app Overview tab](./images/data-apps-overview-tab.png)

These tabs don't show everything that the app can read. The **Questions** tab doesn't list the app's metrics. And the app can also read your published tables, and the metrics and dashboards in your Library. See [what a data app can read and write](./build.md#what-a-data-app-can-read-and-write).

To see what a question or action depends on, open the question or action, and go to its **Dependencies** tab. To see the whole app, including its metrics, look up the app in the [dependency graph](../data-modeling/tools/graph.md).

To see the questions and actions that your apps run, who runs them, and what fails, check out [Data app analytics](../monitor/data-app-analytics.md) in Monitor.

## Make an app live or a draft

An app's status controls whether the app opens at its address:

- **Live**: Admins, and people in the app's groups, can open the app at its address.
- **Draft**: Nobody can open the app at its address, not even admins. Admins can only preview the app on its **Overview** tab in Data Studio.

New apps start live. Make an app a draft to take it offline, for example while you fix a problem. To change an app's status:

1. In the list of data apps, click the **three dots** on the app's row.
2. Select **Make draft** (or **Make live**), and confirm.

## Choose who can open an app

On the app's **Permissions** tab:

1. Click **Add groups**.
2. Search for one or more groups, and select them.
3. Click **Add**.

Admins can always open live apps, so you can't add the **Administrators** group. If an app has no groups, only admins can open it.

[Tenant users](../embedding/tenants.md#user-types) can't open data apps, so you can add only [internal groups](../embedding/tenants.md#group-types) to an app. You can't add [tenant groups](../embedding/tenants.md#create-tenant-groups) or the **All tenant users** group.

### Check that groups can see the app's data

Adding a group to an app lets people in that group open the app, and gives the group read access to the app's collection. Adding a group doesn't change their [data permissions](../permissions/data.md).

If the **Data access** column says **Missing N tables**, people in that group don't have [Can view](../permissions/data.md#can-view-data-permission) access to some of the tables that the app's questions and actions read. The check counts the group's own access, and All Users access, but not access that people get from their other groups. The check also doesn't look at [row and column security](../permissions/row-and-column-security.md): a group with row and column security can show **All tables**, but people in that group can't run the app's actions on that database. And since the check uses the [dependency graph](../data-modeling/tools/graph.md), which updates in the background, a warning can lag behind your latest edits.

![Data app Permissions tab](./images/data-apps-permissions-tab.png)

To fix the group's access:

1. Click the group's row. A sidebar opens with the group's **Missing tables**.
2. Click a table, and select **Change permissions** to open that table's data permissions.

## Delete a data app

Data Studio doesn't have an option to delete apps. Delete the app on your development Metabase: ask your agent, or [log the CLI in](../installation-and-operation/metabase-cli.md#authenticate-the-cli) as an admin and run:

```sh
mb data-app delete <slug>
```

Deleting an app also deletes its collection (with its questions and actions), its bundle, and its group access. To delete the app on production too, [push the change](../data-modeling/semantic-layer/remote-sync.md#pushing-changes-to-git) to your branch, merge the branch, and pull the changes on your production Metabase.
