---
title: Metabase CLI
---

# Metabase CLI

Metabase ships with some handy CLI commands. To view a list of commands, run the Metabase jar followed by `help`.

```
java -jar metabase.jar help
```

Metabase will print out the help text for available commands.

## `api-documentation`

Generate a markdown file containing documentation for all API endpoints. This is written to a file called `docs/api-documentation.md`.

## `driver-methods`

Or `driver-methods _docs`.

Print a list of all multimethods available for a driver to implement, optionally with their docstrings.

## `drop-entity-ids`

Drop entity IDs for instances of serializable models. Useful for migrating from v1 serialization (x.46 and earlier) to v2 (x.47+).

## `dump path & options`

> This command is deprecated. Use `export` instead.

Serializes Metabase instance into directory `path`.

**Options:**

`-u`, `--user EMAIL` Export collections owned by the specified user

`-s`, `--state (active|all) all` When set to `active`, do not dump archived entities. Default behavior is `all`.

## `dump-to-h2 h2-filename & opts`

Transfer data from existing database to newly created H2 DB with specified filename. Target H2 file is deleted before dump, unless the --keep-existing flag is given.

**Options:**

`-k`, `--keep-existing` Do not delete target H2 file if it exists.

`-p`, `--dump-plaintext` Do not encrypt dumped contents.

## `environment-variables-documentation`

Generates a markdown file containing documentation for environment variables relevant to configuring Metabase. The command only includes environment variables registered as defsettings. For a full list of environment variables, see [Environment variables](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables).

## `export path & options`

{% include plans-blockquote.html feature="Serialization" self-hosted-only="true" %}

Serialize Metabase instance into directory at `path`.

**Options:**

`-c`, `--collection ID` Export only specified ID(s). Use commas to separate multiple IDs.

`-C`, `--no-collections` Do not export any content in collections.

`-S`, `--no-settings` Do not export settings.yaml

`-D`, `--no-data-model` Do not export any data model entities; useful for subsequent exports.

`-f`, `--include-field-values` Include field values along with field metadata.

`-s`, `--include-database-secrets` Include database connection details (in plain text; use caution).

## `help`

Show this help message listing valid Metabase commands.

## `import path & options`

{% include plans-blockquote.html feature="Serialization" self-hosted-only="true" %}

Load serialized Metabase instance as created by the export command from directory `path`. Has no options.

## `load path & options`

> This command is deprecated. Use `import` instead.

Load serialized Metabase instance as created by [[dump]] command from directory `path`.

**Options:**

`-m`, `--mode (skip|update) skip` Update or skip on conflicts.

`-e`, `--on-error (continue|abort)` continue Abort or continue on error.

## `load-from-h2`

Transfer data from existing H2 database to the newly created MySQL or Postgres DB specified by env vars.

```
load-from-h2 h2-connection-string
```

## `migrate down`

Used for downgrading versions.

## `profile`

Start Metabase the usual way and exit. Useful for profiling Metabase launch time.

## `reset-password email-address`

Reset the password for a user with `email-address`.

## `rotate-encryption-key new-key`

Rotate the encryption key of a Metabase database. The `MB_ENCRYPTION_SECRET_KEY` environment variable has to be set to the current key, and the parameter `new-key` has to be the new key. `new-key` has to be at least 16 chars.

## `version`

Print version information about Metabase and the current system.
