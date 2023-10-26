(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]))

(defn- resolve-fields-with-ids!
  [field-ids]
  (qp.store/bulk-metadata :metadata/column field-ids)
  (when-let [parent-ids (not-empty
                         (into []
                               (comp (map (fn [field-id]
                                            (:parent-id (lib.metadata/field (qp.store/metadata-provider) field-id))))
                                     (filter some?))
                               field-ids))]
    (recur parent-ids)))

(defn resolve-fields
  "Resolve all field referenced in the `query`, and store them in the QP Store."
  [query]
  (let [field-ids (volatile! #{})]
    (lib.walk/walk-refs
     query
     (fn [[tag :as clause] _context]
       (when (= tag :field)
         (let [[_field _opts id-or-name] clause]
           (when (pos-int? id-or-name)
             (vswap! field-ids conj id-or-name))))
       clause))
    (try
      (resolve-fields-with-ids! @field-ids)
      (catch Throwable e
        (throw (ex-info (tru "Error resolving Fields in query: {0}" (ex-message e))
                        {:field-ids @field-ids
                         :query     query
                         :type      qp.error-type/qp}
                        e)))))
  query)
