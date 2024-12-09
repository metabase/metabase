---
title: Metabase CLI
---

# Metabase CLI

Metabase ships with some handy CLI commands. To view a list of commands, run the Metabase jar followed by `help`.

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar help
```

Metabase will print out the help text for available commands.

## `api-documentation`

Generate a markdown file containing documentation for all API endpoints. This is written to a file called `docs/api-documentation.md`.

## `driver-methods` | `driver-methods _docs`

Print a list of all multimethods available for a driver to implement. Add `_docs` to include their docstrings.

## `config-template`

Generates a Markdown file with documentation and an example configuration file in YAML. The YAML template includes Metabase settings and their defaults. Metabase will save the file as `docs/configuring-metabase/config-template.md`.

## `drop-entity-ids`

Drop entity IDs for instances of serializable models. Useful for migrating from v1 serialization (x.46 and earlier) to v2 (x.47+).

## `dump path & options`

**Note: this command is deprecated. Use `export` instead.**

Serializes Metabase instance into directory `path`.

Options:

- `-u, --user EMAIL` - Export collections owned by the specified user
- `-s, --state (active|all)` - When set to `active`, do not dump archived entities. Default behavior is `all`
- `--include-entity-id` - Include entity_id property in all dumped entities. Default: false

## `dump-to-h2 h2-filename & opts`

Transfer data from existing database to newly created H2 DB with specified filename. Target H2 file is deleted before dump, unless the --keep-existing flag is given.

Options:

- `-k, --keep-existing` - Do not delete target H2 file if it exists
- `-p, --dump-plaintext` - Do not encrypt dumped contents

## `environment-variables-documentation`

Generates a markdown file containing documentation for environment variables relevant to configuring Metabase. The command only includes environment variables registered as defsettings. For a full list of environment variables, see https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.

## `export path & options`

{% include plans-blockquote.html feature="Serialization" self-hosted-only="true" %}

Serialize Metabase instance into directory at `path`.

Options:

- `-c, --collection ID` - Export only specified ID(s). Use commas to separate multiple IDs. You can pass entity ids with `eid:<...>` as a prefix
- `-C, --no-collections` - Do not export any content in collections
- `-S, --no-settings` - Do not export settings.yaml
- `-D, --no-data-model` - Do not export any data model entities; useful for subsequent exports
- `-f, --include-field-values` - Include field values along with field metadata
- `-s, --include-database-secrets` - Include database connection details (in plain text; use caution)
- `-e, --continue-on-error` - Do not break execution on errors
- `--full-stacktrace` - Output full stacktraces on errors

## `help command-name` | `help`

Show this help message listing valid Metabase commands. Use `help command-name` for specific command details.

## `import path & options`

{% include plans-blockquote.html feature="Serialization" self-hosted-only="true" %}

Load serialized Metabase instance as created by the `export` command from directory `path`.

Options:

- `-e, --continue-on-error` - Do not break execution on errors
- `--full-stacktrace` - Output full stacktraces on errors

## `load path & options`

**Note: this command is deprecated. Use `import` instead.**

Load serialized Metabase instance as created by `dump` command from directory `path`.

Options:

- `-m, --mode (skip|update)` - Update or skip on conflicts. Default: skip
- `-e, --on-error (continue|abort)` - Abort or continue on error. Default: continue

## `load-from-h2` | `load-from-h2 h2-connection-string`

Transfer data from existing H2 database to the newly created MySQL or Postgres DB specified by env vars.

## `migrate direction`

Run database migrations. Valid options for `direction` are `up`, `force`, `down`, `print`, or `release-locks`.

## `profile`

Start Metabase the usual way and exit. Useful for profiling Metabase launch time.

## `reset-password email-address`

Reset the password for a user with `email-address`.

## `rotate-encryption-key new-key`

Rotate the encryption key of a metabase database. The MB_ENCRYPTION_SECRET_KEY environment variable has to be set to the current key, and the parameter `new-key` has to be the new key. `new-key` has to be at least 16 chars.

## `seed-entity-ids`

Add entity IDs for instances of serializable models that don't already have them.

## `version`

Print version information about Metabase and the current system.

## Additional useful commands

### H2 SQL Shell

Open an SQL shell for the Metabase H2 DB:

```sh
java -cp metabase.jar org.h2.tools.Shell -url jdbc:h2:/path/to/metabase.db
```
