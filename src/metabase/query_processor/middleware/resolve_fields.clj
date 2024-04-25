(ns metabase.query-processor.middleware.resolve-fields
  "Middleware that resolves the Fields referenced by a query."
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
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
                               (comp (map (fn [field-id]
                                            (:parent-id (lib.metadata/field metadata-providerable field-id))))
                                     (filter some?))
                               field-ids))]
    (recur metadata-providerable parent-ids)))

(defmulti ^:private field-ids
  {:arglists '([query])}
  (fn [query]
    (if (:lib/type query) ::pmbql ::legacy)))

(mu/defmethod field-ids ::pmbql :- [:set ::lib.schema.id/field]
  [query :- ::lib.schema/query]
  (into #{}
        (lib.util.match/match (:stages query)
          [:field _opts (id :guard pos-int?)]
          id

          ;; stage metadata
          {:lib/type :metadata/column, :id (id :guard pos-int?)}
          id)))

(mu/defmethod field-ids ::legacy :- [:set ::lib.schema.id/field]
  [query :- ::mbql.s/Query]
  (into (set (lib.util.match/match (:query query) [:field (id :guard integer?) _] id))
        (comp cat (keep :id))
        (lib.util.match/match (:query query) {:source-metadata source-metadata} source-metadata)))

(defn resolve-fields
  "Resolve all field referenced in the `query`, and store them in the QP Store."
  [query]
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
