---
title: Build a data app
summary: Have an AI coding agent build a data app on your development Metabase with the Metabase CLI, preview it, and change it later.
---

# Build a data app

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

You describe the app, and an AI coding agent (like Claude Code or Codex) builds it on a development Metabase with the [Metabase CLI](../installation-and-operation/metabase-cli.md). Before you start, check the [requirements](./introduction.md#requirements).

## Set up your agent

1. [Install the Metabase CLI](../installation-and-operation/metabase-cli.md#install-the-cli), and [log it in](../installation-and-operation/metabase-cli.md#authenticate-the-cli) to your development Metabase as an admin.
2. Install the [metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill) for your agent.

The CLI comes with its own data app skills, so the instructions your agent reads always match the version of the CLI it runs.

## Ask your agent to build the app

Metabase stores an app's built bundle, not its source code. The source code stays in the directory where your agent builds the app, and the agent needs it to change the app later. If you use Remote Sync, start your agent in a local clone of your Remote Sync repository. The agent then puts the source code in `data_apps/<slug>/`, so the code goes in the repository with the app. See [Keep an app's source code in your repository](./remote-sync.md#keep-an-apps-source-code-in-your-repository).

Ask your agent to create a Metabase data app, and follow its instructions. For example:

```text
Create a Metabase data app that lets people look up product info, and add, edit, or remove products.
```

Your agent might ask for permission to run commands on your computer, like `mb data-app create`, `npm run dev`, and `npm run build`. Approve them.

The agent creates the app on your Metabase, adds the questions and actions the app needs to the [app's collection](#what-a-data-app-can-read-and-write), writes the code, and uploads the built app. When it's done, it gives you the app's address, `/apps/<slug>`. Admins can open the app right away. To let other people open it, [add their groups](./manage.md#choose-who-can-open-an-app) to the app.

Until an app has a bundle, its address shows **This data app isn't ready yet**. The agent uploads the bundle when it builds the app, and Remote Sync brings the bundle to each Metabase that pulls the app. A bundle can be up to 10 MiB.

## Preview the app on your computer

The agent starts a preview of the app with `npm run dev`. The `Local:` line in the command's output shows the preview URL. Open the preview in your browser, and keep the tab open while the agent works: the agent reads the app's errors from the open preview.

To start the preview yourself, change into the app's directory and run:

```sh
npm run dev
```

The preview needs an admin [API key](../people-and-groups/api-keys.md). The agent creates the key on your development Metabase, writes it into a `.env.local` file that Git ignores, and deletes the key when it's done. Don't paste API keys into the chat. Since the preview uses an admin key, it shows what an admin can see, not what the app's viewers can see.

> **The preview changes your data:** The local preview runs the app's actions against your development Metabase's databases. Use test data when you try out adds, edits, or deletes.

## Change an app later

To change an app, start your agent in the app's directory (or in your Remote Sync repository), and ask for the change. The agent updates the code, builds the app again, and uploads the new version. People see the new version right away.

## What a data app can read and write

An app's collection can hold only questions, metrics, and data actions. When your agent saves an item to the collection, Metabase refuses it if it breaks one of these rules:

- Questions must be built with the query builder, not SQL. They can read only [tables published to the Library](../data-modeling/semantic-layer/published-tables.md) and metrics from the Library, so they can't start from or join another saved question or model. If a question reads something else, the error names what it read.
- Questions and metrics in the collection can't be archived, public, or embedded, and they can't be in a dashboard or a document.
- Actions can be table actions, which insert, update, or delete one row of a table published to the Library, or query actions, which run SQL. Actions can't belong to a model, and they can't be archived or public. An action can refer only to questions in the app's collection, and its fields can't get their values from a question.

Only admins can edit an app's collection. You can't move the app's collection, move it to the trash, or make it official.

## Let an app fetch data from other sites

A data app runs in a sandbox. By default, the app can't make network requests to other sites. To let an app fetch data from a site, ask your agent to add the site's origin, like `https://api.example.com`, to the app's `allowed_hosts`. An origin that starts with `*.`, like `https://*.example.com`, matches subdomains, but not the domain itself.
