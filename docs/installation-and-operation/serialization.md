---
title: "Serialization"
redirect_from:
  - /docs/latest/enterprise-guide/serialization
---

## Serialization

{% include plans-blockquote.html feature="Serialization" self-hosted-only="true" %}

Once you really get rolling with Metabase it's often the case that you'll have more than one instance of it spun up. You might have a couple of testing or development instances and a few production ones, or maybe you have a separate instance per office or region.

To help you out in situations like this, Metabase has a serialization feature which lets you create a snapshot, called a dump, of the contents of a Metabase instance that can then be loaded into another instance. This lets you do things like create a set of dashboards and charts in one Metabase instance and then easily copy those items to a number of other Metabase instances. You could also use this feature to enable a staging-to-production workflow for important dashboards or reports by dumping from a staging instance of Metabase and then loading that dump into your production instance(s). You can even put the dump files into version control and audit changes to them, as the YAML files contained within the dump are pretty readable.

If you're looking to do a one-time migration from H2 to MySQL/Postgres, then use the [migration guide instead](./migrating-from-h2.md).

## What gets dumped and loaded

Only some artifacts are included in dumps and loads:

- Collections (except for personal collections)
- Dashboards
- Saved questions
- Segments and Metrics defined in the Data Model
- Public sharing settings for questions and dashboards
- Admin Panel settings, except for permissions
- Database connection settings
- Data Model settings

### Before creating or loading a dump

If your instance is currently running, you will need to stop it first before creating or loading a dump, unless your Metabase application database supports concurrent reads. The default application database type, H2, does not.

### Creating a data dump

To create a dump of a Metabase instance, use the following command in your terminal:

`java -jar metabase.jar dump [dump_name] --user [example@example.com]`

The optional `--user` flag is used to specify a default administrator account for cases when this dump is loaded into a blank Metabase instance. This user will also be marked as the creator of all artifacts that are copied over to the instance. This user's personal collection and its contents will also be included in the data dump. If this flag isn't specified, Metabase will assume that the instance into which you're loading already has an admin user (but the load will fail if there isn't an admin user).

### Loading a dump

Currently, you can only load dumps into a Metabase instance that were created from the same version of Metabase. To load a dump into a Metabase instance, use the following command, where `[my_dump]` is the path to the dump you want to load:

`java -jar metabase.jar load [my_dump] --mode [skip/update] --on-error [continue/abort]`

The `--mode` flag lets you specify what to do when encountering a duplicate dashboard, question, or any Admin Panel settings that already set (again, except for permissions and user settings, which are not currently included in data dumps). It can either `skip` that item and do nothing to it, or `update` it with the version being loaded. The default is `skip`. For example, even if you change the card order for a dashboard, or add or remove any cards in a dashboard, the `skip` mode won't modify the dashboard object, as the load process "skips" any object that previously existed, regardless of changes in the source file.

The `--on-error` flag allows you to specify whether the load process should keep going or stop when there's an error. The default is `continue`. Note that `abort` won't undo any successful artifact loads that happened before an error was encountered.

Both of these flags are optional.

To learn more, check out [Serialization: preloading dashboards in a new Metabase instance](https://www.metabase.com/learn/administration/serialization).

Still need help? Feel free to reach out to us at [support@metabase.com](mailto:support@metabase.com).
