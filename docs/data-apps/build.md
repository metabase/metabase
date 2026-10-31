---
title: Data apps (beta)
summary: Data apps are custom apps that an AI coding agent builds on your semantic layer. They show your data in any layout you want, and can let people add, edit, and delete rows.
---

# Data apps (beta)

![An example data app: a sales overview of a storefront](./images/example-data-app.png)

> **Beta:** Data apps are in beta.

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

Data apps are custom apps that you build on your Metabase data. Like a dashboard, a data app shows charts and tables from your [semantic layer](../data-modeling/semantic-layer/library.md). But an app isn't limited to cards and filters on a grid: an app can have its own layout, its own pages, and forms that add, edit, or delete rows in your database. An app doesn't have to write data: an app can just show data, from any database. You can build apps like portals, review queues, and forms, without having to stand up a separate app and backend.

A data app runs with the permissions of the person who opens it, so people see only the data that they're allowed to see. And an app can read only from your semantic layer and its own collection, and it can write data only through the actions in its own collection. See [what a data app can read and write](#what-a-data-app-can-read-and-write).

## How data apps work

You build and change data apps on your computer, with an AI coding agent, in a clone of your Remote Sync repository. Then you commit the app to the repository, pull the app into your Metabase, and choose who can open the app.

Your agent does most of the work, but here's an overview of the end-to-end process:

1. Clone your [Remote Sync](../data-modeling/semantic-layer/remote-sync.md) repository to your computer.
2. Describe the app to an AI coding agent, like Claude Code or Codex, on your computer. For example: "Create a Metabase data app to add, update, and delete products from the products table."
3. The agent uses the [Metabase CLI](../installation-and-operation/metabase-cli.md) to scaffold the app in your clone, and to fetch the published tables and metrics that the app can read from your Metabase.
4. The agent writes the app's code, including the questions and actions that the app runs. While the agent works, you [preview the app](#preview-the-app-on-your-computer) in your browser.
5. The agent generates the files of the [app's collection](#what-a-data-app-can-read-and-write) from the app's questions and actions, and builds the app.
6. Commit the app and push it to your repository.
7. Pull the changes into your Metabase. Admins can open the app at `/apps/<slug>`.
8. [Choose which groups can open the app](./manage.md#choose-who-can-open-an-app).

## Requirements for data apps

- A Pro or Enterprise plan.
- An admin account. Only admins can build and manage apps.
- An AI coding agent, like Claude Code or Codex.
- The [Metabase CLI](../installation-and-operation/metabase-cli.md) (`mb`).
- Node.js 22.12 or later on your computer.
- [Remote Sync](../data-modeling/semantic-layer/remote-sync.md), in Read-write or Read-only mode, and permission to push to its repository. Apps reach Metabase only through Remote Sync, and the repository also keeps each app's source code.
- A [semantic layer](../data-modeling/semantic-layer/library.md) with the [published tables](../data-modeling/semantic-layer/published-tables.md) and metrics that your apps read. Your agent can publish tables and create metrics while it builds an app. But for apps that people rely on, use tables and metrics that you trust.
- If your apps write data, [actions enabled](../data-modeling/models/actions/introduction.md#enabling-actions-for-a-database) on the databases that your apps write to. An app that only shows data doesn't need actions, so the app can read from any database that Metabase connects to, even a database that doesn't support actions.

## What a data app can read and write

A data app runs with the permissions of the person who opens it. Their [data permissions](../permissions/data.md), including [row and column security](../permissions/row-and-column-security.md), apply to everything the app reads. If row and column security applies to a person on any table in a database, that person can't run the app's actions on that database.

An app can read only:

- [Published tables](../data-modeling/semantic-layer/published-tables.md), with their [segments](../data-modeling/semantic-layer/segments.md) and [measures](../data-modeling/semantic-layer/measures.md). The app can query these tables directly, without a saved question, but not with SQL.
- The metrics in your [Library](../data-modeling/semantic-layer/library.md).
- The questions in its own collection.

An app can write data only through the actions in its own collection.

Your agent defines the questions and actions that the app needs in the app's code, and generates the app's collection from them. The collection can hold only questions and actions. Metabase refuses an item that breaks a rule when it pulls the item, and the CLI refuses it when it generates the item. The main rules are:

- Questions must be built with the query builder, not SQL. Questions can read only [published tables](../data-modeling/semantic-layer/published-tables.md) and metrics from your semantic layer, and the [segments](../data-modeling/semantic-layer/segments.md) and [measures](../data-modeling/semantic-layer/measures.md) of published tables. So questions can't start from or join another saved question or model. Questions also can't join tables or add custom columns, and they have only one stage.
- Actions must be table actions, which insert, update, or delete one row of a published table. Apps can't use SQL actions.
- Items in the collection can't be archived or made public. Questions in the collection can't be embedded.

The app's collection changes only when Metabase pulls it from your repository. You can't move the app's collection, move it to the trash, or make it official.

## Build the app with your agent

1. [Install the Metabase CLI](../installation-and-operation/metabase-cli.md#install-the-cli), and [log the CLI in](../installation-and-operation/metabase-cli.md#authenticate-the-cli) as an admin to your Metabase.
2. Install the [metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill) for your agent. The CLI comes with its own skills for building data apps, and the metabase-cli skill tells your agent to load them.
3. Start your agent in a local clone of your Remote Sync repository, on the branch that your Metabase pulls from. See [what syncs with a data app](#what-syncs-with-a-data-app).
4. Ask your agent to create a Metabase data app, and follow its instructions. For example:

   ```text
   Create a Metabase data app that lets people look up product info, and add, edit, or remove products. Make it look cool.
   ```

The agent scaffolds the app in `data_apps/<slug>/`, and writes the app's code there, with the questions and actions that the app needs. Then the agent generates the app's collection in `collections/data_apps/`, and builds the app's bundle (the built app, up to 10 MiB). After you commit, push, and pull the app into your Metabase, it opens at `/apps/<slug>`.

To build and preview the app, the agent runs commands on your computer, like `mb` (the Metabase CLI), `npm run build`, and `npm run dev`. Your agent might ask for your permission before it runs these commands.

A new app starts live: it opens at its address after the first pull. Admins can open the app right away. To let other people open it, [add their groups](./manage.md#choose-who-can-open-an-app) to the app. To take an app offline, [make it a draft](./manage.md#make-an-app-live-or-a-draft).

## Preview the app on your computer

> **The preview changes real data:** The preview runs the app's actions against the database that your Metabase connects to. If that's your production data warehouse, the adds, edits, and deletes that you try out in the preview change your production data. Try out actions on rows that you add for testing.

The agent starts a preview of the app at a `localhost` address on your computer. The preview runs on your computer, but it gets its data from your Metabase. It runs the app's questions and actions from the app's code, so your Metabase doesn't need the app yet. Open the preview in your browser, and keep the tab open while the agent works: the agent reads the app's errors from the open preview. To start the preview again later, ask your agent.

The preview needs an admin [API key](../people-and-groups/api-keys.md). The agent creates the key on your Metabase, writes it into a `.env.local` file that Git ignores, and deletes the key when it's done. Since the preview uses an admin key, it shows what an admin can see, not what the app's viewers can see.

If your agent can't create the key, for example because its permission settings block it, [create an API key](../people-and-groups/api-keys.md#create-an-api-key) in the **Administrators** group yourself. Then put it in a `.env.local` file at the root of your clone of the repository:

```text
DATA_APP_MB_URL=<your Metabase URL>
DATA_APP_MB_API_KEY=<your API key>
```

Delete the key when you no longer need the preview.

## Ship the app to production with Remote Sync

When [Remote Sync](../data-modeling/semantic-layer/remote-sync.md) is on, it always syncs your data apps, and an app reaches Metabase only through a pull. Use the same steps for a new app and for each change to an app:

1. If your Metabase is in Read-write mode and has changes to synced content that the app reads, like a table you just published, [push your changes](../data-modeling/semantic-layer/remote-sync.md#pushing-changes-to-git) first. Then pull them into your local clone.
2. Commit the app's directory, `data_apps/<slug>/`, and its collection, `collections/data_apps/`, together, and push the commit.
3. On your Metabase, [pull the changes](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-from-git). If your Metabase uses [auto-sync](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-automatically), it pulls the changes on its own within five minutes.
4. The first time that you ship an app, [add the groups](./manage.md#choose-who-can-open-an-app) that can open the app.

If you check changes on a staging Metabase first, push the commit to a branch that your staging Metabase pulls from, then merge the branch into the branch that your production Metabase pulls from, for example with a [pull request](../data-modeling/semantic-layer/remote-sync.md#step-4-create-a-pull-request).

If you let your agent use Git, the agent can do these steps for you.

Remote Sync doesn't sync an app's group access or its [status](./manage.md#make-an-app-live-or-a-draft) (live or draft), so each Metabase keeps its own. The first pull creates the app on your production Metabase as live, and only admins can open it until you add groups there. Later pulls keep the app's status, so you can make the app a draft on one Metabase without changing it on another.

Your production Metabase also needs the published tables and metrics that the app reads. A pull doesn't check that the tables are published, but the pull fails if the app's questions use metrics that aren't in your production Library. So add your [Library](../data-modeling/semantic-layer/library.md), which holds your semantic layer, to Remote Sync too. If your app uses actions, [enable actions](../data-modeling/models/actions/introduction.md#enabling-actions-for-a-database) on the production databases that the app writes to.

### What syncs with a data app

Remote Sync pulls the app's manifest, its bundle, and its collection with its questions and actions. Pulls ignore the app's source code. You commit all of these yourself. In your repository:

- `data_apps/<slug>/data_app.yaml` is the app's manifest.
- `data_apps/<slug>/dist/index.js` is the app's bundle.
- The rest of `data_apps/<slug>/` is the app's source code.
- `collections/data_apps/` holds the app's collection.

When your agent builds the app, it writes the bundle to `dist/index.js`. Commit the bundle with the app's collection: the bundle runs the questions and actions in the collection, so a bundle without them fails. Git ignores `node_modules/` and `.env.local`. In the manifest, you can edit the app's `name`, `description`, and `allowed_hosts`. Don't edit the rest of the manifest, the bundle, or the collection by hand.

## Change a data app

1. In your local clone of your Remote Sync repository, pull the latest changes, so that you start from the latest version of the app.
2. Start your agent in the clone, and ask for the change. The agent updates the code, generates the app's collection, and builds the app again.
3. [Ship the change](#ship-the-app-to-production-with-remote-sync).

Your repository keeps the app's version history. If two people change the same app at the same time, Git shows the conflict. To go back to an earlier version, revert the change in your repository, push, and pull the changes into your Metabase.

Any admin can change an app from their own computer. Clone your Remote Sync repository, do steps 1 and 2 of [Build the app with your agent](#build-the-app-with-your-agent), and start your agent in the clone. Git doesn't keep the app's packages (`node_modules/`) or the preview's API key (`.env.local`), so the agent installs the packages and creates a new API key on each computer.

## Let an app fetch data from other sites

A data app runs in a sandbox, so by default the app can't make network requests to other sites. To let an app get data from a site, add the site's origin to `allowed_hosts` in the app's manifest, `data_apps/<slug>/data_app.yaml`:

```yaml
allowed_hosts:
  - https://api.example.com
```

Then [ship the change](#ship-the-app-to-production-with-remote-sync). Your agent can also change the list for you.

The app can then get data from the site with `fetch`. The app can also show the site's images, embed the site's pages, and submit forms to the site. An origin that starts with `*.`, like `https://*.example.com`, matches subdomains, but not the domain itself.

## Have fun

Ask your agent for any style you like.

![A data app styled like a retro black-and-white desktop app, with a File menu and a table of products](./images/data-app-retro.png)

## Let us know what you think

Data apps are in active development. If you run into a bug or have an idea for how data apps should work, [file an issue](https://github.com/metabase/metabase/issues/new/choose).
