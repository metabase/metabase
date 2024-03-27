---
title: "Serialization"
redirect_from:
  - /docs/latest/enterprise-guide/serialization
---

# Serialization

{% include plans-blockquote.html feature="Serialization" %}

Once you really get rolling with Metabase, it's often the case that you'll have more than one Metabase instance spun up. You might have a couple of testing or development instances and a few production ones, or maybe you have a separate Metabase per office or region.

To help you out in situations like this, Metabase has a serialization feature which lets you create an _export_ of the contents of a Metabase that can then be _imported_ into one or more Metabases.

> We're interested in how we can improve serialization to suit your workflow. [Upvote an existing issue](https://github.com/metabase/metabase/issues?q=is%3Aissue+is%3Aopen+serialization+label%3AOperation%2FSerialization) to let us know it's important to you. If a relevant issue doesn't yet exist, please create one and tell us what you need.

## Serialization use cases

- **Staging environments**. Enable a staging-to-production workflow for important dashboards by exporting from a staging instance of Metabase and then importing them into your production instance(s).
- **Version control**. Check the exported files into version control and audit changes to them, as the YAML files contained within the export are pretty readable.

## What gets exported

Metabase only includes some artifacts in its exports.

- Collections (except for personal collections, unless specified by the `--collection` flag)
- Dashboards
- Saved questions
- Actions
- Models
- SQL Snippets
- Table Metadata settings
- Segments and Metrics defined in the Table Metadata
- Public sharing settings for questions and dashboards
- [General Metabase settings](#the-general-settings-that-metabase-exports)
- Database connection settings
- Events and timelines

Metabase will export its artifacts to a directory of YAML files. The export includes:

- A `settings.yaml` file that includes some basic, [Metabase-wide settings](#the-general-settings-that-metabase-exports)
- Directories that contain YAML files for various Metabase entities

An example export could include the following directories, depending on what you exported:

- actions
- collections
- databases

In the `collections/cards` directory, you'll see that Metabase prefixes individual files with IDs to disambiguate entities that share the same name:

```
IA96oUzmUbYfNFl0GzhRj_accounts_model.yaml
KUEGiWvoBFEc5oGQCEnPg_converted_customers.yaml
qzNa8ZeFgFXrrIoF2g8m4_accounts_model_detail.yaml
```

## Example question

Questions can be found in the `cards` directory of a collection directory. Here's an example card YAML file for a native question (a question written in SQL):

```
description: The number of plans by referral source.
archived: false
collection_position: null
table_id: null
result_metadata: null
database_id: Sample Database
enable_embedding: false
collection_id: onou5H28Wvy3kWnjxxdKQ
query_type: native
name: Plan counts by source
creator_id: jeff@metabase.com
made_public_by_id: null
embedding_params: null
cache_ttl: null
dataset_query:
  type: native
  native:
    query: |-
      SELECT count(*),
             PLAN,
             SOURCE
      FROM accounts
      WHERE SOURCE IS NOT NULL
      GROUP BY PLAN,
               SOURCE
    template-tags: {}
  database: Sample Database
parameter_mappings: []
serdes/meta:
- model: Card
  id: 17p_H8e2OpHGGJVxqg4sN
  label: plan_counts_by_source
display: table
entity_id: 17p_H8e2OpHGGJVxqg4sN
collection_preview: true
visualization_settings:
  table.pivot_column: PLAN
  table.cell_column: COUNT(*)
  column_settings: null
parameters: []
dataset: false
created_at: '2023-05-22T14:32:28.124325'
public_uuid: null
```

## If you're using H2 as your application database, you'll need to stop Metabase before importing or exporting

If you're using Postgres or MySQL as your application database, you can import and export while your Metabase is still running.

## Exporting a Metabase

> To serialize data on Metabase Cloud, use the [import and export API endpoints](#serializing-metabase-via-the-api)

To export the contents of a Metabase instance, change into the directory where you're running the Metabase JAR and run:

```
java -jar metabase.jar export export_name
```

Where `export_name` can be whatever you want to call the directory.

## Export options

To view a list of `export` options, use the `help` command:

```
java -jar metabase.jar help export
```

Which will run and then print something like:

```
export path & options
	 Serialize Metabase instance into directory at `path`.
	 Options:
	   -c, --collection ID             Export only specified ID; may occur multiple times.
	   -C, --no-collections            Do not export any content in collections.
	   -S, --no-settings               Do not export settings.yaml
	   -D, --no-data-model             Do not export any data model entities; useful for subsequent exports.
	   -f, --include-field-values      Include field values along with field metadata.
	   -s, --include-database-secrets  Include database connection details (in plain text; use caution).
```

### `--collection`

By default, Metabase will include all collections (except for personal collections) in the export. To include personal collections, you must explicitly add them with the `--collection` flag.

The `--collection` flag (alias `-c`) lets you specify by ID one or more collections to include in the export. You can find the collection ID in the collection's URL, e.g., for a collection at: `your-metabase.com/collection/42-terraforming-progress`, the ID would be `42`.

If you want to specify multiple collections, separate the IDs with commas. E.g.,

```
java -jar metabase.jar export export_name --collection 1,2,3
```

### `--no-collections`

The `--no-collections` flag (alias `-C`) tells Metabase to exclude all collections from the export.

### `--no-settings`

The `--no-settings` flag (alias `-S`) tells Metabase to exclude the `settings.yaml` file that includes site-wide settings, which is exported by default.

### `--no-data-model`

The `--no-data-model` flag (alias `-D`) tells Metabase to exclude the Table Metadata settings from the export. Admins define the metadata settings in the [Table Metadata](../data-modeling/metadata-editing.md) tab of the Admin settings.

### `--include-field-values`

The `--include-field-values` flag (alias `-f`) tells Metabase to include the sample values for field values, which Metabase uses to present dropdown menus. By default, Metabase excludes these sample field values.

### `--include-database-secrets`

The `--include-database-secrets` flag (alias `-s`) tells Metabase to include connection details, including the database user name and password. By default, Metabase excludes these database connection secrets. If you don't use this flag, you'll need to manually input the credentials in the target Metabase.

## Importing to a Metabase

To import exported artifacts into a Metabase instance, go to the directory where you're running your target Metabase (the Metabase you want to import into) and use the following command, where `path_to_export` is the path to the export that you want to import:

```
java -jar metabase.jar import path_to_export
```

Currently, you can only import exported artifacts into a Metabase instance that was created from the same version of Metabase.

### You'll need to manually add license tokens

Metabase excludes your license token from exports, so if you're running multiple environments of Metabase Enterprise Edition, you'll need to manually add your license token to the target Metabase(s), either via the [Metabase user interface](https://www.metabase.com/docs/latest/paid-features/activating-the-enterprise-edition), or via an [environment variable](../configuring-metabase/environment-variables.md#mb_premium_embedding_token).

## Import options

Most options are defined when exporting data from a Metabase. To view a list of import flags, run:

```
java -jar metabase help import

```

Which prints out:

```
import path & options
         Load serialized Metabase instance as created by the [[export]] command from directory `path`.
```

## Avoid using serialization for backups

Just a note: serialization is _not_ meant to back up your Metabase.

See [Backing up Metabase](./backing-up-metabase-application-data.md).

If you're instead looking to do a one-time migration from the default H2 database included with Metabase to a MySQL/Postgres, then use the [migration guide instead](./migrating-from-h2.md).

### The general settings that Metabase exports

A list of the general settings Metabase exports in the `settings.yaml` file.

```
humanization-strategy
native-query-autocomplete-match-style
site-locale
report-timezone-short
report-timezone-long
application-name
enable-xrays
show-homepage-pin-message
source-address-header
enable-nested-queries
custom-geojson-enabled
start-of-week
custom-geojson
available-timezones
unaggregated-query-row-limit
aggregated-query-row-limit
hide-embed-branding?
search-typeahead-enabled
enable-sandboxes?
application-font
available-locales
landing-page
enable-embedding
application-colors
application-logo-url
application-favicon-url
show-homepage-xrays
show-metabot
enable-whitelabeling?
show-homepage-data
site-name
application-font-files
loading-message
report-timezone
persisted-models-enabled
enable-content-management?
subscription-allowed-domains
breakout-bins-num
available-fonts
custom-formatting
```

For more on Metabase settings, see [Configuring Metabase](../configuring-metabase/start.md)

## Drop entity IDs

Before exporting, you can also run a Metabase command to [drop entity IDs](./commands.md#drop-entity-ids).

## Serializing Metabase via the API

> Just like the CLI serialization commands, these endpoints are only available for [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

You can import and export serialized Metabase data via Metabase's API, which makes serialization possible for [Metabase Cloud](https://www.metabase.com/cloud/) deployments.

There are two endpoints:

- `/api/ee/serialization/export`
- `/api/ee/serialization/import`

For now, these endpoints are synchronous. If the serialization process takes too long, the request can time out. In this case, we suggest using the CLI commands.

### Use parameters to customize what Metabase exports

You can append optional parameters to tell Metabase what to include or exclude from the export. You can also combine parameters (excluding, of course, `all_collections` and selective collections).

So, assuming you're testing on `localhost`, and you want to exclude all collections from the export, you'd format the URL like so:

```html
http://localhost:3000/api/ee/serialization/export?all_collections=false
```

You can include multiple parameters, separated by `&`. For example, to exclude both the settings and the data model from the export:

```html
http://localhost:3000/api/ee/serialization/export?data_model=false&settings=false
```

## Example export params

### `collection`

Type: Array of integers.

Default value: Metabase will export all collections, unless `all_collections` is set to `false`.

To select which collections to export, include the collection IDs. For example, to include collections `1` and `2`:

```html
collection=1&collection=2
```

### `all_collections`

Type: Boolean

Default: `true` (unless you specify a subset of collections with `collection`).

To exclude all collections:

```html
all_collections=false
```

### `settings`

Type: Boolean.

Default: `true`.

To exclude settings:

```html
settings=false
```

### `data_model`

Type: Boolean.

Default: `true`.

To exclude the data model:

```
data_model=false
```

### `field_values`

Type: Boolean.

Default: `false`.

To include field values:

```
field_values=true
```

### `database_secrets`

Type: Boolean.

Default: `false`.

To include secrets:

```html
database_secrets=true
```

### `dirname`

Type: String.

Default: `<instance-name>-<YYYY-MM-dd_HH_mm>`

To specify a different directory:

```
dirname=name_of_your_directory
```

## You must compress your files when serializing via API calls

To keep file sizes over the network under control, both the `export` and `import` endpoints expect GZIP-compressed Tar files (`.tgz`).

### Compress a directory

To compress a directory (e.g., a directory named `metabase_data`).

```sh
tar -czf  metabase_data
```

### Extract a directory

To extract/unzip a directory:

```sh
tar -xvf  metabase_data.tgz
```

## Metabase adds logs to exports and imports

Exports: Metabase adds logs to the compressed directory as `export.log`.

Imports: You can add the `-o -` flag to export logs directly into the terminal, or `-o import.log` to save to a file.

### Example export request with `curl`

To export the contents of your Metabase, first set up an [API key](../people-and-groups/api-keys.md) and assign the key to the Admin group.

Then run:

```sh
  curl \
  -H 'x-api-key: YOUR_API_KEY' \
  -X POST 'http://localhost:3000/api/ee/serialization/export' \
  -o metabase_data.tgz
```

Substituting `YOUR_API_KEY` with your API key. This command will download the files as a GZIP-compressed Tar file named `metabase_data.tgz`.

You'll then need to unzip the compressed file:

```sh
tar -xvf metabase_data.tgz
```

The extracted directory will be called something like `metabase-yyyy-MM-dd_HH-mm`, with the date and time of the export.

### Example import request with `curl`

To import contents into your Metabase, first set up an [API key](../people-and-groups/api-keys.md) and assign the key to the Admin group.

Let's say you have your YAML files with Metabase application data in a directory called `metabase_data`. Before importing those files to your target Metabase, you'll need to compress those files.

```sh
tar -czf metabase_data.tgz metabase_data
```

Then post to the `/api/ee/serialization/import`. From the directory where you've stored your GZIP-compressed file, run:

```sh
curl -X POST \
-H 'x-api-key: YOUR_API_KEY' \
-F file=@metabase_data.tgz \
'http://localhost:3000/api/ee/serialization/import' \
-o -
```

Substituting `YOUR_API_KEY` with your API key. The `-o -` option will output logs in the terminal.

## Migrating from the old serialization commands

If you're upgrading from Metabase version 46.X or older, here's what you need to know:

- The `export` command replaces the `dump` command.
- The `import` command replace the `load` command.

A few other changes to call out:

- The exported YAML files have a slightly different structure:
  - Metabase will prefix each file with a 24-character entity ID (like `IA96oUzmUbYfNFl0GzhRj_accounts_model.yaml`).
  - The file tree is slightly different.
- To serialize personal collections, you just need to include the personal collection IDs in the list of comma-separated IDs following the `-c` option (short for `--collection`).

If you've written scripts to automate serialization, you'll need to:

- Reserialize your Metabase using the upgraded Metabase (which uses the new `export` and `import` commands). Note that serialization will only work if you export and import your Metabase using the same Metabase version.
- Update those scripts with the new commands. See the new [export options](#export-options).
- If your scripts do any post-processing of the exported YAML files, you may need to update your scripts to accommodate the slightly different directory and YAML file structures.

## Further reading

- [Serialization tutorial](https://www.metabase.com/learn/administration/serialization).
- [Setting up a git-based workflow](https://www.metabase.com/learn/administration/git-based-workflow).
- Need help? Contact [support@metabase.com](mailto:support@metabase.com).
