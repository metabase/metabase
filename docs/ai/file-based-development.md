---
title: File-based development
summary: Use a combination of agent skills and serialization to develop Metabase content with agents on your local file system.
---

# File-based development

{% include plans-blockquote.html feature="Serialization" %}

You can use AI to generate YAML files that serialize content like questions and dashboards, then import those items into Metabase.

## The file-based toolkit

We provide a set of tools for creating and editing Metabase content [serialized](../installation-and-operation/serialization.md) as YAML files.

- The [Metabase Representation Format](https://github.com/metabase/representations). This is a directory that includes a spec, schemas, and examples for all Metabase entities as YAML files: questions, dashboards, and so on.
- The [`metabase-representation-format` agent skill](https://github.com/metabase/agent-skills) for working with these YAML files.
- CLI commands and API endpoints to export and import content serialized in YAML.
- [MCP server](./mcp.md) to look up database metadata when creating the YAML files.

## Prerequisites

1. **Add the `metabase-representation-format` skill to your agent** so it understands the YAML schemas. See [Agent skills](https://github.com/metabase/agent-skills).

2. **Connect your agent to your Metabase's MCP server**. Your agent also needs a way to look up your database metadata (table names, fields, and sample values) so it can write questions and dashboards that point at real columns. Connect your agent to your Metabase's [MCP server](./mcp.md), which exposes tools like `search`, `get_table`, and `get_table_field_values`.

## Using AI to create Metabase content

Here's a basic workflow for creating Metabase content as YAML on your local machine, then importing that content into your development and production Metabases.

### 1. Create a git repo

Initialize a git repo with a README.md and an initial commit.

### 2. Check out a branch

Create a new branch to track your work.

```
git checkout -b your-branch-name
```

### 3. Export your production Metabase

You'll need to first export your

1. Create an [API key](../people-and-groups/api-keys.md).
2. Assign the key to the Admin group.
3. Send a `curl` request to export data:

   ```sh
   curl \
     -H 'X-API-Key: YOUR_API_KEY' \
     -X POST 'https://your-metabase-url/api/ee/serialization/export?data_model=false' \
     -o metabase_data.tgz
   ```

   substituting `YOUR_API_KEY` with your API key and `your-metabase-url` with the URL of your Metabase instance.

   The `data_model=false` query parameter excludes from the export, since the data model payload can be really large. Instead, your agent will use the MCP server to searh for the metadata it needs to generate the YAML files. See [Serialization](../installation-and-operation/serialization.md) for other export options.

   This command will download the files as a GZIP-compressed Tar file named `metabase_data.tgz`.

4. Unzip the compressed file:

   ```sh
   tar -xvf metabase_data.tgz
   ```

### 4. Commit the export

Commit the initial exported set of YAML files. If your AI goes off the rails, you can always revert to the original export.

### 5. Use AI to edit or create new content

Change into the directory with your serialized files and ask your agent to create whatever you want. Make sure your agent actually invokes the skills, otherwise the agent may not get the YAML format right.

Example prompt:

```
Use the metabase-representation-format skill and the Metabase MCP server to do the following by editing the YAML files in this directory:

1. Create a new collection called "File-based collection".
2. Create a new dashboard called "AI-created dashboard", saved to that collection.
3. Create a question called "AI counts products" that counts the number of products by category.
4. Add that question to the "AI-created dashboard".
```

Depending on how sophisticated your AI model is, you can also try more ambitious, open-ended requests:

```
Use the metabase-representation-format skill and the Metabase MCP server to analyze the data in the sample postgresql
database. Look at the orders, people, reviews, and products tables.

Create a dashboard with some questions that gives an overview of how the business is doing.
```

### 6. Validate the YAML files

Before importing, check your YAML files against the representation schemas. The `metabase-representation-format` skill should have the agent run the validator for you, but you can also run it yourself:

```
npx --yes @metabase/representations validate-schema
```

You can also set up a workflow to run the validator on pull requests. Here's an example, saved to `.github/workflows/schema-check.yml`:

```yaml
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

That way your team catches schema issues on the PR, before anyone imports the changes into Metabase.

### 7. Set up a development instance to check your work

Set up a Metabase instance to check your work. This Metabase should connect to the same data warehouse(s) your production Metabase connects to. A [config file](../configuring-metabase/config-file.md) will come in handy here.

We also recommend turning off the sample content and usage analytics, so they don't pollute the data model. If you're using a [docker compose file](../installation-and-operation/running-metabase-on-docker.md), add these [environment variables](../configuring-metabase/environment-variables.md):

```
MB_LOAD_SAMPLE_CONTENT: "false"
MB_INSTALL_ANALYTICS_DATABASE: "false"
```

### 8. Import the changes to your development Metabase

Import your changes to your development Metabase, and check that the import works and the content is as expected.

First, compress your directory of YAML files:

```
tar -czf metabase_data.tgz metabase_data
```

Then import that compressed file:

```
curl -X POST \
  -H 'X-API-Key: YOUR_API_KEY' \
  -F 'file=@metabase_data.tgz' \
  'https://your-metabase-url/api/ee/serialization/import' \
  -o -
```

The `-o -` flag writes the import response to stdout, so you can see whether the import succeeded and check any warnings.

Log in to this Metabase and check that the changes are as you expect.

#### Did your AI go off the rails?

Use git to restore your changes. Avoid re-exporting from your production to "reset" your directory. Exports will overwrite any edits you make to existing files, but exports _won't_ delete any new files your AI creates. So the best way to "reset" is to restore your YAMLs to the last known good commit.

### 9. Commit your changes

If all looks good, commit your changes. If you get any errors, give the error info to the agent in the same session and the agent should iron out any issues.

### 10. Import to your production Metabase

Import your changes via the API, or set up [remote sync](../installation-and-operation/remote-sync.md) so that your production instance pulls in the changes automatically.

## Deleting content

Since imports and exports _don't_ delete content, you'll need to delete that content in the Metabase application itself, AND update the YAML files as well.

1. Delete the content in your production Metabase (in the app's UI itself).
2. Export from your production Metabase to your repo.
3. Commit the changes so that the YAML files are updated. That way Metabase won't recreate the deleted items the next time you import your changes.

## Further reading

- [MCP server](./mcp.md)
- [Serialization](../installation-and-operation/serialization.md)
- [Agent skills](https://github.com/metabase/agent-skills)
