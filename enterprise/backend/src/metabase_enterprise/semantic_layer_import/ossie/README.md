# The Ossie source

Imports the metrics of an Apache Ossie semantic model into Metabase. It reads a semantic model document, YAML or JSON,
in either of the two document shapes in use, and parses it into the import's intermediate representation (IR); the
shared part of the import turns that into Metabase metric cards, as a serdes export tree that `import` loads. See [the
module's README](../README.md) for how the import fits together, and the documents it links to for [the IR](../ir.md),
[the config](../config.md), [the report](../report.md), [importing the result](../importing.md) and [the SQL in the
IR](../sql.md). This one covers what is Ossie's: the documents, running an import of one, and how each Ossie construct
converts or why it does not.

Apache Ossie (incubating) is the vendor-neutral semantic-layer interchange format Snowflake, dbt Labs, Salesforce and
others launched in 2025 as OSI, the Open Semantic Interchange, and moved to the Apache Incubator in 2026. Its spec,
JSON Schema, examples and compliance tests are at https://github.com/apache/ossie. A model is a set of *datasets*
(tables, with *fields* over their columns), the many-to-one *relationships* between them, and *metrics*, each a SQL
aggregate expression over the datasets' fields, in one or more SQL dialects.

The Ossie source is a nested module, `enterprise/semantic-layer-import.ossie`:

- `ossie.document` holds the schemas a document is decoded against, for both shapes, and reads one from a file into
  the one shape the parser reads: the record of which keys the import reads;
- `ossie.dialect` chooses which of a document's dialects the SQL is read in, and what that says about the warehouse;
- `ossie.metric-sql` turns a metric's SQL into the IR's aggregation written as SQL: finds every field reference with
  sqlglot, stands a placeholder in for it, works out the base dataset and the joins to the others, and reports an
  aggregate that would count a joined dataset's rows more than once;
- `ossie.parse` turns the document into the IR: datasets into tables, fields into dimensions and named expressions,
  relationships into joins, metrics into simple metrics;
- `ossie.core` implements `interface/raw->ir` for `:ossie`: the module's `core/convert!` loads it and calls it to
  parse a document.

## Importing an Ossie document

### The documents

Two incompatible document shapes are in use, and both are read:

| Version | Shape | Who writes it |
| -- | -- | -- |
| `0.1.1`, the released spec | the model wrapped in a `semantic_model:` array, next to `dialects:` and `vendors:` enumerations | dbt 1.12 (`target/osi_document.json`, written on `dbt parse`), Snowflake's semantic views (export and import) |
| `0.2.0.dev0`, the draft on apache/ossie `main` | the model's keys at the root of the document; datasets may carry `metrics:` of their own (dataset-scoped) beside the model's (model-scoped); fields and metrics may carry a `datatype:` | the Apache converters (Cube, Hex, Sigma, Lightdash, ...), Hex's import |

A document's `version` says which shape it is read in, and a document without one is read by its shape. A 0.1.1
document holds one model: the spec since 0.2 requires one model per document, and a 0.1.1 document with several has to
be split by hand. Anything the schemas do not name (`ai_context`, `custom_extensions`, a vendor's own keys) passes
through unread; a metric's `datatype`, `ai_context` and `custom_extensions` are carried in the IR's `meta` and written
nowhere. The spec's versions are `0.1.1` and `0.2.0.dev0` as of 2026-11; the draft is mutable, and the parser is
written against the shape of its `core-spec/ossie-schema.json` at that date.

### Running an import

From a dev REPL (needs the `:ee` alias on the classpath for the serdes YAML writer):

```clojure
(require '[metabase-enterprise.semantic-layer-import.core :as semantic-layer-import])

(semantic-layer-import/convert!
 {:type    :ossie
  :raw     "/path/to/tpch-revenue.osi.yaml"
  :out-dir "/path/to/serdes-out"
  :config  {:databases     {"SNOWFLAKE_SAMPLE_DATA" "Snowflake"}  ; warehouse database -> Metabase Database name
            :driver        :snowflake                            ; the Metabase driver for those databases
            :creator-email "admin@example.com"}})                ; the user the cards are created as
```

`:raw` is the path of the document, `.yaml`, `.yml` or `.json`. `convert!` returns [the import's report](../report.md),
and the tree it writes is checked with `metabase-enterprise.semantic-layer-import.core/preflight` before importing it
(see [Importing the result](../importing.md)).

The `:config` is [the import's](../config.md). For Ossie:

- `:databases` maps the first part of a three-part dataset `source` (`SNOWFLAKE_SAMPLE_DATA` of
  `SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.LINEITEM`) to the Metabase Database's name. A two-part source (`scott.emp`) is a
  schema and a table in no database, whose key is `nil`: `{nil "My DB"}`; a one-part source is a table in no schema;
- `:schema-mapping` maps the schema part;
- `:collection-name` defaults to `ossie metrics`, written as `collections/main/ossie_metrics.yaml` and
  `ossie_metrics/`.

Beside it, `convert!` takes the source's own option under `:options`, `{:dialect "SNOWFLAKE"}`, naming the dialect the
document's SQL is read in; see "Dialects" below for when it is needed.

Reading the document can fail before anything else does, and every such failure names the file: one that cannot be
read or does not parse (`Cannot read Ossie document ...`), one that holds no mapping (`Invalid Ossie document ...: the
file is empty`, or holds a list), one of a version the import does not read (`Unsupported Ossie document`), one that
does not match its version's schema (`Invalid Ossie document`, with the schema errors in the exception's data), a YAML
mapping with a key twice or nested a hundred levels deep (refused rather than read as its last value, or overflowing the
stack), and a 0.1.1 document holding several models. So can a `:dialect` option naming an expression language that is
not SQL, or a SQL dialect the import knows no warehouse for (`EXASOL`).

A model's `description` and `ai_context` are not read: the collection the metrics land in has a fixed description.

### Dialects

Every field and metric expression comes in one or more dialects: the portable `ANSI_SQL` and `OSSIE_SQL_2026` (the
spec's own SQL, the only dialect it defines; a 0.2.0.dev0 expression may also carry it as a top-level `sql`), and
vendor ones, `SNOWFLAKE`, `BIGQUERY`, `DATABRICKS`, `TRINO`, `CLICKHOUSE`, `POSTGRES`, `REDSHIFT` and so on, among
them expression languages that are not SQL at all (`MDX`, `DAX`, `TABLEAU`, `MAQL`, `SIGMA`). The import reads one
dialect for the whole document:

1. the `:dialect` option, when given, which has to be a vendor SQL dialect the import knows or a portable one; a
   portable one is then tried before the other portable one, so `:dialect "OSSIE_SQL_2026"` reads the spec's own SQL
   (the top-level `sql`, or an `OSSIE_SQL_2026` entry) where a document carries an `ANSI_SQL` form too;
2. otherwise the one vendor SQL dialect the document uses, if it uses exactly one: a document that writes its SQL for
   one warehouse was written for it;
3. otherwise the portable dialects: a document in `ANSI_SQL` alone, or one written for several warehouses, which the
   option tells apart.

Each expression is then read in that dialect, falling back to `ANSI_SQL`, then the top-level `sql`, then an
`OSSIE_SQL_2026` entry. An expression that has none of those is reported: a field, where a metric refers to it, with
the reason the field was left out; a metric, itself. `ANSI_SQL` comes before `OSSIE_SQL_2026` because it is what every
writer emits and what the SQL converter knows best: `OSSIE_SQL_2026`'s own functions (`ZEROIFNULL`, `DATEADD`,
`CHARINDEX`, `DIV0`) mostly do not convert, and are reported as functions the converter does not know when a metric
reaches them (`NVL` converts, as `coalesce`, and `IFF` as a `CASE`).

The chosen vendor dialect says which warehouse the document was written for, and the IR's `:warehouse` names it and
the Metabase driver that connects to it (`SNOWFLAKE` → `:snowflake`, `BIGQUERY` → `:bigquery-cloud-sdk`, `TRINO` →
`:starburst`, `SPARK` → `:sparksql`, `DRUID` → `:druid-jdbc`, ...; the table is `ossie.dialect/vendor->driver`):
`convert!` fails up front when the config's `:driver` is another one. A document read in the portable dialects names
no warehouse, and the config is taken at its word, with a warning. The metric SQL is parsed, in the source, in the
sqlglot dialect of that driver, or sqlglot's default for the portable dialects; the resolve stage parses it again in
the dialect of the config's `:driver`.

BigQuery is a dead end for now: its driver is not a JDBC one, and [the config](../config.md) refuses a `:driver` that
is not, since the import types columns through the driver's JDBC type mapping. A document in `BIGQUERY` can only be
imported for another warehouse, read in its portable forms with `:dialect "ANSI_SQL"`.

### Identifiers and the warehouse

A dataset's `source` and a field's expression are the warehouse's own names, as the document spells them, and the
import writes the names sync sees: a part written in quotes (`"My DB"."My Schema"."My Table"`, backticks and square
brackets too) as written, a bare one folded as the driver folds unquoted identifiers (upper case on Snowflake, lower on
Postgres), which `:identifier-case` overrides. Snowflake's TPC-H quickstart writes `L_ORDERKEY` bare, so it is
`L_ORDERKEY` for Snowflake and `l_orderkey` for Postgres. A field's logical `datatype` (`Integer`, `Decimal`, `Date`,
...) is the type of the column its expression names, when it names one bare, in Metabase's terms; a field with no
`datatype`, a 0.1.1 field, or one of a type the import does not know (`Opaque`, a vendor's own) is a column of unknown
type, and the instance supplies it. Ossie knows no warehouse type strings, so the driver's type mapping is not involved.

### The report

The report is [the import's](../report.md); a model-scoped metric is listed under its `name`, a dataset-scoped one
under `<dataset>.<name>`, the way the spec says it is referred to. A metric the parse stage failed on is listed under
`:errors` as `error parsing metric (<class>): <message>`; a dataset that could not be parsed is listed the same way
under its own name, with `:kind :table`, and so, under `:unsupported`, is a dataset defined by a query or named by more
than three parts. A relationship from a dataset the model does not have is listed with `:kind :relationship`. A second
dataset or metric of a name already declared is listed too: the first is read, since the rest of the import refers to
each by name. The entries come in the document's order: datasets, relationships, then metrics. "Limitations" below
collects every reason an Ossie metric is reported.

### Identifiers and re-import

The ids are [the import's](../ids.md), prefixed `ossie-import/`. A metric's unique id is `<model>.<metric>`, or
`<model>.<dataset>.<metric>` for a dataset-scoped one, a dot or backslash inside a name escaped with a backslash so
that no two metrics share an id (dataset-scoped `b` of dataset `a` is `m.a.b`, a model-scoped metric named `a.b` is
`m.a\.b`); so a metric renamed in the document is a new card on import and the old card stays in the instance, and a
new `description` keeps the card and updates it. The collection's id carries the model's `name`, so two models with
the same name collide only when they are also mapped to the same Database. A curated dimension's id is seeded by its
path, `<relationship>__<field>` for a dimension reached through a relationship and the bare field name on the metric's
own dataset; its display name is the field's `label` or name, prefixed with the relationship's only when two dimensions
of the set would otherwise share a name.

## What converts

### Datasets and fields

| Ossie | IR, and Metabase |
| -- | -- |
| a dataset whose `source` is a table, `db.schema.table`, `schema.table` or `table`, each part bare or quoted (BigQuery's `` `project.dataset.table` `` included) | a table, over that relation; the dataset's name is an alias of it, so `dataset.field` names the metric's own table |
| a dataset whose `source` is a query, or a name of more than three parts | reported under `:unsupported` with `:kind :table`, and every metric that refers to it with the same reason |
| a field with a `dimension` | a dimension of the table: `:time` when `is_time` is true, or, when it is left out, when the field's `datatype` is `Date`, `Time`, `DateTime`, `DateTimeTz` or `timestamp`, as 0.2.0.dev0 defaults it (a 0.1.1 field usually has no `datatype`, and is then `:categorical`; Snowflake's 0.1.1 writer emits one, and it is read the same way). Its `label` and `description` are the curated dimension's; a time dimension has no grain, Ossie having none |
| a field without a `dimension` | a named expression of the table, inlined where a metric refers to it. Not something a metric can be broken out by. The spec leaves this open: it defines `dimension` only as the metadata of a field that is one, and says of fields that they "can be used for grouping, filtering, and in metric expressions" without saying which. The writers that mark anything (Snowflake's, the TPC-DS example) mark the groupable fields with `dimension`, so the import reads it as the declaration; a document that marks nothing (the compliance ladder, SCOTT) gets metrics with no curated dimensions rather than a dimension per column |
| a field whose expression is a bare column, quoted or not, qualified by the dataset or not | documents that column, as written, typed by the field's `datatype` |
| a field with no expression in a dialect the import reads | left out, logged; a metric that refers to it is reported with the reason |
| a field whose expression is SQL (`L_EXTENDEDPRICE * (1 - L_DISCOUNT)`, `EXTRACT(YEAR FROM O_ORDERDATE)`) | the dimension's or expression's `expr`, over the dataset's source columns: inlined in a metric or a filter; a dimension over SQL cannot be a curated dimension and is listed under the metric's `:unsupported-dimensions`, as [the IR](../ir.md) says |
| `primary_key` | the table's keys, one per field; a key naming no field is read as a column, the 0.1.1 reading |
| `unique_keys` | read where a relationship lands, see below |
| `description` | the table's description; the dimension groups are named after the relation's table (`LINEITEM`), a dataset having no label |

### Relationships

A relationship is a many-to-one join from its `from` dataset to its `to` dataset, which Metabase follows as an implicit
join: the dimension mapping's target names the joined column with `:source-field` set to the `from_columns` field's
column on the metric's table, the same way Metabase represents a column reached through a foreign key. The instance
has to know that foreign key, through sync or a Field edit, for the breakout to run; no explicit join clause is
written. So the `to` dataset's dimensions become dimensions of every metric over the `from` dataset, and a model-scoped
metric may reach the `to` dataset's fields (see "Metrics"). A relationship that cannot be an implicit join is a join the
import could not make, and what is behind it, the `to` dataset's dimensions, is listed under the metric's
`:unsupported-dimensions` with the reason; a metric whose SQL reaches through it is reported with the same reason:

| Ossie | Why it is unsupported |
| -- | -- |
| a composite key, `from_columns: [a, b]` | an implicit join is on one column of each side |
| a `from_columns` or `to_columns` field that is SQL rather than a column | the same: a join needs a column on each side |
| a field either side does not declare, or a `to` dataset the model does not have | nothing to join on |
| a `to_columns` field that is not, on its own, one of the `to` dataset's `primary_key` or `unique_keys`, when it declares any | a join to anything but a key would multiply the rows: a part of a composite key (`primary_key: [id, segment]`, landing on `segment`) is not a key. A dataset that declares no keys is trusted |

Dataset and field names in a relationship match ignoring case, as they do in a metric's SQL. A relationship from a
dataset the model does not have is reported (`:kind :relationship`): nothing could reach through it, so no metric would
say so; one from a dataset that is a query is logged, the dataset being reported already. A dataset may relate to
itself (`emp_to_manager`); its own dimensions then come twice, the joined ones named `<relationship>__<field>`.

### Metrics

An Ossie metric is a SQL aggregate expression over the model's fields: `SUM(lineitem.net_amount_kept)`,
`SUM(orders.amount) / COUNT(DISTINCT customers.id)`, `SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END)`.
There are no metric types, no filters, no grains, and a metric cannot refer to another metric. Each becomes a simple
IR metric whose aggregation is that SQL with a placeholder for every field reference, converted whole by the
`sql-to-mbql` module into one Lib aggregation clause (see [SQL in the IR](../sql.md) for the subset of SQL that
converts; its README's "Aggregations" section lists the aggregates):

| Ossie | Metabase |
| -- | -- |
| `SUM`, `AVG`, `MIN`, `MAX`, `MEDIAN`, `COUNT(DISTINCT x)`, `PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY x [DESC])`, `STDDEV_POP`, `VAR_POP` | `sum`, `avg`, `min`, `max`, `median`, `distinct`, `percentile` (of `1 - p` for a `DESC` order, the same value), `stddev`, `var`. Where Metabase's percentile is an approximation (BigQuery, SQL Server, the Trino family) or missing (MySQL, SQLite), or its `AVG` of integers would not truncate as SQL Server's and Redshift's do, the SQL converter reports the aggregate; see its README |
| `COUNT(*)`, `COUNT(1)`, `COUNT(dataset.*)` | `count`, a row count; `COUNT(x)` is `count` over the field, which compiles to `COUNT(x)` |
| `SUM(x) FILTER (WHERE c)`, `COUNT(...) FILTER (WHERE c)`, `COUNT_IF(c)`, `SUM(CASE WHEN c THEN x ELSE 0 END)` and the other `CASE` idioms | `sum-where`, `count-where`, `distinct-where`, `share`. `FILTER` over any other aggregate (`AVG`, `MIN`, `MEDIAN`, ...) is reported: Metabase has no filtered form of those, and the `CASE` idiom (`AVG(CASE WHEN c THEN x END)`) converts as the aggregate over the `CASE` |
| arithmetic, `NULLIF`, `COALESCE`, `IF`/`IFF` and the row-level functions over aggregates | one aggregation, `x / NULLIF(y, 0)` being `x / y` |
| a field reference, `dataset.field` or bare | the field inlined: its column, or its SQL as the dimension's or expression's `expr`, perhaps through a relationship's join |
| the metric's `description` | the card's description |

**Scoping and names.** A model-scoped metric (the model's `metrics`) names fields as `dataset.field`; a dataset-scoped
one (a 0.2.0.dev0 dataset's own `metrics`) names its own dataset's fields bare and may not reach another dataset. The
spec says a model-scoped metric has to qualify every field, but most converters read a bare name (Sigma's drops the
metric, as the ladder's `m0_sum_bare` fixture notes), and so does the import: as the field of the one dataset that
declares a field of that name, reported when none or several do (the compliance ladder carries bare variants,
`SUM(amount)`, for exactly this). Names match ignoring case, as SQL does. `COUNT(dataset.*)` names the dataset and no
field.
A field reference may only name a declared field: `SUM(store_sales.ss_bogus)`, where `ss_bogus` is a column of the
source but no field, is reported, as the spec says it is invalid.

**The base dataset.** A Metabase metric is over one table, so a metric that spans datasets needs a base: the one
dataset among those it refers to from which every other is reached through the model's relationships, each by its
shortest path, which becomes the reference's path of joins. A metric over one dataset is over it; a dataset-scoped
metric over its own. `COUNT(DISTINCT orders.o_orderkey)` is over `orders`; `SUM(lineitem.net_amount_kept) /
COUNT(DISTINCT orders.o_orderkey)` is over `lineitem`, reaching `orders` through `lineitem_to_orders`. The resolve
stage follows one join; a reference two relationships away is reported there. A metric over a dataset that is reached
from none of the others, over datasets that each reach the others (a cycle), or over a dataset two shortest paths lead
to, is reported.

**The time dimension.** A metric's default dimension is its base dataset's time dimension, when the dataset has
exactly one (TPC-H's `lineitem` has `ship_date`; `orders` has `order_date` and `order_year`, so a metric over it has
none, and nothing says so: a metric without a default dimension is not a report entry). A time dimension that is SQL
(`order_year`) counts as one here but cannot be a curated dimension, so a metric over such a dataset has no default
either way. Ossie has no time grains, so it has no default temporal unit.

**Aggregates over a joined dataset.** A metric spanning datasets reaches the one side of a relationship through an
implicit join, which gives the one side's values once per row of the many side: `SUM(store.s_number_employees)` over
`store_sales` sums each store's employees once per sale. The spec's own semantics for this are a proposal still
(apache/ossie PR 246, whose reference strategy de-duplicates the one side by its key before aggregating), and Metabase's
implicit join does not do that, so such an aggregate is reported, naming the aggregate and the field. What converts:
`MIN`, `MAX` and `COUNT(DISTINCT ...)` over a joined field, which give the same answer either way; a joined field in a
condition (`CASE WHEN item.i_category = 'Books' THEN ...`, `FILTER (WHERE store.s_state = 'CA')`), which is a test on
each row; and an aggregate whose argument also takes a field of the base dataset (`SUM(lineitem.qty * part.price)`),
which is a value per base row. TPC-DS's `customer_lifetime_value`, `SUM(store_sales.ss_ext_sales_price) /
COUNT(DISTINCT customer.c_customer_sk)`, converts; its `store_productivity`, over `SUM(store.s_number_employees)`, is
reported.

## Limitations

A Metabase metric is one aggregation over one table, with a curated set of dimensions it can be broken out by. Whatever
Ossie can say that does not fit that shape is not approximated: the import reports each case and moves on. A metric it
cannot convert is listed in the report's `:unsupported` with the reason, and a dimension that cannot become a curated
dimension is listed under the metric's `:unsupported-dimensions` while the metric itself still converts. The SQL
itself has the `sql-to-mbql` module's limits, listed under [What does not
convert](../../../../../../src/metabase/sql_to_mbql/README.md#what-does-not-convert); what is Ossie's own:

| Ossie | Example | Why it is unsupported | What it would take |
| -- | -- | -- | -- |
| a window-function metric, which is how Ossie writes cumulative, ranking and period-over-period metrics | `SUM(SUM(store_sales.ss_ext_sales_price)) OVER (ORDER BY date_dim.d_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`, `RANK() OVER (PARTITION BY store.s_store_sk ORDER BY SUM(...) DESC)`, `SUM(x) - LAG(SUM(x), 1) OVER (ORDER BY d_year, d_moy)` | The value depends on the other rows of the result, which the metric's `description` says the query has to group by; one aggregation has no say over the breakout. The SQL converter reports it. | Read a `SUM(SUM(x)) OVER (ORDER BY t ROWS UNBOUNDED PRECEDING)` as `cum-sum` with `t` as the metric's time dimension, and `LAG` as `offset`, as the dbt source does for cumulative metrics it can recognise. |
| an aggregate over a field of a joined dataset | `SUM(store.s_number_employees)` from `store_sales` | See "Aggregates over a joined dataset": it would count each store once per sale. | The spec's semantics (PR 246) once settled; in Metabase, a `[:metric ...]` reference to a card on another table, so the one side is aggregated at its own grain. |
| a reference two relationships away | `SUM(lineitem.net_amount_kept) FILTER (WHERE customer.market_segment = 'BUILDING')` from `lineitem`, through `orders` | A dimension mapping is one implicit join; the resolve stage reports a two-hop path. | Extend Metabase metrics so a mapping can carry a multi-hop join path, or so a metric query can hold explicit joins. |
| a dataset defined by a query, or named by more than three parts | `source: SELECT * FROM orders WHERE deleted IS NULL`; `source: srv.db.sch.t` | A metric is over a table, and an implicit join needs one; a table is named by at most `database.schema.table`. | Import the query as a model card and let the metric be over it. |
| a composite-key relationship, or one on a SQL field or landing off a key | `from_columns: [ss_item_sk, ss_ticket_number]`; `to_columns: [s_city]` on a dataset keyed by `s_store_sk`; `to_columns: [id]` on a dataset keyed by `[id, segment]` | See "Relationships". | Explicit joins in Metabase metrics. |
| a second dataset or metric of a name already declared | two `metrics` named `total`; a dataset-scoped metric `b` of dataset `a` beside a model-scoped metric named `a.b` | The rest of the import refers to a dataset or a metric by name, so the two would be one card, the second written over the first. The first is read. A second field of a name is left out the same way, logged rather than reported. | Nothing: rename one. |
| a relationship from a dataset the model does not have | `from: date_dim` with no such dataset | Nothing could reach through it; reported so that a misspelling is not silent. | Nothing: fix the name. |
| a document in `BIGQUERY` for BigQuery | | The import types columns through a JDBC driver's type mapping, and BigQuery's driver is not one, so the config refuses it; see "Dialects". | Type columns for the BigQuery driver, whose `database-type->base-type` is its own. |
| a field whose expression is SQL, as a curated dimension | `order_year: EXTRACT(YEAR FROM O_ORDERDATE)` with `dimension: {is_time: true}` | A dimension mapping targets a column. A filter or a metric still inlines it. | Extend Metabase metrics so a mapping can target an expression. |
| a metric that refers to another metric | `net_revenue / order_count` | The spec forbids it, and the SQL converter sees a column outside an aggregate. | Nothing: write the arithmetic out, as the spec says to. |
| a metric that names no dataset in a model of several | `COUNT(*)` as a model-scoped metric | Nothing says which dataset's rows to count. | Nothing: make it dataset-scoped. |
| an expression in no readable dialect | a field or metric written in `MDX` or `DAX` only | Nothing here reads anything but SQL. | A writer that emits an `ANSI_SQL` form beside its own. |
| `ai_context`, `custom_extensions`, `datatype` on a metric | | Carried in the IR's `meta`, written nowhere: a card has no place for them. | |

Two cases are reported rather than guessed at where the document is ambiguous or at odds with itself: a field written
in the case of a SQL keyword that also appears in the SQL (`COUNT(DATE) + CAST(x AS DATE)`), since the rewrite cannot
tell the two apart; and a dataset-scoped metric that refers to another dataset, which the spec says is model-scoped.

## Fixtures and tests

### The test fixtures

Under `enterprise/backend/test_resources/semantic_layer_import/ossie/`, taken from public repositories as they were on
2026-11-02 (the README there says where each comes from and under which license):

- `tpch/tpch-revenue.osi.yaml` and `tpch-revenue.osi.v02.yaml`, Snowflake's TPC-H quickstart model in both shapes:
  five datasets in a chain of four relationships, computed fields (`net_amount_kept` as a `CASE`), a composite primary
  key, a SQL time dimension (`order_year`), and four metrics, one a ratio of aggregates. All four convert, and the two
  documents write the same tree. It is the one fixture with data to run against: `tpch/tpch_sf0_001.edn` is TPC-H at
  scale factor 0.001 as a test dataset, for the end-to-end test.
- `apache/compliance/portability/`, the spec's portability ladder, rungs M0 to M3: one dataset, the core aggregates,
  a filtered aggregate, each in the qualified (`SUM(sales.amount)`) and bare (`SUM(amount)`) reference forms. Every
  rung converts, both forms alike.
- `apache/compliance/scott/scott_model.ossie.yaml`, the SCOTT schema with dataset-scoped metrics, a two-part `source`
  and a self-join.
- `apache/examples/tpcds_semantic_model.yaml`, the TPC-DS example, with three window-function metrics and a sum over a
  joined dataset, for what is reported; and the same example in the 0.1.1 shape, from the `osi-0.1.1-rc1` tag.
- `apache/examples/renamed_fields.yaml`, fields named unlike their source columns, so a metric that names a field
  converts to the column it stands for.
- `duckdb_ossie/`, the fixtures of another implementation: documents it refuses (a dangling relationship, a malformed
  expression, an undeclared field, a model-scoped metric with bare names, the 0.1.1 wrapper, broken YAML) and ones it
  reads (an ambiguous join path, a relationship off a key, `OSSIE_SQL_2026`'s functions, hostile-but-legal YAML).

### The end-to-end test

`e2e_test.clj` is the import described under "Running an import" as a test: it loads TPC-H at scale factor 0.001 as a
Postgres test dataset, converts the quickstart document for that database (`SNOWFLAKE_SAMPLE_DATA` mapped to it,
`TPCH_SF1` to `public`, the driver folding the upper-case names to the lower-case ones the dataset is loaded in),
imports the YAML with serdes, and checks that every converted metric returns the number a hand-written SQL query does,
that `net_revenue` is the number DuckDB computed over the same data when the dataset was generated, that the curated
dimensions break a metric out through the relationship's implicit join, that the cards came through with result
metadata, and that importing a second time updates the cards instead of duplicating them. It runs on Postgres only.
Run it by name with the Postgres driver enabled:

```sh
./bin/test-agent --drivers=postgres :only '[metabase-enterprise.semantic-layer-import.ossie.e2e-test]'
```

The dataset is generated by `test_util/tpch.py`, DuckDB's `tpch` extension run through `uv run --with duckdb==<pinned
version>`, and written as EDN by the test-util namespace of the same name: the five tables the model is defined over,
without their comment columns, with TPC-H's keys as the tables' primary and foreign keys so a sync knows the joins. The
quickstart documents `net_revenue` at scale factor 1 as 164,360,931,200.40, which a checked-in fixture cannot reach
(six million order lines); the generator computes the metric at scale factor 1 as well, in seconds, and refuses to
write the dataset unless it gets that number, so the formula and the data are known to be TPC-H's. It writes the metric
at the small scale next to the dataset, in `tpch_sf0_001_summary.edn`, for the end-to-end test to check against.
Regenerate from a REPL at the repo root, with `uv` on `PATH`:

```clojure
(require '[metabase-enterprise.semantic-layer-import.ossie.test-util.tpch :as tpch])

(tpch/regenerate!)
```

### Running the tests

The tests live under `enterprise/backend/test/metabase_enterprise/semantic_layer_import/ossie/`, and the regular
backend test run picks them up. Run them in a fresh JVM with

```sh
./bin/test-agent :module enterprise/semantic-layer-import
```

or one namespace with `./bin/test-agent :only '[metabase-enterprise.semantic-layer-import.ossie.parse-test]'`.
`document-test` covers the two shapes and what is refused up front; `dialect-test` which dialect is read;
`metric-sql-test` the placeholders, the base dataset, the paths and the fan-out check; `parse-test` what the IR gets of
a document; `core-test` the whole pipeline on the TPC-H document and parse and resolve on every other fixture, pinning
what converts, to what, and what is reported with which reason. All but the end-to-end test need no warehouse.
