---
title: Metabase CLI
description: CLI commands for managing your Metabase instance, including database migrations, serialization, and administrative tasks.
---

# Metabase CLI

Metabase ships with some handy CLI commands for administration, maintenance, and automation tasks. These commands let you manage your Metabase instance, migrate databases, handle serialization, and generate documentation.

To view a list of commands, run the Metabase jar followed by `help`.

```
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar help
```

Metabase will print out the help text for available commands.


## `api-documentation`

Generate an HTML file and a JSON file for Scalar docs for the Metabase API.

## `command-documentation`

Generates a markdown file containing documentation for all CLI commands. This is written to a file called `docs/installation-and-operation/commands.md`.

## `config-template`

Generates a markdown file with some documentation and an example configuration file in YAML. The YAML template includes Metabase settings and their defaults. Metabase will save the template as `docs/configuring-metabase/config-template.md`.

## `driver-methods | driver-methods _docs`

Print a list of all multimethods available for a driver to implement, optionally with their docstrings.

## `drop-entity-ids`

Drop entity IDs for instances of serializable models. Useful for migrating from v1 serialization (x.46 and earlier) to v2 (x.47+).

## `dump-to-h2 h2-filename opts`

Transfer data from existing database to newly created H2 DB with specified filename. Target H2 file is deleted before dump, unless the --keep-existing flag is given.

Options:

- `-k, --keep-existing` - Do not delete target H2 file if it exists.
- `-p, --dump-plaintext` - Do not encrypt dumped contents.

## `environment-variables-documentation`

Generates a markdown file containing documentation for environment variables relevant to configuring Metabase. The command only includes environment variables registered as defsettings. For a full list of environment variables, see https://www.metabase.com/docs/latest/configuring-metabase/environment-variables.

## `export path options`

Serialize Metabase instance into directory at `path`.

Options:

- `-c, --collection ID` - Export only specified ID(s). Use commas to separate multiple IDs. Pass either PKs or entity IDs.
- `-C, --no-collections` - Do not export any content in collections.
- `-S, --no-settings` - Do not export settings.yaml
- `-D, --no-data-model` - Do not export any data model entities; useful for subsequent exports.
- `-f, --include-field-values` - Include field values along with field metadata.
- `-s, --include-database-secrets` - Include database connection details (in plain text; use caution).
- `-e, --continue-on-error` - Do not break execution on errors.
- `--full-stacktrace` - Output full stacktraces on errors.

## `generate-openapi-spec`

Generate OpenAPI specification file from Malli schema definitions. This is written to `resources/openapi/openapi.json`.

## `help command-name | help`

Show this help message listing valid Metabase commands.

## `import path options`

Load serialized Metabase instance as created by the [[export]] command from directory `path`.

Options:

- `-e, --continue-on-error` - Do not break execution on errors.
- `--full-stacktrace` - Output full stacktraces on errors.

## `load-from-h2 | load-from-h2 h2-connection-string`

Transfer data from existing H2 database to the newly created MySQL or Postgres DB specified by env vars.

## `migrate direction`

Run database migrations. Valid options for `direction` are `up`, `force`, `down`, `down-force`, `print`, or `release-locks`.

## `remove-encryption`

Decrypts data in the metabase database. The MB_ENCRYPTION_SECRET_KEY environment variable has to be set to the current key

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

