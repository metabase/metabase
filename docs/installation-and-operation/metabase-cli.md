---
title: Metabase CLI
summary: "The Metabase CLI (mb) is a command-line client that drives a Metabase instance over its API. Use it yourself, or hand it to an AI agent with the metabase-cli skill."
---

# Metabase CLI

The Metabase CLI (`mb`) is a command-line client for Metabase. `mb` authenticates against an instance with an API key and lets you or an AI agent read and write content like questions, dashboards, collections, and transforms over the Metabase API.

> Looking for the commands built into the Metabase JAR, like `migrate` or `load-from-h2`? Check out [Metabase JAR commands](./commands.md).

## Requirements

- Node.js, to install the CLI from npm.
- A Metabase instance on v0.62 or later.
- An [API key](../people-and-groups/api-keys.md#create-an-api-key) to authenticate the CLI against your instance.
- A Pro or Enterprise plan for some command groups. For example, `git-sync` needs the premium [Remote sync](./remote-sync.md) feature.

## Install the CLI

```
npm install -g @metabase/cli
mb --help
```

The binary is `mb`.

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

## What you can do with the CLI

The CLI groups commands by the kind of thing they act on. Some of the main groups:

- **Content**: `card`, `dashboard`, `collection`—create, read, update, and archive questions, dashboards, and collections.
- **Modeling**: `transform`, `transform-job`, `snippet`, `segment`, `measure`—author and run the building blocks of your data model.
- **Warehouse**: `db`, `table`, `field`—inspect databases, tables, and columns, and trigger syncs.
- **Queries**: `query` and `card query`—run MBQL or native queries and stream the results or an export.
- **Instance**: `setting`, `setup`, `search`—read and write settings, bootstrap a fresh instance, and search content.
- **Versioning**: `git-sync`—drive [Remote sync](./remote-sync.md) to import and export content against a git remote.

Run `mb <group> --help` to see the commands in a group, and `mb <group> <command> --help` for a command's flags. Most commands take `--json` for machine-readable output.

For example, to list your databases and inspect a table's columns:

```
mb db list
mb table get 42 --include fields
```

## Use the CLI with an AI agent

The CLI is built to be driven by an AI coding agent like Claude Code. Instead of running commands yourself, you install a skill and describe what you want in plain language; the agent works out the commands.

### The metabase-cli skill

The [metabase-cli skill](https://github.com/metabase/agent-skills/tree/main/skills/metabase-cli) teaches your agent the CLI's conventions: how to authenticate, pick a profile, validate queries before running them, and more.

Install `metabase-cli` skill one of two ways:

```
npx skills add metabase/mb-cli
```

Then run the skill followed by your request:

```
/metabase-cli Create a dashboard summarizing this month's signups by plan.
```

The agent goes to work, creating content directly in your Metabase via the `mb` CLI.

### Bundled skills

The CLI also ships skills that match the version you installed, served at runtime so they never drift from the binary. List and read them with:

```
mb skills list
mb skills get core
```

| Skill       | Use                                                                       |
| ----------- | ------------------------------------------------------------------------- |
| `core`      | Top-level guide: auth, flag conventions, output, and every command group. |
| `transform` | Authoring and running transforms in native SQL or MBQL.                   |
| `git-sync`  | Round-tripping Metabase content to and from a git remote.                 |

## Use the CLI for agent-driven development

Pair the CLI with version control to build content with an agent in a development Metabase, review it as YAML files, and promote it to production. Check out [Agent-driven development](../ai/file-based-development.md).

## Further reading

- [@metabase/cli on npm](https://www.npmjs.com/package/@metabase/cli)
- [Agent-driven development](../ai/file-based-development.md)
- [Agent skills](https://github.com/metabase/agent-skills)
- [Remote sync](./remote-sync.md)
- [Serialization](./serialization.md)
- [Metabase JAR commands](./commands.md)
