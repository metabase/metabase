(ns metabase.contextual-interestingness.sql
  "Compile a chart's dataset_query down to a SQL string for inclusion in LLM prompts.
  Used by the contextual scorer / describer so the LLM can read the actual aggregation,
  joins, and filters — semantics that chart title + axis types do not carry.

  Native queries pass their `:query` through. MBQL queries are compiled via
  [[metabase.query-processor.core/compile-with-inline-parameters]] so parameters appear
  as inline literals (no `?` placeholders + separate params array) and the resulting SQL is
  human-readable end-to-end.

  !!! DANGER — READ-ONLY SQL !!!
  The SQL produced here interpolates parameter VALUES directly into the query text. It is
  SAFE ONLY for human/LLM *reading*. It must NEVER be executed, re-parsed into a query, or
  persisted as the source of a native question — inline-parameter SQL is a SQL-injection
  vector by construction. If you ever find yourself wanting to run this output, stop: use
  the parameterized query instead."
  (:require
   [metabase.query-processor.core :as qp]
   [metabase.util.log :as log]))

(def ^:private max-sql-chars
  "Cap on the SQL string we hand to the LLM. Complex queries with many joins can run long;
  4 KB is more than enough for the LLM to read the metric's intent and bounds worst-case
  prompt size."
  4000)

(defn- truncate
  [s]
  (when s
    (if (<= (count s) max-sql-chars)
      s
      (str (subs s 0 max-sql-chars) "\n-- ... (truncated)"))))

(defn dataset-query->sql
  "Return a SQL string for `dataset-query`, or nil on any failure (no `:database`, driver
  missing, compilation throws, etc.). The result is truncated at [[max-sql-chars]].

  DANGER: the returned SQL has parameter values inlined and is safe ONLY for reading (see the
  namespace docstring). Never execute it or persist it as a native query.

  This is best-effort — callers should treat nil as 'continue without the SQL context'."
  [dataset-query]
  (try
    (some-> dataset-query
            qp/compile-with-inline-parameters
            :query
            str
            truncate)
    (catch Throwable e
      (log/debug e "dataset-query->sql failed; continuing without SQL")
      nil)))
