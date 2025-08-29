(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- resolve-fields-with-ids!
  [metadata-providerable field-ids]
  (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/column field-ids)
  (when-let [parent-ids (not-empty
                         (into #{}
                               (keep (fn [field-id]
                                       (:parent-id (lib.metadata/field metadata-providerable field-id))))
                               field-ids))]
    (recur metadata-providerable parent-ids)))

(mu/defn- field-ids :- [:set ::lib.schema.id/field]
  [query :- ::lib.schema/query]
  (let [field-ids (atom #{})]
    (lib.walk/walk-clauses
     query
     (fn [_query _path-type _stage-or-join-path clause]
       (lib.util.match/match-lite clause
         [:field _opts (id :guard pos-int?)]
         (do
           (swap! field-ids conj id)
           nil))))
    @field-ids))

(mu/defn bulk-fetch-fields :- ::lib.schema.id/query
  "Warm the MetadataProvider cache by fetching all Fields referenced by ID in the `query`."
  [query :- ::lib.schema.id/query]
  (let [ids (field-ids query)]
    (try
      (u/prog1 query
        (let [metadata-providerable (if (:lib/type query)
                                      query
                                      (qp.store/metadata-provider))]
          (resolve-fields-with-ids! metadata-providerable ids)))
      (catch Throwable e
        (throw (ex-info (tru "Error resolving Fields in query: {0}" (ex-message e))
                        {:field-ids ids
                         :query     query
                         :type      qp.error-type/qp}
                        e))))))
