(ns metabase.query-processor.middleware.resolve-source-table
  "Fetches Tables corresponding to any `:source-table` IDs anywhere in the query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

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

(s/defn ^:private query->source-table-ids :- (s/maybe (su/non-empty #{su/IntGreaterThanZero}))
  "Fetch a set of all `:source-table` IDs anywhere in `query`."
  [query]
  (some->
   (mbql.u/match query
     (m :guard (every-pred map? :source-table #(integer? (:source-table %))))
     ;; Recursively look in the rest of `m` for any other source tables
     (cons
      (:source-table m)
      (filter some? (recur (dissoc m :source-table)))))
   flatten
   set))

(defn resolve-source-tables*
  "Resolve all Tables referenced in the `query`, and store them in the QP Store."
  [query]
  (check-all-source-table-ids-are-valid query)
  (qp.store/fetch-and-store-tables! (query->source-table-ids query)))

(defn resolve-source-tables
  "Middleware that will take any `:source-table`s (integer IDs) anywhere in the query and fetch and save the
  corresponding Table in the Query Processor Store."
  [qp]
  (fn [query rff context]
    (resolve-source-tables* query)
    (qp query rff context)))
