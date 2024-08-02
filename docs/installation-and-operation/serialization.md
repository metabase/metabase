---
title: "Serialization"
redirect_from:
  - /docs/latest/enterprise-guide/serialization
---

# Serialization

{% include plans-blockquote.html feature="Serialization" %}

Once you really get rolling with Metabase, it's often the case that you'll have more than one Metabase instance spun up. You might have a couple of testing or development instances and a few production ones, or maybe you have a separate Metabase per office or region.

To help you out in situations like this, Metabase has a serialization feature which lets you create an _export_ of the contents of a Metabase that can then be _imported_ into one or more Metabases.

**Export** will serialize the contents of your source Metabase as YAML files.

**Import** will read those exported YAML files and create or update items in the target Metabase based on the contents serialized in those YAML files.

There are two ways to run these `export` and `import` commands:

- [Using CLI commands](#serialization-with-cli-commands)
- [Through the API](#serialization-via-the-api).

> We're interested in how we can improve serialization to suit your workflow. [Upvote an existing issue](https://github.com/metabase/metabase/issues?q=is%3Aissue+is%3Aopen+serialization+label%3AOperation%2FSerialization) to let us know it's important to you. If a relevant issue doesn't yet exist, please create one and tell us what you need.

## Serialization use cases

- **Staging environments**. Enable a staging-to-production workflow for important dashboards by exporting from a staging instance of Metabase and then importing them into your production instance(s).
- **Version control**. Check the exported files into version control and audit changes to them, as the YAML files contained within the export are pretty readable.

Check out our guides for:

- [Running multiple environments](https://www.metabase.com/learn/administration/multi-env)
- [Setting up git-based workflow](https://www.metabase.com/learn/administration/git-based-workflow)

> Serialization isn't intended for use cases like duplicating assets or swapping data sources within the same Metabase instance. If you're using serialization for duplicating entities, check out [How export works](#how-export-works), [How import works](#how-import-works), and the directions for your use case in [Other uses of serialization](#other-uses-of-serialization)

## How export works

- [What gets exported](#what-gets-exported)
- [General Metabase settings that get exported](#general-metabase-settings-that-are-exported)
- [Customize what gets exported](#customize-what-gets-exported)
- [Example of a serialized question](#example-of-a-serialized-question)
- [Metabase uses Entity IDs to identify and reference items](#metabase-uses-entity-ids-to-identify-and-reference-metabase-items)

### What gets exported

Metabase will only include some artifacts in its exports:

- Collections (but personal collections don't get exported unless explicitly specified them through [export options](#customize-what-gets-exported))
- Dashboards
- Saved questions
- Actions
- Models
- SQL Snippets
- Data model and table metadata
- Segments and Metrics defined in the Table Metadata
- Public sharing settings for questions and dashboards
- [General Metabase settings](#general-metabase-settings-that-are-exported)
- Events and timelines
- Database connection strings (only if specified through [export options](#customize-what-gets-exported))
  (#customize-what-gets-exported).

Metabase will export its artifacts to a directory of YAML files. The export includes:

- Directories that contain YAML files for various Metabase entities.
  An example export could include the following directories, depending on what you exported and the contents of your Metabase:

  - actions
  - collections
    - cards
    - dashboards
    - timelines
  - databases

  When serializing through the API, the export directory [will be a compressed into a .tar.gz file](#you-must-compress-your-files-when-serializing-via-api-calls).

- A `settings.yaml` file that includes some [Metabase-wide settings](#general-metabase-settings-that-are-exported)

Database connection details are not included by default, so you but you can [configure your export](#customize-what-gets-exported) to include them.

### General Metabase settings that are exported

Here's the list of the general settings Metabase exports in the `settings.yaml` file. For more on Metabase settings, see [Configuring Metabase](../configuring-metabase/start.md).

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

### Customize what gets exported

You can customize what gets exported. You can tell Metabase:

- Export specific collections
- Do not export collections
- Do not export Metabase settings
- Do not export table metadata
- Include sample field values (excluded by default)
- Include database connection details (excluded by default)

See [export parameters in CLI commands](#export-options) or [export parameters in API calls](#api-export-parameters).

### Example of a serialized question

Questions can be found in the `cards` directory of a collection directory. Here's an example card YAML file for a question written with SQL that uses a field filter and has an area chart visualization:

```yml
name: Products by week
description: Area chart of products created by week
entity_id: r6vC_vLmo9zG6_r9sAuYG
created_at: "2024-05-08T19:10:24.348808Z"
creator_id: admin@metabase.local
display: area
archived: false
collection_id: onou5H28Wvy3kWnjxxdKQ
collection_preview: true
collection_position: null
query_type: native
dataset: false
cache_ttl: null
database_id: Sample Database
table_id: null
enable_embedding: false
embedding_params: null
made_public_by_id: null
public_uuid: null
parameters:
  - default:
      - Gizmo
    id: c37d2f38-05fa-48c4-a208-19d9dba803c6
    name: Pick a category
    slug: category_filter
    target:
      - dimension
      - - template-tag
        - category_filter
    type: string/=
parameter_mappings: []
dataset_query:
  database: Sample Database
  native:
    query: |-
      SELECT
        category,
        date_trunc ('week', created_at) AS "Week",
        count(*) AS "Count"
      FROM
        products
      WHERE
        {{category_filter}}
      GROUP BY
        category,
        "Week"
    template-tags:
      category_filter:
        default:
          - Gizmo
        dimension:
          - field
          - - Sample Database
            - PUBLIC
            - PRODUCTS
            - CATEGORY
          - base-type: type/Text
        display-name: Pick a category
        id: c37d2f38-05fa-48c4-a208-19d9dba803c6
        name: category_filter
        type: dimension
        widget-type: string/=
  type: native
result_metadata:
  - base_type: type/Text
    display_name: CATEGORY
    effective_type: type/Text
    field_ref:
      - field
      - CATEGORY
      - base-type: type/Text
    name: CATEGORY
    semantic_type: null
  - base_type: type/DateTime
    display_name: Week
    effective_type: type/DateTime
    field_ref:
      - field
      - Week
      - base-type: type/DateTime
    name: Week
    semantic_type: null
  - base_type: type/BigInteger
    display_name: Count
    effective_type: type/BigInteger
    field_ref:
      - field
      - Count
      - base-type: type/BigInteger
    name: Count
    semantic_type: type/Quantity
visualization_settings:
  column_settings: null
  graph.dimensions:
    - Week
    - CATEGORY
  graph.metrics:
    - Count
serdes/meta:
  - id: r6vC_vLmo9zG6_r9sAuYG
    label: products_created_by_week
    model: Card
initially_published_at: null
metabase_version: v1.49.7 (f0ff786)
type: question
```

### Metabase uses Entity IDs to identify and reference Metabase items

Metabase assigns a unique entity ID to every Metabase item (a dashboard, question, model, collection, etc.). Entity IDs use the [NanoID format](https://github.com/ai/nanoid).

You can see the entity IDs of items in the exported YAML files in the `entity_id` field. For example, in the [Example of a serialized question](#example-of-a-serialized-question), you'll see the Entity ID of that question:

```yaml
entity_id: r6vC_vLmo9zG6_r9sAuYG
```

This ID also appears in the `serdes/meta → id` field (these IDs must match):

```yaml
serdes/meta:
  - id: r6vC_vLmo9zG6_r9sAuYG
```

To disambiguate entities that share the same name, Metabase includes entity IDs in the file and directory names for exported entities.

```
r6vC_vLmo9zG6_r9sAuYG_products_by_week.yaml
IA96oUzmUbYfNFl0GzhRj_accounts_model.yaml
KUEGiWvoBFEc5oGQCEnPg_converted_customers.yaml
```

For example, in the [Example of a serialized question](#example-of-a-serialized-question) above, you can see the field `collection_id`:

```yaml
collection_id: onou5H28Wvy3kWnjxxdKQ
```

This ID refers to the collection where the question was saved. In a real export, you'd be able to find a YAML file for this collection whose name starts with its ID: `onou5H28Wvy3kWnjxxdKQ`.

### Databases, schemas, tables, and fields are identified by name

By default, Metabase exports some database and data model settings. Exports exclude database connection strings by default. You can [explicitly include database connection strings](#customize-what-gets-exported). You can also choose to exclude the data model entirely.

Metabase serializes databases and tables in the `databases` directory. It will include YAML files for every database, table, field, segment, and metric.

Databases, tables, and fields are referred to by their names (unlike Metabase-specific items, which are [referred to by entity IDs](#metabase-uses-entity-ids-to-identify-and-reference-metabase-items)).

For example, in the [Example of a serialized question](#example-of-a-serialized-question), there are several YAML keys that reference Sample Database:

```yaml
database_id: Sample Database
---
dataset_query:
  database: Sample Database
```

In the description of the field filter (`category_filter:`) in that example, you can see the reference to the field that's used to populate the filter options:

```yaml
dimension:
  - field
  - - Sample Database
    - PUBLIC
    - PRODUCTS
    - CATEGORY
```

It refers to the `CATEGORY` field in the `PRODUCTS` table in the `PUBLIC` schema in `Sample Database`. The serialized `Sample Database` in the `databases` directory will also include YAML files for this field and table.

## How import works

During import, Metabase will read the provided YAML files and create items according to the YAML specs. [Example of a serialized question](#example-of-a-serialized-question) how Metabase records information it needs to reconstruct an item.

Metabase will not delete items from target instance during import, but it will overwrite items that already exist.

Metabase relies on [Entity IDs](#metabase-uses-entity-ids-to-identify-and-reference-metabase-items) to figure out which items to create or overwrite, and what are the relationships between items. When importing into an instance that already has some content in it, keep in mind:

- If you import an item with an `entity_id` that doesn't exist in your target Metabase, Metabase will create a new item.

- If you import an item with an `entity_id` that already exists in your target Metabase, the existing item will be overwritten.

  In particular, this means that if you export a question, then make a change in an exported YAML file — like rename a question by directly editing the `name` field — and then import the edited file back, Metabase will try to apply the changes you made to the YAML.

- If you import an item with blank `entity_id` (and blank `serdes/meta → id`), Metabase will create a new item.

- All items and data sources referenced in YAML must either exist in the target Metabase already, or be included in the import.

  For example, if an exported YAML has the field `collection_id: onou5H28Wvy3kWnjxxdKQ`, then the collection `onou5H28Wvy3kWnjxxdKQ` must already exist in target instance, or there must be a YAML file with the export of a collection that has this ID.

## Serialization best practices

### Use the same Metabase version for source and target instance

Currently, serialization only works if source and target Metabase have the same major version.
If you are using the CLI serialization commands, the version of the .jar file that you are using to run the serialization commands should match both the source and target Metabase versions as well.

### If you're using H2 as your application database, you'll need to stop Metabase before importing or exporting

If you're using Postgres or MySQL as your application database, you can import and export while your Metabase is still running.

### Avoid using serialization for backups

Just a note: serialization is _not_ meant to back up your Metabase.

See [Backing up Metabase](./backing-up-metabase-application-data.md).

If you're instead looking to do a one-time migration from the default H2 database included with Metabase to a MySQL/Postgres, then use the [migration guide instead](./migrating-from-h2.md).

### You'll need to manually add license tokens

Metabase excludes your license token from exports, so if you're running multiple environments of Metabase Enterprise Edition, you'll need to manually add your license token to the target Metabase(s), either via the [Metabase user interface](https://www.metabase.com/docs/latest/paid-features/activating-the-enterprise-edition), or via an [environment variable](../configuring-metabase/environment-variables.md#mb_premium_embedding_token).

### Metabase adds logs to exports and imports

Exports: Metabase adds logs to the compressed directory as `export.log`.

Imports: You can add the `-o -` flag to export logs directly into the terminal, or `-o import.log` to save to a file.

## Serialization with CLI commands

> To serialize data on Metabase Cloud, use the [import and export API endpoints](#serialization-via-the-api)

Metabase provides [`export`](#exporting-with-cli) and [`import`](#importing-with-cli) CLI commands.

See [How export works](#how-export-works), [How import works](#how-import-works), and [Serialization best practices](#serialization-best-practices) for general information about serialization.

### Exporting with CLI

To export the contents of a Metabase instance, change into the directory where you're running the Metabase JAR and run:

```
java -jar metabase.jar export dir_name
```

Where `dir_name` can be whatever you want to call the directory.

### `export` options

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

#### `--collection`

By default, Metabase will include all collections (except for personal collections) in the export. To include personal collections, you must explicitly add them with the `--collection` flag.

The `--collection` flag (alias `-c`) lets you specify by ID one or more collections to include in the export. You can find the collection ID in the collection's URL, e.g., for a collection at: `your-metabase.com/collection/42-terraforming-progress`, the ID would be `42`.

If you want to specify multiple collections, separate the IDs with commas. E.g.,

```
java -jar metabase.jar export export_name --collection 1,2,3
```

#### `--no-collections`

The `--no-collections` flag (alias `-C`) tells Metabase to exclude all collections from the export.

#### `--no-settings`

The `--no-settings` flag (alias `-S`) tells Metabase to exclude the `settings.yaml` file that includes [site-wide settings](#general-metabase-settings-that-are-exported), which is exported by default.

#### `--no-data-model`

The `--no-data-model` flag (alias `-D`) tells Metabase to exclude the Table Metadata settings from the export. Admins define the metadata settings in the [Table Metadata](../data-modeling/metadata-editing.md) tab of the Admin settings.

#### `--include-field-values`

The `--include-field-values` flag (alias `-f`) tells Metabase to include the sample values for field values, which Metabase uses to present dropdown menus. By default, Metabase excludes these sample field values.

#### `--include-database-secrets`

The `--include-database-secrets` flag (alias `-s`) tells Metabase to include connection details, including the database user name and password. By default, Metabase excludes these database connection secrets. If you don't use this flag, you'll need to manually input the credentials in the target Metabase.

### Importing with CLI

To import exported artifacts into a Metabase instance, go to the directory where you're running your target Metabase (the Metabase you want to import into) and use the following command, where `path_to_export` is the path to the export that you want to import:

```
java -jar metabase.jar import path_to_export
```

Currently, you can only import exported artifacts into a Metabase instance that was created from the same version of Metabase.

### `import` options

Most options are defined when exporting data from a Metabase. To view a list of import flags, run:

```
java -jar metabase.jar help import
```

Which prints out:

```
import path & options
         Load serialized Metabase instance as created by the [[export]] command from directory `path`.
```

## Serialization via the API

> Just like the CLI serialization commands, these endpoints are only available for [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

You can import and export serialized Metabase data via Metabase's API, which makes serialization possible for [Metabase Cloud](https://www.metabase.com/cloud/) deployments.

There are two endpoints:

- `POST /api/ee/serialization/export`
- `POST /api/ee/serialization/import`

> We use `POST`, not `GET`, for the `/export` endpoint. The export operation does not modify your Metabase, but it's long and intensive, so we use `POST` to prevent accidental exports.

For now, these endpoints are synchronous. If the serialization process takes too long, the request can time out. In this case, we suggest using the CLI commands.

See [How export works](#how-export-works), [How import works](#how-import-works), and [Serialization best practices](#serialization-best-practices) for general information about serialization.

### API export parameters

You can append optional parameters to tell Metabase what to include or exclude from the export. You can also combine parameters (excluding, of course, `all_collections` and selective collections).

So, assuming you're testing on `localhost`, and you want to exclude all collections from the export, you'd format the URL like so:

```
http://localhost:3000/api/ee/serialization/export?all_collections=false
```

You can include multiple parameters, separated by `&`. For example, to exclude both the settings and the data model from the export:

```
http://localhost:3000/api/ee/serialization/export?data_model=false&settings=false
```

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

To exclude the `settings.yaml` file that contains site-wide settings:

```html
settings=false
```

### `data_model`

Type: Boolean.

Default: `true`.

To exclude the [Table Metadata](../data-modeling/metadata-editing.md):

```
data_model=false
```

### `field_values`

Type: Boolean.

Default: `false`.

To include the sample values for field values, which Metabase uses to present dropdown menus:

```
field_values=true
```

### `database_secrets`

Type: Boolean.

Default: `false`.

To include database connection details, like the database username and password:

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

## Serialization API example

### Step 1: Set up an API key

1. Create an [API key](../people-and-groups/api-keys.md).
2. Assign the key to the Admin group

### Step 2: Export

1. Send a `curl` request to export data:

```sh
curl \
  -H 'x-api-key: YOUR_API_KEY' \
  -X POST 'http://your-metabase-url/api/ee/serialization/export' \
  -o metabase_data.tgz
```

substituting `YOUR_API_KEY` with your API key and `your-metabase-url` with the URL of your Metabase instance.

> We use `POST`, not `GET`, for the `/export` endpoint.

This command will download the files as a GZIP-compressed Tar file named `metabase_data.tgz`.

2. Unzip the compressed file:

```sh
tar -xvf metabase_data.tgz
```

The extracted directory will be called something like `metabase-yyyy-MM-dd_HH-mm`, with the date and time of the export.

### Step 3: Import

1. Compress the directory containing serialized Metabase application data

Let's say you have your YAML files with Metabase application data in a directory called `metabase_data`. Before importing those files to your target Metabase, you'll need to compress those files.

```sh
tar -czf metabase_data.tgz metabase_data
```

3. POST to `/api/ee/serialization/import`.

From the directory where you've stored your GZIP-compressed file, run:

```sh
curl -X POST \
  -H 'x-api-key: YOUR_API_KEY' \
  -F file=@metabase_data.tgz \
  'http://your-metabase-url/api/ee/serialization/import' \
  -o -
```

substituting `YOUR_API_KEY` with your API key and `your-metabase-url` with your Metabase instance URL.
The `-o -` option will output logs in the terminal.

> If you import Metabase data into the same Metabase as you exported it from, you will overwrite your existing questions, dashboards, etc. See [How import works](#how-import-works).

## Other uses of serialization

Serialization is intended for version control and staging-to-production workflows. While it is possible to use serialization for other use cases like duplicating assets within a single instance, these use cases are not currently officially supported.

We're providing some directions on how to approach alternative use cases, but you should use them at your own risk. We strongly recommend that you test any process involving serialization on a non-production instance first, and reach out to [help@metabase.com](mailto:help@metabase.com) if you have any questions.

### Using serialization for duplicating content within the same Metabase

Using serialization to duplicate content is not trivial, because you'll need to wrangle [Entity IDs](#metabase-uses-entity-ids-to-identify-and-reference-metabase-items) for all the items you want to duplicate — and the IDs for all the items that are related to those items — to avoid overwriting existing data.

Before starting this perilous journey, review [how export works](#how-export-works) and [how import works](#how-import-works), and contact [help@metabase.com](mailto:help@metabase.com) if you have any questions.

You'll need to keep in mind:

- Importing an item with an entity ID that already exists will overwrite the existing item. To use an existing YAML file to create a new item, you'll need to either a) create a new entity ID or b) clear the Entity ID.
- Two items cannot have the same entity IDs.
- `entity_id` and `serdes/meta → id` fields in the YAML file should match.
- If the `entity_id` and `serdes/meta → id` fields in a YAML file for an item are blank, Metabase will create a new item with a new Entity ID.
- All items and data sources referenced by an item should either already exist in target Metabase or be included in the import.

  For example, a collection can contain a dashboard that contains a question that is built on a model that references a data source. All of those dependencies must be either included in the import or already exist in the target instance.

  This means that you might need a multi-stage export/import: create some of the items you need (like collections) in Metabase first, export them to get their entity IDs, then export the stuff that you want to duplicate and use those IDs in items that reference them.

For example, to duplicate a collection that contains _only_ questions that are built directly on raw data (not on models or other saved questions), without changing the data source for the questions, you can use a process like this:

1. In Metabase, create a "template" collection and add the items you'd like to duplicate.
2. In Metabase, create a new collection which will serve as the target for duplicated items.
3. Export the template collection and the target collection (you can use [export parameters](#customize-what-gets-exported) to export only a few collections).
   The YAML files for template questions in the export will have their own Entity IDs and reference the entity ID of the template collection.
4. Get the entity ID of the target collection from its export.
5. In the YAML files for questions in the template collection export:

   - Clear the values for the fields `entity_id` and `serdes/meta → id` for questions. This will ensure that the template questions don't get overwritten, and instead Metabase will create new questions.
   - Replace `collection_id` references to the template collection with the ID of the new collection

6. Import the edited files.

This process assumes that your duplicated questions will all use the same data source. You can combine this with [switching the data source](#using-serialization-to-swap-the-data-source-for-questions-within-one-instance) to use a different data source for every duplicated collection.

If you want to create multiple copies of a collection at once, then instead of repeating this process for every copy, you could create your own target entity IDs (they can be any string that uses the [NanoID format](https://github.com/ai/nanoid)), duplicate all the template YAML files, and replace template entity IDs and any references to them with your created entity IDs.

If your collections contains dashboards, models, and other items that can add dependencies, this process can become even more complicated -- you need to handle every dependency. We strongly recommend that you first test your serialization on a non-production Metabase, and reach out to [help@metabase.com](mailto:help@metabase.com) if you need any help.

### Using serialization to swap the data source for questions within one instance

If you want to change the data source for some of the questions in your Metabase — for example, just for questions in a single collection - you can serialize the questions manually, then edit the exported YAML files.

> If you want to switch _every_ question built on database A to use database B instead, and database B has exactly the same schema as database A, you don't need to use serialization: you can just swap the connection string in **Admin > Databases**

Your databases must have the same engine, and ideally they should have the same schema.

You'll need to keep in mind:

- Databases, tables and fields are [referred to in Metabase by name](#databases-schemas-tables-and-fields-are-identified-by-name)
- Database connection details are not exported by default. To export database connection details, you'll need to [specify this in export parameters](#customize-what-gets-exported).
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

A few other changes to call out:

- The exported YAML files have a slightly different structure:
  - Metabase will prefix each file with a 24-character entity ID (like `IA96oUzmUbYfNFl0GzhRj_accounts_model.yaml`).
    You can run a Metabase command to [drop entity IDs](./commands.md#drop-entity-ids) before exporting.
  - The file tree is slightly different.
- To serialize personal collections, you just need to include the personal collection IDs in the list of comma-separated IDs following the `-c` option (short for `--collection`).

If you've written scripts to automate serialization, you'll need to:

- Reserialize your Metabase using the upgraded Metabase (which uses the new `export` and `import` commands). Note that serialization will only work if you export and import your Metabase using the same Metabase version.
- Update those scripts with the new commands. See the new [export options](#export-options).
- If your scripts do any post-processing of the exported YAML files, you may need to update your scripts to accommodate the slightly different directory and YAML file structures.

## Further reading

- [Serialization tutorial](https://www.metabase.com/learn/administration/serialization).
- [Multiple environments](https://www.metabase.com/learn/administration/multi-env)
- [Setting up a git-based workflow](https://www.metabase.com/learn/administration/git-based-workflow).
- Need help? Contact [support@metabase.com](mailto:support@metabase.com).
