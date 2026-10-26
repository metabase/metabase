---
title: Data apps
summary: Data apps are React apps that Metabase serves on top of your Library. Admins manage them in Data Studio and ship them to production with Remote Sync.
---

# Data apps

_Data studio > Data apps_

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

<!-- TODO(writer): confirm which plans include the data-apps feature. The blockquote assumes Pro and Enterprise. -->

A data app is a React app that Metabase serves at `/apps/<slug>`. Data apps let you build small internal tools on your Metabase data, like portals, review queues, and forms, without standing up a separate app and backend. An app reads questions and metrics built on your [Library](./semantic-layer/library.md) and writes data through data actions, all under Metabase permissions.

Developers (or their AI agents) build apps on a development Metabase with the [Metabase CLI](../installation-and-operation/metabase-cli.md), and ship them to production with [Remote Sync](../installation-and-operation/remote-sync.md). Admins manage the apps in Data Studio: they see what each app reads and writes, make apps live or drafts, and choose which groups can open them.

## Requirements

- A plan that includes data apps. Without it, Data Studio doesn't show the **Data apps** tab.
- An admin account, to manage apps in Data Studio and to create apps.
- [Remote Sync](../installation-and-operation/remote-sync.md) to ship apps to production, with your development Metabase in Read-write mode and your production Metabase in Read-only mode.
- The tables and metrics your apps read, [published to the Library](./semantic-layer/published-tables.md).
- The [Metabase CLI](../installation-and-operation/metabase-cli.md), installed and logged in to your development Metabase.

## Build an app with the Metabase CLI

Log the CLI in to your development Metabase as an admin, because only admins can create, edit, and delete apps. Then:

1. Create the app with the CLI.
2. Add the questions the app reads, and the data actions it uses to write data, to the app's collection. See [What a data app can read and write](#what-a-data-app-can-read-and-write).
3. Generate the app's typed schema:

   ```sh
   mb data-app typed-schema <slug> --out src/metabase.ts
   ```

   The typed schema is a TypeScript file with a query for each question and an action for each data action in the app's collection. It refers to them by entity ID, so the same app works on every Metabase you sync it to.

4. Build the app, and push its bundle to your development Metabase. A bundle can be at most 10 MiB.

To have an AI agent run the CLI for you, check out [Use the CLI with an AI agent](../installation-and-operation/metabase-cli.md#use-the-cli-with-an-ai-agent).

## Manage data apps in Data Studio

Only admins can manage data apps. People in the [Data Analysts](../people-and-groups/managing.md#data-analysts) group can open Data Studio, but they don't see the **Data apps** tab.

1. Click the **grid** icon in the upper right and select **Data studio**.
2. In the left sidebar, under **Library**, click **Data apps**.

The list shows each app's **Name**, **Address**, **Status**, and **Last synced** time. The address is where people open the app, `/apps/<slug>`. **Last synced** shows when the app was last updated.

![Data apps list](./images/data-apps-list.png)

### Data app statuses

| Status                                    | Who can open the app                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Live**                                  | Admins, and people in the app's groups.                                                                                   |
| **Draft**                                 | Nobody. Admins can preview the app on its **Overview** tab.                                                               |
| **Live, outdated** or **Draft, outdated** | Nobody. The app was built for an older version of data apps. Migrate it to the current version, then rebuild and sync it. |

### See what an app reads and writes

Click an app in the list to see its details. Each app has four tabs:

- **Overview**: A live preview of the app (drafts too), and the app's **Status**, **Address**, and **Group access**.
- **Questions**: The questions the app reads. Click a question to see it.
- **Actions**: The data actions the app uses to write data. Click an action to see its **Definition** and **Fields**.
- **Permissions**: The groups whose people can open the app.

If your Metabase has the [dependency graph](./tools/graph.md), each question and action also has a **Dependencies** tab.

![Data app Overview tab](./images/data-apps-overview-tab.png)

### Choose who can open an app

On the app's **Permissions** tab:

1. Click **Add groups**.
2. In **Search for groups to add**, pick one or more groups.
3. Click **Add**.

You can add any group except **Administrators** and [tenant](../embedding/tenants.md) groups. Admins can always open live apps. If an app has no groups, only admins can open it.

### Check that groups can see the app's data

Adding a group to an app lets people in that group open the app, but it doesn't change their [data permissions](../permissions/data.md). If the **Data access** column says **Missing N tables**, people in that group don't have [Can view](../permissions/data.md#can-view-data-permission) access to some of the tables that the app's questions and actions read. Metabase counts the access the group gets from All Users too.

![Data app Permissions tab](./images/data-apps-permissions-tab.png)

To fix the group's access:

1. Click the group's row. A sidebar opens with the group's **Missing tables**.
2. Click a table, and select **Change permissions** to open that table's data permissions.

### Make an app live or a draft

New apps start live. To change an app's status:

1. In the list of data apps, click the **three dots** on the app's row.
2. Select **Make draft** (or **Make live**), and confirm.

Making an app a draft doesn't change the app. Nobody can open it until you make it live again.

Each Metabase keeps its own status for an app: the status doesn't sync with Remote Sync, and you can change it on a Read-only Metabase.

### Open an app from Data Studio

To open a live app at its address, click the **three dots** on the app's row and select **Open app**. **Open app** only shows for live apps that aren't outdated.

## What a data app can read and write

An app's collection can hold only questions, metrics, and query actions. When you save an item to the collection, Metabase refuses it if it breaks one of these rules:

- Questions must be built with the query builder, not SQL. They can't start from another saved question, and they can read only [tables published to the Library](./semantic-layer/published-tables.md) and metrics from the Library. If a question reads something else, the error names what it read.
- Questions and metrics in the collection can't be archived, public, or embedded.
- Actions must be query actions that don't belong to a model, aren't archived or public, and read only the questions in the app's collection.

For permissions, the app's collection is an ordinary collection: admins can edit it. Adding a group to an app gives that group read access to the app's collection. On a Metabase in Read-only mode, nobody can edit an app's collection.

You can't move the app's collection, move it to the trash, make it official, or sync it on its own. The collection syncs with its app.

Deleting an app also deletes its collection (with its questions and actions), its bundle, and its group access. You can't delete a synced app on a Read-only Metabase.

## Ship an app to production with Remote Sync

When [Remote Sync](../installation-and-operation/remote-sync.md) is on, it always syncs your data apps.

1. On your development Metabase (in Read-write mode), [push your changes](../installation-and-operation/remote-sync.md#pushing-changes-to-git). In your repository, the app goes under `data_apps/<slug>/` with its bundle, and the app's collection goes under `collections/data_apps/`.
2. On your production Metabase (in Read-only mode), [pull the changes](../installation-and-operation/remote-sync.md#pulling-changes-from-git).
3. On your production Metabase, [add groups](#choose-who-can-open-an-app) to the app.

A new app starts live on your production Metabase, but group access doesn't sync. Until you add groups on production, only admins can open the app there.

### What syncs with a data app

Remote Sync syncs the app's manifest (`data_app.yaml`), its bundle, and its collection with its questions and actions.

Remote Sync doesn't sync the app's status (live or draft) or its group access. Set those on each Metabase.

### If a pull fails

- **A data app named "<slug>" already exists on this instance**: Your Metabase already has an app with that slug. Delete the app on your Metabase, or give the app in the repository another slug.
- The pull also fails if the app's bundle file is missing from the repository.

## How people open data apps

People in an app's groups can open a live app at its address, `/apps/<slug>`. They can also open it from the **Data apps** section of the left navigation sidebar, which lists the live apps they can open.

People in [tenants](../embedding/tenants.md) can't open data apps.

## Fix an app that won't open

- **You don't have access to this data app**: The person isn't in any of the app's groups, or the app is a draft. To give them access, [add one of their groups](#choose-who-can-open-an-app) to the app.
- **This data app is outdated**: The app was built for an older version of data apps. Migrate it to the current version, then rebuild it and sync it again.
- **This data app isn't ready yet**: The app has no bundle yet. Build the app and push its bundle, or wait for Remote Sync to pull it.
