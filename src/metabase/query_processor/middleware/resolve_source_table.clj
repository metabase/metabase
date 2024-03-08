(ns metabase.query-processor.middleware.resolve-source-table
  "Fetches Tables corresponding to any `:source-table` IDs anywhere in the query."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- check-all-source-table-ids-are-valid
  "Sanity check: Any non-positive-integer value of `:source-table` should have been resolved by now. The
  `resolve-card-id-source-tables` middleware should have already taken care of it."
  [query]
  (mbql.u/match-one query
    (m :guard (every-pred map? :source-table #(string? (:source-table %))))
    (throw
     (ex-info
      (tru "Invalid :source-table ''{0}'': should be resolved to a Table ID by now." (:source-table m))
      {:form m}))))

(mu/defn ^:private query->source-table-ids :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
  "Fetch a set of all `:source-table` IDs anywhere in `query`."
  [query]
  (some->
   (mbql.u/match query
     (m :guard (every-pred map? :source-table))
     ;; Recursively look in the rest of `m` for any other source tables
     (cons
      (:source-table m)
      (filter some? (recur (dissoc m :source-table)))))
   flatten
   set))

(defn resolve-source-tables
  "Middleware that will take any `:source-table`s (integer IDs) anywhere in the query and fetch and save the
  corresponding Table in the Query Processor Store."
  [query]
  (check-all-source-table-ids-are-valid query)
  ;; this is done for side effects
  (qp.store/bulk-metadata :metadata/table (query->source-table-ids query))
  query)
