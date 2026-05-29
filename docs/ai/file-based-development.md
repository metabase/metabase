---
title: Agent-driven development
summary: "Use a coding agent and the Metabase CLI to create Metabase content, then version that content as YAML files with Remote Sync or the serialization API."
---

# Agent-driven development

{% include plans-blockquote.html feature="Agent-driven development" %}

Metabase content like questions and dashboards can be serialized as YAML files. You can edit those YAML files by hand, sure, but now that we have actual genies, you can just ask the genies to create the content for you (call it "lamp-rubbing development").

With this set up, a typical workflow in a development instance of Metabase would be:

- Prompt the agent with `/metabase-cli {your prompt here}`
- Agent creates questions and dashboards.
- You view them in your dev instance.
- Iterate until you're happy with the dashboard
- Commit your changes and push them up to the repo.
- Remote sync pulls the changes into production.

## The agent-driven development toolkit

To develop your Metabase content with an agent, we've put together a set of tools.

- [**Metabase CLI**](../installation-and-operation/metabase-cli.md): a command-line client (`mb`) your agent drives to introspect your warehouse (tables, fields, sample values) and to create content directly in your Metabase. Use it with the [`/metabase-cli` skill](https://github.com/metabase/agent-skills/tree/main/skills/metabase-cli).
- [**Metabase Representation Format**](https://github.com/metabase/representations): the YAML schema and spec for every Metabase entity (questions, dashboards, collections, transforms, and so on). This is the format your content takes once you version it as files.
- **Export and Import** CLI and API endpoints to move serialized content between your local files and Metabase.
- [**Remote Sync**](../installation-and-operation/remote-sync.md) (Optional): push content from a Read-write Metabase into a git repo, and pull it into a Read-only Metabase in production.
- A Metabase instance to use for development.

## How content moves between files and Metabase

Your agent creates content directly in Metabase through the CLI. To version that content as YAML files (so your team can review a diff and promote it to production), you'll need a way to get the files out of Metabase and back in. There are two options:

- **[Remote Sync](../installation-and-operation/remote-sync.md)** — push and pull from inside Metabase. Requires a Read-write development instance and a Read-only production instance.
- **Serialization API** — `curl`-based export and import against the `/api/ee/serialization/` endpoints.

Pick one before you start the [Initial setup](#initial-setup); the setup steps differ slightly (Remote Sync doesn't need a separate API key in production).

## Initial setup

Some things to put into place to get a workflow going:

1. [Set up a development Metabase](#set-up-a-development-metabase)
2. [Set up a repository to version your YAML files](#set-up-a-repository-to-version-your-yaml-files)
3. [Install and authenticate the Metabase CLI](#install-and-authenticate-the-metabase-cli)
4. [Add agent skills to your repository](#add-agent-skills-to-your-repository)

Once you have these set up, you can step through one of the example workflows.

### Set up a development Metabase

1. Set up a Metabase instance to check your work before pushing changes to production. This Metabase should connect to the same data warehouse(s) your production Metabase connects to. A [config file](../configuring-metabase/config-file.md) will come in handy here.

2. Create an [API key](../people-and-groups/api-keys.md#create-an-api-key) and assign it to the Admin group. The agent reads database metadata and creates content, so it needs Admin-level access. If you're using the [Serialization API workflow](#how-content-moves-between-files-and-metabase), you'll also need to create an API key in your production Metabase so you can import your files into it.

3. We also recommend turning off the sample content and usage analytics, so they don't pollute the data model. If you're using a [docker compose file](../installation-and-operation/running-metabase-on-docker.md), add these [environment variables](../configuring-metabase/environment-variables.md):

```
MB_LOAD_SAMPLE_CONTENT: "false"
MB_INSTALL_ANALYTICS_DATABASE: "false"
```

### Set up a repository to version your YAML files

1. Initialize a new repo.
2. Add a `.gitignore` file and add `.metabase/` and `.env`.
3. Add the following to your `.env`:

```
   METABASE_URL={your-metabase-url}
   METABASE_API_KEY={your-api-key}
```

The serialization `curl` commands and the semantic checker read these values. The Metabase CLI can read them too, though you'll authenticate it separately in the next step.

### Install and authenticate the Metabase CLI

Install the CLI globally:

```
npm install -g @metabase/cli
```

Then authenticate it against your development Metabase:

```
mb auth login
```

The CLI stores your credentials securely and caches your server version, so later commands skip re-probing. That's the only setup the CLI needs — from here on, you drive it through the agent.

For the full command reference and profile setup, see [Metabase CLI](../installation-and-operation/metabase-cli.md).

### Add agent skills to your repository

You should add the following skills to your agent so it has the context it needs. If you commit the skills into `.claude/skills/` in your repo, for example, Claude loads them automatically whenever you run it from that directory.

- [**`/metabase-cli` skill**](https://github.com/metabase/agent-skills/tree/main/skills/metabase-cli): teaches the agent to drive the CLI to introspect your warehouse and create content directly in your Metabase.
- [**`metabase-representation-format` skill**](https://github.com/metabase/agent-skills/blob/main/skills/metabase-representation-format/SKILL.md): teaches the agent the representation format and ships the schema checker for when you version content as files.
- [**`metabase-semantic-checker` skill**](https://github.com/metabase/agent-skills/blob/main/skills/metabase-semantic-checker/SKILL.md) (optional): runs Metabase's semantic checker in Docker to catch referential and query errors the schema check doesn't.

## Example workflows

The workflows below both assume you've completed the [Initial setup](#initial-setup).

### Example prompts

Once your repo has the agent skills, run the `/metabase-cli` skill and give the agent a structured request. The agent introspects your warehouse and builds the content directly in your development Metabase:

```
/metabase-cli Create a new dashboard called "Support overview". Add questions showing total ticket volume, open tickets, and average satisfaction rating.
```

Or, depending on how capable your model is, try a more open-ended request:

```
/metabase-cli Analyze our support data. Look at the tickets, customers, and interactions tables, and build a dashboard that gives an overview of our team's support workload.
```

The agent reads real column names, field types, and foreign-key relationships from your warehouse, then creates the questions and dashboard for you. You don't need to write any CLI commands yourself — just describe what you want.

## Example workflow with Remote Sync

### 1. Configure Remote Sync on both instances

In your development Metabase, configure [Remote Sync in Read-write mode](../installation-and-operation/remote-sync.md#setting-up-remote-sync) pointed at your repo. In production, configure a second Metabase in Read-only mode pointed at the same repo.

### 2. Create a branch from the Metabase UI

Switch branches in Metabase, as the Metabase UI is the source of truth for which branch the development instance pushes to and pulls from.

In your development Metabase, click the **branch dropdown** at the top and [create a new branch](../installation-and-operation/remote-sync.md#creating-a-branch) for your work, like `feature/support-dashboard`.

### 3. Ask the agent to create content

Run the `/metabase-cli` skill and prompt the agent to build your questions and dashboards. See [Example prompts](#example-prompts) above for patterns to use here. The agent creates the content directly in your development Metabase.

### 4. Verify the content in your development Metabase

Open your development Metabase and confirm the dashboard renders correctly and the questions return expected results.

### 5. Push the new content to the branch

The agent's work lives only in your development Metabase until you push it. Click the up arrow (**push**) icon to [commit and push](../installation-and-operation/remote-sync.md#committing-and-pushing-your-changes) the new content to the branch as YAML files. Metabase does the git commit for you, so there's nothing to commit locally.

### 6. Review and validate the YAML

Clone or pull the branch locally to review the diff and run the checks:

```sh
git clone your-metabase-repo
cd your-metabase-repo
git checkout feature/support-dashboard
```

Run the [schema check](#schema-check) and optionally the [semantic check](#semantic-checker-for-deeper-validation). See [Validating YAML files](#validating-yaml-files) below.

### 7. Open a pull request

Metabase already committed the content to the branch when you pushed, so open a pull request directly from your git host. Your team can review the YAML diff there.

### 8. Merge the PR so production picks up the changes

If you've enabled [auto-sync](../installation-and-operation/remote-sync.md#pulling-changes-automatically), your production Metabase (in Read-only mode) will pull the new main branch automatically on its next interval. Otherwise, trigger a pull from production manually.

## Example workflow with import and export endpoints

### 1. Ask the agent to create content

Run the `/metabase-cli` skill and prompt the agent to build your questions and dashboards directly in your development Metabase. See [Example prompts](#example-prompts) above for prompt patterns.

### 2. Verify the content in your development Metabase

Open your development Metabase and confirm the dashboard renders correctly and the questions return expected results.

### 3. Export the new content to version it as files

The agent's work lives only in your development Metabase until you export it. Clone your repo (or `cd` into it), then run the [serialization export](../installation-and-operation/serialization.md#serialization-workflow-example) to pull the content into the repo as YAML files you can commit:

```sh
git clone https://github.com/your-org/your-repo.git
cd your-repo
git checkout -b feature/support-dashboard

curl \
  -H 'X-API-Key: YOUR_API_KEY' \
  -X POST 'https://your-metabase-url/api/ee/serialization/export?data_model=false' \
  -o metabase_data.tgz
tar -xzf metabase_data.tgz
```

Set `data_model=false` to keep the export small. For more on export options, see [Serialization](../installation-and-operation/serialization.md).

### 4. Validate the YAML and open a pull request

Run the [schema check](#schema-check) and optionally the [semantic check](#semantic-checker-for-deeper-validation) against the exported files. See [Validating YAML files](#validating-yaml-files) below.

The export added the new content to your working tree, so commit and push it to the branch yourself:

```sh
git add -A
git commit -m "Add support-overview dashboard"
git push origin feature/support-dashboard
```

Then open a pull request so your team can review the YAML diff.

### 5. Import the YAML into production

Once you're confident in the changes, re-bundle the YAML and import it into your production Metabase, using its API key:

```sh
tar -czf metabase_data.tgz metabase_data
curl -X POST \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'file=@metabase_data.tgz' \
  'https://your-metabase-url/api/ee/serialization/import' \
  -o -
```

The `-o -` flag writes the import response to stdout, so you can see whether the import succeeded and check any warnings. You can ask the agent to generate `export.sh` and `import.sh` wrappers so you're running a single command each time.

Verify the dashboard renders correctly and the questions return expected results.

## Undoing the agent's changes

Since the agent creates content directly in Metabase, undoing its work means cleaning up in two places:

- **In the repo**: use `git` to revert your YAML files to the last known-good commit before pushing or re-importing.
- **In Metabase**: archive or delete the items the agent created (or re-import a known-good export).

If you're using Remote Sync, don't try to fix things by re-pushing from Metabase: Metabase's push only reflects its current state and won't delete any new files the agent created locally.

## Validating YAML files

Run both checks locally before pushing. The same checks belong in CI — see [CI example](#ci-example) below.

### Schema check

You can run a quick schema check:

```sh
npx --yes @metabase/representations validate-schema
```

The check validates the shape of every YAML file against the Representation Format spec. The `metabase-representation-format` skill should run this check for you automatically after any export.

### Semantic checker for deeper validation

> The semantic checker is only available in the Pro/Enterprise plans.

The **semantic checker** catches things like references to tables that don't exist or columns that don't match your warehouse.

What it validates beyond schema:

- Cross-entity references: `collection_id`, `dashboard_id`, `parent_id`, snippet names, transform tags, card embeddings.
- MBQL query compilation: `source-table`, field references, joins, segments, measures, expressions.
- Native-query references: tables, columns, and snippets named in SQL.

The semantic checker compares your YAML against your warehouse metadata, which it reads from `.metabase/metadata.json`. Fetch that file directly from your Metabase before running the check:

```sh
curl \
  -H "X-API-Key: $METABASE_API_KEY" \
  "$METABASE_URL/api/database/metadata" \
  -o .metabase/metadata.json
```

If you've installed the `metabase-semantic-checker` skill, just ask the agent to run the semantic checker; the skill picks the right image, passes the right flags, and summarizes the findings.

You can manually run the semantic checker via Docker like so:

```sh
docker pull metabase/metabase-enterprise:latest

docker run --rm \
  -v "$PWD:/workspace" \
  --entrypoint "" \
  -w /app \
  metabase/metabase-enterprise:latest \
  java -jar metabase.jar \
    --mode checker \
    --export /workspace \
    --schema-dir /workspace/.metabase/metadata.json \
    --schema-format concise
```

Match the image tag (`:latest`) to your Metabase build.

### CI example

You can hook the schema check into GitHub Actions so your team catches problems on the PR, before anyone pulls the changes into Metabase:

```yaml
# .github/workflows/schema-check.yml
name: Schema Check

on:
  push:
    branches: [main]
  pull_request:

jobs:
  schema-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6.4.0
        with:
          node-version: "20"

      - name: Validate representation YAML files
        run: npx --yes @metabase/representations validate-schema
```

For the semantic check, add a second workflow that fetches `.metabase/metadata.json` from your Metabase and then runs the Docker command above against the checkout. If you run the semantic check in more than one workflow (for example, a semantic check and per-PR preview environments), you should probably factor the database metadata fetch to run and cache once a day so you don't hit the API on every push.

## Deleting content

Since imports and exports _don't_ delete content, you'll need to delete content in the Metabase application itself, then update the YAML files as well.

1. Delete the content in your production Metabase (in the app's UI).
2. Push (with Remote Sync) or re-export (without) so the change is reflected in the repo.
3. Commit the deletion. That way Metabase won't recreate the deleted items the next time it pulls.

## Further reading

- [Remote Sync](../installation-and-operation/remote-sync.md)
- [Serialization](../installation-and-operation/serialization.md)
- [Metabase CLI](../installation-and-operation/metabase-cli.md)
- [Metabase Representation Format](https://github.com/metabase/representations)
- [Agent skills](https://github.com/metabase/agent-skills)
- [MCP server](./mcp.md) — for agents that need live metadata lookups outside the file-based workflow.
