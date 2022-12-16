(ns metabase.models.values-card
  (:require
   [metabase.models :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [toucan.db :as db]
   [toucan.models :as models]))


(models/defmodel ValuesCard :values_card)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class ValuesCard)
                 models/IModel
                 (merge models/IModelDefaults
                        {:properties (constantly {:timestamped? true})
                         :types      (constantly {:parameterized_object_type :keyword})}))

(defn- query-for-dashboard
  [{dashboard-id :id :as dashboard} param-key]
  (->> (db/query {:select [:dataset_query]
                  :from [:report_card]
                  :join [:values_card [:= :report_card.id :values_card.card_id]]
                  :where [:and
                          [:= :parameterized_object_id dashboard-id]
                          [:= :parameterized_object_type "dashboard"]
                          [:= :parameter_id param-key]]})
       (db/do-post-select Card)
       first
       :dataset_query))

(defn values-for-dashboard
  [dashboard param-key]
  {:values
   (map first
        (qp/process-query (query-for-dashboard dashboard param-key) {:rff (constantly conj)}))})
