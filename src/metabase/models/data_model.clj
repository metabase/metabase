(ns metabase.models.data-model
  (:require [metabase.etl.core :as etl]))

;; See ETL for the motions
(def @data-models (delay ...))

(models/defmodel DataModel :data_model)

(defn- best-fit
  [candidates]
  (->> candidates
       (sort-by (comp count ancestors))
       first))

(defn find-model-for-table
  [table]
  (best-fit (concat (etl/candidates table)
                    (filter (partial satisfies-requirements? table) @data-models))))

(defn- instantiate-template
  "Bind dimensions and fill out metrics & segmets (reusing/extracting the same logic as ETL)"
  [template table]
  ;; ....
  {:name        "Orders"
   ;; Entity is either a table or a card (produced by ETL)
   :entity      entity
   :description "blablabla"
   ;; This collapses required_dimensions and optional_dimensions
   :dimensions  {"Income"    (Field 17)
                 "Timestamp" (Field 15)
                 "Source"    (Field 25)
                 "NumOrders" (Field 24)}
   :metrics     {"TotalIncome" (metric/map->MetricInstance
                                {:name       "TotalIncome"
                                 :definition {:aggregation [[:sum [:field-if 17]]]}})}
   :segments   {"ReturningUsers" (segment/map->SegmentInstance
                                  {:name       "ReturningUsers"
                                   :definition {:filter [:> [:field-id 24] 1]}})}
   :breakout_dimensions ["Source" "Timestamp"]})
