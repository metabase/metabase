---
title: Agent-driven development
summary: "Use a coding agent and the Metabase CLI to create Metabase content, then version that content as YAML files with Remote Sync."
---

# Agent-driven development

{% include plans-blockquote.html feature="Agent-driven development" %}

Now that we have actual genies, you can just ask the genies to create the content for you (call it "lamp-rubbing development").

Give an agent the [Metabase CLI](../installation-and-operation/metabase-cli.md), and it can create content for you. But since LLMs can be unpredictable, we recommend developing content in a dev instance of Metabase, then using [Remote Sync](../installation-and-operation/remote-sync.md) to get your changes into production.

With this set up, a typical workflow using an agent with a development instance of Metabase would be:

1. Prompt the agent with `/metabase-cli Create a dashboard based on the sales table.`
2. Agent creates questions and a dashboard.
3. View the dashboard in your dev instance.
4. Iterate either in your Metabase or via the agent until you're happy with the dashboard.
5. Use Remote Sync to push your changes to a repo.
6. Create a PR.
7. Merge the changes.
8. Once merged, your production Metabase pulls in the changes via Remote Sync.

## The agent-driven development toolkit

To develop your Metabase content with an agent, we've put together a set of tools.

- A Metabase instance to use for development.
- [**Metabase CLI**](../installation-and-operation/metabase-cli.md): a command-line client (`mb`) your agent uses to create content directly in your Metabase. Use the CLI with the [`/metabase-cli` skill](https://github.com/metabase/agent-skills/tree/main/skills/metabase-cli).
- [**Metabase Representation Format**](https://github.com/metabase/representations): the YAML schema and spec for every Metabase entity (questions, dashboards, collections, transforms, and so on). This is the format your content takes once you version it as files.
- [**Remote Sync**](../installation-and-operation/remote-sync.md): push content from a Read-write Metabase into a git repo, and pull it into a Read-only Metabase in production.

## Initial setup

Some things to put into place to get a workflow going:

1. [Set up a development Metabase](#set-up-a-development-metabase)
2. [Set up a repository to version your YAML files](#set-up-a-repository-to-version-your-yaml-files)
3. [Install and authenticate the Metabase CLI](#install-and-authenticate-the-metabase-cli)
4. [Add the agent skill](#add-the-agent-skill)

Once you have these set up, you can step through the example workflow.

### Set up a development Metabase

1. Set up a Metabase instance to check your work before pushing changes to production. This Metabase should connect to the same data warehouse(s) your production Metabase connects to. A [config file](../configuring-metabase/config-file.md) will come in handy here.

2. Create an [API key](../people-and-groups/api-keys.md#create-an-api-key) in this development Metabase and assign it to the Admin group, so the agent can create content and work with Remote Sync.

3. We also recommend turning off the sample content and usage analytics, so they don't pollute the data model. If you're using a [docker compose file](../installation-and-operation/running-metabase-on-docker.md), add these [environment variables](../configuring-metabase/environment-variables.md):

```
MB_LOAD_SAMPLE_CONTENT: "false"
MB_INSTALL_ANALYTICS_DATABASE: "false"
```

### Set up a repository to version your YAML files

Create a new git repository for your Metabase content. You'll point Remote Sync at this repo when you configure it, and clone the repo locally to review changes and open pull requests.

### Install and authenticate the Metabase CLI

Install the [Metabase CLI](../installation-and-operation/metabase-cli.md) globally:

```
npm install -g @metabase/cli
```

Then authenticate it against your development Metabase:

```
mb auth login --url your-metabase-url-here
```

Authenticate with the API key you created in your Metabase instance.

### Add the agent skill

Add the [`/metabase-cli` skill](https://github.com/metabase/agent-skills/tree/main/skills/metabase-cli) to your agent so it knows how to use the CLI to create content directly in your Metabase.

## Example prompts

These examples assume you've completed the [Initial setup](#initial-setup). Run the `/metabase-cli` skill and give the agent a structured request. The agent will run CLI commands to create the content directly in your development Metabase:

```
/metabase-cli Create a new dashboard called "Support overview". Add questions showing total ticket volume, open tickets, and average satisfaction rating.
```

Or, depending on how capable your model is, try a more open-ended request:

```
/metabase-cli Analyze our support data. Look at the tickets, customers, and interactions tables, and build a dashboard that gives an overview of our team's support workload.
```

The agent writes the CLI commands and creates the questions and dashboard for you—just describe what you want.

## Example workflow

### 1. Configure Remote Sync on both Metabase instances

In your development Metabase, configure [Remote Sync in Read-write mode](../installation-and-operation/remote-sync.md#setting-up-remote-sync) pointed at your repo.

Set up Remote Sync in your production Metabase in Read-only mode pointed at the same repo.

### 2. Create a branch from the Metabase UI

Switch branches in Metabase, as the Metabase UI is the source of truth for which branch the development instance pushes to and pulls from.

In your development Metabase, click the **branch dropdown** at the top and [create a new branch](../installation-and-operation/remote-sync.md#creating-a-branch) for your work, like `feature/support-dashboard`.

### 3. Ask the agent to create content

Run the `/metabase-cli` skill and prompt the agent to build your questions and dashboards. The agent creates the content directly in your development Metabase.

### 4. Verify the content in your development Metabase

Open your development Metabase and confirm the dashboard renders correctly and the questions return expected results. Make any changes you want, either in the UI or via the agent.

### 5. If you make any changes in your Metabase, push the new content to the branch

To commit the work, [push the change from your Metabase](../installation-and-operation/remote-sync.md#committing-and-pushing-your-changes). If you don't push your changes from your Metabase to your repo, you could lose work the next time you pull changes into that Metabase.

### 6. Open a pull request

Open a pull request so your team can review the YAML diff. They can also use Remote Sync to pull the branch into a development Metabase and see the changes live.

### 7. Merge the PR so production picks up the changes

If you've enabled [auto-sync](../installation-and-operation/remote-sync.md#pulling-changes-automatically), your production Metabase (in Read-only mode) will pull the new main branch automatically on its next interval.

## Undoing the agent's changes

Since the agent uses the CLI to create content directly in Metabase, to undo changes, you could either:

- **Revert to a commit and pull changes**: Revert to a previous commit, and pull that commit into your Metabase. Pulling that commit would overwrite any changes you or the agent had made.
- **Update Metabase and push changes**: Edit or archive the content in your Metabase (either manually or via an agent with the CLI), and push the changes to your repo. You may want to pick this approach if you want to keep some, but not all of the changes made by the AI, or if you've made additional changes via Metabase's handy UI that you want to keep.

## Further reading

- [Remote Sync](../installation-and-operation/remote-sync.md)
- [Metabase CLI](../installation-and-operation/metabase-cli.md)
- [Metabase Representation Format](https://github.com/metabase/representations)
- [Agent skills](https://github.com/metabase/agent-skills)
- [MCP server](./mcp.md): for agents that need live metadata lookups outside the file-based workflow.
