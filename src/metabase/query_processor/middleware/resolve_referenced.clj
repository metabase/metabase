(ns metabase.query-processor.middleware.resolve-referenced
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.fetch-source-query :as qp.fetch-source-query]
   [metabase.query-processor.middleware.resolve-fields :as qp.resolve-fields]
   [metabase.query-processor.middleware.resolve-source-table :as qp.resolve-source-table]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [weavejester.dependency :as dep])
  (:import
   (clojure.lang ExceptionInfo)))

(mu/defn ^:private resolve-referenced-card-resources*
  "Done for side effects; warm the MetadataProvider."
  [query :- ::lib.schema/query]
  (doseq [referenced-card (lib/template-tags-referenced-cards query)
          :let            [referenced-query (->> referenced-card
                                                 (qp.fetch-source-query/normalize-card-query query)
                                                 :dataset-query)
                           resolved-query   (qp.fetch-source-query/resolve-source-cards referenced-query)]]
    (qp.resolve-source-table/resolve-source-tables resolved-query)
    (qp.resolve-fields/resolve-fields resolved-query)))

(mu/defn ^:private card-subquery-graph
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   graph                 :- :map
   card-id               :- ::lib.schema.id/card]
  (let [card-query (->> (or (lib.metadata/card metadata-providerable card-id)
                            (throw (ex-info (tru "Card {0} does not exist, or is from a different Database." (pr-str card-id))
                                            {:type qp.error-type/invalid-query, :card-id card-id})))
                        (qp.fetch-source-query/normalize-card-query metadata-providerable)
                        :dataset-query)]
    (reduce
     (fn [g sub-card-id]
       (card-subquery-graph metadata-providerable
                            (dep/depend g card-id sub-card-id)
                            sub-card-id))
     graph
     (lib/template-tag-card-ids card-query))))

(mu/defn ^:private circular-ref-error :- ::lib.schema.common/non-blank-string
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   from-card             :- ::lib.schema.id/card
   to-card               :- ::lib.schema.id/card]
  (let [cards     (into {}
                        (map (juxt :id :name))
                        (lib.metadata/bulk-metadata metadata-providerable :metadata/card #{from-card to-card}))
        from-name (or (get cards from-card)
                      (throw (ex-info (tru "Referenced query is from a different database")
                                      {:type qp.error-type/invalid-query, :card-id from-card})))
        to-name   (or (get cards to-card)
                      (throw (ex-info (tru "Referenced query is from a different database")
                                      {:type qp.error-type/invalid-query, :card-id to-card})))]
    (str
     (tru "This query has circular referencing sub-queries. ")
     (tru "These questions seem to be part of the problem: \"{0}\" and \"{1}\"." from-name to-name))))

(mu/defn ^:private check-for-circular-references
  "Done for side effects; [[card-subquery-graph]] will throw if there are circular references."
  [query :- ::lib.schema/query]
  (try
    (reduce (partial card-subquery-graph query)
            (dep/graph)
            (lib/template-tag-card-ids query))
    (catch ExceptionInfo e
      (let [{:keys [reason node dependency]} (ex-data e)]
        (if (= reason :weavejester.dependency/circular-dependency)
          (throw (ex-info (circular-ref-error query node dependency) {:original-exception e}))
          (throw e))))))

(mu/defn resolve-referenced-card-resources :- ::lib.schema/query
  "Resolves tables and fields referenced in card query template tags."
  [query :- ::lib.schema/query]
  (check-for-circular-references query)
  (resolve-referenced-card-resources* query)
  query)
