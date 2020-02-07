(ns metabase.query-processor.middleware.resolve-referenced
  (:require [metabase.query-processor.middleware
             [resolve-fields :as qp.resolve-fields]
             [resolve-source-table :as qp.resolve-tables]]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- tags-referenced-cards
  [query]
  (->> (get-in query [:native :template-tags])
       vals
       (filter #(= (:type %) :card))
       (map :card)
       (mapv #(db/select-one 'Card :id %))))

(s/defn ^:private resolve-referenced-card-resources* :- clojure.lang.IPersistentMap
  [query]
  (doseq [referenced-card (tags-referenced-cards query)
          :let [referenced-query (:dataset_query referenced-card)]
          :when (= (name (:type referenced-query)) "query")]
    (qp.resolve-tables/resolve-source-tables* referenced-query)
    (qp.resolve-fields/resolve-fields* referenced-query))
  query)

(defn resolve-referenced-card-resources
  "Resolves tables and fields referenced in card query template tags."
  [qp]
  (comp qp resolve-referenced-card-resources*))
