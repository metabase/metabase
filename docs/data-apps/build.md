---
title: Data apps (beta)
summary: Data apps are custom apps that an AI coding agent builds on your semantic layer. They show your data in any layout you want, and can let people add, edit, and delete rows.
---

# Data apps (beta)

![An example data app: a sales overview of a storefront](./images/example-data-app.png)

> **Beta:** Data apps are in beta.

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

Data apps are custom apps that you build on your Metabase data. Like a dashboard, a data app shows charts and tables from your [semantic layer](../data-modeling/semantic-layer/library.md). But an app isn't limited to cards and filters on a grid: an app can have its own layout, its own pages, and forms that add, edit, or delete rows in your database. You can build apps like portals, review queues, and forms, without having to stand up a separate app and backend.

A data app can read only from your semantic layer and its own collection, and it can write data only through the actions in its own collection. See [what a data app can read and write](#what-a-data-app-can-read-and-write).

This page is the reference for data apps. To set up your tools and build your first app step by step, check out [Getting started with data apps](./getting-started.md).

## Requirements for data apps

- A Pro or Enterprise plan.
- An admin account. Only admins can create and manage apps.
- An AI coding agent, like Claude Code or Codex.
- The [Metabase CLI](../installation-and-operation/metabase-cli.md) (`mb`), version 0.5.9 or later. To update the CLI, run `mb upgrade`.
- Node.js 22.12 or later on your computer.
- A development Metabase, connected to your data warehouse, where you build and change your apps. See [development instances](../installation-and-operation/development-instance.md).
- A Git repository that your Metabases connect to with [Remote Sync](../data-modeling/semantic-layer/remote-sync.md), in Read-write mode on your development Metabase. Apps get to your development and production Metabases through the repository, which also keeps each app's source code.
- A [semantic layer](../data-modeling/semantic-layer/library.md) with the [published tables](../data-modeling/semantic-layer/published-tables.md) and metrics that your apps read. Your agent can publish tables and create metrics while it builds an app. But for apps that people rely on, use tables and metrics that you trust.
- If your apps write data, a PostgreSQL or MySQL database with [data actions turned on](../data-modeling/data-actions.md#turn-on-data-actions-for-a-database). An app that only shows data doesn't need actions, and can read from any database that Metabase connects to.

## What a data app can read and write

A data app runs with the permissions of the person who opens it. Their [data permissions](../permissions/data.md), including [row and column security](../permissions/row-and-column-security.md), apply to everything the app reads. If row and column security applies to a person on any table in a database, that person can't run the app's actions on that database.

An app can read only:

- [Published tables](../data-modeling/semantic-layer/published-tables.md), with their [segments](../data-modeling/semantic-layer/segments.md) and [measures](../data-modeling/semantic-layer/measures.md). The app can query these tables directly, without a saved question, but not with SQL.
- The metrics and dashboards in your [Library](../data-modeling/semantic-layer/library.md).
- The questions and metrics in its own collection.

An app can write data only through the actions in its own collection.

The app's collection can hold only questions, metrics, and actions. When your agent saves an item to the collection, Metabase refuses the item if it breaks a rule. The main rules are:

- Questions must be built with the query builder, not SQL, and can read only published tables (with their segments and measures) and the metrics in your Library. So a question can't start from or join another saved question or model, even one in the app's collection.
- Actions must be [table actions](../data-modeling/data-actions.md#create-a-data-action-that-changes-one-row), which insert, update, or delete one row of a published table. Data apps don't support SQL actions.
- Items in the collection can't be archived or made public. Questions and metrics in the collection can't be embedded.

Only admins can edit an app's collection. You can't move the app's collection, move it to the trash, or make it official.

## Build the app with your agent

1. [Install the Metabase CLI](../installation-and-operation/metabase-cli.md#install-the-cli), and [log the CLI in](../installation-and-operation/metabase-cli.md#authenticate-the-cli) as an admin to your development Metabase.
2. Install the [metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill) for your agent. The CLI comes with its own skills for building data apps, and the metabase-cli skill tells your agent to load them.
3. Start your agent in a local clone of your Git repository. The agent writes the app's source code in the clone, and stops if the folder isn't a clone of the repository that your development Metabase syncs with. See [what syncs with a data app](#what-syncs-with-a-data-app).
4. Ask your agent to create a Metabase data app and ship it on a new branch. Then follow the agent's instructions. For example:

   ```text
   Create a Metabase data app that lets people look up product info, and add, edit, or remove products. Make it look cool. Ship it on a new branch.
   ```

The agent creates the app on your development Metabase, adds the questions and actions that the app needs to the app's collection, and writes the app's code in `data_apps/<slug>/`. Then the agent builds the app's bundle (the built app, up to 10 MiB), and [ships the app](#ship-the-app-to-production) to a new branch with its collection and source code. When the agent pulls the branch into your development Metabase, the app opens at `/apps/<slug>`.

Use a new branch, not your main branch. By default, your development Metabase pushes to your main branch, and your production Metabase pulls from it. So an app that ships on your main branch goes to production without review.

To build, preview, and ship the app, the agent runs commands on your computer, like `mb`, `npm run build`, `npm run dev`, and `git`. Your agent might ask for your permission before it runs these commands.

A new app starts live, so admins can open it at its address when its bundle gets to your development Metabase. To let other people open it, [add their groups](./manage.md#choose-who-can-open-an-app) to the app. To take an app offline, [make it a draft](./manage.md#make-an-app-live-or-a-draft).

## Preview the app on your computer

> **The preview changes real data:** The preview runs the app's actions against the database that your development Metabase connects to. If that's your production data warehouse, the adds, edits, and deletes that you try out in the preview change your production data. Try out actions on rows that you add for testing.

The agent starts a preview of the app at a `localhost` address on your computer. The preview gets its data from your development Metabase. Open the preview in your browser, and keep the tab open while the agent works: the agent reads the app's errors from the open preview. To start the preview again later, ask your agent.

The preview needs an admin [API key](../people-and-groups/api-keys.md). The agent creates the key on your development Metabase, writes it into a `.env.local` file that Git ignores, and deletes the key when it's done. Since the preview uses an admin key, it shows what an admin can see, not what the app's viewers can see.

If your agent can't create the key, for example because its permission settings block it, [create an API key](../people-and-groups/api-keys.md#create-an-api-key) in the **Administrators** group yourself. Then put it in a `.env.local` file in the app's directory, next to `package.json`:

```text
DATA_APP_MB_URL=<your development Metabase URL>
DATA_APP_MB_API_KEY=<your API key>
```

Delete the key when you no longer need the preview.

## Ship the app to production

Your data apps always sync through your Git repository, so an app ships to production like the rest of your [synced content](../data-modeling/semantic-layer/remote-sync.md#what-metabase-syncs). Use the same steps for a new app and for each change to an app:

1. On your development Metabase (in [Read-write mode](../data-modeling/semantic-layer/remote-sync.md#remote-sync-has-two-modes-for-different-roles)), [create a branch](../data-modeling/semantic-layer/remote-sync.md#creating-a-branch), and [push your changes](../data-modeling/semantic-layer/remote-sync.md#pushing-changes-to-git) to it. The push adds the app's manifest and collection to the branch.
2. In your local clone, switch to the branch, and pull it.
3. In the app's directory, `data_apps/<slug>/`, run `npm run build`. The build writes the app's bundle to `dist/index.js`.
4. Commit the app's directory, and push the commit. The commit adds the app's source code and bundle to the branch.
5. On your development Metabase, [pull the changes](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-from-git). The pull loads the new bundle. If you skip this step, the next push from Metabase has a conflict.
6. Merge your branch into the branch that your production Metabase pulls from, for example with a [pull request](../data-modeling/semantic-layer/remote-sync.md#step-4-create-a-pull-request).
7. On your production Metabase (in Read-only mode), [pull the changes](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-from-git). If your production Metabase uses [auto-sync](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-automatically), it pulls the changes on its own within five minutes.
8. The first time that you ship an app, [add the groups](./manage.md#choose-who-can-open-an-app) that can open the app on your production Metabase.

When your agent ships an app, it does steps 1 to 5 for you.

Metabase doesn't sync an app's group access or its [status](./manage.md#make-an-app-live-or-a-draft) (live or draft), so each Metabase keeps its own. The first pull creates the app on your production Metabase as live, and only admins can open it until you add groups there. Later pulls keep the app's status on production, so you can make the app a draft on production without changing it on development.

Your production Metabase also needs the published tables and metrics that the app reads. They sync with your [Library](../data-modeling/semantic-layer/library.md), so they ship with the app. If your app uses actions, you must [turn on data actions](../data-modeling/data-actions.md#turn-on-data-actions-for-a-database) on the production databases that the app writes to.

### What syncs with a data app

Metabase syncs the app's manifest, its bundle, and its collection with its questions and actions. Metabase doesn't sync the app's source code: pushes from Metabase don't change the source code, and pulls ignore it. In your repository:

- `data_apps/<slug>/data_app.yaml` is the app's manifest, with the app's slug, name, bundle path, and [allowed hosts](#let-an-app-fetch-data-from-other-sites).
- `data_apps/<slug>/dist/index.js` is the app's bundle.
- The rest of `data_apps/<slug>/` is the app's source code.
- `collections/data_apps/` holds the app's collection.

Your agent sends the bundle to Metabase only through Git: the agent commits the bundle with the source code, and Metabase loads the bundle when it pulls the branch. The `.gitignore` in the app template keeps `node_modules/` and `.env.local` out of your repository. Don't edit the manifest or the bundle by hand.

## Change a data app

1. In your local clone of your Git repository, pull the latest changes.
2. Start your agent in the clone, and ask for the change on a new branch. The agent updates the code, builds the app again, and ships the new version, with the app's collection, to a new branch.
3. [Ship the change to production](#ship-the-app-to-production).

Git keeps each version of the app's bundle with the source code that it was built from. To go back to an earlier version, revert the commits in Git, and pull the changes into your Metabase. If two people change the same app on different branches, their bundles conflict when you merge the second branch. Merge the source code, and ask your agent to build the app again.

Any admin can change an app from their own computer. Git doesn't keep the app's packages (`node_modules/`) or the preview's API key (`.env.local`), so the agent installs the packages and creates a new API key on each computer.

## Let an app fetch data from other sites

A data app runs in a sandbox, so by default the app can't make network requests to other sites. To let an app get data from a site, add the site's origin to the app's allowed hosts:

```sh
mb data-app update <slug> --body '{"allowed_hosts":["https://api.example.com"]}'
```

The list replaces the app's allowed hosts, so include every origin that the app needs. Your agent can also change the list for you. Change the list on your development Metabase: the allowed hosts are in the app's manifest, so they ship to production with the app.

The app can then get data from the site with `fetch`. The app can also show the site's images, embed the site's pages, and submit forms to the site. An origin that starts with `*.`, like `https://*.example.com`, matches subdomains, but not the domain itself.

## Have fun

Ask your agent for any style you like. You can even travel through time:

![A data app styled like a retro black-and-white desktop app, with a File menu and a table of products](./images/data-app-retro.png)

## Let us know what you think

Data apps are in active development. If you run into a bug or have an idea for how data apps should work, [file an issue](https://github.com/metabase/metabase/issues/new/choose).
