---
title: "Serialization"
redirect_from:
  - /docs/latest/enterprise-guide/serialization
---

# Serialization

{% include plans-blockquote.html feature="Serialization" self-hosted-only="true" %}

Once you really get rolling with Metabase, it's often the case that you'll have more than one Metabase instance spun up. You might have a couple of testing or development instances and a few production ones, or maybe you have a separate Metabase per office or region.

To help you out in situations like this, Metabase has a serialization feature which lets you create an _export_ of the contents of a Metabase that can then be _imported_ into one or more Metabases. 

## Serialization use cases

- **Staging environments**. Enable a staging-to-production workflow for important dashboards by exporting from a staging instance of Metabase and then importing them into your production instance(s).
- **Version control**. Check the exported files into version control and audit changes to them, as the YAML files contained within the export are pretty readable.

## What gets exported

Metabase only includes some artifacts its exports.

- Collections (except for personal collections)
- Dashboards
- Saved questions
- Actions
- Models
- Segments and Metrics defined in the Data Model
- SQL Snippets
- Public sharing settings for questions and dashboards
- Admin Panel settings, except for permissions
- Database connection settings (QUESTION: are secrets excluded by default?)
- Data Model settings

QUESTION Events and timelines?

### Export example

Metabase will export the artifacts in a directory of YAML files. The export will include a `settings.yaml` file that includes some basic, Metabase-wide settings, as well as sub-directories that contain YAML files for various Metabase entities.

An example export could include the following directories, depending on what you exported.

- actions
- collections
- databases

In the `collections/cards` directory, you'll see that Metabase prefixes individual files with IDs to disambiguate entities that share the same name:

```
IA96oUzmUbYfNFl0GzhRj_accounts_model.yaml
KUEGiWvoBFEc5oGQCEnPg_converted_customers.yaml
qzNa8ZeFgFXrrIoF2g8m4_accounts_model_detail.yaml
```

## Before exporting or importing

If your Metabase is:

- currently running, and 
- you're using the default H2 database

You'll need to stop Metabase before exporting or importing.

Otherwise, you're good.

## Exporting

To export the contents of a Metabase instance, use the following command in your terminal:

```
java -jar metabase.jar export [export_name] 
```

### Export options

To view a list of `export` options, use the `help` command:

```
java -jar metabase.jar help export
```

Which will print:

```
export path & options
	 Serialize Metabase instance into directory at `path`.
	 Options:
	   -u, --user EMAIL                Include collections owned by the specified user
	   -c, --collection ID             Export only specified ID; may occur multiple times.
	       --collections ID_LIST       (Legacy-style) Export collections in comma-separated list of IDs, e.g. '123,456'.
	   -C, --no-collections            Do not export any content in collections.
	   -S, --no-settings               Do not export settings.yaml
	   -D, --no-data-model             Do not export any data model entities; useful for subsequent exports.
	   -f, --include-field-values      Include field values along with field metadata.
	   -s, --include-database-secrets  Include database connection details (in plain text; use caution).
```

### `user`

The `user` flag tells Metabase to include collections owned by the specified user, identified by email. QUESTION what about SSO?

### `collection`

The `--collection` flag (alias `-c`) lets you specify by ID one or more collections to include in the export. You can find the collection ID in the collection's URL, e.g., for a collection at: `your-metabase.com/collection/42-terraforming-progress`, the ID would be `42`.

If you want to specify multiple collections, separate the IDs with commas. E.g., 

```
java -jar metabase.jar export --collection 1,3,5,9
```

### `no-collection`

The `--no-collection` flag (alias `-C`) allows you to exclude one or more collections. E.g.:

```
java -jar metabase.jar export --no-collection 1,3,5,9
```

Would export every collection except collections with IDs `1`, `3`, `5`, and `9`.

### `no-settings`

The `--no-settings` flag (alias `-S`) tells Metabase to exclude the `settings.yaml` file that includes site-wide settings, which is exported by default.

### `no-data-model`

The `no-data-model` flag tells Metabase to exclude the data model settings from the export. Admins define the data model settings in the [Data model](../data-modeling/metadata-editing) tab of the Admin settings.

### `include-field-values`

The `include-field-values` tells Metabase to include the sample values for field values, which Metabase uses to present dropdown menus. By default, Metabase excludes these values. QUESTION is that true? 

### `include-database-secrets`

The `include-database-secrets` flag tells Metabase to include the secrets in the something else.

## Importing

To import exported artifacts into a Metabase instance, use the following command, where `[my_export]` is the path to the export you want to import:

```
java -jar metabase.jar import [my_export]
```

Currently, you can only import exported artifacts into a Metabase instance that was created from the same version of Metabase.

## Import options

Most options are defined when exporting data from a Metabase. To view a list of import flags, run:

```
java -jar metabase help import

```

Which prints out:

```
import path & options
         Load serialized Metabase instance as created by the [[export]] command from directory `path`.
         Options:
           -e, --abort-on-error  Stops import on any errors, default is to continue.
```
### `--abort-on-error`

The `--abort-on-error` flag (alias `-e`) is an optional flag that allows you to specify how the import process should handle errors. Metabase will ignore errors by default.

## Avoid using serialization for backups

Just a note: serialization is _not_ meant to back up your database.

See [Backing up Metabase](./backing-up-metabase-application-data.md).

If you're instead looking to do a one-time migration from the default H2 database included with Metabase to a MySQL/Postgres, then use the [migration guide instead](./migrating-from-h2.md).

## Further reading

- [Serialization tutorial](https://www.metabase.com/learn/administration/serialization).
- Need help, contact [support@metabase.com](mailto:support@metabase.com).
