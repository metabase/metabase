(ns metabase.contextual-interestingness.sql
  "Compile a chart's dataset_query down to a SQL string for inclusion in LLM prompts.
  Used by the contextual scorer / describer so the LLM can read the actual aggregation,
  joins, and filters — semantics that chart title + axis types do not carry.

  Native queries pass their `:query` through. MBQL queries are compiled via
  [[metabase.query-processor.core/compile-with-inline-parameters]] so parameters appear
  as inline literals (no `?` placeholders + separate params array) and the resulting SQL is
  human-readable end-to-end."
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

  This is best-effort — callers should treat nil as 'continue without the SQL context'."
  [dataset-query]
  (try
    (when dataset-query
      (let [{:keys [query]} (qp/compile-with-inline-parameters dataset-query)]
        (truncate (some-> query str))))
    (catch Throwable e
      (log/debug e "dataset-query->sql failed; continuing without SQL")
      nil)))
