---
title: Getting started with data apps
summary: Set up a development Metabase, a Git repository, and an AI coding agent. Then have the agent build a data app, and ship the app to your production Metabase.
---

# Getting started with data apps

> **Beta:** Data apps are in beta.

{% include plans-blockquote.html feature="Data apps" is_plural=true %}

This guide takes you from one Metabase to a [data app](./build.md) that people in your company can open. Your agent builds the app, and you ship the app to your production Metabase through Git.

The app in this guide only shows data, so it works with any database that Metabase connects to. Once the app works, you can [add a form that changes data](#add-a-form-that-changes-data).

## What you need

- An admin account on a Metabase on a Pro or Enterprise plan. This guide calls it your production Metabase: the Metabase that people use.
- An account with GitHub, GitLab, or Bitbucket, to store your apps in a Git repository.
- A computer where you can install software and run commands in a terminal.
- An AI coding agent, like Claude Code or Codex.

## Set up your tools

You do these steps once.

### 1. Get a development Metabase

You build apps on a development Metabase, and you ship them to your production Metabase when they're ready. That way, people never see an app before it's ready, and every change goes through Git.

Your development Metabase can be any Metabase on your plan, other than your production Metabase. If you don't have one, you can get a [development instance](../installation-and-operation/development-instance.md#creating-a-development-instance) in the Metabase Store, on Metabase Cloud or self-hosted.

On your development Metabase:

- Make sure that you have an admin account.
- [Add the databases](../databases/connecting.md) that your app will read from. Give each database the same name that it has on your production Metabase, because synced content [finds its database by name](../data-modeling/semantic-layer/remote-sync.md#synced-content-that-uses-a-database-your-metabase-doesnt-have).

### 2. Create a Git repository

Create a new repository on GitHub, GitLab, or Bitbucket, and initialize it with a README file. For each provider's instructions, see [Set up a repository](../data-modeling/semantic-layer/remote-sync.md#1-set-up-a-repository-to-store-your-content).

The repository stores your apps. Anyone who can push to the repository can change the content in your Metabases. So only give write access to people that you'd trust as admins.

### 3. Connect your development Metabase to the repository

1. Create an access token that can read and write to the repository. For the permissions that each provider needs, see [Create a token for your development Metabase](../data-modeling/semantic-layer/remote-sync.md#2-create-a-token-for-your-development-metabase).
2. On your development Metabase, go to **Admin** > **Settings** > **Remote sync**.
3. In **Repository URL**, enter the repository's URL, for example `https://github.com/your-org/your-repo`.
4. Select **Read-write**.
5. In **Access Token**, paste the token.
6. Click **Set up remote sync**.

### 4. Install Node.js

Install [Node.js](https://nodejs.org/) 22.12 or later. To check which version you have, run:

```sh
node --version
```

### 5. Install the Metabase CLI, and log in to your development Metabase

Your agent uses the [Metabase CLI](../installation-and-operation/metabase-cli.md) (`mb`) to work with your development Metabase. Install the CLI:

```sh
npm install -g @metabase/cli
```

If you already have the CLI, run `mb upgrade` to get the latest version.

Then log the CLI in to your development Metabase. Use your development Metabase's URL:

```sh
mb auth login --url https://dev-metabase.example.com
```

The CLI offers to open Metabase in your browser. Sign in with your admin account, and approve the CLI.

### 6. Add the metabase-cli skill to your agent

The [metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill) tells your agent how to use the CLI, and how to build data apps. To add the skill to Claude Code, run:

```sh
npx skills add metabase/agent-skills --skill metabase-cli -a claude-code
```

For other ways to install the skill, check out [The metabase-cli skill](../installation-and-operation/metabase-cli.md#the-metabase-cli-skill).

### 7. Clone the repository

Clone the repository to your computer, and go into its folder. Use your repository's URL:

```sh
git clone https://github.com/your-org/your-repo
cd your-repo
```

Your agent works in this folder. The agent stops if the folder isn't a clone of the repository that your development Metabase syncs with.

## Build the app

### 8. Create a branch for the app

Your agent ships the app to the branch that your development Metabase tracks. So give the app its own branch: the app then gets to production only when you merge the branch.

1. On your development Metabase, go to **Admin** > **Settings** > **Remote sync**.
2. Under **Sync branch**, click the current branch.
3. Type a name for the branch, like `orders-overview`, and click **Create branch "orders-overview"**. Metabase creates the branch in your repository, and switches to it.
4. In your clone, switch to the same branch:

   ```sh
   git fetch
   git switch orders-overview
   ```

The agent stops if your clone isn't on the branch that your development Metabase tracks.

### 9. Ask your agent for the app

Start your agent in the folder of your clone, and describe the app. For example:

```text
Create a Metabase data app that shows our orders by month, and a table of the latest orders.
```

The agent:

- Publishes the tables that the app reads on your development Metabase, if they aren't [published](../data-modeling/semantic-layer/published-tables.md) yet. For apps that people rely on, use published tables that you trust.
- Writes the app's code in `data_apps/<slug>/`, where `<slug>` is the app's short name. The code includes the questions that the app runs.
- Generates the [app's collection](./build.md#what-a-data-app-can-read-and-write) in `collections/data_apps/` from the app's questions.
- Starts a preview of the app.

The agent runs commands on your computer, like `mb`, `npm`, and `git`, and it might ask for your permission first.

### 10. Preview the app

The agent starts the preview at a `localhost` address on your computer. Open the preview in your browser, and keep the tab open while the agent works: the agent reads the app's errors from the open preview.

Ask your agent for changes until the app looks the way you want. The preview shows what an admin can see, not what the app's viewers can see. For more on the preview, see [Preview the app on your computer](./build.md#preview-the-app-on-your-computer).

### 11. Ship the app to your development Metabase

When the app is ready, ask your agent:

```text
Ship the app to my development Metabase.
```

If the agent published tables on your development Metabase, it first pushes them to the app's branch. Then the agent builds the app, commits the app's source code, bundle, and collection to the app's branch, and pushes the branch. Last, the agent pulls the branch into your development Metabase.

Open the app on your development Metabase at `/apps/<slug>`, for example `https://dev-metabase.example.com/apps/orders-overview`. On your development Metabase, only admins can open the app.

## Ship the app to production

### 12. Connect your production Metabase to the repository

You do this step once.

In Read-only mode, your production Metabase gets its [Library](../data-modeling/semantic-layer/library.md) from the repository, and nobody can edit the Library on production. If people already use the Library on your production Metabase, read [Remote sync](../data-modeling/semantic-layer/remote-sync.md) before you connect it.

1. Create an access token that can only read the repository. See [Create a token for your production Metabase](../data-modeling/semantic-layer/remote-sync.md#5-create-a-token-for-your-production-metabase).
2. On your production Metabase, go to **Admin** > **Settings** > **Remote sync**.
3. In **Repository URL**, enter the same repository URL as on your development Metabase.
4. Select **Read-only**.
5. In **Access Token**, paste the token.
6. Turn on **Auto-sync with git**. Your production Metabase then pulls changes from your main branch every five minutes. That's why each app gets its own branch in [step 8](#8-create-a-branch-for-the-app): an app that your agent ships to your main branch goes to production without review.
7. Click **Set up remote sync**.

### 13. Merge the app's branch

Merge the app's branch into your main branch, for example with a [pull request](../data-modeling/semantic-layer/remote-sync.md#step-4-create-a-pull-request). Your production Metabase pulls the app within five minutes.

### 14. Let people open the app

1. On your production Metabase, click the **grid** icon in the upper right, and select **Data studio**.
2. Click **Data apps**, and click the app.
3. On the **Permissions** tab, add the groups that can open the app.

People in those groups can now open the app at `/apps/<slug>` on your production Metabase. The app runs with each person's [data permissions](../permissions/data.md), so people see only the data that they're allowed to see. For more, see [Choose who can open an app](./manage.md#choose-who-can-open-an-app).

## Add a form that changes data

An app can also add, edit, and delete rows in your database, with actions. Actions only work on [PostgreSQL and MySQL](../data-modeling/data-actions.md#databases-that-support-data-actions) databases.

1. On your development Metabase, [turn on data actions](../data-modeling/data-actions.md#turn-on-data-actions-for-a-database) for the database.
2. On your development Metabase, [switch to your main branch](../data-modeling/semantic-layer/remote-sync.md#switching-branches), and [pull the latest changes](../data-modeling/semantic-layer/remote-sync.md#pulling-changes-from-git). Then create a new branch for the form, like `orders-overview-form`, the same way as in [step 8](#8-create-a-branch-for-the-app).
3. In your clone, pull the latest changes, and switch to the new branch:

   ```sh
   git switch main
   git pull
   git switch orders-overview-form
   ```

4. Ask your agent for the form. For example:

   ```text
   Add a form to the app that lets people add a product.
   ```

5. Try out the form in the preview. The preview's actions change real data in the database that your development Metabase connects to, so try them out on test rows.
6. When the form works, ask your agent:

   ```text
   Ship the app to my development Metabase.
   ```

7. On your production Metabase, turn on data actions for the same database.
8. Merge the branch into your main branch.

For the rules that an app's actions follow, see [What a data app can read and write](./build.md#what-a-data-app-can-read-and-write).

## Next steps

- [Build a data app](./build.md): The full reference for building, previewing, shipping, and changing apps.
- [Manage data apps](./manage.md): Make apps live or drafts, and check which data each app reads and writes.
