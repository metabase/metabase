(ns metabase.query-processor.middleware.resolve-referenced
  (:require
   [clojure.set :as set]
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

(mu/defn- resolve-referenced-card-resources*
  "Done for side effects; warm the MetadataProvider."
  [query :- ::lib.schema/query]
  (doseq [referenced-card (lib/template-tags-referenced-cards query)
          :let            [referenced-query (->> referenced-card
                                                 (qp.fetch-source-query/normalize-card-query query)
                                                 :dataset-query)
                           resolved-query   (qp.fetch-source-query/resolve-source-cards referenced-query)]]
    (qp.resolve-source-table/resolve-source-tables resolved-query)
    (qp.resolve-fields/resolve-fields resolved-query)))

(mu/defn- expand-snippets-to-card-ids
  "Recursively expand snippets to find all card IDs they reference.
   Returns a set of card IDs found within the snippets and their nested snippets."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   query]
  (if-let [snippet-ids (lib/native-query-snippet-ids query)]
    (loop [to-process snippet-ids
           visited #{}
           card-ids #{}]
      (if-let [snippet-id (first to-process)]
        (if (visited snippet-id)
          (throw (ex-info (tru "Snippet to snippet cycle detected!") {:native-query-snippet-id snippet-id}))
          ;; Process this snippet
          (let [snippet (lib.metadata/native-query-snippet metadata-providerable snippet-id)
                snippet-template-tags (:template-tags snippet)
                snippet-card-ids (lib/template-tags->card-ids snippet-template-tags)
                nested-snippet-ids (lib/template-tags->snippet-ids snippet-template-tags)]
            (recur (into (rest to-process) nested-snippet-ids)
                   (conj visited snippet-id)
                   (into card-ids snippet-card-ids))))
        ;; Nothing left in to-process:
        card-ids))
    #{}))

(defn- card-references
  [metadata-providerable card-query]
  (set/union
   (lib/native-query-card-ids card-query)
   (expand-snippets-to-card-ids metadata-providerable card-query)))

(mu/defn- card-subquery-graph
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   graph                 :- :map
   card-id               :- ::lib.schema.id/card]
  (let [card-query (->> (or (lib.metadata/card metadata-providerable card-id)
                            (throw (ex-info (tru "Card {0} does not exist, or is from a different Database." (pr-str card-id))
                                            {:type qp.error-type/invalid-query, :card-id card-id})))
                        (qp.fetch-source-query/normalize-card-query metadata-providerable)
                        :dataset-query)
        card-ids (card-references metadata-providerable card-query)]
    (reduce
     (fn [g sub-card-id]
       (card-subquery-graph metadata-providerable
                            (dep/depend g card-id sub-card-id)
                            sub-card-id))
     graph
     card-ids)))

(mu/defn- circular-ref-error :- ::lib.schema.common/non-blank-string
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   from-card             :- ::lib.schema.id/card
   to-card               :- ::lib.schema.id/card]
  (let [card-ids (conj #{from-card} to-card) ; card could point to itself, via snippets
        cards (into {}
                    (map (juxt :id :name))
                    (lib.metadata/bulk-metadata metadata-providerable :metadata/card card-ids))
        from-name (or (get cards from-card)
                      (throw (ex-info (tru "Referenced query is from a different database")
                                      {:type qp.error-type/invalid-query, :card-id from-card})))
        to-name   (or (get cards to-card)
                      (throw (ex-info (tru "Referenced query is from a different database")
                                      {:type qp.error-type/invalid-query, :card-id to-card})))]
    (str
     (tru "This query has circular referencing sub-queries. ")
     (tru "These questions seem to be part of the problem: \"{0}\" and \"{1}\"." from-name to-name))))

(mu/defn- check-for-circular-references
  "Done for side effects; [[card-subquery-graph]] will throw if there are circular references."
  [query :- ::lib.schema/query]
  (try
    (reduce (partial card-subquery-graph query)
            (dep/graph)
            (card-references query query))
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
