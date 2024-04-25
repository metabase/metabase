(ns metabase.query-processor.middleware.resolve-source-table
  "Fetches Tables corresponding to any `:source-table` IDs anywhere in the query."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(mu/defn  ^:private query->source-table-ids :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
  "Fetch a set of all `:source-table` IDs anywhere in `query`."
  [query]
  (let [source-table-ids (volatile! #{})]
    (lib.walk/walk-stages
     query
     (fn [_query _path {:keys [source-table], :as _stage}]
       (when source-table
         (vswap! source-table-ids conj source-table))))
    (not-empty @source-table-ids)))

(defn resolve-source-tables
  "Middleware that will take any `:source-table`s (integer IDs) anywhere in the query and fetch and save the
  corresponding Table in the Query Processor Store."
  [query]
  ;; this is done for side effects
  (lib.metadata/bulk-metadata-or-throw query :metadata/table (query->source-table-ids query))
  query)
