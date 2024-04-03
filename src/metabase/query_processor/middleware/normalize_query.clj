(ns metabase.query-processor.middleware.normalize-query
  "Middleware that converts a query into a normalized, canonical form."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmulti ^:private normalize*
  {:arglists '([query])}
  lib/normalized-query-type)

(defn- normalize-legacy-query [query]
  (lib/query (qp.store/metadata-provider) query))

(defmethod normalize* :query  [query] (normalize-legacy-query query))
(defmethod normalize* :native [query] (normalize-legacy-query query))

;;; normalize a pMBQL query
(defmethod normalize* :mbql/query
  [query]
  (let [query (lib/normalize query)]
    ;; attach the metatdata provider if needed.
    (cond->> query
      (not (:lib/metadata query)) (lib/query (qp.store/metadata-provider)))))

;;; normalize an audit app query
(defmethod normalize* :internal
  [query]
  (-> query
      (update-keys keyword)
      (update :type keyword)))

(defmethod normalize* :default
  [query]
  (throw (ex-info (i18n/tru "Invalid query, missing query :type or :lib/type")
                  {:query query, :type qp.error-type/invalid-query})))

(mu/defn normalize-preprocessing-middleware :- [:and
                                                [:map
                                                 [:database ::lib.schema.id/database]
                                                 [:lib/type {:optional true} [:= :mbql/query]]
                                                 [:type     {:optional true} [:= :internal]]]
                                                [:fn
                                                 {:error/message "valid pMBQL query or :internal audit query"}
                                                 (some-fn :lib/type :type)]]
  "Preprocessing middleware. Normalize a query, meaning do things like convert keys and MBQL clause tags to kebab-case
  keywords. Convert query to pMBQL if needed."
  [query :- [:map [:database ::lib.schema.id/database]]]
  (try
    (u/prog1 (normalize* query)
      (log/tracef "Normalized query:\n%s\n=>\n%s" (u/pprint-to-str query) (u/pprint-to-str <>)))
    (catch Throwable e
      (throw (ex-info (format "Error normalizing query: %s" (ex-message e))
                      {:type  qp.error-type/qp
                       :query query}
                      e)))))
