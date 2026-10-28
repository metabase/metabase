---
title: Data apps (beta)
summary: Data apps are custom apps that an AI coding agent builds on your semantic layer. They show your data in any layout you want, and let people add, edit, and delete rows.
---

# Data apps (beta)

![An example data app: a sales overview of a storefront](./images/example-data-app.webp)

> **Beta:** Data apps are in beta.

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

Data apps are custom apps that you build on your Metabase data. Like a dashboard, a data app shows charts and tables from your [semantic layer](../data-modeling/semantic-layer/library.md). But an app isn't limited to cards and filters on a grid: an app can have its own layout, its own pages, and forms that add, edit, or delete rows in your database. You can build apps like portals, review queues, and forms, without having to stand up a separate app and backend.

A data app runs with the permissions of the person who opens it, so people see only the data that they're allowed to see. And an app can read and write data only through the questions, metrics, and actions in its own collection. See [what a data app can read and write](#what-a-data-app-can-read-and-write).

## How data apps work

You build and maintain data apps with an AI agent locally with a development Metabase connected to your data warehouse. Check the app's code and bundle into your Remote Sync repository. Pull the changes into production, and then set up permissions.

Your agent does most of the work, but here's an overview of the end-to-end process.

1. Clone your [Remote Sync](../installation-and-operation/remote-sync.md) repository and create a new branch.
2. Describe the app to an AI coding agent, like Claude Code or Codex, on your computer. "Create a Metabase data app to add, update, and delete products from the products table."
3. The agent uses the [Metabase CLI](../installation-and-operation/metabase-cli.md) to create the app on your Metabase. The agent saves the questions and actions that the app runs to the [app's collection](#what-a-data-app-can-read-and-write).
4. The agent writes the app's code in your local clone of your Remote Sync repository. While the agent works, you [preview the app](#preview-the-app-on-your-computer) in your browser.
5. The agent builds the app and uploads it to your Metabase. People open the app on your Metabase at `/apps/<slug>`.
6. Commit your changes to your Remote Sync repository so that you (and other admins) can edit the app later.
7. Pull the changes into your production Metabase.
8. [Choose which groups can open the app](./manage.md#choose-who-can-open-an-app). People see only the data that their permissions let them see.

## Requirements for data apps

- A Pro or Enterprise plan.
- An admin account. Only admins can create and manage apps.
- An AI coding agent, like Claude Code or Codex.
- The [Metabase CLI](../installation-and-operation/metabase-cli.md) (`mb`).
- Node.js 22.12 or later on your computer.
- A [semantic layer](../data-modeling/semantic-layer/library.md) with the [published tables](../data-modeling/semantic-layer/published-tables.md) and metrics that your apps will read. Your agent can do this for you when it's building the app, but ideally you only create data apps based on trusted data.
- [Remote Sync](../installation-and-operation/remote-sync.md), to keep the source code, bundle, and collection for the data apps.
- A development instance of Metabase, connected to your data warehouse, for you to build the app with.
- [Actions enabled](../data-modeling/models/actions/introduction.md#enabling-actions-for-a-database) on the databases that your apps write to, if your apps write data.

## What a data app can read and write

A data app runs with the permissions of the person who opens it. Their [data permissions](../permissions/data.md), including [row and column security](../permissions/row-and-column-security.md), apply to everything the app reads. If row and column security applies to a person on any table in a database, that person can't run the app's actions on that database.

An app runs only the items in its own collection, and the collection can hold only questions, metrics, and actions. When your agent saves an item to the collection, Metabase refuses the item if it breaks a rule. The main rules are:

- Questions must be built with the query builder, not SQL. Questions can read only [published tables](../data-modeling/semantic-layer/published-tables.md) and metrics from your semantic layer, and the [segments](../data-modeling/semantic-layer/segments.md) and [measures](../data-modeling/semantic-layer/measures.md) of published tables. So questions can't start from or join another saved question or model.
- Actions can be table actions, which insert, update, or delete one row of a published table, or SQL actions.
- Items in the collection can't be archived or made public. Questions and metrics in the collection can't be embedded.

Only admins can edit an app's collection. You can't move the app's collection, move it to the trash, or make it official.

## Set up your agent

1. [Install the Metabase CLI](../installation-and-operation/metabase-cli.md#install-the-cli), and [log the CLI in](../installation-and-operation/metabase-cli.md#authenticate-the-cli) as an admin to the Metabase where you build the app.
2. Install the [metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill) for your agent.

The Metabase CLI comes with its own skills for building data apps.

## Ask your agent to build the app

Start your agent in a local clone of your Remote Sync repository, so that the [app's source code goes in your Metabase's repository](#keep-an-apps-source-code-in-your-repository).

Ask your agent to create a Metabase data app, and follow its instructions. For example:

```text
Create a Metabase data app that lets people look up product info, and add, edit, or remove products. Make it look cool.
```

The agent creates the app on your development Metabase, adds the questions and actions that the app needs to the app's collection, and writes the app's code in the app's directory. Then the agent builds the app, and uploads the app's bundle (the built app, up to 10 MiB) to Metabase. The agent will give you the app's address, `/apps/<slug>`.

To build and preview the app, the agent runs commands on your computer, like `mb` (the Metabase CLI), `npm run build`, and `npm run dev`. Your agent might ask for your permission before it runs these commands.

A new app starts live: it opens at its address. Admins can open the app right away. To let other people open it, [add their groups](./manage.md#choose-who-can-open-an-app) to the app. To take an app offline, [make it a draft](./manage.md#make-an-app-live-or-a-draft).

## Preview the app on your computer

> **The preview changes your data:** The local preview runs the app's actions against your database. Use test data when you try out adds, edits, or deletes.

The agent starts a preview of the app at a `localhost` address on your computer. The preview runs on your computer, but it gets its data from the Metabase where you build the app. Open the preview in your browser, and keep the tab open while the agent works: the agent reads the app's errors from the open preview. To start the preview again later, ask your agent.

The preview needs an admin [API key](../people-and-groups/api-keys.md). The agent creates the key on your Metabase, writes it into a `.env.local` file that Git ignores, and deletes the key when it's done. Since the preview uses an admin key, it shows what an admin can see, not what the app's viewers can see.

If your agent can't create the key, for example because its permission settings block it, [create an API key](../people-and-groups/api-keys.md#create-an-api-key) in the **Administrators** group yourself. Then put it in a `.env.local` file in the app's directory, next to `package.json`:

```text
DATA_APP_MB_URL=<the URL of the Metabase where you build the app>
DATA_APP_MB_API_KEY=<your API key>
```

Delete the key when you no longer need the preview.

## Editing a data app

To change an app:

1. Check out a new branch in your development Metabase.
2. Start your agent in a local clone of your Remote Sync repository, and check out that same branch.
3. Ask for the change. The agent updates the code, builds the app again, and uploads the new version to the Metabase where you build the app.
4. From your Metabase, push the changes to a remote branch.
5. Stash your local changes.
6. Pull the remote changes from Metabase (this will include the app bundle, and any updated questions).
7. Apply your stashed changes (the source code). Push up to your branch.
8. Create a pull request with the changes: bundle, Metabase artifacts, and source code.
9. Merge the pull request.
10. If your production Metabase isn't set up to auto-pull from your main branch, pull the changes manually.

If you allow your agent to use Git and manage commits, the agent can handle this git-wrangling for you.

Metabase keeps only the latest bundle for each app, so it has no version history for the app. To go back to an earlier version, ask your agent to build the app from an earlier version of the source code, and upload it again.

### Keep the app's source code

Metabase stores only the app's bundle, not its source code. The agent needs the source code to change the app, so keep the app's directory where the people who change the app can get to it:

- If you use Remote Sync, keep the source code in your Remote Sync repository, next to the app's manifest and bundle. See [Keep an app's source code in your repository](#keep-an-apps-source-code-in-your-repository).
- If you don't use Remote Sync, keep the app's directory in a Git repository.

### Edit an app from another computer

Anyone with an admin account can change the app from their own computer:

1. Get the app's source code, for example by cloning the repository.
2. [Set up your agent](#set-up-your-agent), and log the Metabase CLI in to the Metabase where you build the app.
3. Start your agent in the app's directory, and ask for the change.

Git doesn't keep the app's packages (`node_modules/`) or the preview's API key (`.env.local`), so each computer has its own. The agent installs the packages and creates a new API key for the preview.

Each app has only one bundle, and each upload replaces it. If two people change the same app at the same time, the last upload wins: an upload from an older copy of the source code removes the changes in the newer bundle. So before you ask for a change, get the latest source code, and after the change, commit the source code, so that the next person starts from your version.

## Ship the app to production with Remote Sync

When [Remote Sync](../installation-and-operation/remote-sync.md) is on, it always syncs your data apps, so an app ships to production like the rest of your synced content:

1. On your development Metabase (in Read-write mode), [push your changes](../installation-and-operation/remote-sync.md#pushing-changes-to-git).
2. On your production Metabase (in Read-only mode), [pull the changes](../installation-and-operation/remote-sync.md#pulling-changes-from-git). If your production Metabase uses [auto-sync](../installation-and-operation/remote-sync.md#pulling-changes-automatically), it pulls the changes on its own within five minutes.
3. On your production Metabase, [add the groups](./manage.md#choose-who-can-open-an-app) that can open the app.

Remote Sync doesn't sync an app's group access. Groups that you add to the app on your development Metabase don't carry over to production, so each Metabase keeps its own group access. Until you add groups on your production Metabase, only admins can open the app there.

Remote Sync also doesn't sync an app's [status](./manage.md#make-an-app-live-or-a-draft) (live or draft). The first pull creates the app on your production Metabase as live. Later pulls keep the app's status on production, so you can make the app a draft on production without changing it on development.

Your production Metabase also needs the published tables and metrics that the app reads. A pull doesn't check for them, so [sync your Library](../installation-and-operation/remote-sync.md#you-choose-what-to-sync) too. If your app uses actions, [enable actions](../data-modeling/models/actions/introduction.md#enabling-actions-for-a-database) on the production databases that the app writes to.

### What syncs with a data app

Remote Sync syncs the app's manifest, its bundle, and its collection with its questions and actions. In your repository:

- `data_apps/<slug>/data_app.yaml` is the app's manifest.
- `data_apps/<slug>/` also holds the app's bundle.
- `collections/data_apps/` holds the app's collection.

### Keep an app's source code in your repository

When you start your agent in a local clone of your Remote Sync repository, the app's directory is `data_apps/<slug>/`. Pushes from Metabase don't change your source code, and pulls ignore it. Don't edit the manifest or the bundle by hand. The template's `.gitignore` keeps `node_modules/`, `build/`, and `.env.local` out of your repository.

Metabase doesn't commit the source code for you. To commit the source code:

1. On your development Metabase, [push your changes](../installation-and-operation/remote-sync.md#pushing-changes-to-git), so that the repository has the app's latest bundle.
2. In your local clone, pull the branch that Metabase pushed to.
3. Commit the app's directory, `data_apps/<slug>/`, and push the commit.
4. On your development Metabase, [pull the changes](../installation-and-operation/remote-sync.md#pulling-changes-from-git). If you skip this step, Metabase's next push has a conflict.

## Let an app fetch data from other sites

A data app runs in a sandbox, so by default the app can't make network requests to other sites. To let an app get data from a site, add the site's origin to the app's allowed hosts:

```sh
mb data-app update <slug> --body '{"allowed_hosts":["https://api.example.com"]}'
```

The list replaces the app's allowed hosts, so include every origin that the app needs. Your agent can also change the list for you.

The app can then get data from the site with `fetch`. The app can also show the site's images, embed the site's pages, and submit forms to the site. An origin that starts with `*.`, like `https://*.example.com`, matches subdomains, but not the domain itself.

## Have fun

![A data app styled like a retro black-and-white desktop app, with a File menu and a table of products](./images/data-app-retro.png)

## Let us know what you think

Data apps are in active development. If you run into a bug or have an idea for how data apps should work, [file an issue](https://github.com/metabase/metabase/issues/new/choose).
