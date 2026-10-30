# Configuration

`core/convert!` takes the source's `:type`, its `:raw` project and `:options`, a directory and the config; [the
README](README.md#usage) shows a whole run, and the source's README ([dbt's](dbt/README.md#running-an-import)) shows
what its own `:raw` and `:options` are.

The config is the closed map `schemas.config/config`; a source's own options are its own, not part of it:

| Key | Required | Type | Meaning | Default |
| -- | -- | -- | -- | -- |
| `:databases` | yes | map of string (or nil) to string | The one mapping a semantic layer cannot supply: the warehouse database as the source names it to the name of the Metabase Database it is connected as, as typed, letter case included. The key is `nil` for a source that names no database. A table whose database has no entry reports every metric over it. | none |
| `:driver` | yes | keyword | The Metabase driver those databases use, `:postgres`. It has to be one the instance can load and a JDBC driver (one derived from `:sql-jdbc`): `:mongo` or `:bigquery-cloud-sdk` fails the run up front, since the import types columns through the driver's sql-jdbc type mapping. | none |
| `:creator-email` | yes | string | The user the cards are created as. Serdes resolves it by email and synthesizes an inactive user when none exists, but a card cannot be imported without one. | none |
| `:collection-name` | no | string | The name of the collection the metrics are written to; also the collection's file and directory name, slugified. A name that slugifies to nothing, `.` or `..` is refused. | `<tool> metrics`, `dbt metrics` for dbt |
| `:identifier-case` | no | `:upper`, `:lower` or `:as-is` | How the warehouse stores a name the project wrote without quotes (see [Importing the result](importing.md)). Overrides what the driver says. | `:upper` for a driver with the `:upper-case-unquoted-identifiers` feature (Snowflake, Oracle, H2), `:lower` otherwise |
| `:schema-mapping` | no | map of string to string or nil | A schema as the source names it to the schema the instance has the table under, `nil` for none, overriding the default for that schema only. | the schema as the driver stores it; `nil` for a driver without the `:schemas` feature |

## The driver

The `:driver` decides four things. Its own `database-type->base-type` mapping turns the project's declared column types
into Metabase base types, so a type the driver has no mapping for is reported; the fix is a mapping in the driver, which
is meant to have one for every type its warehouse has. It picks the SQL dialect the IR's SQL is parsed in. Its
`:upper-case-unquoted-identifiers` and `:schemas` features say how the warehouse spells the names the project wrote (see
[Importing the result](importing.md)). And its feature flags say which clauses the warehouse can run: a metric whose
query needs a feature the driver lacks (a `median` on MySQL, a regex on SQL Server, a cumulative metric on Spark) is
reported, naming the clause and the feature, since it would import and fail when queried.

The driver has to agree with the warehouse the semantic layer was written for: the IR names it, and the Metabase driver
the source maps it to (`::ir/warehouse`). `check-driver` fails the run up front when that driver is another one, and
logs a warning and takes the config at its word when the IR names no warehouse, or one the source knows no driver for.

The field refs the import writes carry no type at all: the instance knows its columns, and a ref's options would
override that knowledge once the card is imported, so the ref names the column and nothing more. (The import still
types columns internally, from the project's declared types through the driver, wherever it has to decide something,
and a curated dimension is written with the `effective_type` it worked out, when it knew one.) A column of unknown
type is trusted where it has to decide something: a time dimension over it is bucketed by the grain as written, and a
bare column in a boolean position is taken for a boolean.
