---
title: "Serialization"
redirect_from:
  - /docs/latest/enterprise-guide/serialization
---

# Serialization

{% include plans-blockquote.html feature="Serialization" self-hosted-only="true" %}

Once you really get rolling with Metabase, it's often the case that you'll have more than one instance of it spun up. You might have a couple of testing or development instances and a few production ones, or maybe you have a separate instance per office or region.

To help you out in situations like this, Metabase has a serialization feature which lets you create an export of the contents of a Metabase instance that can then be imported into another instance. Serialization lets you do things like create a set of dashboards and charts in one Metabase instance and then easily copy those items to a number of other Metabase instances. You could use this feature to do things like:

- Enable a staging-to-production workflow for important dashboards by exporting from a staging instance of Metabase and then importing them into your production instance(s). 
- Check the exported files into version control and audit changes to them, as the YAML files contained within the export are pretty readable.

## What gets exported

**Exports include:**

- Collections
- Dashboards
- Saved questions
- Actions
- Models
- Segments and Metrics defined in the Data Model
- SQL Snippets
- Public sharing settings for questions and dashboards
- Admin Panel settings, except for permissions
- Database connection settings
- Data Model settings

**Exports exclude:**

- Permission settings
- User accounts or settings
- Alerts on saved questions
- Personal Collections or their contents (except for the user specified with the `--user` flag; see below)
- Archived items

## Before exporting or importing

If your instance is currently running and your application database doesn't support concurrent reads and writes (like the default H2 database), you'll need to stop Metabase before exporting or importing.

## Exporting

To export the contents of a Metabase instance, use the following command in your terminal:

```
java -jar metabase.jar export [export_name] --user [example@example.com]
```

The optional `--user` flag is used to specify a default administrator account for cases when this export is loaded into a blank Metabase instance. This user will also be marked as the creator of all artifacts that are copied over to the instance. This user's personal collection and its contents will also be included in the export. If this flag isn't specified, Metabase will assume that the instance into which you're loading already has an admin user (but the load will fail if there isn't an admin user).

## Importing

To import exported artifacts into a Metabase instance, use the following command, where `[my_export]` is the path to the export you want to import:

```
java -jar metabase.jar import [my_export]
```

Currently, you can only import exported artifacts into a Metabase instance that was created from the same version of Metabase. 

## Import flags

### `mode`

The `--mode` flag is an optional flag that lets you specify what to do when encountering a duplicate item (like a dashboard or question) in the target Metabase. The `mode` flag has two options:

- `--mode skip` do nothing to the existing item in the target Metabase, or
- `--mode update` overwrite that duplicate with the version of the item that you're importing.

The default is `--mode skip`. For example, even if you change the card order for a dashboard, or add or remove any cards in a dashboard, the `skip` mode won't modify the dashboard object, regardless of changes in the source file.

### `on-error`

The `--on-error` flag is an optional flag that allows you to specify how the import process should handle errors.

- `--on-error continue` (the default).
- `--co-error abort` Stops the import process on error. The `abort` option won't undo any successful artifact imports prior to the error.

## Avoid using serialization for backups

See [Backing up metabase](./backing-up-metabase-application-data.md).

If you're looking to do a one-time migration from H2 to MySQL/Postgres, then use the [migration guide instead](./migrating-from-h2.md).

## Further reading

- [Serialization: preloading dashboards in a new Metabase instance](https://www.metabase.com/learn/administration/serialization).

Still need help? Feel free to reach out to us at [support@metabase.com](mailto:support@metabase.com).
