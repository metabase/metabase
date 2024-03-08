(ns metabase.query-processor.middleware.resolve-source-table
  "Fetches Tables corresponding to any `:source-table` IDs anywhere in the query."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.walk :as lib.walk]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defmulti ^:private check-all-source-table-ids-are-valid
  "Sanity check: Any non-positive-integer value of `:source-table` should have been resolved by now. The
  `resolve-card-id-source-tables` middleware should have already taken care of it."
  {:arglists '([query])}
  (fn [query]
    (if (:lib/type query)
      ::pmbql
      ::legacy)))

(defmethod check-all-source-table-ids-are-valid ::legacy
  [query]
  (mbql.u/match-one query
    (m :guard (every-pred map? :source-table #(string? (:source-table %))))
    (throw
     (ex-info
      (tru "Invalid :source-table ''{0}'': should be resolved to a Table ID by now." (:source-table m))
      {:form m}))))

;;; TODO -- 95% sure this middleware is unneeded, because the [[metabase.query-processor.middleware.fetch-source-query]]
;;; middleware is supposed to be handling this stuff.
(defmethod check-all-source-table-ids-are-valid ::pmbql
  [query]
  (lib.walk/walk-stages
   query
   (fn [_query _path {:keys [source-table], :as _stage}]
     (when source-table
       (when-not (pos-int? source-table)
         (throw
          (ex-info
           (tru "Invalid :source-table {0}: should be resolved to a Table ID by now." (pr-str source-table))
           {:type qp.error-type/qp, :form source-table})))))))

(defmulti ^:private query->source-table-ids
  "Fetch a set of all `:source-table` IDs anywhere in `query`."
  {:arglists '([query])}
  (fn [query]
    (if (:lib/type query)
      ::pmbql
      ::legacy)))

(mu/defmethod query->source-table-ids ::legacy :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
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

(mu/defmethod query->source-table-ids ::pmbql :- [:maybe [:set {:min 1} ::lib.schema.id/table]]
  [query]
  (let [source-table-ids (atom #{})]
    (lib.walk/walk-stages
     query
     (fn [_query _path {:keys [source-table], :as _stage}]
       (when source-table
         (swap! source-table-ids conj source-table))))
    (not-empty @source-table-ids)))

(defn resolve-source-tables
  "Middleware that will take any `:source-table`s (integer IDs) anywhere in the query and fetch and save the
  corresponding Table in the Query Processor Store."
  [query]
  (check-all-source-table-ids-are-valid query)
  ;; this is done for side effects
  (let [metadata-providerable (if (:lib/type query) query (qp.store/metadata-provider))]
    (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/table (query->source-table-ids query)))
  query)
