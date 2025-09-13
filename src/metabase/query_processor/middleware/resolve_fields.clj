(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- resolve-fields-with-ids!
  [metadata-providerable field-ids]
  (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/column field-ids)
  (when-let [parent-ids (not-empty
                         (into #{}
                               (comp (map (fn [field-id]
                                            (:parent-id (lib.metadata/field metadata-providerable field-id))))
                                     (filter some?))
                               field-ids))]
    (recur metadata-providerable parent-ids)))

(mu/defn- field-ids :- [:set ::lib.schema.id/field]
  [query :- ::lib.schema/query]
  (into #{}
        (lib.util.match/match (:stages query)
          [:field _opts (id :guard pos-int?)]
          id

          ;; stage metadata
          {:lib/type :metadata/column, :id (id :guard pos-int?)}
          id)))

;;; TODO (Cam 9/10/25) -- give this a more accurate name like `prefetch-all-fields` or
;;; `warm-metadata-provider-cache-with-all-fields` or something.
(defn resolve-fields
  "Resolve all field referenced in the `query`, and store them in the Metadata Provider."
  [query]
  (let [ids (field-ids query)]
    (try
      (u/prog1 query
        (resolve-fields-with-ids! query ids))
      (catch Throwable e
        (throw (ex-info (tru "Error resolving Fields in query: {0}" (ex-message e))
                        {:field-ids ids
                         :query     query
                         :type      qp.error-type/qp}
                        e))))))
