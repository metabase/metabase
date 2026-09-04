---
title: Metabase CLI
summary: "The Metabase CLI (mb) is a command-line client that drives a Metabase instance over its API. Use it yourself, or hand it to an AI agent with the metabase-cli skill."
---

# Metabase CLI

The Metabase CLI (`mb`) is a command-line client for Metabase. `mb` logs in to a Metabase instance and lets you or an AI agent read and write content over the Metabase API: questions, models, metrics, dashboards, collections, documents, transforms, alerts, subscriptions, snippets, segments, measures, settings, and more.

> Looking for the commands built into the Metabase JAR, like `migrate` or `load-from-h2`? Check out [Metabase JAR commands](./commands.md).

## Requirements

- Node.js 20.6 or later, to install the CLI from npm.
- A Metabase instance on version 58 or later. Some command groups need a newer Metabase. For example, transforms and measures need version 59, Remote Sync needs version 60, and browser login needs version 63. The CLI tells you when a command needs a newer Metabase.
- A Pro or Enterprise plan for some command groups. For example, `git-sync` needs the premium [Remote Sync](./remote-sync.md) feature, and `content-translation` needs [translation dictionaries](../embedding/translations.md).

## Install the CLI

```
npm install -g @metabase/cli
```

The binary is `mb`.

For commands, run:

```
mb --help
```

To update to the latest version later, run `mb upgrade`.

## Authenticate the CLI

Log in once per Metabase instance:

```
mb auth login --url https://metabase.example.com
```

On Metabase 63 or later, the CLI opens Metabase in your browser. Sign in with your password or SSO and approve the CLI. The CLI stores a token that refreshes itself, so you never paste a secret. If you'd rather use an API key, pick **With an API key** at the prompt. If the `MB_API_KEY` environment variable is set, the CLI uses that key and skips the browser.

On older versions of Metabase, the CLI skips the browser and asks for an [API key](../people-and-groups/api-keys.md#create-an-api-key).

### Log in without a prompt

To log in from a script or CI, give the CLI an API key. Pipe the key on stdin or set the `MB_API_KEY` environment variable:

```
echo "$MB_API_KEY" | mb auth login --url https://metabase.example.com
```

You can set `MB_URL` instead of passing `--url`. There's also an `--api-key` flag, but the key ends up in your shell history, so prefer stdin or the environment variable. The older `METABASE_API_KEY` and `METABASE_URL` names still work, but the CLI warns you to switch to the `MB_` names.

### Check or clear your login

To see whether you're logged in, which login method you used, and which Metabase version you're talking to, run:

```
mb auth status
```

To remove stored credentials, run `mb auth logout`.

### Manage more than one Metabase with profiles

Credentials are stored per profile, so you can manage more than one Metabase (like dev and prod Metabases):

```
mb auth login --profile prod --url https://prod.example.com
mb auth list
```

Add `--profile <name>` (or `-p <name>`) to any command to run it against that instance. To change the default profile, set the `MB_PROFILE` environment variable.

The CLI stores secrets in your operating system's keychain when it can. Otherwise it stores them, with a warning, in `profiles.json` in its config directory (`~/.config/metabase-cli` on macOS and Linux, `%APPDATA%\metabase-cli` on Windows).

## Use the CLI with an AI agent

The CLI is built to be driven by an AI coding agent like Claude Code. Instead of running commands yourself, you install a skill and describe what you want in plain language; the agent works out the commands.

### The metabase-cli skill

The CLI ships with its own agent skills, so the instructions your agent reads always match the version of the CLI it's running. The [metabase-cli skill](https://github.com/metabase/agent-skills/tree/main/skills/metabase-cli) you install is a small pointer that tells the agent to load those bundled skills with `mb skills get`.

Install the skill in one of these ways:

- **From the Metabase agent skills repo**: `npx skills add metabase/agent-skills --skill metabase-cli -a claude-code`
- **As a Claude Code plugin**: `/plugin marketplace add metabase/mb-cli`, then `/plugin install metabase-cli@metabase`

Once installed, you can run:

```
/metabase-cli Create a dashboard summarizing this month's signups by plan.
```

And your agent will go to work, creating content directly in your Metabase via the `mb` CLI.

## Use the CLI for agent-driven development

Pair the CLI with version control to build content with an agent in a development Metabase, commit the changes, and pull the changes into your production Metabase. Check out [Agent-driven development](../ai/file-based-development.md).

## Further reading

- [Metabase CLI command reference](https://github.com/metabase/mb-cli#readme)
- [CLI analytics](../monitor/cli-analytics.md)
- [@metabase/cli on npm](https://www.npmjs.com/package/@metabase/cli)
- [Agent-driven development](../ai/file-based-development.md)
- [Agent skills](https://github.com/metabase/agent-skills)
- [Remote Sync](./remote-sync.md)
- [Serialization](./serialization.md)
- [Metabase JAR commands](./commands.md)
