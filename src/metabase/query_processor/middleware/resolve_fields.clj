(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:refer-clojure :exclude [not-empty])
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.performance :refer [not-empty]]))

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

;;; TODO (Cam 9/10/25) -- give this a more accurate name like `prefetch-all-fields` or
;;; `warm-metadata-provider-cache-with-all-fields` or something.
(defn resolve-fields
  "Resolve all field referenced in the `query`, and store them in the Metadata Provider."
  [query]
  (let [ids (lib/all-field-ids query)]
    (try
      (u/prog1 query
        (resolve-fields-with-ids! query ids))
      (catch Throwable e
        (throw (ex-info (tru "Error resolving Fields in query: {0}" (ex-message e))
                        {:field-ids ids
                         :query     query
                         :type      qp.error-type/qp}
                        e))))))
