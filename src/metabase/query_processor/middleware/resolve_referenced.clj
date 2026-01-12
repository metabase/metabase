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

(mu/defn- fetch-card-query
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card-id :- ::lib.schema.id/card]
  (->> (or (lib.metadata/card metadata-providerable card-id)
           (throw (ex-info (tru "Card {0} does not exist, or is from a different Database." (pr-str card-id))
                           {:type qp.error-type/invalid-query, :card-id card-id})))
       (qp.fetch-source-query/normalize-card-query metadata-providerable)
       :dataset-query))

(mu/defn- fetch-snippet
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   snippet-id :- ::lib.schema.id/snippet]
  (or (lib.metadata/native-query-snippet metadata-providerable snippet-id)
      (throw (ex-info (tru "Snippet {0} does not exist." (pr-str snippet-id))
                      {:type qp.error-type/invalid-query, :snippet-id snippet-id}))))

(mu/defn- subquery-graph
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   graph :- :map
   init-query :- ::lib.schema/query]
  (letfn [(card-subquery-graph [mp graph card-id]
            (let [card-query (fetch-card-query mp card-id)
                  card-ids (concat (lib/native-query-card-ids card-query)
                                   (lib/all-source-card-ids card-query))
                  snippet-ids (lib/native-query-snippet-ids card-query)]
              (subquery-graph* mp graph ::card card-id card-ids snippet-ids)))
          (snippet-subquery-graph [mp graph snippet-id]
            (let [snippet (fetch-snippet mp snippet-id)
                  snippet-template-tags (:template-tags snippet)
                  card-ids (lib/template-tags->card-ids snippet-template-tags)
                  snippet-ids (lib/template-tags->snippet-ids snippet-template-tags)]
              (subquery-graph* mp graph ::snippet snippet-id card-ids snippet-ids)))
          (subquery-graph* [mp graph node-type node-id card-ids snippet-ids]
            (as-> graph <>
              (reduce (card-recurse mp node-type node-id) <> card-ids)
              (reduce (snippet-recurse mp node-type node-id) <> snippet-ids)))
          (card-recurse [mp node-type id]
            (fn [graph nested-card-id]
              (card-subquery-graph mp
                                   (dep/depend graph [node-type id] [::card nested-card-id])
                                   nested-card-id)))
          (snippet-recurse [mp node-type id]
            (fn [graph nested-snippet-id]
              (snippet-subquery-graph mp
                                      (dep/depend graph [node-type id] [::snippet nested-snippet-id])
                                      nested-snippet-id)))]
    (let [card-ids (lib/native-query-card-ids init-query)
          snippet-ids (lib/native-query-snippet-ids init-query)]
      (subquery-graph* metadata-providerable
                       graph
                       ::card
                       ::init-id
                       card-ids
                       snippet-ids))))

(mu/defn- circular-ref-error :- ::lib.schema.common/non-blank-string
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   from-type             :- :keyword
   from-id               :- [:or ::lib.schema.id/card ::lib.schema.id/snippet]
   to-type               :- :keyword
   to-id                 :- [:or ::lib.schema.id/card ::lib.schema.id/snippet]]
  (let [get-card-name (fn [card-id]
                        (if-let [card (lib.metadata/card metadata-providerable card-id)]
                          (:name card)
                          (throw (ex-info (tru "Referenced query is from a different database")
                                          {:type qp.error-type/invalid-query, :card-id card-id}))))
        get-snippet-name (fn [snippet-id]
                           (if-let [snippet (lib.metadata/native-query-snippet metadata-providerable snippet-id)]
                             (:name snippet)
                             (throw (ex-info (tru "Referenced snippet not found")
                                             {:type qp.error-type/invalid-query, :snippet-id snippet-id}))))
        [from-name from-label] (case from-type
                                 ::card [(get-card-name from-id) "question"]
                                 ::snippet [(get-snippet-name from-id) "snippet"])
        [to-name to-label] (case to-type
                             ::card [(get-card-name to-id) "question"]
                             ::snippet [(get-snippet-name to-id) "snippet"])]
    (str (tru "This query has circular referencing sub-queries. ")
         (tru "The {0} \"{1}\" and the {2} \"{3}\" seem to be part of the problem."
              from-label from-name to-label to-name))))

(mu/defn- check-for-circular-references
  "Done for side effects; [[subquery-graph]] will throw if there are circular references."
  [query :- ::lib.schema/query]
  (try
    (subquery-graph query (dep/graph) query)
    (catch ExceptionInfo e
      (let [{:keys [reason node dependency]} (ex-data e)
            [node-type node-id] node
            [dependency-type dependency-id] dependency]
        (if (= reason :weavejester.dependency/circular-dependency)
          (throw (ex-info (circular-ref-error query node-type node-id dependency-type dependency-id) {:original-exception e}))
          (throw e))))))

(mu/defn resolve-referenced-card-resources :- ::lib.schema/query
  "Resolves tables and fields referenced in card query template tags."
  [query :- ::lib.schema/query]
  (check-for-circular-references query)
  (resolve-referenced-card-resources* query)
  query)
