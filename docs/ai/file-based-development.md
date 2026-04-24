---
title: File-based development
summary: "Use the Git-Based File Editing Workflow — a bundle of agent skills with optional Remote Sync — to author Metabase content with an AI agent on your local filesystem, with schema and semantic validation available locally and in CI."
---

# File-based development

{% include plans-blockquote.html feature="File-based development" %}

Metabase content like questions and dashboards can be serialized as YAML files. You can edit those YAML files directly, but you can also just throw an agent at them.

Paired with some skills we've developed, you can ask your agent to build new questions and dashboards as YAML files, then import that new content into your Metabase. This file-based development flow opens up a whole new way to work with your Metbase.

## The file-based toolkit

To develop your Metase content on your local file-system, we've put together a  set of tools, including a set of agent skills.

- [**Metabase Representation Format**](https://github.com/metabase/representations): the YAML schema and spec for every Metabase entity (questions, dashboards, collections, transforms, and so on).
- **[Metabase Database Metadata Format](https://github.com/metabase/database-metadata)**: diff-friendly representations of synced databases, their tables, and their fields, as a tree of YAML files.
- **Export and Import** CLI and API endpoints to manage serialized content (if you're not using Remote Sync).
- [**Remote Sync**](../installation-and-operation/remote-sync.md) (Optional): you can push content from a Read-write Metabase into a git repo, and pull it into a Read-only Metabase in production.


## Initial setup

Some things to put into place to get a workflow going:

1. [Set up a development Metabase](#set-up-a-development-metabase)
2. [Set up a repository to version your YAML files](#set-up-a-repository-to-version-your-yaml-files)
3. [Add agent skills to your repository](#add-agent-skills-to-your-repository)
4. [Download the database metadata](#download-the-database-metadata)

Once you have these set up, you can step through one of the example workflows.

### Set up a development Metabase

1. Set up a Metabase instance to check your work before pushing changes to production. This Metabase should connect to the same data warehouse(s) your production Metabase connects to. A [config file](../configuring-metabase/config-file.md) will come in handy here.

2. Create an [API key](../people-and-groups/api-keys.md#create-an-api-key) and assign it to the Admin group. If you're not using Remote Sync, also create an API key in your production Metabase, as you'll need it for the import step.

3. We also recommend turning off the sample content and usage analytics, so they don't pollute the data model. If you're using a [docker compose file](../installation-and-operation/running-metabase-on-docker.md), add these [environment variables](../configuring-metabase/environment-variables.md):


```
MB_LOAD_SAMPLE_CONTENT: "false"
MB_INSTALL_ANALYTICS_DATABASE: "false"
```

### Set up a repository to version your YAML files

1. Initialize a new repo.
2. Add the skills to the repo (like .claude/skills directory).
3. Add a `.gitignore` file and add `.metabase` and `.env`.
4. Add the following to your .env:

```
   METABASE_URL={your-metabase-url}
   METABASE_API_KEY={your-api-key}
```

### Add agent skills to your repository

You should add the following skills to your agent so it has context it needs. If you commit the skills into `.claude/skills/` in your repo, for example, Claude loads them automatically whenever you run it from that directory.

- [**`metabase-representation-format` agent skill**](https://github.com/metabase/agent-skills/blob/main/skills/metabase-representation-format/SKILL.md): teaches the agent the representation format and ships the schema checker.
- [**`metabase-database-metadata` agent skill**](https://github.com/metabase/agent-skills/blob/main/skills/metabase-database-metadata/SKILL.md): fetches database metadata from your Metabase into an on-disk YAML tree the agent can read while editing.
- [**`metabase-semantic-checker` agent skill**](https://github.com/metabase/agent-skills/blob/main/skills/metabase-semantic-checker/SKILL.md) (optional): runs Metabase's semantic checker in Docker to catch referential and query errors the schema check doesn't.

### Download the database metadata

Invoke the `metabase-database-metadata` skill and ask your agent to fetch the database metadata. The agent will:

- Check that `.env` exists. If it doesn't, the agent will prompt you to create it.
- Verify that `.env` and `.metabase/` are in `.gitignore`, asking before adding them.
- Fetch `/api/database/metadata` into `.metabase/metadata.json` (raw API response; can be several GB on large warehouses).
- Extract a diff-friendly YAML tree to `.metabase/databases/<database>/schemas/<schema>/tables/<table>.yaml` by running `npx @metabase/database-metadata extract-metadata`.

The agent can use the YAML extracted to your `.metabase` directory while creating and editing new questions and dashboards in YAML. That way your agent can refer to real column names, field types, and foreign-key relationships without making live API calls (which would be much slower).

To refresh this database metadata, just ask your agent to re-fetch it.

## Example workflows

There are two ways to get your YAML files into and out of Metabase:

- **[Remote Sync](../installation-and-operation/remote-sync.md)** — push and pull from inside Metabase. Requires a Read-write development instance and a Read-only production instance.
- **Serialization API** — `curl`-based export and import. Available on all plans.

Pick one and follow the matching workflow below. Both assume you've completed the [initial setup](#initial-setup).

## Example workflow with Remote Sync

### 1. Configure Remote Sync on both instances

In your development Metabase, configure [Remote Sync in Read-write mode](../installation-and-operation/remote-sync.md#setting-up-remote-sync) pointed at your repo. In production, configure a second Metabase in Read-only mode pointed at the same repo.

### 2. Create a branch from the Metabase UI

In your development Metabase, click the branch dropdown at the top and [create a new branch](../installation-and-operation/remote-sync.md#creating-a-branch) for your work, like `feature/support-dashboard`.

### 3. Push existing content to seed the repo

Click the up arrow (push) icon to [commit and push](../installation-and-operation/remote-sync.md#committing-and-pushing-your-changes) your existing synced collections to the branch.

### 4. Clone the repo locally and check out the branch

```sh
git clone your-metabase-repo
cd your-metabase-repo
git checkout feature/support-dashboard
```

### 5. Ask the agent to edit or create content

Example prompt:

```
Use the metabase-representation-format and metabase-database-metadata skills Create new YAML files in this directory:

1. Create a new dashboard called "Support overview" in collections/main/.
2. Add questions showing total ticket volume, open tickets, and average satisfaction rating.
```

Depending on how capable your model is, you can also try more open-ended requests:

```
Use the metabase-representation-format and metabase-database-metadata skills to analyze our support data.

Look at the tickets, customers, and interactions tables, and create a dashboard that gives an overview of our team's support workload.
```

The agent will read the representation format spec, check existing files for local conventions, consult `.metabase/databases/` for real column names, and write new YAML.

### 6. Validate the YAML files

Run the [schema check](#schema-check) after every batch of edits, and optionally run the [semantic check](#semantic-checker-for-deeper-validation) at the end of the session. See [Validating YAML files](#validating-yaml-files) below.

If anything fails, the agent should be able to fix the issue if you give it the error.

### 7. Commit and open a pull request

```sh
git add -A
git commit -m "Add support-overview dashboard"
git push origin feature/support-dashboard
```

Open a pull request so your team can review the YAML diff.

### 8. Pull the branch into your dev Metabase

Click the pull (down arrow) icon in your development Metabase to load the agent's changes. Verify the dashboard renders correctly and the questions return expected results.

### 9. Merge the PR so production auto-syncs

When you merge the PR, your production Metabase (in Read-only mode) will [auto-sync](../installation-and-operation/remote-sync.md#pulling-changes-automatically) the new main branch on its next pull.

## Example workflow with import and export endpoints

### 1. Clone the empty repo and create a branch

```sh
git clone https://github.com/your-org/your-repo.git
cd your-repo
git checkout -b feature/support-dashboard
```

### 2. Export existing content to seed the repo

The agent does better work when the repo already holds your current Metabase content, so it can see real examples of the Representation Format and your collection conventions. Run the [serialization export](../installation-and-operation/serialization.md#serialization-workflow-example) from inside the clone:

```sh
curl \
  -H 'X-API-Key: YOUR_API_KEY' \
  -X POST 'https://your-metabase-url/api/ee/serialization/export?data_model=false' \
  -o metabase_data.tgz
tar -xzf metabase_data.tgz
```

Set `data_model=false` to keep the export small. The agent should get its metadata from the `metabase-database-metadata` skill instead. For more on export options, see [Serialization](../installation-and-operation/serialization.md)

Commit the extracted YAML so you have a baseline to revert to if the agent goes off the rails.

### 3. Ask the agent to edit or create content

Example prompt:

```
Use the metabase-representation-format and metabase-database-metadata skills to do the following by editing the YAML files in this directory:

1. Create a new dashboard called "Support overview" in collections/main/.
2. Add questions showing total ticket volume, open tickets, and average satisfaction rating.
```

Depending on how capable your model is, you can also try more open-ended requests:

```
Use the metabase-representation-format and metabase-database-metadata skills to analyze our support data.
Look at the tickets, customers, and interactions tables, and create a dashboard that gives an overview
of our team's support workload.
```

The agent will read the representation format spec, check existing files for local conventions, consult `.metabase/databases/` for real column names, and write new YAML.

### 4. Validate the YAML files

Run the [schema check](#schema-check) after every batch of edits, and optionally run the [semantic check](#semantic-checker-for-deeper-validation) at the end of the session. See [Validating YAML files](#validating-yaml-files) below.

### 5. Commit and open a pull request

```sh
git add -A
git commit -m "Add support-overview dashboard"
git push origin feature/support-dashboard
```

Open a pull request so your team can review the YAML diff. Reviewing analytics content as text before it touches any Metabase is the whole point of the file-based workflow.

### 6. Import the YAML into your dev Metabase

Re-bundle the YAML and import it:

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

### 7. Repeat the import against production

Once you're confident in the changes, run the same `tar` + `curl` import against your production Metabase, using its API key.

## Undoing the agent's changes

If you want to undo the agent's changes, use `git` to revert your YAML files to the last known-good commit before pushing or re-importing.

If you're using Remote Sync, don't try to fix things by re-pushing from Metabase: Metabase's push only reflects its current state and won't delete any new files the agent created locally.

## Validating YAML files

Run both checks locally before pushing. The same checks belong in CI see [CI scaffolding](#ci-scaffolding) below.

### Schema check

Fast, runs freely, and doesn't need database metadata:

```sh
npx --yes @metabase/representations validate-schema
```

Validates the shape of every YAML file against the Representation Format. The `metabase-representation-format` skill runs this for you automatically after edits; you can also run it yourself at any time.

### Semantic checker for deeper validation

> The semantic checker is only available in the Pro/Enterprise edition.

The **semantic checker** catches things like references to tables that don't exist or columns the agent invented.

What it validates beyond schema:

- Cross-entity references: `collection_id`, `dashboard_id`, `parent_id`, snippet names, transform tags, card embeddings.
- MBQL query compilation: `source-table`, field references, joins, segments, measures, expressions.
- Native-query references: tables, columns, and snippets named in SQL.

If you've installed the `metabase-semantic-checker` skill, just ask the agent to run the semantic checker, the skill should pick the right image, pass the right flags, and summarize the findings.

Run the semantic checker via Docker:

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

Hook the schema check into GitHub Actions so your team catches problems on the PR, before anyone pulls the changes into Metabase:

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
- uses: actions/checkout@v4

- uses: actions/setup-node@v4
        with:
          node-version: "20"

- name: Validate representation YAML files
        run: npx --yes @metabase/representations validate-schema
```

For the semantic check, add a second workflow that fetches `.metabase/metadata.json` from your Metabase and then runs the Docker command above against the checkout. If you run the semantic check in more than one workflow (for example, a semantic check and per-PR preview environments), factor the metadata fetch into a composite action with day-long caching so you don't hit the API on every push.

## Deleting content

Since imports and exports _don't_ delete content, you'll need to delete content in the Metabase application itself, then update the YAML files as well.

1. Delete the content in your production Metabase (in the app's UI).
2. Push (with Remote Sync) or re-export (without) so the change is reflected in the repo.
3. Commit the deletion. That way Metabase won't recreate the deleted items the next time it pulls.


## Repo layout

| Path                | What it is                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections/`      | Collections, cards, dashboards, documents, segments, and measures (Representation Format).                                                                                                                                         |
| `databases/`        | Database-scoped measures and segments that live next to their tables.                                                                                                                                                              |
| `transforms/`       | Transform jobs and tags.                                                                                                                                                                                                           |
| `python_libraries/` | Shared Python source files for Python transforms.                                                                                                                                                                                  |
| `.metabase/`        | **Gitignored.** Fetched on demand. Contains `metadata.json` (raw API response) and `databases/` (extracted YAML tree of schemas, tables, fields, and foreign keys). Can reach multiple GB on large warehouses, so never commit it. |
| `.env`              | **Gitignored.** Holds `METABASE_URL` and `METABASE_API_KEY` for the database-metadata skill.                                                                                                                                       |
| `.env.template`     | Committed template. Copy it to `.env` and fill in values.                                                                                                                                                                          |
| `.claude/skills/`   | Optional. Pre-wired copies of the three agent skills so Claude loads them automatically when you run it from the repo.                                                                                                             |

Top-level folders (`collections/`, `databases/`, `transforms/`, `python_libraries/`) follow the [Metabase Representation Format](https://github.com/metabase/representations). The `.metabase/` folder follows the [Metabase Database Metadata Format](https://github.com/metabase/database-metadata).

## Further reading

- [Remote Sync](../installation-and-operation/remote-sync.md)
- [Serialization](../installation-and-operation/serialization.md)
- [Metabase Representation Format](https://github.com/metabase/representations)
- [Metabase Database Metadata Format](https://github.com/metabase/database-metadata)
- [Agent skills](https://github.com/metabase/agent-skills)
- [MCP server](./mcp.md) — for agents that need live metadata lookups outside the file-based workflow.
