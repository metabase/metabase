---
title: Data apps (beta)
summary: Data apps are custom apps that an AI coding agent builds on your semantic layer. They show your data in any layout you want, and can let people add, edit, and delete rows.
---

# Data apps (beta)

![An example data app: a sales overview of a storefront](./images/example-data-app.png)

> **Beta:** Data apps are in beta.

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

Data apps are custom apps that you build on your Metabase data. Like a dashboard, a data app shows charts and tables from your [semantic layer](../data-modeling/semantic-layer/library.md). But an app isn't limited to cards and filters on a grid: an app can have its own layout, its own pages, and forms that add, edit, or delete rows in your database. You can build apps like portals, review queues, and forms, without having to stand up a separate app and backend.

A data app runs with the permissions of the person who opens it, so people see only the data that they're allowed to see. An app can write data only through the actions in its own collection. See [what a data app can read and write](#what-a-data-app-can-read-and-write).

This page is the reference for data apps. To set up your tools and build your first app step by step, check out [Getting started with data apps](./getting-started.md).

## Requirements for data apps

- A Pro or Enterprise plan.
- An admin account. Only admins can build and manage apps.
- An AI coding agent, like Claude Code or Codex.
- The [Metabase CLI](../installation-and-operation/metabase-cli.md) (`mb`), version 0.5.10 or later. To update the CLI, run `mb upgrade`.
- Node.js 22.12 or later on your computer.
- A Git repository that your Metabases connect to with [Remote Sync](../data-modeling/semantic-layer/remote-sync.md), and permission to push to it. Apps get into Metabase only when Metabase pulls them from the repository, and the repository also keeps each app's source code.
- A Metabase where your agent builds each app. See [Choose where to build apps](#choose-where-to-build-apps).
- A [semantic layer](../data-modeling/semantic-layer/library.md) with the [published tables](../data-modeling/semantic-layer/published-tables.md) and metrics that your apps read. Your agent can publish tables and create metrics on a Metabase in Read-write mode while it builds an app.
- If your apps write data, a PostgreSQL or MySQL database with [data actions turned on](../data-modeling/data-actions.md#turn-on-data-actions-for-a-database). Only these databases support actions. An app that only shows data can read from any database that Metabase connects to.

## Choose where to build apps

Your agent builds and ships each app from a Metabase that it logs in to. You can set this up in two ways:

- **A development Metabase and a production Metabase (recommended).** Your agent builds each app on its own branch, on a development Metabase in Read-write mode that connects to your data warehouse. You review the app in a pull request, and merge it into the branch that your production Metabase pulls from. Keep your production Metabase in Read-only mode, so that every change to your Library and data apps goes through Git. On the development Metabase, your agent can also publish tables and create metrics for the app.
- **Only your production Metabase, in Read-only mode.** This setup has fewer steps, but each change that your agent ships goes to production without review. And you can't publish tables or create metrics on a Read-only Metabase, and neither can your agent, so your apps can read only the tables and metrics that are already in your Library. [Getting started with data apps](./getting-started.md) uses this setup.

The rest of this page uses a development Metabase and a production Metabase.

## What a data app can read and write

A data app runs with the permissions of the person who opens it. Their [data permissions](../permissions/data.md), including [row and column security](../permissions/row-and-column-security.md), apply to everything the app reads. If row and column security applies to a person on any table in a database, that person can't run the app's actions on that database.

An app can read:

- Tables, with their [segments](../data-modeling/semantic-layer/segments.md) and [measures](../data-modeling/semantic-layer/measures.md).
- The metrics in your [Library](../data-modeling/semantic-layer/library.md), but no other metrics.
- The questions in its own collection, but no other questions.

An app can write data only through the actions in its own collection.

Your agent writes the questions and actions that the app needs in the app's code, and generates the app's collection with those items. The collection can hold only questions and actions. Items follow these rules:

- Questions must be built with the query builder, not SQL, and must start from a table. So a question can't start from another saved question or model, even one in the app's collection. Questions also can't have explicit joins, custom columns, parameters, or more than one stage. But a question can use columns from linked tables through foreign keys, and the metrics in your Library.
- Actions are data actions (not model actions).
- Items in the collection can't be archived or made public. Questions in the collection can't be embedded.

The app's collection changes only when Metabase pulls it from your repository. You can't move the app's collection, move it to the trash, or make it official.

## Build the app with your agent

1. [Install the Metabase CLI](../installation-and-operation/metabase-cli.md#install-the-cli), and [log the CLI in](../installation-and-operation/metabase-cli.md#authenticate-the-cli) as an admin to your development Metabase.
2. Install the [metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill) for your agent. The CLI comes with its own skills for building data apps, and the metabase-cli skill tells your agent to load them.
3. On your development Metabase, [create a branch](../data-modeling/semantic-layer/remote-sync.md#creating-a-branch) for the app. Metabase creates the branch in your repository, and switches to it.
4. In a local clone of your Git repository, switch to the same branch, and start your agent there. The agent writes the app's source code in the clone. The agent stops if the folder isn't a clone of the repository that your development Metabase syncs with, or if the clone isn't on the branch that your development Metabase tracks. See [what syncs with a data app](#what-syncs-with-a-data-app).
5. Ask your agent to create a Metabase data app, and follow its instructions. For example:

   ```text
   Create a Metabase data app that lets people look up product info, and add, edit, or remove products. Make it look cool.
   ```

The agent creates the app in `data_apps/<slug>/`, and writes the app's code there, with the questions and actions that the app needs. Then the agent generates the app's collection in `collections/data_apps/`, and builds the app's bundle (the built app, up to 10 MiB). When the app is ready, ask the agent to ship it. The agent [ships the app](#ship-the-app-to-production) to your branch, and pulls the branch into your development Metabase, where the app opens at `/apps/<slug>`.

Build each app on its own branch. The agent pushes the app to the branch that your development Metabase tracks. If that's the branch that your production Metabase pulls from (by default, your main branch), the app goes to production without review.

To build, preview, and ship the app, the agent runs commands on your computer, like `mb`, `npm run build`, `npm run dev`, and `git`. Your agent might ask for your permission before it runs these commands.

A new app starts live, so admins can open it at its address after the first pull. To let other people open it, [add their groups](./manage.md#choose-who-can-open-an-app) to the app. To take an app offline, [make it a draft](./manage.md#make-an-app-live-or-a-draft).

![The Permissions tab of the Store Explorer app, with two groups that can open the app, and an Add groups button](./images/data-app-permissions.png)

## Preview the app on your computer

> **The preview changes real data:** The preview runs the app's actions against the database that your development Metabase connects to. If that's your production data warehouse, the adds, edits, and deletes that you try out in the preview change your production data. Try out actions on rows that you add for testing.

The agent starts a preview of the app at a `localhost` address on your computer. The preview gets its data from your development Metabase, but it runs the app's questions and actions from the app's code, so your development Metabase doesn't need the app yet. Open the preview in your browser, and keep the tab open while the agent works: the agent reads the app's errors from the open preview. To start the preview again later, ask your agent.

In the preview, the app has a **Diagnostics** button, which shows the errors that the agent reads. The app in Metabase doesn't have this button.

The preview needs an admin [API key](../people-and-groups/api-keys.md). The agent asks before it creates the key on your development Metabase. Then the agent writes the key into a `.env.local` file that Git ignores, and deletes the key when it's done. If your session ends before the agent deletes the key, [delete the key](../people-and-groups/api-keys.md#deleting-api-keys) yourself. The key's name starts with `data-app`. Since the preview uses an admin key, it shows what an admin can see, not what the app's viewers can see.

If your agent can't create the key, for example because its permission settings block it, [create an API key](../people-and-groups/api-keys.md#create-an-api-key) in the **Administrators** group yourself. Then put it in a `.env.local` file at the root of your clone of the repository:

```text
DATA_APP_MB_URL=<your development Metabase URL>
DATA_APP_MB_API_KEY=<your API key>
```

Delete the key when you no longer need the preview.

## Ship the app to production

Your data apps always sync through your Git repository. Use the same steps for a new app and for each change to an app:

1. If your development Metabase has changes to synced content that the app reads, like a table that your agent just published, [push your changes](../data-modeling/semantic-layer/remote-sync.md#pushing-changes-to-git) to the app's branch. Then pull the branch in your local clone.
2. Commit the app's directory, `data_apps/<slug>/`, and its collection, `collections/data_apps/`, together, and push the branch.
3. On your development Metabase, [pull the changes](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-from-git). Check the app at `/apps/<slug>`.
4. Merge your branch into the branch that your production Metabase pulls from, for example with a [pull request](../data-modeling/semantic-layer/remote-sync.md#step-4-create-a-pull-request).
5. On your production Metabase (in Read-only mode), [pull the changes](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-from-git). If your production Metabase uses [auto-sync](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-automatically), it pulls the changes on its own within five minutes.
6. The first time that you ship an app, [add the groups](./manage.md#choose-who-can-open-an-app) that can open the app on your production Metabase.

When your agent ships an app, it does steps 1 to 3 for you.

Metabase doesn't sync an app's group access or its [status](./manage.md#make-an-app-live-or-a-draft) (live or draft), so each Metabase keeps its own. The first pull creates the app on your production Metabase as live, and only admins can open it until you add groups there. Later pulls keep the app's status on production, so you can make the app a draft on production without changing it on development.

Your production Metabase also needs the published tables and metrics that the app reads. They ship with the app only if you [sync your Library](../data-modeling/semantic-layer/library.md#versioning-the-library) with Remote Sync, so sync your Library too. If your app uses actions, you must [turn on data actions](../data-modeling/data-actions.md#turn-on-data-actions-for-a-database) on the production databases that the app writes to.

### What syncs with a data app

Metabase pulls the app's manifest, its bundle, and its collection with its questions and actions. Pulls ignore the app's source code. You (or your agent) commit all of these to your repository:

- `data_apps/<slug>/data_app.yaml` is the app's manifest, with the app's slug, name, description, data apps version, bundle path, and [allowed hosts](#let-an-app-fetch-data-from-other-sites).
- `data_apps/<slug>/dist/index.js` is the app's bundle.
- The rest of `data_apps/<slug>/` is the app's source code.
- `collections/data_apps/` holds the app's collection.

When your agent builds the app, it writes the bundle to `dist/index.js`. Commit the bundle with the app's collection: the bundle runs the questions and actions in the collection, so a bundle without them fails. The `.gitignore` files in your repository keep `node_modules/` and `.env.local` out of it. In the manifest, you can edit the app's `name`, `description`, and `allowed_hosts`. Don't edit the rest of the manifest, the bundle, or the collection by hand.

## Change a data app

1. On your development Metabase, [switch to the branch](../data-modeling/semantic-layer/remote-sync.md#switching-branches) that your production Metabase pulls from, and [pull the changes](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-from-git). Then [create a branch](../data-modeling/semantic-layer/remote-sync.md#creating-a-branch) for the change.
2. In your local clone of your Git repository, pull the latest changes, and switch to the new branch.
3. Start your agent in the clone, and ask for the change. The agent updates the code, generates the app's collection, and builds the app again. When the change is ready, ask the agent to ship it.
4. [Ship the change to production](#ship-the-app-to-production).

Your repository keeps each version of the app, with the bundle and the source code that it was built from. To go back to an earlier version, revert the change in your repository, merge the revert, and pull the changes into your Metabases. If two people change the same app on different branches, the app's bundle and collection conflict when you merge the second branch. Merge the source code, and ask your agent to generate the collection and build the app again.

Any admin can change an app from their own computer. Git doesn't keep the app's packages (`node_modules/`) or the preview's API key (`.env.local`), so the agent installs the packages and creates a new API key on each computer.

### Fix an app after a Metabase upgrade

Most Metabase upgrades don't change your apps. But if an upgrade makes a breaking change to data apps, apps that were built for the older version of data apps stop opening. To fix an app, ask your agent to migrate the app to the current version of data apps, build it again, and ship it.

## Let an app fetch data from other sites

A data app runs in a sandbox, so by default the app can't make network requests to other sites. To let an app get data from a site, add the site's origin to `allowed_hosts` in the app's manifest, `data_apps/<slug>/data_app.yaml`:

```yaml
allowed_hosts:
  - https://api.example.com
```

Then [ship the change](#ship-the-app-to-production). Your agent can also change the list for you.

The app can then get data from the site with `fetch`. The app can also show the site's images, embed the site's pages, and submit forms to the site. An origin that starts with `*.`, like `https://*.example.com`, matches subdomains, but not the domain itself.

## Have fun

Ask your agent for any style you like. You can even travel through time:

![A data app styled like a retro black-and-white desktop app, with a File menu and a table of products](./images/data-app-retro.png)
