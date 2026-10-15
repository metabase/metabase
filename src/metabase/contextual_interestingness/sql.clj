(ns metabase.contextual-interestingness.sql
  "Compile a chart's dataset_query down to a SQL string for inclusion in LLM prompts.
  Used by the contextual scorer / describer so the LLM can read the actual aggregation,
  joins, and filters — semantics that chart title + axis types do not carry.

  Compiled with parameters left as `?` placeholders, and only the query text is kept — the
  values are discarded with the `:params` array.

  That is a privacy boundary, not a formatting preference. Compilation happens under the
  exploration creator's identity (`metabase.explorations.runner/run-query!` binds them), so the
  preprocessing pipeline applies their sandbox: `apply-sandboxing` injects the GTAP subquery, and
  the creator's user-attribute values become parameters of this query. Inlining them would render
  identity attributes as literals inside a string handed to a third-party model provider — which
  no admin configuring a sandbox would expect. The structure the LLM actually needs (aggregation,
  joins, filters, grouping) survives placeholder compilation; the attribute values do not."
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

  Parameters stay as `?` — the values are dropped rather than inlined, keeping the compiling user's
  sandbox attributes out of the prompt (see the namespace docstring).

  This is best-effort — callers should treat nil as 'continue without the SQL context'."
  [dataset-query]
  (try
    (some-> dataset-query
            qp/compile
            :query
            str
            truncate)
    (catch Throwable e
      (log/debug e "dataset-query->sql failed; continuing without SQL")
      nil)))
