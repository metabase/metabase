(ns metabase.query-processor.middleware.resolve-referenced
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.query-processor.middleware.fetch-source-query-legacy
    :as fetch-source-query-legacy]
   [metabase.query-processor.middleware.resolve-fields
    :as qp.resolve-fields]
   [metabase.query-processor.middleware.resolve-source-table
    :as qp.resolve-source-table]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.tag-referenced-cards
    :as qp.u.tag-referenced-cards]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [weavejester.dependency :as dep])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- check-query-database-id=
  [query database-id]
  (when-not (= (:database query) database-id)
    (throw (ex-info (tru "Referenced query is from a different database")
                    {:referenced-query     query
                     :expected-database-id database-id}))))

(mu/defn ^:private resolve-referenced-card-resources* :- :map
  [query]
  (doseq [referenced-card (qp.u.tag-referenced-cards/tags-referenced-cards query)
          :let            [referenced-query (:dataset-query referenced-card)
                           resolved-query (fetch-source-query-legacy/resolve-card-id-source-tables* referenced-query)]]
    (check-query-database-id= referenced-query (:database query))
    (qp.resolve-source-table/resolve-source-tables resolved-query)
    (qp.resolve-fields/resolve-fields resolved-query))
  query)

(defn- card-subquery-graph
  [graph card-id]
  (let [card-query (:dataset-query (lib.metadata.protocols/card (qp.store/metadata-provider) card-id))]
    (reduce
     (fn [g sub-card-id]
       (card-subquery-graph (dep/depend g card-id sub-card-id)
                            sub-card-id))
     graph
     (qp.u.tag-referenced-cards/query->tag-card-ids card-query))))

(mu/defn ^:private circular-ref-error :- ::lib.schema.common/non-blank-string
  [from-card :- ::lib.schema.id/card
   to-card   :- ::lib.schema.id/card]
  (let [cards               (into {}
                                  (map (juxt :id :name))
                                  (qp.store/bulk-metadata :metadata/card #{from-card to-card}))
        from-name           (get cards from-card)
        to-name             (get cards to-card)]
    (str
     (tru "This query has circular referencing sub-queries. ")
     (tru "These questions seem to be part of the problem: \"{0}\" and \"{1}\"." from-name to-name))))

(defn- check-for-circular-references
  [query]
  (try
   ;; `card-subquery-graph` will throw if there are circular references
   (reduce card-subquery-graph (dep/graph) (qp.u.tag-referenced-cards/query->tag-card-ids query))
   (catch ExceptionInfo e
     (let [{:keys [reason node dependency]} (ex-data e)]
       (if (= reason :weavejester.dependency/circular-dependency)
         (throw (ex-info (circular-ref-error node dependency) {:original-exception e}))
         (throw e)))))
  query)

(defn resolve-referenced-card-resources
  "Resolves tables and fields referenced in card query template tags."
  [query]
  (-> query check-for-circular-references resolve-referenced-card-resources*))
