---
title: Data apps
summary: Data apps let you build small internal tools on your Metabase data, like portals, review queues, and forms, without standing up a separate app and backend.
---

# Data apps

![An example data app: a sales overview of a storefront](./images/example-data-app.webp)

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

> **Beta:** Data apps are in beta.

Data apps let you build app like portals, review queues, and forms with Metabase, without having to stand up a separate app and backend. A data app reads questions and metrics built on your [Library](../data-modeling/semantic-layer/library.md), and writes data through data actions that insert, update, or delete rows.

You describe the app, and your AI coding agent builds the app locally with [Metabase CLI](../installation-and-operation/metabase-cli.md). You [ship the app to production](#ship-the-app-to-production-with-remote-sync) with Remote Sync, and admins [manage it in Data Studio](./manage.md).

## Requirements

- A Pro or Enterprise plan.
- An admin account, to manage apps in Data Studio and to create apps.
- An AI coding agent, like Claude Code or Codex.
- Node.js 22.12 or later on the computer where you build the app.
- [Remote Sync](../installation-and-operation/remote-sync.md), to ship apps to production.
- The tables and metrics your apps read, [published to the Library](../data-modeling/semantic-layer/published-tables.md).
- [Actions enabled](../data-modeling/models/actions/introduction.md#enabling-actions-for-a-database) on the databases your apps write to.

## Set up your agent

1. [Install the Metabase CLI](../installation-and-operation/metabase-cli.md#install-the-cli), and [log it in](../installation-and-operation/metabase-cli.md#authenticate-the-cli) to your development Metabase as an admin.
2. Install the [metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill) for your agent.

The Metabase CLI comes with its own skills for building data apps.

## Ask your agent to build the app

If you use Remote Sync, start your agent in a local clone of your Remote Sync repository. The [app's source code goes in the repository with the app](#keep-an-apps-source-code-in-your-repository).

Ask your agent to create a Metabase data app, and follow its instructions. For example:

```text
Create a Metabase data app that lets people look up product info, and add, edit, or remove products. Make it look cool.
```

Your agent might ask for permission to run commands on your computer, like `mb`, `npm run build`, and `npm run dev`. Approve them.

The agent then creates the app on your Metabase, adds the questions and actions the app needs to the [app's collection](#what-a-data-app-can-read-and-write), writes the code, and uploads the app's bundle (the built app, up to 10 MiB). The agent will give you the app's address, `/apps/<slug>`.

Admins can open the app right away. To let other people open it, [add their groups](./manage.md#choose-who-can-open-an-app) to the app.

## Preview the app on your computer

The agent starts a preview of the app at a `localhost` address on your computer. Open the preview in your browser, and keep the tab open while the agent works: the agent reads the app's errors from the open preview. To start the preview again later, ask your agent.

The preview needs an admin [API key](../people-and-groups/api-keys.md). The agent creates the key on your development Metabase, writes it into a `.env.local` file that Git ignores, and deletes the key when it's done. Since the preview uses an admin key, it shows what an admin can see, not what the app's viewers can see.

> **The preview changes your data:** The local preview runs the app's actions against your database. Use test data when you try out adds, edits, or deletes.

## Editing a data app

To change an app, start your agent in the app's directory (or in your Remote Sync repository), and ask for the change. The agent updates the code, builds the app again, and uploads the new version. People see the new version right away.

Metabase stores only the app's bundle, not its source code, so keep the app's directory: the agent needs the source code to change the app.

## Ship the app to production with Remote Sync

When [Remote Sync](../installation-and-operation/remote-sync.md) is on, it always syncs your data apps.

1. On your development Metabase (in Read-write mode), [push your changes](../installation-and-operation/remote-sync.md#pushing-changes-to-git).
2. On your production Metabase (in Read-only mode), [pull the changes](../installation-and-operation/remote-sync.md#pulling-changes-from-git). If your production Metabase uses [auto-sync](../installation-and-operation/remote-sync.md#pulling-changes-automatically), it pulls the changes on its own within five minutes.
3. On your production Metabase, [add groups](./manage.md#choose-who-can-open-an-app) to the app.

Remote Sync doesn't sync an app's status (live or draft) or its group access, so each Metabase keeps its own. A new app starts live on your production Metabase, and only admins can open it until you add groups there.

Your production Metabase also needs the Library content that the app reads, so [sync your Library](../installation-and-operation/remote-sync.md#you-choose-what-to-sync) too. If your app usese actions, [enable actions](../data-modeling/models/actions/introduction.md#enabling-actions-for-a-database) on the production databases that the app writes to.

### What syncs with a data app

Remote Sync syncs the app's manifest, its bundle, and its collection with its questions and actions. In your repository:

- `data_apps/<slug>/data_app.yaml` is the app's manifest.
- `data_apps/<slug>/` also holds the app's bundle.
- `collections/data_apps/` holds the app's collection.

### Keep an app's source code in your repository

When you start your agent in a local clone of your Remote Sync repository, the agent puts the app's source code in `data_apps/<slug>/`, next to the manifest and the bundle. Pushes from Metabase don't change your source code. Don't edit the manifest or the bundle by hand. The template's `.gitignore` keeps `node_modules/`, `build/`, and `.env.local` out of your repository.

To commit the source code, ask your agent.

## What a data app can read and write

A data app runs with the permissions of the person who opens it. Their [data permissions](../permissions/data.md), including [row and column security](../permissions/row-and-column-security.md), apply to everything the app reads. If row and column security applies to a person on any table in a database, that person can't run the app's actions on that database.

An app's collection can hold only questions, metrics, and data actions. When your agent saves an item to the collection, Metabase refuses it if it breaks a rule. The main rules are:

- Questions must be built with the query builder, not SQL. They can read only [tables published to the Library](../data-modeling/semantic-layer/published-tables.md), metrics from the Library, and the [segments](../data-modeling/semantic-layer/segments.md) and [measures](../data-modeling/semantic-layer/measures.md) of published tables, so they can't start from or join another saved question or model.
- Questions and metrics in the collection can't be archived, public, or embedded, and they can't be in a dashboard or a document.
- Actions can be table actions, which insert, update, or delete one row of a table published to the Library, or query actions, which run SQL. Actions can't belong to a model, and they can't be archived or public.

Only admins can edit an app's collection. You can't move the app's collection, move it to the trash, or make it official.

## Let an app fetch data from other sites

A data app runs in a sandbox. By default, the app can't make network requests to other sites. To let an app fetch data from a site, ask your agent to add the site's origin, like `https://api.example.com`, to the app's `allowed_hosts`. The app can then get data from the site with `fetch`. The app can also show the site's images, embed the site's pages, and submit forms to the site. An origin that starts with `*.`, like `https://*.example.com`, matches subdomains, but not the domain itself.

## Give feedback

If you run into a bug or have an idea for how data apps should work, [file an issue](https://github.com/metabase/metabase/issues/new/choose).
