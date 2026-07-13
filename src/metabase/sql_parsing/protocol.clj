(ns metabase.sql-parsing.protocol
  "The strongly-typed protocol implemented by the sqlglot SQL parsers (currently
  [[metabase.sql-parsing.graal]]). Callers go through [[metabase.sql-parsing.core]], which owns the
  JVM-side pre/post-processing and invokes these methods on the implementation.")

(set! *warn-on-reflection* true)

(defprotocol SqlParser
  "Dialect-aware SQL parsing via sqlglot. Each method calls the corresponding `sql_tools` Python function
  and returns its result parsed from JSON into Clojure data, except the SQL-rewriting methods
  ([[add-into-clause]], [[replace-names]]) which return the rewritten SQL string. `dialect` is a sqlglot
  dialect string, or nil for sqlglot's default dialect."
  (referenced-tables [parser dialect sql]
    "Table references literally present in the SQL, as a vector of `[catalog schema table]` 3-tuples.")
  (referenced-fields [parser dialect sql]
    "Field references from actual database tables, as a vector of `[catalog schema table field]`
    4-tuples (wildcards as `\"*\"`).")
  (returned-columns-lineage [parser dialect sql default-table-schema sqlglot-schema]
    "Column lineage of the query's output, as a vector of `[alias pure? deps]` tuples.")
  (validate-query [parser dialect sql default-table-schema sqlglot-schema]
    "Validate the query against `sqlglot-schema` (strict) or its own structure (permissive when the
    schema is nil/empty). Returns a keywordized `{:status \"ok\"}` or `{:status \"error\" ...}` map.")
  (simple-query [parser dialect sql]
    "Whether the SQL is a simple SELECT without LIMIT, OFFSET, or CTEs. Returns a keywordized
    `{:is_simple ...}` map with a `:reason` when false.")
  (add-into-clause [parser dialect sql table-name]
    "Add an `INTO table-name` clause to a SELECT statement (SQL Server SELECT INTO syntax). Returns the
    rewritten SQL string.")
  (field-references [parser dialect sql]
    "Used and returned field specs, as a keywordized map of `:used_fields`, `:returned_fields`, and
    `:errors` in the raw Python shape.")
  (replace-names [parser dialect sql replacements]
    "Replace schema/table/column names in the SQL. Returns the rewritten SQL string. Replacement values
    are injected into the AST unsanitized — callers must ensure they are system-generated.")
  (single-stmt-of-type [parser dialect sql stmt-type]
    "Whether the SQL is a single statement of `stmt-type`, as a keywordized map that includes the SQL
    reconstructed from the parsed AST.")
  (transpile-sql [parser sql from-dialect to-dialect]
    "Transpile the SQL from one dialect to another, as a keywordized result map."))
