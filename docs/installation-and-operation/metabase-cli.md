---
title: Metabase CLI
summary: "The Metabase CLI (mb) is a command-line client that drives a Metabase instance over its API. Use it yourself, or hand it to an AI agent with the metabase-cli skill."
---

# Metabase CLI

The Metabase CLI (`mb`) is a command-line client for Metabase. `mb` authenticates against a Metabase instance with an API key and lets you or an AI agent read and write content like questions, dashboards, collections, and transforms over the Metabase API.

> Looking for the commands built into the Metabase JAR, like `migrate` or `load-from-h2`? Check out [Metabase JAR commands](./commands.md).

## Requirements

- Node.js, to install the CLI from npm.
- A Metabase instance on version 58 or later.
- An [API key](../people-and-groups/api-keys.md#create-an-api-key) to authenticate the CLI against your instance.
- A Pro or Enterprise plan for some command groups. For example, `git-sync` needs the premium [Remote sync](./remote-sync.md) feature.

## Install the CLI

```
npm install -g @metabase/cli
```

The binary is `mb`.

For commands, run:

```
mb --help
```

## Authenticate the CLI

Log in once per Metabase instance.

```
mb auth login --url https://metabase.example.com
```

The CLI prompts for an API key, or reads it from the `METABASE_API_KEY` environment variable or stdin. To create a key, see [API keys](../people-and-groups/api-keys.md#create-an-api-key).

Credentials are stored per profile, so you can manage more than one Metabase (like dev and prod Metabases):

```
mb auth login --profile prod --url https://prod.example.com
mb auth list
```

Add `--profile <name>` to any command to run it against that instance.

## Use the CLI with an AI agent

The CLI is built to be driven by an AI coding agent like Claude Code. Instead of running commands yourself, you install a skill and describe what you want in plain language; the agent works out the commands.

### The metabase-cli skill

The [metabase-cli skill](https://github.com/metabase/agent-skills/tree/main/skills/metabase-cli) teaches your agent the CLI's conventions. Once installed, you can run:

```
/metabase-cli Create a dashboard summarizing this month's signups by plan.
```

And your agent will go to work, creating content directly in your Metabase via the `mb` CLI.

## Use the CLI for agent-driven development

Pair the CLI with version control to build content with an agent in a development Metabase, commit the changes, and pull the changes into your production Metabase. Check out [Agent-driven development](../ai/file-based-development.md).

## Further reading

- [@metabase/cli on npm](https://www.npmjs.com/package/@metabase/cli)
- [Agent-driven development](../ai/file-based-development.md)
- [Agent skills](https://github.com/metabase/agent-skills)
- [Remote sync](./remote-sync.md)
- [Serialization](./serialization.md)
- [Metabase JAR commands](./commands.md)
