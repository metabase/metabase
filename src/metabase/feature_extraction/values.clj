(ns metabase.feature-extraction.values
  "Helpers to get data behind various models in a consistent shape."
  (:require [metabase.db.metadata-queries :as metadata]
            [metabase.query-processor :as qp]))

(defn field-values
  "Return all the values of FIELD for QUERY."
  [field query]
  (->> (qp/process-query
         {:type       :query
          :database   (metadata/db-id field)
          :query      (merge {:fields       [[:field-id (:id field)]]
                              :source-table (:table_id field)}
                             query)
          :middleware {:format-rows? false}})
       :data
       :rows
       (map first)))

(defn query-values
  "Return all values for QUERY."
  [db-id query]
  (-> (qp/process-query
        {:type       :query
         :database   db-id
         :query      query
         :middleware {:format-rows? false}})
      :data))

(defn card-values
  "Return all values for CARD."
  [card]
  (let [query (-> card :dataset_query (assoc :middleware {:format-rows? false}))
        {:keys [rows cols] :as dataset} (-> query qp/process-query :data)]
    (if (and (:visualization_settings card)
             (not-every? :source cols))
      (let [aggregation (-> card :visualization_settings :graph.metrics first)
            breakout    (-> card :visualization_settings :graph.dimensions first)]
        {:rows rows
         :cols (for [c cols]
                 (cond
                   (= (:name c) aggregation) (assoc c :source :aggregation)
                   (= (:name c) breakout)    (assoc c :source :breakout)
                   :else                     c))})
      dataset)))
