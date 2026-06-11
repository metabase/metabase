---
title: "Serialization"
summary: How to export and import Metabase content between instances using serialization. Useful for version control, staging environments, and duplicating assets.
redirect_from:
  - /docs/latest/enterprise-guide/serialization
---

# Serialization

{% include plans-blockquote.html feature="Serialization" %}

Serialization lets you export the contents of one Metabase and import them into another Metabase. It's useful when you run multiple Metabases, like separate instances for testing and production, or a Metabase per office or region.

- **Export** will serialize the contents of your source Metabase as YAML files.
- **Import** will read those exported YAML files and create or update those serialized items in the target Metabase.

## Serialization format

The [Metabase Representation Format](https://github.com/metabase/representations) repository contains the full specification for the YAML format used by serialization, including schemas for each entity type, examples, and an [NPM validation package](https://www.npmjs.com/package/@metabase/representations) you can use to validate YAML files.

## Serialization use cases

- **Staging environments**. Enable a staging-to-production workflow for important dashboards by exporting from a staging instance of Metabase and then importing them into your production instance(s).
- **Version control**. Check the exported files into version control and audit changes to them, as the YAML files contained within the export are pretty readable. For a built-in Git workflow with push/pull from the Metabase UI, see [Remote Sync](./remote-sync.md).
- **Duplicating assets to other Metabases**. Export the "template" data from a source Metabase and import them to one or more target instances.

Check out our guides for:

- [Running multiple environments](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/multi-env)
- [Setting up git-based workflow](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/git-based-workflow)

## Importing and exporting your Metabase content

There are two ways to run these `export` and `import` commands:

- [Using CLI commands](#serialization-with-cli-commands)
- [Through the API](#serialization-via-the-api)

If you're on Metabase Cloud, the API endpoints are your only option.

## How export works

- [What gets exported](#what-gets-exported)
- [General Metabase settings that get exported](#general-metabase-settings-that-are-exported)
- [Customize what gets exported](#customize-what-gets-exported)
- [Example of a serialized question](#example-of-a-serialized-question)
- [Metabase uses Entity IDs to identify and reference items](#metabase-uses-entity-ids-to-identify-metabase-items)

### What gets exported

Metabase will only export the following entities:

- Collections (but personal collections don't get exported unless you explicitly specify them with the [Select collections](#select-collections) option)
- Dashboards
- Questions (cards)
- Transforms (including tags and jobs)
- Documents (without comments)
- Actions
- Models
- Metrics
- Snippets
- Data model and table metadata
- Segments
- Measures
- Glossary entries (data definitions)
- Public sharing settings for questions and dashboards
- [General Metabase settings](#general-metabase-settings-that-are-exported)
- Events and timelines
- Notification channels (email and webhook destinations used by alerts and subscriptions)
- Metabot configuration (AI assistant settings and prompts)
- Python libraries (shared Python modules used by transforms)
- Database connection strings (only if specified through the [Include database connection details](#include-database-connection-details) option)

All other entities—including users, groups, permissions, alerts, subscriptions, document comments—won't get exported. Those entities are tied to user accounts, and therefore aren't portable between Metabases.

### General Metabase settings that are exported

Here's the list of the general settings Metabase exports in the `settings.yaml` file. For more on Metabase settings, see [Configuring Metabase](../configuring-metabase/start.md).

```
aggregated-query-row-limit
allowed-iframe-hosts
application-colors
application-favicon-url
application-font
application-font-files
application-logo-url
application-name
available-fonts
available-locales
available-timezones
breakout-bins-num
csv-field-separator
custom-formatting
custom-geojson
custom-geojson-enabled
custom-homepage
custom-homepage-dashboard
default-maps-enabled
disable-cors-on-localhost
email-max-recipients-per-second
embedded-metabot-enabled?
embedding-homepage
embedding-hub-production-embed-snippet-created
embedding-hub-sso-auth-manual-tested
embedding-hub-test-embed-snippet-created
enable-embedding
enable-nested-queries
enable-pivoted-exports
enable-sandboxes?
enable-whitelabeling?
enable-xrays
gsheets
hide-embed-branding?
humanization-strategy
landing-page
landing-page-illustration
landing-page-illustration-custom
loading-message
login-page-illustration
login-page-illustration-custom
metabot-chat-system-prompt
metabot-enabled?
metabot-icon
metabot-limit-reset-rate
metabot-limit-unit
metabot-name
metabot-nlq-system-prompt
metabot-quota-reached-message
metabot-show-illustrations
metabot-sql-system-prompt
native-query-autocomplete-match-style
no-data-illustration
no-data-illustration-custom
no-object-illustration
no-object-illustration-custom
non-table-chart-generated
persisted-models-enabled
report-timezone
report-timezone-long
report-timezone-short
search-typeahead-enabled
setup-embedding-autoenabled
setup-license-active-at-setup
show-homepage-data
show-homepage-pin-message
show-homepage-xrays
show-metabot
show-sdk-embed-terms
show-simple-embed-terms
show-static-embed-terms
site-locale
site-name
source-address-header
start-of-week
subscription-allowed-domains
synchronous-batch-updates
system-timezone
unaggregated-query-row-limit
```

### Customize what gets exported

You can customize what gets exported — select specific collections, exclude settings or the data model, include field values or database connection details, and more. The same options are available through both the CLI and the API; only the syntax differs.

See [Export options](#export-options) for the full list.

### Example of a serialized question

Questions are stored as YAML files inside their parent collection folder. For examples and a complete spec, see the [Metabase Representation Format](https://github.com/metabase/representations).

Some things to keep in mind when reading or editing exported YAML:

- To preserve a native query's multi-line format, remove trailing whitespace from native queries. If your native query has trailing whitespace, YAML will convert your query to a single string literal (which only affects presentation, not functionality).
- To keep exported files compact, Metabase omits fields from the YAML when their values match the default. For example, `archived` defaults to `false`, so it won't appear unless the item is archived. Top-level fields with `null` values are also omitted.
- Fields prefixed with `lib/` (like `lib/type`, `lib/source`) are internal metadata that Metabase generates during export. You don't need to provide or edit them when hand-writing YAML — see the [Metabase Representation Format spec](https://github.com/metabase/representations) for which fields are required vs. informational.

### Metabase uses Entity IDs to identify Metabase items

Metabase assigns a unique Entity ID to every Metabase item (a dashboard, question, etc.). These Entity IDs are in addition to the sequential IDs Metabase generates that you'll see in URLs. Entity IDs use the [NanoID format](https://github.com/ai/nanoid), and are stable across Metabases. By "stable" we mean that you can, for example, export a dashboard with an entity ID from one Metabase, and import that dashboard into another Metabase and have that dashboard use the same Entity ID, even though the item is now in two different Metabase instances.

To get an item's Entity ID in Metabase:

1. Visit the item in Metabase.
2. Click on the info button.
3. In the overview tab, copy the Entity ID.

You can also see the Entity IDs of items in the exported YAML files in the `entity_id` field. This ID also appears in the `serdes/meta → id` field (these IDs must match).

Metabase uses simplified versions of entity names for file and directory names in exports. Names are lowercased, and special characters are replaced with underscores. Names are also truncated for filesystem compatibility.

```
products_by_week.yaml
accounts_model.yaml
converted_customers.yaml
```

If two entities in the same folder share the same name after simplification, Metabase appends a numeric suffix to disambiguate:

```
products_by_week.yaml
products_by_week_2.yaml
```

### Entity IDs work with embedding

Metabase supports working with [Entity IDs](#metabase-uses-entity-ids-to-identify-metabase-items) for questions, dashboards, and collections in [Guest embedding](../embedding/guest-embedding.md), [Modular embedding](../embedding/modular-embedding.md), [SDK](../embedding/sdk/introduction.md), and [Full app embedding](../embedding/full-app-embedding.md).

A high-level workflow for using Entity IDs when embedding Metabase in your app would look something like:

1. Create a dashboard in a Metabase running locally on your machine.
2. Embed the dashboard in your app locally using the Entity ID in your application code.
3. Export your Metabase changes to YAML files via serialization.
4. Import your Metabase changes (the exported YAML files) to your production Metabase.
5. Since the Entity ID remains the same in the production Metabase, you can just push the code in your app to production, and the code will refer to the right dashboard.

### Databases, schemas, tables, and fields are identified by name

By default, Metabase exports some database and data model settings. Exports exclude database connection strings by default. You can [explicitly include database connection strings](#include-database-connection-details). You can also choose to exclude the data model entirely.

Metabase serializes databases and tables in the `databases` directory. It will include YAML files for every database, table, field, segment, and metric.

Databases, tables, and fields are referred to by their names (unlike Metabase-specific items, which are [referred to by Entity IDs](#metabase-uses-entity-ids-to-identify-metabase-items)).

For example, exported YAML has several keys that reference the database by name:

```yaml
database_id: Sample PostgreSQL
---
dataset_query:
  database: Sample PostgreSQL
```

## How import works

Metabase will read the imported YAML files and look for [Entity IDs](#metabase-uses-entity-ids-to-identify-metabase-items) to figure out which items to create or overwrite. Imports _only_ create or overwrite items; they never delete items from the target instance.

- If you import an item with an [`entity_id`](#metabase-uses-entity-ids-to-identify-metabase-items) that doesn't exist in your target Metabase, Metabase will create a new item.
- If you import an item with an `entity_id` that already exists in your target Metabase, the import will overwrite the existing item. In particular, this means that if you export a question, then make a change in an exported YAML file — like rename a question by directly editing the `name` field — and then import the edited file back, Metabase will try to apply the changes you made to the YAML.
- If you import an item with a blank `entity_id`, Metabase will create a new item. Any `serdes/meta → id` will be ignored in this case.
- All items and data sources referenced in YAML must either exist in the target Metabase already, or be included in the import. For example, if an exported YAML has the field `collection_id: onou5H28Wvy3kWnjxxdKQ`, then the collection `onou5H28Wvy3kWnjxxdKQ` must already exist in the target instance, or there must be a YAML file with the export of a collection that has this ID.

## Export options

Export options let you customize what Metabase includes in an export. Every option works with both the [API](#serialization-via-the-api) and the [CLI](#serialization-with-cli-commands) — only the syntax differs.

- For the CLI, flags go after the `export` command (for example, `metabase.jar export my_export --no-settings`).
- For the API, options are URL query parameters appended to `POST /api/ee/serialization/export?...`.

You can combine options by chaining them (`&` in URLs, multiple flags on the command line).

### Select collections

- **CLI:** `-c, --collection <ID[,ID,...]>`
- **API:** `collection=<ID>` (repeat to add more)

Type: Integer (comma-separated list for CLI; repeated parameter for API).

By default, Metabase includes all collections in the export except for personal collections. To include personal collections, add each one by numeric ID — there's no option to include all personal collections at once.

You can find a collection ID in its URL. For example, a collection at `your-metabase.com/collection/42-terraforming-progress` has the ID `42`.

This option works the same regardless of a collection's namespace. Metabase determines the output directory (`collections/main/`, `collections/snippets/`, or `collections/transforms/`) from the collection's own namespace property, not from the ID you pass.

Examples:

CLI (include collections 1, 2, and 3):

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar export export_name --collection 1,2,3
```

API (include collections 1 and 2):

```
POST http://localhost:3000/api/ee/serialization/export?collection=1&collection=2
```

### Skip all collections

- **CLI:** `-C, --no-collections`
- **API:** `all_collections=false`

Type: Boolean.

Default: Collections are included, unless you explicitly specify a subset with [`--collection` / `collection`](#select-collections).

Excludes all content in collections from the export. Useful when you only want to export settings, data model, or other non-collection content.

### Skip settings

- **CLI:** `-S, --no-settings`
- **API:** `settings=false`

Type: Boolean.

Default: Settings are included.

Excludes the `settings.yaml` file that contains [site-wide settings](#general-metabase-settings-that-are-exported).

### Skip data model

- **CLI:** `-D, --no-data-model`
- **API:** `data_model=false`

Type: Boolean.

Default: Data model is included.

Excludes [table metadata](../data-studio/managing-tables.md) settings, which admins define in **Data Studio > Data structure**. Excluding the data model is useful for subsequent exports where you only want content changes.

### Include field values

- **CLI:** `-f, --include-field-values`
- **API:** `field_values=true`

Type: Boolean.

Default: Field values are excluded.

Includes sample values for fields, which Metabase uses to present dropdown menus. Excluded by default to keep exports compact.

### Include database connection details

- **CLI:** `-s, --include-database-secrets`
- **API:** `database_secrets=true`

Type: Boolean.

Default: Database connection details are excluded.

Includes database connection details (including the database username and password) in plain text. Use with caution. If you don't include this option, you'll need to manually input the credentials in the target Metabase.

### Output directory name

- **CLI:** positional argument (required): `export <dir_name>`
- **API:** `dirname=<name>`

Type: String.

Default (API): `<instance-name>-<YYYY-MM-dd_HH_mm>`. For the CLI, the directory name is required. There's no default.

Sets the name of the directory that holds the exported YAML files.

## Serialization via the API

> Just like the CLI serialization commands, these endpoints are only available for [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

You can import and export serialized Metabase data via Metabase's API, which makes serialization possible for [Metabase Cloud](https://www.metabase.com/cloud/) deployments.

There are two endpoints:

- `POST /api/ee/serialization/export`
- `POST /api/ee/serialization/import`

> We use `POST`, not `GET`, for the `/export` endpoint. The export operation does not modify your Metabase, but it's long and intensive, so we use `POST` to prevent accidental exports.

> The `/export` endpoint streams its response, so long exports won't time out. The `/import` endpoint is still synchronous — for very large imports, the request can time out before the import finishes. If that happens, check the server logs to see whether the import completed on the backend.

See [How export works](#how-export-works), [How import works](#how-import-works), [Export options](#export-options), and [Serialization best practices](#serialization-best-practices) for general information about serialization.

### Passing export options via the API

Append options as URL query parameters. For example, to exclude all collections:

```
POST http://localhost:3000/api/ee/serialization/export?all_collections=false
```

To combine multiple options, chain them with `&`. For example, to exclude both settings and the data model:

```
POST http://localhost:3000/api/ee/serialization/export?data_model=false&settings=false
```

To select specific collections, repeat the `collection` parameter:

```
POST http://localhost:3000/api/ee/serialization/export?collection=1&collection=2
```

See [Export options](#export-options) for the full list.

### You must compress your files when serializing via API calls

To keep file sizes over the network under control, both the `export` and `import` endpoints expect GZIP-compressed Tar files (`.tgz`).

#### Compress a directory

To compress a directory (e.g., a directory named `metabase_data`).

```sh
tar -czf  metabase_data.tgz metabase_data
```

#### Extract a directory

To extract/unzip a directory:

```sh
tar -xvf  metabase_data.tgz
```

## Serialization workflow example

Here's a typical serialization export/import setup with default settings via the API endpoints.

### Step 1: Set up an API key

1. Create an [API key](../people-and-groups/api-keys.md).
2. Assign the key to the Admin group.

### Step 2: Export

1. Send a `curl` request to export data:

   ```sh
   curl \
     -H 'X-API-Key: YOUR_API_KEY' \
     -X POST 'https://your-metabase-url/api/ee/serialization/export' \
     -o metabase_data.tgz
   ```

   substituting `YOUR_API_KEY` with your API key and `your-metabase-url` with the URL of your Metabase instance.

   This command will download the files as a GZIP-compressed Tar file named `metabase_data.tgz`.

2. Unzip the compressed file:

   ```sh
   tar -xvf metabase_data.tgz
   ```

   The extracted directory will be called something like `<instance-name>-<YYYY-MM-dd_HH_mm>`, with the instance name, date, and time of the export.

### Step 3: Import

1. Compress the directory containing serialized Metabase application data.

   Let's say you have your YAML files with Metabase application data in a directory called `metabase_data`. Before importing those files to your target Metabase, you'll need to compress those files.

   ```sh
   tar -czf metabase_data.tgz metabase_data
   ```

2. POST to `/api/ee/serialization/import`.

   From the directory where you've stored your GZIP-compressed file, run:

   ```sh
   curl -X POST \
     -H 'X-API-Key: YOUR_API_KEY' \
     -F 'file=@metabase_data.tgz' \
     'https://your-metabase-url/api/ee/serialization/import' \
     -o -
   ```

   substituting `YOUR_API_KEY` with your API key and `your-metabase-url` with your Metabase instance URL.
   The `-o -` option will output logs in the terminal.

   > If you import Metabase data into the same Metabase as you exported it from, you will overwrite your existing questions, dashboards, etc. See [How import works](#how-import-works).

## Serialization with CLI commands

> To serialize data on Metabase Cloud, use the [import and export API endpoints](#serialization-via-the-api)

Metabase provides [`export`](#exporting-with-cli) and [`import`](#importing-with-cli) CLI commands.

See [How export works](#how-export-works), [How import works](#how-import-works), [Export options](#export-options), and [Serialization best practices](#serialization-best-practices) for general information about serialization.

### Exporting with CLI

To export the contents of a Metabase instance, change into the directory where you're running the Metabase JAR and run:

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar export dir_name
```

Where `dir_name` can be whatever you want to call the directory.

### Customizing the export

To customize what's included in an export, add flags after the `export` command. See [Export options](#export-options) for the full list. You can combine multiple flags:

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar export my_export -S -D --include-field-values
```

You can also print all available flags with the `help` command:

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar help export
```

### Importing with CLI

To import exported artifacts into a Metabase instance, go to the directory where you're running your target Metabase (the Metabase you want to import into) and use the following command, where `path_to_export` is the path to the export that you want to import:

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar import path_to_export
```

### `import` options

Most options are defined when exporting data from a Metabase. To view a list of import flags, run:

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar help import
```

Which prints out:

```
import path & options
         Load serialized Metabase instance as created by the [[export]] command from directory `path`.
```

## Serialization best practices

### Avoid using serialization for backups

Serialization is _not_ meant to back up your Metabase.

See [Backing up Metabase](./backing-up-metabase-application-data.md).

If you're instead looking to do a one-time migration from the default H2 database included with Metabase to a MySQL/Postgres, then use the [migration guide instead](./migrating-from-h2.md).

### Use the same Metabase major version for source and target instance

Currently, serialization only works if source and target Metabase have the same major version. If you're using the CLI serialization commands, the version of the .jar file that you are using to run the serialization commands should match both the source and target Metabase versions as well.

Metabase will log a warning if the versions doesn't match, but it won't block the import.

### If you're using H2 as your application database, you'll need to stop Metabase before importing or exporting

Avoid using H2 as your application database! This note is just for when you're playing around with a local version of Metabase. If you're using Postgres or MySQL as your application database, you can import and export while your Metabase is still running, no problemo.

### You'll need to manually add license tokens

Metabase excludes your license token from exports, so if you're running multiple environments of Metabase Enterprise Edition, you'll need to manually add your license token to the target Metabase(s), either via the [Metabase user interface](../installation-and-operation/activating-the-enterprise-edition.md), or via an [environment variable](../configuring-metabase/environment-variables.md#mb_premium_embedding_token).

### Metabase adds logs to exports and imports

- Exports: Metabase adds logs to the compressed directory as `export.log`.
- Imports: You can add the `-o -` flag to export logs directly into the terminal, or `-o import.log` to save to a file.

## Other uses of serialization

Serialization is intended for version control, staging-to-production workflows, and duplicating assets to other Metabase instances. While it's possible to use serialization for other use cases (like duplicating assets _within_ a single instance), we don't officially support these use cases.

We're providing some directions on how to approach these unsupported use cases, but you should use them at your own risk. We strongly recommend that you test any process involving serialization on a non-production instance first, and reach out to [help@metabase.com](mailto:help@metabase.com) if you have any questions.

### Using serialization for duplicating content within the same Metabase

> Duplicating assets via serialization, while technically possible, isn't officially supported, so do so at your own risk. The risk here being that you may have to manage long chains of dependencies, which can make it more likely you'll forget to edit an entity ID, or overwrite an entity ID that already exists. So make sure you're doing backups and checking your changes into version control.

Using serialization to duplicate content is not trivial, because you'll need to wrangle [Entity IDs](#metabase-uses-entity-ids-to-identify-metabase-items) for all the items you want to duplicate — _and_ the IDs for all the items that are related to those items — to avoid overwriting existing data.

Before starting this perilous journey, review [how export works](#how-export-works) and [how import works](#how-import-works), and contact [help@metabase.com](mailto:help@metabase.com) if you have any questions.

You'll need to keep in mind:

- Importing an item with an Entity ID that already exists will overwrite the existing item. To use an existing YAML file to create a new item, you'll need to either a) create a new Entity ID or b) clear the Entity ID.
- Two items cannot have the same Entity IDs.
- `entity_id` and `serdes/meta → id` fields in the YAML file should match.
- If the `entity_id` and `serdes/meta → id` fields in a YAML file for an item are blank, Metabase will create a new item with a new Entity ID.
- All items and data sources referenced by an item should either already exist in target Metabase or be included in the import.

  For example, a collection can contain a dashboard that contains a question that is built on a model that references a data source. All of those dependencies must be either included in the import or already exist in the target instance.

  This means that you might need a multi-stage export/import: create some of the items you need (like collections) in Metabase first, export them to get their Entity IDs, then export the stuff that you want to duplicate and use those IDs in items that reference them.

For example, to duplicate a collection that contains _only_ questions that are built directly on raw data (not on models or other saved questions), without changing the data source for the questions, you can use a process like this:

1. In Metabase, create a "template" collection and add the items you'd like to duplicate.
2. In Metabase, create a new collection which will serve as the target for duplicated items.
3. Export the template collection and the target collection (you can use the [Select collections](#select-collections) option to export only a few collections).
   The YAML files for template questions in the export will have their own Entity IDs and reference the Entity ID of the template collection.
4. Get the Entity ID of the target collection from its export.
5. In the YAML files for questions in the template collection export:

   - Clear the values for the fields `entity_id` and `serdes/meta → id` for questions. This will ensure that the template questions don't get overwritten, and instead Metabase will create new questions.
   - Replace `collection_id` references to the template collection with the ID of the new collection

6. Import the edited files.

This process assumes that your duplicated questions will all use the same data source. You can combine this with [switching the data source](#using-serialization-to-swap-the-data-source-for-questions-within-one-instance) to use a different data source for every duplicated collection.

If you want to create multiple copies of a collection at once, then instead of repeating this process for every copy, you could create your own target Entity IDs (they can be any string that uses the [NanoID format](https://github.com/ai/nanoid)), duplicate all the template YAML files, and replace template Entity IDs and any references to them with your created Entity IDs.

If your collections contains dashboards, models, and other items that can add dependencies, this process can become even more complicated -- you need to handle every dependency. We strongly recommend that you first test your serialization on a non-production Metabase, and reach out to [help@metabase.com](mailto:help@metabase.com) if you need any help.

### Using serialization to swap the data source for questions within one instance

> We've since built an official solution for situations where you want to build one dashboard and change the database it queries based on who's viewing it. Check out [Database routing](../permissions/database-routing.md).

Read the blockquote above before proceeding, as that's probably what you're looking for. We're leaving the docs below as a backup in case [database routing](../permissions/database-routing.md) doesn't solve your problem.

If you want to switch _every_ question built on database A to use database B instead, and database B has exactly the same schema as database A, you don't need to use serialization: you can just swap the connection string in **Admin > Databases**.

If you want to change the data source for some of the questions in your Metabase — for example, just for questions in a single collection - you can serialize the questions manually, then edit the exported YAML files.

Your databases must have the same engine, and ideally they should have the same schema.

You'll need to keep in mind:

- Databases, tables and fields are [referred to in Metabase by name](#databases-schemas-tables-and-fields-are-identified-by-name)
- Database connection details are not exported by default. To export database connection details, you'll need to enable the [Include database connection details](#include-database-connection-details) option.
- Databases, tables and fields referenced by an item should either already exist in the target Metabase, or be included in the import.

For example, if you want to switch all questions in the `Movie reviews` collection to use the `Romance` database instead of the `Horror` database, and _both databases have the same schema_, you could follow a process like this:

1. In Metabase, add a new database connection in **Admin > Databases** and name it `Romance`.
2. Export the collection `Movie reviews`.

   You can tell Metabase to export a single collection, or you can export all the collections and just work with files in the folder for the `Movie reviews` collection

3. In the YAML files for items from this collection, replace all references to `Horror` database with references to `Romance`
4. Import the edited files.

Importing will overwrite the original questions. If you're looking to create new questions that use a different data source, you can combine this process with [Using serialization for duplicating assets](#using-serialization-for-duplicating-content-within-the-same-metabase).

This process assumes that your new data source has exactly the same schema. If the schema is different, then you will also need to replace all references to all tables and fields. This process can be complicated and error-prone, so we strongly recommend that you test your serialization on a non-production instance first, and reach out to [help@metabase.com](mailto:help@metabase.com) if you need any help.

## Migrating from the old serialization commands

If you're upgrading from Metabase version 46.X or older, here's what you need to know:

- The `export` command replaces the `dump` command.
- The `import` command replace the `load` command.

Starting with Metabase 60, the export format changed:

- File and directory names now use human-readable names (like `accounts_model.yaml`) instead of Entity ID prefixes. Entity IDs are still present inside each YAML file.
- Fields with default values (like `archived: false`) and null-valued fields are omitted from the YAML output, keeping files compact.
- The file tree organizes collections by namespace (`main/`, `snippets/`, `transforms/`), and entities are stored inside their parent collection folder.
- To serialize personal collections, you just need to include the personal collection IDs in the list of comma-separated IDs following the `-c` option (short for `--collection`).

If you've written scripts to automate serialization, you'll need to:

- Reserialize your Metabase using the upgraded Metabase (which uses the new `export` and `import` commands). Note that serialization will only work if you export and import your Metabase using the same Metabase version.
- Update those scripts with the new commands. See the new [export options](#export-options).
- If your scripts do any post-processing of the exported YAML files, you may need to update your scripts to accommodate the slightly different directory and YAML file structures.

## Let us know how we can improve serialization

We're interested in how we can improve serialization to suit your workflow. [Upvote an existing issue](https://github.com/metabase/metabase/issues?q=is%3Aissue+is%3Aopen+serialization+label%3AOperation%2FSerialization) to let us know it's important to you. If a relevant issue doesn't yet exist, please create one and tell us what you need.

## Further reading

- [Remote Sync](./remote-sync.md)
- [Serialization tutorial](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/serialization)
- [Database routing](../permissions/database-routing.md)
- [Multiple environments](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/multi-env)
- [Setting up a git-based workflow](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/git-based-workflow)
- Need help? Contact [support@metabase.com](mailto:support@metabase.com)
